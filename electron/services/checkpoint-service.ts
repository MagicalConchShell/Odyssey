import {promises as fs} from 'fs';
import { FileSystemService } from './file-system-service';
import {join, dirname, resolve} from 'path';
import {homedir} from 'os';
import {createHash} from 'crypto';
import {ObjectStore, DirectoryTreeBuilder, BlobObject, TreeObject, CommitObject} from './object-storage-service.js';
import {RetryManager, withRetry, CHECKPOINT_RETRY_OPTIONS} from '../utils/retry-manager.js';
import {TransactionManager, withTransaction, createRefOperationRollback} from '../utils/transaction-manager.js';
import type {
  CheckpointSystem,
  CheckpointInfo,
  StorageStats,
  FileRestoreInfo,
  CheckoutOptions,
  CheckpointDiff,
  FileDiff,
  DiffStats,
  DiffType,
  CheckpointConfig
} from '../types/checkpoint.js';

/**
 * Checkpoint storage system
 */
export class CheckpointStorage implements CheckpointSystem {
  private baseDir: string;
  private ignorePatterns: string[];
  private maxFileSize: number;
  private author: string;
  private retryManager: RetryManager;
  private transactionManager: TransactionManager;

  constructor(config: CheckpointConfig = {}) {
    this.baseDir = config.basePath || join(homedir(), '.odyssey', 'checkpoints');
    this.ignorePatterns = config.ignorePatterns || [
      'node_modules/**',
      '.git/**',
      '.DS_Store',
      '*.log',
      'tmp/**',
      'temp/**',
      'dist/**',
      'build/**',
      '.next/**',
      '.nuxt/**',
      'coverage/**',
      '.nyc_output/**',
      '.cache/**',
      '*.tmp'
    ];
    this.maxFileSize = config.maxFileSize || 100 * 1024 * 1024; // 100MB
    this.author = config.author || 'odyssey-user';
    
    // Initialize retry manager with checkpoint-specific configuration
    this.retryManager = new RetryManager({
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      enableMonitoring: true,
      context: 'checkpoint-service'
    });
    
    // Initialize transaction manager for rollback capabilities
    this.transactionManager = new TransactionManager(
      join(this.baseDir, 'transactions')
    );
    
    // Register custom rollback handlers for checkpoint operations
    this.initializeCustomRollbackHandlers();
  }

  /**
   * Initialize custom rollback handlers for checkpoint-specific operations
   */
  private initializeCustomRollbackHandlers(): void {
    // Object store rollback handler
    (this.transactionManager as any).rollbackHandlers.set('object-store', {
      execute: async (operation: any) => {
        const { objectStore, commitHash, shouldDelete } = operation.rollbackData;
        if (shouldDelete && commitHash && objectStore) {
          try {
            await objectStore.deleteObject(commitHash);
            console.log(`[Transaction] Rolled back object store operation: deleted ${commitHash.substring(0, 8)}`);
          } catch (error: any) {
            console.warn(`[Transaction] Failed to delete object during rollback: ${error.message}`);
          }
        }
      },
      canRollback: async (operation: any) => {
        return operation.rollbackData && operation.rollbackData.shouldDelete;
      }
    });
  }

  /**
   * Create checkpoint with enhanced retry logic and transaction support
   */
  async createCheckpoint(projectPath: string, description?: string, author?: string): Promise<string> {
    const startTime = Date.now();

    const result = await this.retryManager.execute(async () => {
      return await withTransaction(this.transactionManager, async (transactionId) => {
        const projectHash = this.hashProjectPath(projectPath);
        const objectStore = await this.initStorage(projectHash);

        // Build directory tree with retry protection and transaction support
        const treeHash = await this.transactionManager.executeInTransaction(
          transactionId,
          async () => {
            return await withRetry(async () => {
              const treeBuilder = new DirectoryTreeBuilder(objectStore, this.ignorePatterns, this.maxFileSize);
              return await treeBuilder.buildTree(projectPath);
            }, 'build-directory-tree', CHECKPOINT_RETRY_OPTIONS.fileOperations);
          },
          {
            type: 'object-store',
            description: 'Build directory tree for checkpoint',
            rollbackData: { objectStore, treeHash: null },
            canRollback: false // Tree building doesn't need rollback as it's read-only
          }
        );

        // Get current HEAD as parent Commit with retry and transaction
        const headCommitHash = await this.transactionManager.executeInTransaction(
          transactionId,
          async () => {
            return await withRetry(async () => {
              return await this.resolveRef(projectHash, 'HEAD');
            }, 'resolve-head-ref', CHECKPOINT_RETRY_OPTIONS.databaseOperations);
          },
          {
            type: 'custom',
            description: 'Resolve HEAD reference',
            rollbackData: {},
            canRollback: false // Reference resolution is read-only
          }
        );

        const parent: string | null = headCommitHash || null;

        // Create commit object with retry protection and transaction support
        const commitHash = await this.transactionManager.executeInTransaction(
          transactionId,
          async () => {
            return await withRetry(async () => {
              return await objectStore.storeCommit({
                tree: treeHash,
                parent: parent,
                author: author || this.author,
                timestamp: new Date().toISOString(),
                message: description || `Checkpoint ${new Date().toLocaleString()}`
              });
            }, 'store-commit-object', CHECKPOINT_RETRY_OPTIONS.databaseOperations);
          },
          {
            type: 'object-store',
            description: `Store commit object for checkpoint`,
            rollbackData: { objectStore, commitHash: null, shouldDelete: true },
            canRollback: true // We can delete the commit object if needed
          }
        );

        // Update HEAD to point directly to the new commit with retry and transaction
        const headPath = this.getRefPath(projectHash, 'HEAD');
        const headRollbackData = await createRefOperationRollback(headPath);
        
        await this.transactionManager.executeInTransaction(
          transactionId,
          async () => {
            await withRetry(async () => {
              await this.setHead(projectHash, commitHash);
            }, 'update-head-ref', CHECKPOINT_RETRY_OPTIONS.fileOperations);
          },
          {
            type: 'ref-update',
            description: `Update HEAD to point to new commit ${commitHash.substring(0, 8)}`,
            rollbackData: headRollbackData,
            canRollback: true
          }
        );

        const duration = Date.now() - startTime;
        console.log(`✅ Checkpoint created: ${commitHash.substring(0, 8)} (${duration}ms)`);

        return commitHash;
      }, {
        operation: 'create-checkpoint',
        projectPath,
        description,
        author: author || this.author
      });
    }, 'create-checkpoint');

    return result.result;
  }

