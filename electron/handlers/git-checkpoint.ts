import {IpcMain} from 'electron';
import {GitCheckpointStorage} from '../git-checkpoint-storage.js';
import {registerHandler} from './base-handler.js';
import {ApiResponse, GitBranch, GitDiff, GitFileInfo, GitHistory, GitStorageStats, GitStatusResult} from './types.js';
import type {
  BranchInfo,
  CheckoutOptions,
  CheckpointDiff,
  FileRestoreInfo,
  GitCheckpointInfo
} from '../types/git-checkpoint.js';

/**
 * Create a new checkpoint
 */
async function createCheckpoint(
  projectPath: string,
  description?: string,
  author?: string
): Promise<ApiResponse<{ commitHash: string }>> {
  try {
    const storage = new GitCheckpointStorage();
    const commitHash = await storage.createCheckpoint(projectPath, description, author);

    return {
      success: true,
      data: {commitHash}
    };
  } catch (error: any) {
    return {success: false, error: error.message};
  }
}

/**
 * Checkout a specific commit or branch
 */
async function checkout(
  projectPath: string,
  ref: string,
  options?: CheckoutOptions
): Promise<ApiResponse<void>> {
  try {
    const storage = new GitCheckpointStorage();
    await storage.checkout(projectPath, ref, options);

    return {success: true};
  } catch (error: any) {
    return {success: false, error: error.message};
  }
}

/**
 * Get commit history
 */
async function getHistory(
  projectPath: string,
  branch?: string
): Promise<GitHistory> {

  const storage = new GitCheckpointStorage();
  const history = await storage.getHistory(projectPath, branch);

  // Convert GitCheckpointInfo[] to GitHistory format
  return {
    commits: history.map((info: GitCheckpointInfo) => ({
      hash: info.hash,
      message: info.description,
      author: info.author,
      date: info.timestamp,
      parents: info.parents
    })),
    branches: [] // Will be populated separately if needed
  }
}

/**
 * Create a new branch
 */
async function createBranch(
  projectPath: string,
  branchName: string,
  startPoint?: string
): Promise<ApiResponse<void>> {
  try {
    const storage = new GitCheckpointStorage();
    await storage.createBranch(projectPath, branchName, startPoint);

    return {success: true};
  } catch (error: any) {
    return {success: false, error: error.message};
  }
}

/**
 * Switch to a different branch
 */
async function switchBranch(
  projectPath: string,
  branchName: string
): Promise<ApiResponse<void>> {
  try {
    const storage = new GitCheckpointStorage();
    await storage.switchBranch(projectPath, branchName);

    return {success: true};
  } catch (error: any) {
    return {success: false, error: error.message};
  }
}

/**
 * List all branches
 */
async function listBranches(
  projectPath: string
): Promise<GitBranch[]> {
  const storage = new GitCheckpointStorage();
  const branches = await storage.listBranches(projectPath);

  // Convert BranchInfo[] to GitBranch[] format
  return branches.map((branch: BranchInfo) => ({
    name: branch.name,
    current: false, // TODO: Determine current branch
    hash: branch.commitHash
  }))
}

/**
 * Delete a branch
 */
async function deleteBranch(
  projectPath: string,
  branchName: string
): Promise<ApiResponse<void>> {
  try {
    const storage = new GitCheckpointStorage();
    await storage.deleteBranch(projectPath, branchName);

    return {success: true};
  } catch (error: any) {
    return {success: false, error: error.message};
  }
}

/**
 * Get checkpoint information
 */
async function getCheckpointInfo(
  projectPath: string,
  ref: string
): Promise<GitCheckpointInfo | null> {
  try {
    const storage = new GitCheckpointStorage();
    return await storage.getCheckpointInfo(projectPath, ref);
  } catch (error: any) {
    throw new Error(error.message);
  }
}

/**
 * List files in a checkpoint
 */
