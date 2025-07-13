/**
 * Git-style checkpoint type definitions
 */

/**
 * Checkpoint information (Git-style), directly reflects core information of a Commit object
 */
export interface GitCheckpointInfo {
  hash: string;            // Commit hash
  description: string;     // User description (commit message)
  timestamp: string;       // Creation timestamp
  author: string;          // Author
  parents: string[];       // Parent Commit hash list
  treeHash: string;        // Root tree object hash
}

/**
 * Branch information
 */
export interface BranchInfo {
  name: string;
  commitHash: string;
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
 * Merge commit information
 */
export interface MergeInfo {
  isMerge: boolean;
  parentCount: number;
  parents: string[];
  note: string;
}

/**
 * Diff statistics
 */
export interface DiffStats {
  filesAdded: number;       // Added files count
  filesDeleted: number;     // Deleted files count
  filesModified: number;    // Modified files count
  filesRenamed: number;     // Renamed files count
  totalChanges: number;     // Total changes count
  sizeChange: number;       // Size change (bytes)
  mergeInfo?: MergeInfo;    // Merge commit information (optional)
}

/**
 * Git-style checkpoint system interface
 */
export interface GitCheckpointSystem {
  // Basic operations
  createCheckpoint(projectPath: string, description?: string, author?: string): Promise<string>;
  checkout(projectPath: string, ref: string, options?: CheckoutOptions): Promise<void>;
  getHistory(projectPath: string, branch?: string): Promise<GitCheckpointInfo[]>;
  
  // Branch management
  createBranch(projectPath: string, branchName: string, startPoint?: string): Promise<void>;
  switchBranch(projectPath: string, branchName: string): Promise<void>;
  listBranches(projectPath: string): Promise<BranchInfo[]>;
  deleteBranch(projectPath: string, branchName: string): Promise<void>;

  // Advanced operations
  getCheckpointInfo(projectPath: string, ref: string): Promise<GitCheckpointInfo | null>;
  listFiles(projectPath: string, ref: string): Promise<FileRestoreInfo[]>;
  getFileDiff(projectPath: string, fromRef: string, toRef: string): Promise<CheckpointDiff>;
  getCheckpointChanges(projectPath: string, ref: string): Promise<CheckpointDiff>;
  
  // Storage management
  getStorageStats(projectPath: string): Promise<StorageStats>;
  garbageCollect(projectPath: string): Promise<void>;
  
  // Import/export (future implementation)
  // exportCheckpoint(ref: string, outputPath: string): Promise<void>;
  // importCheckpoint(archivePath: string, projectPath: string): Promise<string>;
}

/**
 * Configuration options
 */
export interface GitCheckpointConfig {
  basePath?: string;              // Base storage path
  compressionLevel?: number;      // Compression level
  maxFileSize?: number;           // Maximum file size
  ignorePatterns?: string[];      // Ignore patterns
  author?: string;                // Default author
  autoGC?: boolean;               // Auto garbage collection
  gcThreshold?: number;           // Garbage collection threshold
}