  /**
   * Checkout/Restore a checkpoint
   */
  async checkout(projectPath: string, ref: string, options: CheckoutOptions = {}): Promise<void> {
    const startTime = Date.now();

    try {
      const projectHash = this.hashProjectPath(projectPath);
      const objectStore = await this.initStorage(projectHash);

      // Resolve ref to commit hash
      const commitHash = await this.resolveRef(projectHash, ref);
      if (!commitHash) {
        throw new Error(`Ref ${ref} not found`);
      }

      const commit = await objectStore.readObject(commitHash) as CommitObject;
      if (!commit || commit.type !== 'commit') {
        throw new Error(`Invalid commit object for ref ${ref}`);
      }

      // Backup current state
      if (options.overwrite !== false) {
        await this.backupCurrentState(projectPath);
      }

      // Safely restore files (no destructive clearing)
      // This approach preserves untracked files and only overwrites tracked files

      // Safely restore files without destructive clearing
      const filesRestored = await this.safeRestoreFiles(
        objectStore,
        commit.tree,
        projectPath,
        options
      );

      // Always set HEAD to the commit hash (pure checkpoint mode)
      await this.setHead(projectHash, commitHash);

      const duration = Date.now() - startTime;
      console.log(`✅ Checkpoint checkout: ${ref} (${filesRestored} files, ${duration}ms)`);
    } catch (error: any) {
      throw new Error(`Failed to checkout ${ref}: ${error.message}`);
    }
  }

  /**
   * Safely delete a checkpoint with enhanced retry logic (only supports deleting the latest/HEAD checkpoint)
   */
  async deleteCheckpoint(projectPath: string, commitHash: string): Promise<void> {
    const startTime = Date.now();
    
    await this.retryManager.execute(async () => {
      const projectHash = this.hashProjectPath(projectPath);
      const objectStore = await this.initStorage(projectHash);

      // Get current history to validate this is the latest checkpoint with retry
      const allHistory = await withRetry(async () => {
        return await this.getHistory(projectPath);
      }, 'get-history-validation', CHECKPOINT_RETRY_OPTIONS.databaseOperations);

      if (allHistory.length === 0) {
        throw new Error('No checkpoints exist to delete');
      }

      const latestCommit = allHistory[0]; // Most recent commit
      if (latestCommit.hash !== commitHash) {
        throw new Error('Can only delete the latest checkpoint for safety. Use reset to remove multiple checkpoints.');
      }

      if (allHistory.length === 1) {
        throw new Error('Cannot delete the only remaining checkpoint');
      }

      // Validate target commit exists with retry
      const targetCommit = await withRetry(async () => {
        const commit = await objectStore.readObject(commitHash) as CommitObject;
        if (!commit || commit.type !== 'commit') {
          throw new Error(`Target commit ${commitHash} not found or invalid`);
        }
        return commit;
      }, 'validate-target-commit', CHECKPOINT_RETRY_OPTIONS.databaseOperations);

      // Get parent commit (where we'll reset to) with retry
      if (targetCommit.parent === null) {
        throw new Error('Cannot delete the initial checkpoint');
      }
      
      const parentHash = targetCommit.parent;
      const parentCommit = await withRetry(async () => {
        const commit = await objectStore.readObject(parentHash) as CommitObject;
        if (!commit || commit.type !== 'commit') {
          throw new Error(`Parent commit ${parentHash} not found or invalid`);
        }
        return commit;
      }, 'validate-parent-commit', CHECKPOINT_RETRY_OPTIONS.databaseOperations);

      // Create backup before destructive operation with retry
      const backupHash = await withRetry(async () => {
        return await this.backupCurrentState(projectPath);
      }, 'create-backup-before-delete', CHECKPOINT_RETRY_OPTIONS.fileOperations);
      
      console.log(`Created backup before delete: ${backupHash}`);

      // Step 1: Update HEAD to parent commit with retry
      await withRetry(async () => {
        await this.setHead(projectHash, parentHash);
      }, 'update-head-to-parent', CHECKPOINT_RETRY_OPTIONS.fileOperations);

      // Step 2: Restore working directory to parent state with retry
      await withRetry(async () => {
        await this.safeRestoreFiles(
          objectStore,
          parentCommit.tree,
          projectPath,
          { overwrite: true, preservePermissions: true }
        );
      }, 'restore-files-to-parent', CHECKPOINT_RETRY_OPTIONS.fileOperations);

      // Step 3: Remove the target commit object with retry
      console.log(`Removing commit object: ${commitHash}`);
      await withRetry(async () => {
        await objectStore.deleteObject(commitHash);
      }, 'delete-commit-object', CHECKPOINT_RETRY_OPTIONS.databaseOperations);
      
      // Run garbage collection to clean up orphaned objects with retry
      await withRetry(async () => {
        await this.garbageCollect(projectPath);
      }, 'garbage-collect-after-delete', CHECKPOINT_RETRY_OPTIONS.heavyOperations);

      const duration = Date.now() - startTime;
      console.log(`✅ Delete checkpoint ${commitHash.substring(0, 8)} completed (${duration}ms)`);
      console.log(`Reset to parent commit ${parentHash.substring(0, 8)}`);
    }, 'delete-checkpoint');

    // Method returns void, so we just need the result to complete
  }