async function listFiles(
  projectPath: string,
  ref: string
): Promise<GitFileInfo[]> {
  try {
    const storage = new GitCheckpointStorage();
    const files = await storage.listFiles(projectPath, ref);

    // Convert FileRestoreInfo[] to GitFileInfo[] format
    return files.map((file: FileRestoreInfo) => ({
      path: file.path,
      hash: file.hash,
      size: file.size,
      mode: file.mode.toString()
    }));
  } catch (error: any) {
    throw new Error(error.message);
  }
}

/**
 * Get file diff between commits
 */
async function getFileDiff(
  projectPath: string,
  fromRef: string,
  toRef: string
): Promise<GitDiff> {
  try {
    const storage = new GitCheckpointStorage();
    const diff = await storage.getFileDiff(projectPath, fromRef, toRef);

    // Convert CheckpointDiff to GitDiff format
    const gitDiff: GitDiff = {
      files: (diff.files || []).map(file => ({
        path: file.path,
        status: file.type as 'added' | 'modified' | 'deleted' | 'renamed',
        oldPath: file.oldPath,
        additions: 0, // TODO: Calculate line changes
        deletions: 0, // TODO: Calculate line changes
        content: undefined // Content will be loaded separately if needed
      })),
      stats: {
        additions: diff.stats.totalChanges,
        deletions: 0, // TODO: Calculate deletions
        changes: diff.stats.totalChanges
      }
    };

    return gitDiff;
  } catch (error: any) {
    throw new Error(error.message);
  }
}

/**
 * Get checkpoint changes
 */
async function getCheckpointChanges(
  projectPath: string,
  ref: string
): Promise<CheckpointDiff> {
  try {
    const storage = new GitCheckpointStorage();
    return await storage.getCheckpointChanges(projectPath, ref);
  } catch (error: any) {
    throw new Error(error.message);
  }
}

/**
 * Get file content at a specific commit
 */
async function getFileContent(
  projectPath: string,
  ref: string,
  filePath: string
): Promise<string> {
  try {
    const storage = new GitCheckpointStorage();
    const content = await storage.getFileContent(projectPath, ref, filePath);

    if (content === null) {
      throw new Error(`File not found: ${filePath} at ref ${ref}`);
    }

    return content;
  } catch (error: any) {
    throw new Error(error.message);
  }
}

/**
 * Get file content by hash
 */
async function getFileContentByHash(
  projectPath: string,
  hash: string
): Promise<string> {
  try {
    const storage = new GitCheckpointStorage();
    const content = await storage.getFileContentByHash(projectPath, hash);

    if (content === null) {
      throw new Error(`File not found for hash: ${hash}`);
    }

    return content;
  } catch (error: any) {
    throw new Error(error.message);
  }
}

/**
 * Get file content diff
 */
async function getFileContentDiff(
  projectPath: string,
  fromRef: string,
  toRef: string,
  filePath: string
): Promise<GitDiff> {
  try {
    const storage = new GitCheckpointStorage();
    const diffResult = await storage.getFileContentDiff(projectPath, fromRef, toRef, filePath);

    // Calculate basic diff stats based on content
    let additions = 0;
    let deletions = 0;

    if (diffResult.oldContent && diffResult.newContent) {
      const oldLines = diffResult.oldContent.split('\n');
      const newLines = diffResult.newContent.split('\n');

      // Simple diff calculation (could be improved with proper diff algorithm)
      if (oldLines.length !== newLines.length) {
        additions = Math.max(0, newLines.length - oldLines.length);
        deletions = Math.max(0, oldLines.length - newLines.length);
      } else {
        // Count changed lines as both addition and deletion
        let changedLines = 0;
        for (let i = 0; i < oldLines.length; i++) {
          if (oldLines[i] !== newLines[i]) {
            changedLines++;
          }
        }
        additions = changedLines;
        deletions = changedLines;
      }
    } else if (diffResult.newContent && !diffResult.oldContent) {
      // File was added
      additions = diffResult.newContent.split('\n').length;
    } else if (diffResult.oldContent && !diffResult.newContent) {
      // File was deleted
      deletions = diffResult.oldContent.split('\n').length;
    }

    // Convert the result to GitDiff format
    return {
      files: [{
        path: filePath,
        status: diffResult.diffType as 'added' | 'modified' | 'deleted' | 'renamed',
        additions,
        deletions,
        content: `--- a/${filePath}\n+++ b/${filePath}\n` +
          (diffResult.oldContent || '') + '\n' +
          (diffResult.newContent || '')
      }],
      stats: {
        additions,
        deletions,
        changes: additions + deletions
      }
    };
  } catch (error: any) {
    throw new Error(error.message);
  }
}

