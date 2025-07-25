/**
 * Checkpoint type definitions
 */

/**
 * Checkpoint information, simplified for linear checkpoint history
 */
export interface CheckpointInfo {
  hash: string;            // Checkpoint hash
  description: string;     // User description
  timestamp: string;       // Creation timestamp
  author: string;          // Author
  parent: string | null;   // Parent checkpoint hash (single parent for linear history)
  treeHash: string;        // Root tree object hash
}


/**
 * Storage statistics
 */
export interface StorageStats {
  totalObjects: number;          // Total object count
  uniqueBlobs: number;           // Unique blob count
  uniqueTrees: number;           // Unique tree count
  totalCommits: number;          // Total commit count
  storageSize: number;           // Storage size
  deduplicationRatio: number;    // Deduplication ratio
}

/**
 * File restore information
 */
export interface FileRestoreInfo {
  path: string;            // File path
  hash: string;            // File hash
  size: number;            // File size
  mode: number;            // File permissions
  isDirectory: boolean;    // Whether it is a directory
}

/**
 * Restore options (now Checkout options)
 */
export interface CheckoutOptions {
  overwrite?: boolean;     // Whether to overwrite existing files
  preservePermissions?: boolean; // Whether to preserve permissions
  excludePatterns?: string[]; // Exclude patterns
  includePatterns?: string[]; // Include patterns
}

/**
 * Diff type
 */
export type DiffType = 'added' | 'deleted' | 'modified' | 'renamed';

/**
 * File diff information
 */
export interface FileDiff {
  type: DiffType;
  path: string;
  oldPath?: string;        // Original path for rename
  oldHash?: string;        // Original hash
  newHash?: string;        // New hash
  oldSize?: number;        // Original size
  newSize?: number;        // New size
  isDirectory?: boolean;   // Whether it is a directory
}

/**
 * Checkpoint diff
 */
export interface CheckpointDiff {
  fromRef: string;          // Source ref (commit hash or branch)
  toRef: string;            // Target ref (commit hash or branch)
  files?: FileDiff[];       // File diff list (optional, will be serialized)
  serializedFiles?: string; // Serialized files array for IPC
  stats: DiffStats;         // Diff statistics
}

/**
 * Diff statistics (simplified for linear checkpoints)
 */
export interface DiffStats {
  filesAdded: number;       // Added files count
  filesDeleted: number;     // Deleted files count
  filesModified: number;    // Modified files count
  filesRenamed: number;     // Renamed files count
  totalChanges: number;     // Total changes count
  sizeChange: number;       // Size change (bytes)
}

/**
 * Checkpoint system interface
 */
export interface CheckpointSystem {
  // Basic operations
  createCheckpoint(projectPath: string, description?: string, author?: string): Promise<string>;
  checkout(projectPath: string, ref: string, options?: CheckoutOptions): Promise<void>;
  resetToCheckpoint(projectPath: string, targetCommitHash: string): Promise<void>;
  deleteCheckpoint(projectPath: string, commitHash: string): Promise<void>;
  getHistory(projectPath: string): Promise<CheckpointInfo[]>;

  // Advanced operations
  getCheckpointInfo(projectPath: string, ref: string): Promise<CheckpointInfo | null>;
  listFiles(projectPath: string, ref: string): Promise<FileRestoreInfo[]>;
  getFileDiff(projectPath: string, fromRef: string, toRef: string): Promise<CheckpointDiff>;
  getCheckpointChanges(projectPath: string, ref: string): Promise<CheckpointDiff>;
  
  // Storage management
  getStorageStats(projectPath: string): Promise<StorageStats>;
  garbageCollect(projectPath: string): Promise<void>;
  optimizeStorage(projectPath: string): Promise<void>;
  
  // Import/export (future implementation)
  exportCheckpoint(checkpointId: string, outputPath: string): Promise<void>;
  importCheckpoint(archivePath: string, projectPath: string): Promise<string>;
}

/**
 * Configuration options
 */
export interface CheckpointConfig {
  basePath?: string;              // Base storage path
  compressionLevel?: number;      // Compression level
  maxFileSize?: number;           // Maximum file size
  ignorePatterns?: string[];      // Ignore patterns
  author?: string;                // Default author
  autoGC?: boolean;               // Auto garbage collection
  gcThreshold?: number;           // Garbage collection threshold
}