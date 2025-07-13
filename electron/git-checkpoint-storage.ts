import {promises as fs} from 'fs';
import {join, dirname, resolve} from 'path';
import {homedir} from 'os';
import {createHash} from 'crypto';
import {GitObjectStore, DirectoryTreeBuilder, BlobObject, TreeObject, CommitObject} from './git-style-objects.js';
import type {
  GitCheckpointSystem,
  GitCheckpointInfo,
  StorageStats,
  FileRestoreInfo,
  CheckoutOptions,
  CheckpointDiff,
  FileDiff,
  DiffStats,
  DiffType,
  GitCheckpointConfig,
  BranchInfo
} from './types/git-checkpoint.js';

/**
 * Git-style checkpoint storage system
 */
export class GitCheckpointStorage implements GitCheckpointSystem {
  private baseDir: string;
  private ignorePatterns: string[];
  private maxFileSize: number;
  private author: string;

  constructor(config: GitCheckpointConfig = {}) {
    this.baseDir = config.basePath || join(homedir(), '.odyssey', 'git-checkpoints');
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
  }

  /**
   * Create checkpoint
   */
  async createCheckpoint(projectPath: string, description?: string, author?: string): Promise<string> {
    const startTime = Date.now();

    try {
      const projectHash = this.hashProjectPath(projectPath);
      const objectStore = await this.initStorage(projectHash);

      // Build directory tree
      const treeBuilder = new DirectoryTreeBuilder(objectStore, this.ignorePatterns, this.maxFileSize);
      const treeHash = await treeBuilder.buildTree(projectPath);

      // Get current HEAD as parent Commit
      let parents: string[] = [];
      const headCommitHash = await this.resolveRef(projectHash, 'HEAD');
      if (headCommitHash) {
        parents.push(headCommitHash);
      }

      // Create commit object
      const commitHash = await objectStore.storeCommit({
        tree: treeHash,
        parents: parents,
        author: author || this.author,
        timestamp: new Date().toISOString(),
        message: description || `Checkpoint ${new Date().toLocaleString()}`
      });

      // Update HEAD to point to the new Commit
      const currentBranch = await this.getHeadBranch(projectHash);
      if (currentBranch) {
        await this.updateRef(projectHash, `refs/heads/${currentBranch}`, commitHash);
      } else {
        // If no branch, create a default 'main' branch
        await this.updateRef(projectHash, 'refs/heads/main', commitHash);
        await this.setHead(projectHash, 'refs/heads/main');
      }

      // Auto garbage collection
      // if (this.autoGC) {
      //   await this.garbageCollect(projectPath);
      // }

      const duration = Date.now() - startTime;
      console.log(`✅ Git-style checkpoint created: ${commitHash.substring(0, 8)} (${duration}ms)`);

      return commitHash;
    } catch (error: any) {
      throw new Error(`Failed to create checkpoint: ${error.message}`);
    }
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

      // Update HEAD
      if (ref.startsWith('refs/heads/')) {
        await this.setHead(projectHash, ref);
      } else {
        // Detached HEAD
        await this.setHead(projectHash, commitHash);
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Git-style checkout: ${ref} (${filesRestored} files, ${duration}ms)`);
    } catch (error: any) {
      throw new Error(`Failed to checkout ${ref}: ${error.message}`);
    }
  }

  /**
   * Get history (commits)
   */
  async getHistory(projectPath: string, branch?: string): Promise<GitCheckpointInfo[]> {
    try {
      const projectHash = this.hashProjectPath(projectPath);
      const objectStore = await this.initStorage(projectHash);

      let startCommitHash: string | null = null;
      if (branch) {
        startCommitHash = await this.resolveRef(projectHash, `refs/heads/${branch}`);
      } else {
        startCommitHash = await this.resolveRef(projectHash, 'HEAD');
      }

      if (!startCommitHash) {
        console.warn('No start commit found for history traversal.');
        return [];
      }

      const history: GitCheckpointInfo[] = [];
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
              parents: commit.parents,
              treeHash: commit.tree
            });

            for (const parentHash of commit.parents) {
              if (parentHash && !visited.has(parentHash)) {
                queue.push(parentHash);
              }
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
   * Create a new branch
   */
  async createBranch(projectPath: string, branchName: string, startPoint?: string): Promise<void> {
    try {
      const projectHash = this.hashProjectPath(projectPath);

      let commitHashToPointTo: string | null = null;
      if (startPoint) {
        commitHashToPointTo = await this.resolveRef(projectHash, startPoint);
      } else {
        // Default to current HEAD
        commitHashToPointTo = await this.resolveRef(projectHash, 'HEAD');
      }

      if (!commitHashToPointTo) {
        throw new Error(`Start point ${startPoint || 'HEAD'} not found.`);
      }

      await this.updateRef(projectHash, `refs/heads/${branchName}`, commitHashToPointTo);
      console.log(`✅ Branch ${branchName} created pointing to ${commitHashToPointTo.substring(0, 8)}`);
    } catch (error: any) {
      throw new Error(`Failed to create branch ${branchName}: ${error.message}`);
    }
  }

  /**
   * Switch to a branch
   */
  async switchBranch(projectPath: string, branchName: string): Promise<void> {
    try {
      const projectHash = this.hashProjectPath(projectPath);

      // Validate project path exists
      if (!projectPath || typeof projectPath !== 'string') {
        throw new Error('Invalid project path provided');
      }

      // Check if storage is initialized
      const objectStore = await this.initStorage(projectHash);
      if (!objectStore) {
        throw new Error('Git checkpoint storage not initialized');
      }

      // Validate branch name
      if (!branchName || typeof branchName !== 'string') {
        throw new Error('Invalid branch name provided');
      }

      // Check if branch exists
      const branchRef = `refs/heads/${branchName}`;
      const commitHash = await this.resolveRef(projectHash, branchRef);
      if (!commitHash) {
        // List available branches for better error message
        const branches = await this.listBranches(projectPath);
        const availableBranches = branches.map(b => b.name).join(', ');
        throw new Error(`Branch '${branchName}' not found. Available branches: ${availableBranches || 'none'}`);
      }

      // Verify commit exists
      const commitObj = await objectStore.readObject(commitHash);
      if (!commitObj || commitObj.type !== 'commit') {
        throw new Error(`Branch '${branchName}' points to invalid commit ${commitHash.substring(0, 8)}`);
      }

      // Update HEAD to point to the branch
      await this.setHead(projectHash, branchRef);

      // Checkout the branch's commit
      await this.checkout(projectPath, commitHash);
      
      console.log(`✅ Switched to branch ${branchName} (${commitHash.substring(0, 8)})`);
    } catch (error: any) {
      console.error(`❌ Failed to switch to branch ${branchName}:`, error.message);
      throw new Error(`Failed to switch to branch ${branchName}: ${error.message}`);
    }
  }

  /**
   * List all branches
   */
  async listBranches(projectPath: string): Promise<BranchInfo[]> {
    try {
      const projectHash = this.hashProjectPath(projectPath);
      const refsDir = join(this.getProjectDir(projectHash), 'refs', 'heads');

      const branches: BranchInfo[] = [];
      try {
        const branchFiles = await fs.readdir(refsDir);
        for (const file of branchFiles) {
          const branchName = file;
          const commitHash = await fs.readFile(join(refsDir, file), 'utf8');
          branches.push({name: branchName, commitHash: commitHash.trim()});
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') throw error;
      }
      return branches;
    } catch (error: any) {
      throw new Error(`Failed to list branches: ${error.message}`);
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(projectPath: string, branchName: string): Promise<void> {
    try {
      const projectHash = this.hashProjectPath(projectPath);
      const branchPath = join(this.getProjectDir(projectHash), 'refs', 'heads', branchName);

      // Prevent deleting current branch
      const currentHead = await this.getHeadRef(projectHash);
      if (currentHead === `refs/heads/${branchName}`) {
        throw new Error(`Cannot delete branch ${branchName}: it is the current branch.`);
      }

      await fs.unlink(branchPath);
      console.log(`✅ Branch ${branchName} deleted.`);
    } catch (error: any) {
      throw new Error(`Failed to delete branch ${branchName}: ${error.message}`);
    }
  }

  /**
   * Get checkpoint info by ref
   */
  async getCheckpointInfo(projectPath: string, ref: string): Promise<GitCheckpointInfo | null> {
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
        parents: commit.parents,
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

      // If this is the initial commit (no parents), return all files as added
      if (checkpointInfo.parents.length === 0) {
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

      // Handle merge commits with multiple parents
      if (checkpointInfo.parents.length > 1) {
        console.log(`Merge commit detected with ${checkpointInfo.parents.length} parents`);

        // For merge commits, compare with the first parent (main branch)
        // and add a note about the merge nature
        const parentRef = checkpointInfo.parents[0];
        console.log(`Comparing merge commit ${ref} with first parent ${parentRef}`);

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
        const diff = await this.getFileDiff(projectPath, resolvedParent, resolvedCurrent);

        // Add merge commit metadata to the diff
        return {
          ...diff,
          fromRef: `${parentRef} (merge base)`,
          toRef: `${ref} (merge commit)`,
          stats: {
            ...diff.stats,
            // Add note about merge nature
            mergeInfo: {
              isMerge: true,
              parentCount: checkpointInfo.parents.length,
              parents: checkpointInfo.parents,
              note: `This is a merge commit with ${checkpointInfo.parents.length} parents. Changes shown are relative to the first parent (main branch).`
            }
          }
        };
      } else {
        // Single parent commit - standard comparison
        const parentRef = checkpointInfo.parents[0];
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
      }

    } catch (error: any) {
      throw new Error(`Failed to get checkpoint changes for ${ref}: ${error.message}`);
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(projectPath: string): Promise<StorageStats> {
    const projectHash = this.hashProjectPath(projectPath);
    const objectStore = new GitObjectStore(this.getProjectDir(projectHash));

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
    const objectStore = new GitObjectStore(this.getProjectDir(projectHash));

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
  private async initStorage(projectHash: string): Promise<GitObjectStore> {
    const projectDir = this.getProjectDir(projectHash);
    const dirs = [
      projectDir,
      join(projectDir, 'objects'),
      join(projectDir, 'refs', 'heads') // Create refs/heads directory
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, {recursive: true});
    }

    const objectStore = new GitObjectStore(projectDir);
    await objectStore.init();

    return objectStore;
  }

  /**
   * Restore files from a tree object
   */
  private async restoreFilesFromTree(
    objectStore: GitObjectStore,
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
    objectStore: GitObjectStore,
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
    objectStore: GitObjectStore,
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
    for (const [path, file2] of fileMap2) {
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
    
    for (const [path, file1] of fileMap1) {
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
    await this.atomicWrite(refPath, commitHash);
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
      await this.atomicWrite(headPath, `ref: ${ref}`);
    } else {
      // Detached HEAD (commit hash)
      await this.atomicWrite(headPath, ref);
    }
  }

  /**
   * Get current HEAD branch name
   */
  private async getHeadBranch(projectHash: string): Promise<string | null> {
    const headRef = await this.getHeadRef(projectHash);
    if (headRef && headRef.startsWith('ref: refs/heads/')) {
      return headRef.substring('ref: refs/heads/'.length);
    }
    return null;
  }

  /**
   * Garbage collect objects
   */
  private async garbageCollectObjects(objectStore: GitObjectStore, projectHash: string): Promise<void> {
    try {
      const referencedObjects = new Set<string>();

      // 1. Collect all reachable objects from HEAD and branches
      const branches = await this.listBranches(projectHash);
      const headRef = await this.getHeadRef(projectHash);

      const allRefs = branches.map(b => `refs/heads/${b.name}`);
      if (headRef && !headRef.startsWith('ref: ')) { // Detached HEAD
        allRefs.push(headRef);
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
    objectStore: GitObjectStore,
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
        for (const parent of commit.parents) {
          queue.push(parent);
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
        
        // Store the backup hash in a special backup ref
        const backupRef = `backup-${Date.now()}`;
        await this.createBranch(projectPath, backupRef, backupHash);
        
        console.log(`Backup stored in branch: ${backupRef}`);
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
    objectStore: GitObjectStore,
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
    objectStore: GitObjectStore,
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

  /**
   * Atomic file write
   */
  private async atomicWrite(filePath: string, content: string | Buffer): Promise<void> {
    const tempPath = `${filePath}.tmp.${Date.now()}`;

    try {
      await fs.writeFile(tempPath, content);
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }
}

/**
 * Create Git-style checkpoint storage instance
 */
export function createGitCheckpointStorage(config?: GitCheckpointConfig): GitCheckpointStorage {
  return new GitCheckpointStorage(config);
}