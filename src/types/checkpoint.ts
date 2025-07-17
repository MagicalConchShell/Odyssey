// Git-style checkpoint system type definitions
// Import Git checkpoint types

export type {
  GitCheckpointInfo,
  CheckpointDiff,
  FileRestoreInfo,
  StorageStats,
  FileDiff
} from '../../electron/types/git-checkpoint';

export type {
  GitHistory,
  GitCommit,
  GitBranch
} from '../../electron/ipc-handlers/types';

// Re-export as old interface names for compatibility
import type {
  GitCheckpointInfo as _GitCheckpointInfo,
  CheckpointDiff as _CheckpointDiff,
  FileRestoreInfo as _FileRestoreInfo,
  BranchInfo as _BranchInfo
} from '../../electron/types/git-checkpoint';

// Compatibility aliases
export type CheckpointInfo = _GitCheckpointInfo;
export type BranchInfo = _BranchInfo;
export type FileSnapshot = _FileRestoreInfo;

// Timeline tree node (for Git-style timeline visualization)
export interface TimelineTreeNode {
  checkpoint: _GitCheckpointInfo;      // Checkpoint information
  columnIndex: number;                // Horizontal column index (branch column)
  rowIndex: number;                   // Vertical row index (time order)
  branchColor: string;               // Branch color
  isCurrent: boolean;                // Whether this is the current checkpoint
  isMergeCommit: boolean;            // Whether this is a merge commit
  isBranchPoint: boolean;            // Whether this is a branch point
  branchName: string;                // Branch name this belongs to
}

// Connection line information (for drawing timeline connections)
export interface ConnectionLine {
  from: { rowIndex: number; columnIndex: number };   // Start coordinates (row/column index)
  to: { rowIndex: number; columnIndex: number };     // End coordinates (row/column index)
  type: 'direct' | 'branch' | 'merge'; // Connection type
  color: string;                    // Line color
  strokeWidth: number;              // Line width
  pathData?: string;                // SVG path data (for curves)
}

// UI state types
export interface TimelineViewState {
  selectedCheckpoint: string | null; // Selected checkpoint hash
  hoveredCheckpoint: string | null;  // Hovered checkpoint hash
  searchQuery: string;              // Search query
  sortOrder: 'newest' | 'oldest';   // Sort order
  showDetails: boolean;             // Show detailed information
}

// Checkpoint operation result
export interface CheckpointOperationResult {
  success: boolean;
  checkpointId?: string; // May still refer to commit hash here
  error?: string;
  metrics?: {
    duration: number;
    filesProcessed: number;
    totalSize: number;
    compressionRatio: number;
  };
}

// Branch operation result
export interface BranchOperationResult {
  success: boolean;
  branchName?: string;
  commitHash?: string;
  error?: string;
  operation: 'create' | 'switch' | 'delete' | 'merge';
  metadata?: {
    parentCommit?: string;
    isDetachedHead?: boolean;
    conflictFiles?: string[];
  };
}

// Branch state information
export interface BranchState {
  currentBranch: string | null;
  isDetachedHead: boolean;
  availableBranches: _BranchInfo[];
  uncommittedChanges: boolean;
  ahead: number; // Commits ahead of base
  behind: number; // Commits behind base
}

// Merge operation result
export interface MergeOperationResult {
  success: boolean;
  resultCommitHash?: string;
  error?: string;
  conflictFiles?: string[];
  mergeStrategy: 'fast-forward' | 'recursive' | 'manual';
  stats?: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

// Storage optimization result
export interface StorageOptimizationResult {
  success: boolean;
  error?: string;
  stats?: {
    objectsRemoved: number;
    bytesFreed: number;
    compressionImprovement: number;
    optimizationTime: number;
  };
}

// Checkpoint system API interface (UI-oriented)
export interface CheckpointSystemAPI {
  createCheckpoint(projectPath: string, description?: string): Promise<CheckpointOperationResult>;
  checkout(projectPath: string, ref: string): Promise<CheckpointOperationResult>;
  getHistory(projectPath: string, branch?: string): Promise<_GitCheckpointInfo[]>;
  getBranches(projectPath: string): Promise<_BranchInfo[]>;
  getCheckpointDiff(projectPath: string, fromRef: string, toRef: string): Promise<_CheckpointDiff>;
  optimizeStorage(projectPath: string): Promise<StorageOptimizationResult>;
  
  // Branch operations
  createBranch(projectPath: string, branchName: string, startPoint?: string): Promise<BranchOperationResult>;
  switchBranch(projectPath: string, branchName: string): Promise<BranchOperationResult>;
  deleteBranch(projectPath: string, branchName: string): Promise<BranchOperationResult>;
  getBranchState(projectPath: string): Promise<BranchState>;
  
  // Merge operations
  mergeBranch(projectPath: string, sourceBranch: string, targetBranch: string): Promise<MergeOperationResult>;
  canMerge(projectPath: string, sourceBranch: string, targetBranch: string): Promise<boolean>;
}

// Branch name validation rules
export interface BranchValidationRules {
  readonly MAX_LENGTH: number;
  readonly MIN_LENGTH: number;
  readonly FORBIDDEN_CHARS: RegExp;
  readonly RESERVED_NAMES: string[];
}

// Branch name validation result
export interface BranchValidationResult {
  isValid: boolean;
  error?: string;
  suggestions?: string[];
}

// Timeline navigation context
export interface TimelineNavigationContext {
  currentCommit: string;
  parentCommits: string[];
  childCommits: string[];
  branchPath: string[];
  canNavigateBack: boolean;
  canNavigateForward: boolean;
}

// Keyboard shortcuts configuration
export interface KeyboardShortcuts {
  navigateUp: string;
  navigateDown: string;
  createCheckpoint: string;
  createBranch: string;
  switchBranch: string;
  restoreCheckpoint: string;
  showDetails: string;
  search: string;
}

// Performance metrics
export interface PerformanceMetrics {
  renderTime: number;
  dataLoadTime: number;
  interactionLatency: number;
  memoryUsage: number;
  lastUpdateTimestamp: number;
}