  /**
   * Reset to a specific checkpoint, removing all later commits (destructive operation)
   * This is equivalent to checkpoint reset with history truncation
   */
  async resetToCheckpoint(projectPath: string, targetCommitHash: string): Promise<void> {
    const startTime = Date.now();

    try {
      const projectHash = this.hashProjectPath(projectPath);
      const objectStore = await this.initStorage(projectHash);

      // Validate target commit exists
      const targetCommit = await objectStore.readObject(targetCommitHash) as CommitObject;
      if (!targetCommit || targetCommit.type !== 'commit') {
        throw new Error(`Target commit ${targetCommitHash} not found or invalid`);
      }

      // Create backup before destructive operation
      const backupHash = await this.backupCurrentState(projectPath);
      console.log(`Created backup before reset: ${backupHash}`);

      // Step 1: Get all commits that will be removed (newer than target)
      const allHistory = await this.getHistory(projectPath);
      const targetIndex = allHistory.findIndex(commit => commit.hash === targetCommitHash);
      
      if (targetIndex === -1) {
        throw new Error(`Target commit ${targetCommitHash} not found in history`);
      }

      const commitsToRemove = allHistory.slice(0, targetIndex);
      console.log(`Will remove ${commitsToRemove.length} commits newer than target`);

      // Step 2: Update HEAD to target commit
      await this.setHead(projectHash, targetCommitHash);

      // Step 3: Restore working directory to target state
      await this.safeRestoreFiles(
        objectStore,
        targetCommit.tree,
        projectPath,
        { overwrite: true, preservePermissions: true }
      );

      // Step 4: Remove newer commits and run garbage collection
      await this.truncateHistoryAfter(objectStore, projectHash, targetCommitHash, commitsToRemove);

      const duration = Date.now() - startTime;
      console.log(`✅ Reset to checkpoint ${targetCommitHash.substring(0, 8)} completed (${duration}ms)`);
      console.log(`Removed ${commitsToRemove.length} newer commits`);

    } catch (error: any) {
      console.error(`❌ Failed to reset to checkpoint: ${error.message}`);
      throw new Error(`Failed to reset to checkpoint: ${error.message}`);
    }
  }

  /**
   * Truncate history by removing commits newer than target and garbage collecting
   */
  private async truncateHistoryAfter(
    objectStore: ObjectStore,
    projectHash: string,
    targetCommitHash: string,
    commitsToRemove: CheckpointInfo[]
  ): Promise<void> {
    console.log(`Starting history truncation after ${targetCommitHash.substring(0, 8)}`);

    try {
      // Collect all object hashes that should be removed
      const objectsToRemove = new Set<string>();
      
      for (const commit of commitsToRemove) {
        // Add commit object
        objectsToRemove.add(commit.hash);
        
        // Add tree objects (we'll let GC handle blobs that might be shared)
        if (commit.treeHash) {
          objectsToRemove.add(commit.treeHash);
        }
      }

      // Remove the commit objects and their trees
      // Note: We don't remove blobs here as they might be shared with remaining commits
      let removedCount = 0;
      for (const objectHash of objectsToRemove) {
        try {
          await objectStore.deleteObject(objectHash);
          removedCount++;
        } catch (error: any) {
          // Object might not exist or already removed, continue
          console.warn(`Could not remove object ${objectHash}: ${error.message}`);
        }
      }

      console.log(`Removed ${removedCount} objects during truncation`);

      // Run comprehensive garbage collection to clean up any orphaned objects
      await this.garbageCollectObjects(objectStore, projectHash);

      console.log(`✅ History truncation completed`);

    } catch (error: any) {
      console.error(`❌ Error during history truncation: ${error.message}`);
      throw new Error(`History truncation failed: ${error.message}`);
    }
  }