/**
 * Get storage statistics
 */
async function getStorageStats(
  projectPath: string
): Promise<GitStorageStats> {
  try {
    const storage = new GitCheckpointStorage();
    const stats = await storage.getStorageStats(projectPath);

    // Convert StorageStats to GitStorageStats format
    return {
      totalSize: stats.storageSize,
      objectCount: stats.totalObjects,
      branchCount: 0, // TODO: Get branch count
      commitCount: stats.totalCommits
    };
  } catch (error: any) {
    throw new Error(error.message);
  }
}

/**
 * Garbage collect storage
 */
async function garbageCollect(
  projectPath: string
): Promise<void> {

  const storage = new GitCheckpointStorage();
  await storage.garbageCollect(projectPath);
}

/**
 * Optimize storage (placeholder - using garbage collect for now)
 */
async function optimizeStorage(
  projectPath: string
): Promise<void> {

  const storage = new GitCheckpointStorage();
  await storage.garbageCollect(projectPath);
}

/**
 * Get git status - compare current working directory with last checkpoint
 */
async function getGitStatus(
  projectPath: string
): Promise<GitStatusResult> {
  try {
    const storage = new GitCheckpointStorage();
    
    // Get the current HEAD commit
    const history = await storage.getHistory(projectPath);
    if (history.length === 0) {
      // No checkpoints yet, all files are new
      return {
        files: [],
        summary: {
          staged: 0,
          unstaged: 0,
          untracked: 0,
          modified: 0,
          added: 0,
          deleted: 0
        }
      };
    }

    const lastCheckpoint = history[0]; // Most recent checkpoint
    
    // Get files from last checkpoint
    const checkpointFiles = await storage.listFiles(projectPath, lastCheckpoint.hash);
    
    // Get current working directory files
    const currentFiles = await getAllFiles(projectPath);
    
    // Compare files and determine status
    const fileStatuses = await compareFiles(checkpointFiles, currentFiles);
    
    // Calculate summary
    const summary = {
      staged: 0, // Not implemented yet
      unstaged: fileStatuses.filter(f => f.status === 'modified' || f.status === 'deleted').length,
      untracked: fileStatuses.filter(f => f.status === 'untracked').length,
      modified: fileStatuses.filter(f => f.status === 'modified').length,
      added: fileStatuses.filter(f => f.status === 'untracked').length,
      deleted: fileStatuses.filter(f => f.status === 'deleted').length
    };

    return {
      files: fileStatuses,
      summary
    };
  } catch (error: any) {
    console.warn('Failed to get git status:', error.message);
    return {
      files: [],
      summary: {
        staged: 0,
        unstaged: 0,
        untracked: 0,
        modified: 0,
        added: 0,
        deleted: 0
      }
    };
  }
}

/**
 * Get all files in a directory recursively
 */
async function getAllFiles(dirPath: string): Promise<{path: string, size: number, hash: string}[]> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const crypto = await import('crypto');
  
  const files: {path: string, size: number, hash: string}[] = [];
  
  async function scanDirectory(currentPath: string, relativePath: string = '') {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativeFile = relativePath ? path.join(relativePath, entry.name) : entry.name;
        
        // Skip common ignored directories
        if (entry.isDirectory() && ['node_modules', '.git', 'dist', 'build', '.next', '.nuxt'].includes(entry.name)) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath, relativeFile);
        } else {
          try {
            const stats = await fs.stat(fullPath);
            const content = await fs.readFile(fullPath);
            const hash = crypto.createHash('sha256').update(content).digest('hex');
            
            files.push({
              path: relativeFile,
              size: stats.size,
              hash
            });
          } catch (err) {
            // Skip files that can't be read
            console.warn(`Cannot read file ${fullPath}:`, err);
          }
        }
      }
    } catch (err) {
      console.warn(`Cannot scan directory ${currentPath}:`, err);
    }
  }
  
  await scanDirectory(dirPath);
  return files;
}

