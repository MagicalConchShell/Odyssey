import {IpcMain} from 'electron';
import {CheckpointStorage} from '../services/checkpoint-service.js';
import {registerHandler} from './base-handler.js';
import {ApiResponse, GitStatusResult} from './types.js';
import type {
  CheckoutOptions,
  CheckpointDiff,
  FileRestoreInfo,
  CheckpointInfo,
  StorageStats
} from '../types/checkpoint.js';

/**
 * Higher-order function to wrap storage operations with consistent error handling
 */
async function withStorageOperation<T>(
  operation: (storage: CheckpointStorage) => Promise<T>
): Promise<ApiResponse<T>> {
  try {
    const storage = new CheckpointStorage();
    const result = await operation(storage);
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * For operations that don't return data, only success/failure
 */
async function withVoidStorageOperation(
  operation: (storage: CheckpointStorage) => Promise<void>
): Promise<ApiResponse<void>> {
  try {
    const storage = new CheckpointStorage();
    await operation(storage);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Create a new checkpoint
 */
async function createCheckpoint(
  projectPath: string,
  description?: string,
  author?: string
): Promise<ApiResponse<{ commitHash: string }>> {
  return withStorageOperation(async (storage) => {
    const commitHash = await storage.createCheckpoint(projectPath, description, author);
    return { commitHash };
  });
}

/**
 * Checkout a specific commit or branch
 */
async function checkout(
  projectPath: string,
  ref: string,
  options?: CheckoutOptions
): Promise<ApiResponse<void>> {
  return withVoidStorageOperation(async (storage) => {
    await storage.checkout(projectPath, ref, options);
  });
}

/**
 * Reset to a specific checkpoint (destructive operation)
 */
async function resetToCheckpoint(
  projectPath: string,
  targetCommitHash: string
): Promise<ApiResponse<void>> {
  return withVoidStorageOperation(async (storage) => {
    await storage.resetToCheckpoint(projectPath, targetCommitHash);
  });
}

/**
 * Delete a checkpoint (only supports deleting the latest checkpoint)
 */
async function deleteCheckpoint(
  projectPath: string,
  commitHash: string
): Promise<ApiResponse<void>> {
  return withVoidStorageOperation(async (storage) => {
    await storage.deleteCheckpoint(projectPath, commitHash);
  });
}

/**
 * Get commit history - returns CheckpointInfo[] directly
 */
async function getHistory(
  projectPath: string
): Promise<CheckpointInfo[]> {
  const storage = new CheckpointStorage();
  return storage.getHistory(projectPath);
}




/**
 * Get checkpoint information
 */
async function getCheckpointInfo(
  projectPath: string,
  ref: string
): Promise<CheckpointInfo | null> {
  const storage = new CheckpointStorage();
  return storage.getCheckpointInfo(projectPath, ref);
}

/**
 * List files in a checkpoint - returns FileRestoreInfo[] directly
 */
async function listFiles(
  projectPath: string,
  ref: string
): Promise<FileRestoreInfo[]> {
  const storage = new CheckpointStorage();
  return storage.listFiles(projectPath, ref);
}

/**
 * Get file diff between commits - returns CheckpointDiff directly
 */
async function getFileDiff(
  projectPath: string,
  fromRef: string,
  toRef: string
): Promise<CheckpointDiff> {
  const storage = new CheckpointStorage();
  return storage.getFileDiff(projectPath, fromRef, toRef);
}

/**
 * Get checkpoint changes
 */
async function getCheckpointChanges(
  projectPath: string,
  ref: string
): Promise<CheckpointDiff> {
  const storage = new CheckpointStorage();
  return storage.getCheckpointChanges(projectPath, ref);
}

/**
 * Get file content at a specific commit
 */
async function getFileContent(
  projectPath: string,
  ref: string,
  filePath: string
): Promise<string> {
  const storage = new CheckpointStorage();
  const content = await storage.getFileContent(projectPath, ref, filePath);

  if (content === null) {
    throw new Error(`File not found: ${filePath} at ref ${ref}`);
  }

  return content;
}

/**
 * Get file content by hash
 */
async function getFileContentByHash(
  projectPath: string,
  hash: string
): Promise<string> {
  const storage = new CheckpointStorage();
  const content = await storage.getFileContentByHash(projectPath, hash);

  if (content === null) {
    throw new Error(`File not found for hash: ${hash}`);
  }

  return content;
}

// Simple interface for file content diff result
interface FileContentDiffResult {
  files: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    additions: number;
    deletions: number;
    content: string;
  }>;
  stats: {
    additions: number;
    deletions: number;
    changes: number;
  };
}

/**
 * Get file content diff with computed line differences
 */
async function getFileContentDiff(
  projectPath: string,
  fromRef: string,
  toRef: string,
  filePath: string
): Promise<FileContentDiffResult> {
  try {
    const storage = new CheckpointStorage();
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
 * Get storage statistics - returns StorageStats directly
 */
async function getStorageStats(
  projectPath: string
): Promise<StorageStats> {
  const storage = new CheckpointStorage();
  return storage.getStorageStats(projectPath);
}

/**
 * Garbage collect storage
 */
async function garbageCollect(
  projectPath: string
): Promise<void> {
  const storage = new CheckpointStorage();
  return storage.garbageCollect(projectPath);
}

/**
 * Optimize storage (placeholder - using garbage collect for now)
 */
async function optimizeStorage(
  projectPath: string
): Promise<void> {
  const storage = new CheckpointStorage();
  return storage.garbageCollect(projectPath);
}

/**
 * Get git status - compare current working directory with last checkpoint
 */
async function getGitStatus(
  projectPath: string
): Promise<GitStatusResult> {
  try {
    const storage = new CheckpointStorage();
    
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
 * Register all checkpoint related IPC handlers
 */
export function setupCheckpointHandlers(ipcMain: IpcMain): void {
  // Create checkpoint
  registerHandler(
    ipcMain,
    'checkpoint:createCheckpoint',
    createCheckpoint
  );

  // Checkout
  registerHandler(
    ipcMain,
    'checkpoint:checkout',
    checkout
  );

  // Reset to checkpoint
  registerHandler(
    ipcMain,
    'checkpoint:resetToCheckpoint',
    resetToCheckpoint
  );

  // Delete checkpoint
  registerHandler(
    ipcMain,
    'checkpoint:deleteCheckpoint',
    deleteCheckpoint
  );

  // Get history
  registerHandler(
    ipcMain,
    'checkpoint:getHistory',
    getHistory
  );


  // Get checkpoint info
  registerHandler(
    ipcMain,
    'checkpoint:getCheckpointInfo',
    getCheckpointInfo
  );

  // List files
  registerHandler(
    ipcMain,
    'checkpoint:listFiles',
    listFiles
  );

  // Get file diff
  registerHandler(
    ipcMain,
    'checkpoint:getFileDiff',
    getFileDiff
  );

  // Get checkpoint changes
  registerHandler(
    ipcMain,
    'checkpoint:getCheckpointChanges',
    getCheckpointChanges
  );

  // Get file content
  registerHandler(
    ipcMain,
    'checkpoint:getFileContent',
    getFileContent
  );

  // Get file content by hash
  registerHandler(
    ipcMain,
    'checkpoint:getFileContentByHash',
    getFileContentByHash
  );

  // Get file content diff
  registerHandler(
    ipcMain,
    'checkpoint:getFileContentDiff',
    getFileContentDiff
  );

  // Get storage stats
  registerHandler(
    ipcMain,
    'checkpoint:getStorageStats',
    getStorageStats
  );

  // Garbage collect
  registerHandler(
    ipcMain,
    'checkpoint:garbageCollect',
    garbageCollect
  );

  // Optimize storage
  registerHandler(
    ipcMain,
    'checkpoint:optimizeStorage',
    optimizeStorage
  );

  // Get git status
  registerHandler(
    ipcMain,
    'checkpoint:getGitStatus',
    getGitStatus
  );

}