  /**
   * Get history (commits)
   */
  async getHistory(projectPath: string): Promise<CheckpointInfo[]> {
    try {
      const projectHash = this.hashProjectPath(projectPath);
      const objectStore = await this.initStorage(projectHash);

      const startCommitHash = await this.resolveRef(projectHash, 'HEAD');

      if (!startCommitHash) {
        console.warn('No start commit found for history traversal.');
        return [];
      }

      const history: CheckpointInfo[] = [];
      const visited = new Set<string>();
      const queue: string[] = [startCommitHash];

      let sanityBreak = 0;
      const maxCommits = 1000; // Prevent infinite loops

      while (queue.length > 0 && sanityBreak < maxCommits) {
        sanityBreak++;
        const currentHash = queue.shift()!;
        if (!currentHash || visited.has(currentHash)) {
          continue;
        }
        visited.add(currentHash);

        try {
          const commit = await objectStore.readObject(currentHash) as CommitObject;
          if (commit && commit.type === 'commit') {
            history.push({
              hash: commit.hash,
              description: commit.message,
              timestamp: commit.timestamp,
              author: commit.author,
              parent: commit.parent,
              treeHash: commit.tree
            });

            if (commit.parent && !visited.has(commit.parent)) {
              queue.push(commit.parent);
            }
          } else {
             console.warn(`Object ${currentHash.substring(0,8)} is not a valid commit.`);
          }
        } catch (readError: any) {
          console.error(`Failed to read or parse commit object ${currentHash.substring(0,8)}: ${readError.message}`);
          // Continue to the next in queue
        }
      }
      
      if(sanityBreak >= maxCommits) {
        console.warn(`getHistory aborted after reaching max ${maxCommits} commits.`);
      }

      // Sort history by timestamp, newest first
      history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      console.log(`Found ${history.length} commits.`);
      return history;
    } catch (error: any) {
      console.error(`Failed to get history: ${error.message}`);
      throw new Error(`Failed to get history: ${error.message}`);
    }
  }

  /**
   * Get checkpoint info by ref
   */
  async getCheckpointInfo(projectPath: string, ref: string): Promise<CheckpointInfo | null> {
    try {
      const projectHash = this.hashProjectPath(projectPath);
      const objectStore = await this.initStorage(projectHash);

      const commitHash = await this.resolveRef(projectHash, ref);
      if (!commitHash) {
        return null;
      }

      const commit = await objectStore.readObject(commitHash) as CommitObject;
      if (!commit || commit.type !== 'commit') {
        return null;
      }

      return {
        hash: commit.hash,
        description: commit.message,
        timestamp: commit.timestamp,
        author: commit.author,
        parent: commit.parent,
        treeHash: commit.tree
      };
    } catch (error: any) {
      throw new Error(`Failed to get checkpoint info for ref ${ref}: ${error.message}`);
    }
  }

  /**
   * List files in a checkpoint by ref
   */
  async listFiles(projectPath: string, ref: string): Promise<FileRestoreInfo[]> {
    try {
      const projectHash = this.hashProjectPath(projectPath);
      const objectStore = await this.initStorage(projectHash);

      const commitHash = await this.resolveRef(projectHash, ref);
      if (!commitHash) {
        throw new Error(`Ref ${ref} not found. Make sure this is a valid commit hash or reference.`);
      }

      const commit = await objectStore.readObject(commitHash) as CommitObject;
      if (!commit || commit.type !== 'commit') {
        throw new Error(`Invalid commit object for ref ${ref} (commit hash: ${commitHash})`);
      }

      return this.listFilesFromTree(objectStore, commit.tree, '');
    } catch (error: any) {
      throw new Error(`Failed to list files for ref ${ref}: ${error.message}`);
    }
  }

  /**
   * Get file content at a specific commit
   */
  async getFileContent(projectPath: string, ref: string, filePath: string): Promise<string | null> {
    try {
      const projectHash = this.hashProjectPath(projectPath);
      const objectStore = await this.initStorage(projectHash);

      const commitHash = await this.resolveRef(projectHash, ref);
      if (!commitHash) {
        return null; // Ref not found, so file content is null
      }

      const commit = await objectStore.readObject(commitHash) as CommitObject;
      if (!commit || commit.type !== 'commit') {
        throw new Error(`Invalid commit object for ref ${ref}`);
      }

      // Find the file in the tree
      const fileInfo = await this.findFileInTree(objectStore, commit.tree, filePath);
      if (!fileInfo) {
        return null; // File not found in this commit
      }

      // Read the blob content
      const blob = await objectStore.readObject(fileInfo.hash) as BlobObject;
      if (!blob || blob.type !== 'blob') {
        throw new Error(`Invalid blob object for file ${filePath}`);
      }

      return blob.content.toString('utf8');
    } catch (error: any) {
      throw new Error(`Failed to get file content for ${filePath} at ${ref}: ${error.message}`);
    }
  }

  /**
   * Get file content by hash directly
   */
  async getFileContentByHash(projectPath: string, hash: string): Promise<string | null> {
    try {
      const projectHash = this.hashProjectPath(projectPath);
      const objectStore = await this.initStorage(projectHash);

      const blob = await objectStore.readObject(hash) as BlobObject;
      if (!blob || blob.type !== 'blob') {
        return null;
      }

      return blob.content.toString('utf8');
    } catch (error: any) {
      throw new Error(`Failed to get file content by hash ${hash}: ${error.message}`);
    }
  }

  /**
   * Get file diff content between two commits
   */
  async getFileContentDiff(projectPath: string, fromRef: string, toRef: string, filePath: string): Promise<{
    oldContent: string | null;
    newContent: string | null;
    diffType: DiffType;
  }> {
    const [oldContent, newContent] = await Promise.all([
      this.getFileContent(projectPath, fromRef, filePath),
      this.getFileContent(projectPath, toRef, filePath)
    ]);

    let diffType: DiffType;
    if (oldContent === null && newContent !== null) {
      diffType = 'added';
    } else if (oldContent !== null && newContent === null) {
      diffType = 'deleted';
    } else if (oldContent !== newContent) {
      diffType = 'modified';
    } else {
      diffType = 'modified'; // Shouldn't happen, but safe default
    }

    return {
      oldContent,
      newContent,
      diffType
    };
  }