/**
 * Compare checkpoint files with current files
 */
async function compareFiles(
  checkpointFiles: any[],
  currentFiles: {path: string, size: number, hash: string}[]
): Promise<{path: string, status: 'modified' | 'untracked' | 'deleted'}[]> {
  const statuses: {path: string, status: 'modified' | 'untracked' | 'deleted'}[] = [];
  
  // Create maps for easier lookup
  const checkpointMap = new Map(checkpointFiles.map(f => [f.path, f]));
  const currentMap = new Map(currentFiles.map(f => [f.path, f]));
  
  // Check for modified and untracked files
  for (const currentFile of currentFiles) {
    const checkpointFile = checkpointMap.get(currentFile.path);
    
    if (!checkpointFile) {
      // File doesn't exist in checkpoint, it's untracked
      statuses.push({
        path: currentFile.path,
        status: 'untracked'
      });
    } else if (checkpointFile.hash !== currentFile.hash) {
      // File exists but hash is different, it's modified
      statuses.push({
        path: currentFile.path,
        status: 'modified'
      });
    }
  }
  
  // Check for deleted files
  for (const checkpointFile of checkpointFiles) {
    if (!checkpointFile.isDirectory && !currentMap.has(checkpointFile.path)) {
      statuses.push({
        path: checkpointFile.path,
        status: 'deleted'
      });
    }
  }
  
  return statuses;
}

/**
 * Register all git checkpoint related IPC handlers
 */
export function setupGitCheckpointHandlers(ipcMain: IpcMain): void {
  // Create checkpoint
  registerHandler(
    ipcMain,
    'git-checkpoint:createCheckpoint',
    createCheckpoint
  );

  // Checkout
  registerHandler(
    ipcMain,
    'git-checkpoint:checkout',
    checkout
  );

  // Get history
  registerHandler(
    ipcMain,
    'git-checkpoint:getHistory',
    getHistory
  );

  // Create branch
  registerHandler(
    ipcMain,
    'git-checkpoint:createBranch',
    createBranch
  );

  // Switch branch
  registerHandler(
    ipcMain,
    'git-checkpoint:switchBranch',
    switchBranch
  );

  // List branches
  registerHandler(
    ipcMain,
    'git-checkpoint:listBranches',
    listBranches
  );

  // Delete branch
  registerHandler(
    ipcMain,
    'git-checkpoint:deleteBranch',
    deleteBranch
  );

  // Get checkpoint info
  registerHandler(
    ipcMain,
    'git-checkpoint:getCheckpointInfo',
    getCheckpointInfo
  );

  // List files
  registerHandler(
    ipcMain,
    'git-checkpoint:listFiles',
    listFiles
  );

  // Get file diff
  registerHandler(
    ipcMain,
    'git-checkpoint:getFileDiff',
    getFileDiff
  );

  // Get checkpoint changes
  registerHandler(
    ipcMain,
    'git-checkpoint:getCheckpointChanges',
    getCheckpointChanges
  );

  // Get file content
  registerHandler(
    ipcMain,
    'git-checkpoint:getFileContent',
    getFileContent
  );

  // Get file content by hash
  registerHandler(
    ipcMain,
    'git-checkpoint:getFileContentByHash',
    getFileContentByHash
  );

  // Get file content diff
  registerHandler(
    ipcMain,
    'git-checkpoint:getFileContentDiff',
    getFileContentDiff
  );

  // Get storage stats
  registerHandler(
    ipcMain,
    'git-checkpoint:getStorageStats',
    getStorageStats
  );

  // Garbage collect
  registerHandler(
    ipcMain,
    'git-checkpoint:garbageCollect',
    garbageCollect
  );

  // Optimize storage
  registerHandler(
    ipcMain,
    'git-checkpoint:optimizeStorage',
    optimizeStorage
  );

  // Get git status
  registerHandler(
    ipcMain,
    'git-checkpoint:getGitStatus',
    getGitStatus
  );

}