  /**
   * Get file diff between two checkpoints
   */
  async getFileDiff(projectPath: string, fromRef: string, toRef: string): Promise<CheckpointDiff> {
    const [info1, info2] = await Promise.all([
      this.getCheckpointInfo(projectPath, fromRef),
      this.getCheckpointInfo(projectPath, toRef)
    ]);

    if (!info1 || !info2) {
      throw new Error('One or both refs not found');
    }

    const [files1, files2] = await Promise.all([
      this.listFiles(projectPath, fromRef),
      this.listFiles(projectPath, toRef)
    ]);

    const diffs = this.calculateFileDiffs(files1, files2);
    const stats = this.calculateDiffStats(diffs);

    return {
      fromRef,
      toRef,
      files: diffs,
      stats
    };
  }

  /**
   * Get changes introduced by a specific checkpoint compared to its parent
   */
  async getCheckpointChanges(projectPath: string, ref: string): Promise<CheckpointDiff> {
    try {
      const checkpointInfo = await this.getCheckpointInfo(projectPath, ref);
      if (!checkpointInfo) {
        throw new Error(`Checkpoint ${ref} not found`);
      }

      // If this is the initial checkpoint (no parent), return all files as added
      if (checkpointInfo.parent === null) {
        const files = await this.listFiles(projectPath, ref);
        const fileDiffs: FileDiff[] = files.map(file => ({
          type: 'added' as DiffType,
          path: file.path,
          newHash: file.hash,
          newSize: file.size,
          isDirectory: file.isDirectory // <--- This is where isDirectory is used for initial commit
        }));

        const stats = this.calculateDiffStats(fileDiffs);

        return {
          fromRef: 'empty',
          toRef: ref,
          files: fileDiffs,
          stats
        };
      }

      // Standard single parent comparison - simplified for linear checkpoints
      const parentRef = checkpointInfo.parent;
      console.log(`Comparing checkpoint ${ref} with parent ${parentRef}`);

      // Verify that both refs can be resolved
      const projectHash = this.hashProjectPath(projectPath);
      const [resolvedParent, resolvedCurrent] = await Promise.all([
        this.resolveRef(projectHash, parentRef),
        this.resolveRef(projectHash, ref)
      ]);

      if (!resolvedParent) {
        throw new Error(`Parent ref ${parentRef} could not be resolved`);
      }
      if (!resolvedCurrent) {
        throw new Error(`Current ref ${ref} could not be resolved`);
      }

      console.log(`Resolved refs: ${parentRef} -> ${resolvedParent.substring(0, 8)}, ${ref} -> ${resolvedCurrent.substring(0, 8)}`);
      return await this.getFileDiff(projectPath, resolvedParent, resolvedCurrent);

    } catch (error: any) {
      throw new Error(`Failed to get checkpoint changes for ${ref}: ${error.message}`);
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(projectPath: string): Promise<StorageStats> {
    const projectHash = this.hashProjectPath(projectPath);
    const objectStore = new ObjectStore(this.getProjectDir(projectHash));

    await objectStore.init();
    const stats = await objectStore.getStats();

    return {
      totalObjects: stats.totalObjects,
      uniqueBlobs: stats.blobCount,
      uniqueTrees: stats.treeCount,
      totalCommits: stats.commitCount,
      storageSize: stats.totalSize,
      deduplicationRatio: stats.compressionRatio
    };
  }

  /**
   * Run garbage collection
   */
  async garbageCollect(projectPath: string): Promise<void> {
    const projectHash = this.hashProjectPath(projectPath);
    const objectStore = new ObjectStore(this.getProjectDir(projectHash));

    await this.garbageCollectObjects(objectStore, projectHash);
  }

  /**
   * Optimize storage
   */
  async optimizeStorage(projectPath: string): Promise<void> {
    // For now, optimization is just garbage collection
    await this.garbageCollect(projectPath);
  }

  /**
   * Export checkpoint (not implemented)
   */
  async exportCheckpoint(_checkpointId: string, _outputPath: string): Promise<void> {
    throw new Error('Export not implemented yet');
  }

  /**
   * Import checkpoint (not implemented)
   */
  async importCheckpoint(_archivePath: string, _projectPath: string): Promise<string> {
    throw new Error('Import not implemented yet');
  }

  /**
   * Generate project path hash
   */
  private hashProjectPath(projectPath: string): string {
    const absolutePath = resolve(projectPath);
    const hash = createHash('sha256').update(absolutePath).digest('hex');
    return hash.substring(0, 16);
  }

  /**
   * Initialize storage for a project
   */
  private async initStorage(projectHash: string): Promise<ObjectStore> {
    const projectDir = this.getProjectDir(projectHash);
    const dirs = [
      projectDir,
      join(projectDir, 'objects'),
      join(projectDir, 'refs', 'backups') // Create refs/backups directory for backup refs
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, {recursive: true});
    }

    const objectStore = new ObjectStore(projectDir);
    await objectStore.init();

    return objectStore;
  }

  /**
   * Restore files from a tree object
   */
  private async restoreFilesFromTree(
    objectStore: ObjectStore,
    treeHash: string,
    basePath: string,
    options: CheckoutOptions
  ): Promise<number> {
    const tree = await objectStore.readObject(treeHash) as TreeObject;
    if (!tree) return 0;

    let filesRestored = 0;

    for (const entry of tree.entries) {
      const fullPath = join(basePath, entry.name);

      if (entry.type === 'blob') {
        const blob = await objectStore.readObject(entry.hash) as BlobObject;
        if (blob) {
          await fs.mkdir(dirname(fullPath), {recursive: true});
          await fs.writeFile(fullPath, blob.content);

          if (options.preservePermissions !== false && process.platform !== 'win32') {
            await fs.chmod(fullPath, entry.mode);
          }

          filesRestored++;
        }
      } else if (entry.type === 'tree') {
        await fs.mkdir(fullPath, {recursive: true});

        if (options.preservePermissions !== false && process.platform !== 'win32') {
          await fs.chmod(fullPath, entry.mode);
        }

        filesRestored += await this.restoreFilesFromTree(objectStore, entry.hash, fullPath, options);
      }
    }

    return filesRestored;
  }

  /**
   * List files from a tree object
   */
  private async listFilesFromTree(
    objectStore: ObjectStore,
    treeHash: string,
    basePath: string
  ): Promise<FileRestoreInfo[]> {
    const tree = await objectStore.readObject(treeHash) as TreeObject;
    if (!tree) return [];

    const files: FileRestoreInfo[] = [];

    for (const entry of tree.entries) {
      const fullPath = join(basePath, entry.name);

      if (entry.type === 'blob') {
        files.push({
          path: fullPath,
          hash: entry.hash,
          size: entry.size,
          mode: entry.mode,
          isDirectory: false
        });
      } else if (entry.type === 'tree') {
        const dirInfo = {
          path: fullPath,
          hash: entry.hash,
          size: 0,
          mode: entry.mode,
          isDirectory: true
        };
        files.push(dirInfo);

        // Recursively list subdirectories
        const subFiles = await this.listFilesFromTree(objectStore, entry.hash, fullPath);
        files.push(...subFiles);
      }
    }

    return files;
  }

  /**
   * Find a specific file in a tree
   */
  private async findFileInTree(
    objectStore: ObjectStore,
    treeHash: string,
    targetPath: string,
    basePath: string = ''
  ): Promise<FileRestoreInfo | null> {
    const tree = await objectStore.readObject(treeHash) as TreeObject;
    if (!tree) return null;

    for (const entry of tree.entries) {
      const fullPath = basePath ? join(basePath, entry.name) : entry.name;

      if (fullPath === targetPath) {
        if (entry.type === 'blob') {
          return {
            path: fullPath,
            hash: entry.hash,
            size: entry.size,
            mode: entry.mode,
            isDirectory: false
          };
        }
        return null; // Target is a directory, not a file
      }

      // If the target path starts with this directory path, recurse
      if (entry.type === 'tree' && targetPath.startsWith(fullPath + '/')) {
        const result = await this.findFileInTree(objectStore, entry.hash, targetPath, fullPath);
        if (result) return result;
      }
    }

    return null;
  }

  /**
   * Calculate file differences
   */
  private calculateFileDiffs(files1: FileRestoreInfo[], files2: FileRestoreInfo[]): FileDiff[] {
    const diffs: FileDiff[] = [];
    const fileMap1 = new Map(files1.map(f => [f.path, f]));
    const fileMap2 = new Map(files2.map(f => [f.path, f]));

    // Track potential renames by content hash (only for non-directory files)
    const hashToFile1 = new Map<string, FileRestoreInfo[]>();
    const hashToFile2 = new Map<string, FileRestoreInfo[]>();
    
    // Group files by hash for rename detection
    for (const file of files1) {
      if (!file.isDirectory) {
        if (!hashToFile1.has(file.hash)) {
          hashToFile1.set(file.hash, []);
        }
        hashToFile1.get(file.hash)!.push(file);
      }
    }
    
    for (const file of files2) {
      if (!file.isDirectory) {
        if (!hashToFile2.has(file.hash)) {
          hashToFile2.set(file.hash, []);
        }
        hashToFile2.get(file.hash)!.push(file);
      }
    }

    // Check for added and modified files
    for (const [path, file2] of Array.from(fileMap2)) {
      const file1 = fileMap1.get(path);

      if (!file1) {
        const diff = {
          type: 'added' as DiffType,
          path,
          newHash: file2.hash,
          newSize: file2.size,
          isDirectory: file2.isDirectory
        };
        diffs.push(diff);
        console.log(`[DEBUG] calculateFileDiffs - Added: ${JSON.stringify(diff)}`);
      } else if (file1.hash !== file2.hash) {
        const diff = {
          type: 'modified' as DiffType,
          path,
          oldHash: file1.hash,
          newHash: file2.hash,
          oldSize: file1.size,
          newSize: file2.size,
          isDirectory: file2.isDirectory
        };
        diffs.push(diff);
        console.log(`[DEBUG] calculateFileDiffs - Modified: ${JSON.stringify(diff)}`);
      }
    }

    // Check for deleted files and detect renames
    const processedRenames = new Set<string>();
    
    for (const [path, file1] of Array.from(fileMap1)) {
      if (!fileMap2.has(path)) {
        // File was deleted, check if it was renamed
        let foundRename = false;
        
        if (!file1.isDirectory && !processedRenames.has(file1.hash)) {
          // Look for files with the same hash in the new set
          const sameHashFiles = hashToFile2.get(file1.hash);
          if (sameHashFiles) {
            // Find a file that doesn't exist in the old set (i.e., was "added")
            for (const candidateFile of sameHashFiles) {
              if (!fileMap1.has(candidateFile.path)) {
                // This is likely a rename
                const diff = {
                  type: 'renamed' as DiffType,
                  path: candidateFile.path,
                  oldPath: file1.path,
                  oldHash: file1.hash,
                  newHash: candidateFile.hash,
                  oldSize: file1.size,
                  newSize: candidateFile.size,
                  isDirectory: file1.isDirectory
                };
                diffs.push(diff);
                console.log(`[DEBUG] calculateFileDiffs - Renamed: ${file1.path} -> ${candidateFile.path}`);
                
                // Remove the corresponding "added" entry if it exists
                const addedIndex = diffs.findIndex(d => 
                  d.type === 'added' && d.path === candidateFile.path
                );
                if (addedIndex !== -1) {
                  diffs.splice(addedIndex, 1);
                }
                
                processedRenames.add(file1.hash);
                foundRename = true;
                break;
              }
            }
          }
        }
        
        // If no rename was detected, it's a regular deletion
        if (!foundRename) {
          const diff = {
            type: 'deleted' as DiffType,
            path,
            oldHash: file1.hash,
            oldSize: file1.size,
            isDirectory: file1.isDirectory
          };
          diffs.push(diff);
        }
      }
    }

    return diffs;
  }

  /**
   * Calculate diff statistics
   */
  private calculateDiffStats(diffs: FileDiff[]): DiffStats {
    const stats: DiffStats = {
      filesAdded: 0,
      filesDeleted: 0,
      filesModified: 0,
      filesRenamed: 0,
      totalChanges: diffs.length,
      sizeChange: 0
    };

    for (const diff of diffs) {
      switch (diff.type) {
        case 'added':
          stats.filesAdded++;
          stats.sizeChange += diff.newSize || 0;
          break;
        case 'deleted':
          stats.filesDeleted++;
          stats.sizeChange -= diff.oldSize || 0;
          break;
        case 'modified':
          stats.filesModified++;
          stats.sizeChange += (diff.newSize || 0) - (diff.oldSize || 0);
          break;
        case 'renamed':
          stats.filesRenamed++;
          break;
      }
    }

    return stats;
  }

  /**
   * Get project storage directory
   */
  private getProjectDir(projectHash: string): string {
    return join(this.baseDir, projectHash);
  }

  /**
   * Get ref file path
   */
  private getRefPath(projectHash: string, ref: string): string {
    return join(this.getProjectDir(projectHash), ref);
  }

  /**
   * Update a ref
   */
  private async updateRef(projectHash: string, ref: string, commitHash: string): Promise<void> {
    const refPath = this.getRefPath(projectHash, ref);
    await fs.mkdir(dirname(refPath), {recursive: true});
    await FileSystemService.atomicWrite(refPath, commitHash);
  }

  /**
   * Resolve a ref to a commit hash
   */
  private async resolveRef(projectHash: string, ref: string): Promise<string | null> {
    const objectStore = await this.initStorage(projectHash);

    // If it's a direct commit hash (7-64 characters for SHA-256)
    if (ref.match(/^[0-9a-f]{7,64}$/)) {
      // If it's a full 64-char hash, check directly
      if (ref.length === 64) {
        if (await objectStore.hasObject(ref)) {
          return ref;
        }
      } else {
        // Shorter hash (7-63 chars) - need to expand to full hash
        console.log(`Expanding short hash: ${ref}`);
        const allObjects = await objectStore.listObjects();
        const matches = allObjects.filter(hash => hash.startsWith(ref));

        if (matches.length === 0) {
          console.warn(`No objects found matching short hash: ${ref}`);
          return null;
        } else if (matches.length === 1) {
          console.log(`Expanded ${ref} to ${matches[0]}`);
          return matches[0];
        } else {
          // Multiple matches found - this is ambiguous and should be an error
          const matchSample = matches.slice(0, 3).join(', ');
          const additional = matches.length > 3 ? ` and ${matches.length - 3} more` : '';
          throw new Error(
            `Ambiguous short hash '${ref}' - found ${matches.length} matches: ${matchSample}${additional}. ` +
            `Please use a longer hash to uniquely identify the commit.`
          );
        }
      }
    }

    const refPath = this.getRefPath(projectHash, ref);
    try {
      const content = (await fs.readFile(refPath, 'utf8')).trim();
      if (content.startsWith('ref: ')) {
        // Symbolic ref, resolve recursively
        return this.resolveRef(projectHash, content.substring(5));
      } else {
        // Direct hash
        return content;
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get HEAD ref
   */
  private async getHeadRef(projectHash: string): Promise<string | null> {
    const headPath = this.getRefPath(projectHash, 'HEAD');
    try {
      return (await fs.readFile(headPath, 'utf8')).trim();
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Set HEAD ref
   */
  private async setHead(projectHash: string, ref: string): Promise<void> {
    const headPath = this.getRefPath(projectHash, 'HEAD');
    if (ref.startsWith('refs/')) {
      // Symbolic ref (branch)
      await FileSystemService.atomicWrite(headPath, `ref: ${ref}`);
    } else {
      // Detached HEAD (commit hash)
      await FileSystemService.atomicWrite(headPath, ref);
    }
  }


  /**
   * Garbage collect objects
   */
  private async garbageCollectObjects(objectStore: ObjectStore, projectHash: string): Promise<void> {
    try {
      const referencedObjects = new Set<string>();

      // 1. Collect all reachable objects from HEAD and backup refs
      const headRef = await this.getHeadRef(projectHash);
      const allRefs: string[] = [];
      
      if (headRef) {
        if (headRef.startsWith('ref: ')) {
          // Symbolic ref - resolve it
          const resolvedRef = await this.resolveRef(projectHash, headRef.substring(5));
          if (resolvedRef) allRefs.push(resolvedRef);
        } else {
          // Direct commit hash
          allRefs.push(headRef);
        }
      }
      
      // Also collect backup refs
      try {
        const backupsDir = join(this.getProjectDir(projectHash), 'refs', 'backups');
        const backupFiles = await fs.readdir(backupsDir);
        for (const backupFile of backupFiles) {
          const backupHash = await fs.readFile(join(backupsDir, backupFile), 'utf8');
          allRefs.push(backupHash.trim());
        }
      } catch (error: any) {
        // Backups directory might not exist, which is fine
        if (error.code !== 'ENOENT') throw error;
      }

      for (const ref of allRefs) {
        const commitHash = await this.resolveRef(projectHash, ref);
        if (commitHash) {
          await this.collectReachableObjects(objectStore, commitHash, referencedObjects);
        }
      }

      // 2. Delete unreferenced objects
      const allObjects = await objectStore.listObjects();
      let objectsRemovedCount = 0;
      for (const objectHash of allObjects) {
        if (!referencedObjects.has(objectHash)) {
          await objectStore.deleteObject(objectHash);
          objectsRemovedCount++;
        }
        // Also ensure the object is not a ref file itself
        // This is a safeguard, as refs should not be in the objects directory
        const refPath = this.getRefPath(projectHash, objectHash);
        try {
          await fs.unlink(refPath);
        } catch (e) {
          // Ignore if it's not a ref file or cannot be unlinked
        }
      }

      console.log(`Garbage collected ${objectsRemovedCount} objects`);
    } catch (error: any) {
      console.warn(`Garbage collection failed: ${error.message}`);
    }
  }

  /**
   * Recursively collect all reachable objects
   */
  private async collectReachableObjects(
    objectStore: ObjectStore,
    startHash: string,
    referencedObjects: Set<string>
  ): Promise<void> {
    const queue: string[] = [startHash];
    while (queue.length > 0) {
      const hash = queue.shift()!;
      if (referencedObjects.has(hash)) {
        continue;
      }
      referencedObjects.add(hash);

      const obj = await objectStore.readObject(hash);
      if (!obj) continue;

      if (obj.type === 'commit') {
        const commit = obj as CommitObject;
        referencedObjects.add(commit.tree);
        queue.push(commit.tree);
        if (commit.parent) {
          queue.push(commit.parent);
        }
      } else if (obj.type === 'tree') {
        const tree = obj as TreeObject;
        for (const entry of tree.entries) {
          referencedObjects.add(entry.hash);
          if (entry.type === 'tree') {
            queue.push(entry.hash);
          }
        }
      }
    }
  }

  /**
   * Backup current state
   */
  private async backupCurrentState(projectPath: string): Promise<string | null> {
    try {
      // Create a temporary backup checkpoint of the current state
      const backupTime = new Date().toISOString();
      const backupMessage = `Backup before checkout at ${backupTime}`;
      
      console.log(`Creating backup checkpoint for project: ${projectPath}`);
      
      // Create a temporary checkpoint with the current state
      // This allows users to revert back if needed
      const backupHash = await this.createCheckpoint(projectPath, backupMessage, this.author);
      
      if (backupHash) {
        console.log(`Backup checkpoint created with hash: ${backupHash}`);
        
        // Store the backup hash directly as a ref (no branch needed)
        const projectHash = this.hashProjectPath(projectPath);
        const backupRef = `refs/backups/backup-${Date.now()}`;
        await this.updateRef(projectHash, backupRef, backupHash);
        
        console.log(`Backup stored as ref: ${backupRef}`);
        return backupHash;
      } else {
        console.warn(`Failed to create backup checkpoint`);
        return null;
      }
    } catch (error: any) {
      console.error(`Error during backup: ${error.message}`);
      return null;
    }
  }

  /**
   * Safely restore files from checkpoint without destructive clearing
   * This method only overwrites files that exist in the checkpoint,
   * preserving untracked files and preventing data loss
   */
  private async safeRestoreFiles(
    objectStore: ObjectStore,
    treeHash: string,
    projectPath: string,
    options: CheckoutOptions
  ): Promise<number> {
    const tree = await objectStore.readObject(treeHash) as TreeObject;
    if (!tree) return 0;

    let filesRestored = 0;
    const filesToRestore = new Set<string>();

    // First pass: collect all files that will be restored
    await this.collectFilesToRestore(objectStore, treeHash, '', filesToRestore);

    // Second pass: restore files
    filesRestored = await this.restoreFilesFromTree(
      objectStore,
      treeHash,
      projectPath,
      options
    );

    return filesRestored;
  }

  /**
   * Recursively collect all file paths that will be restored
   */
  private async collectFilesToRestore(
    objectStore: ObjectStore,
    treeHash: string,
    basePath: string,
    filesToRestore: Set<string>
  ): Promise<void> {
    const tree = await objectStore.readObject(treeHash) as TreeObject;
    if (!tree) return;

    for (const entry of tree.entries) {
      const fullPath = join(basePath, entry.name);

      if (entry.type === 'blob') {
        filesToRestore.add(fullPath);
      } else if (entry.type === 'tree') {
        await this.collectFilesToRestore(objectStore, entry.hash, fullPath, filesToRestore);
      }
    }
  }

  
}

/**
 * Create checkpoint storage instance
 */
export function createCheckpointStorage(config?: CheckpointConfig): CheckpointStorage {
  return new CheckpointStorage(config);
}