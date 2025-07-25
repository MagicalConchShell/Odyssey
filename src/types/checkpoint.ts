// Checkpoint system type definitions
// Import checkpoint types

export type {
  CheckpointInfo,
  CheckpointDiff,
  FileRestoreInfo,
  StorageStats,
  FileDiff
} from '../../electron/types/checkpoint';

// Removed GitHistory and GitCommit - now using CheckpointInfo[] directly

// Re-export as old interface names for compatibility
import type {
  CheckpointInfo as _CheckpointInfo,
  CheckpointDiff as _CheckpointDiff,
  FileRestoreInfo as _FileRestoreInfo
} from '../../electron/types/checkpoint';

// Compatibility aliases
export type FileSnapshot = _FileRestoreInfo;

// Timeline tree node (for checkpoint timeline visualization)
export interface TimelineTreeNode {
  checkpoint: _CheckpointInfo;      // Checkpoint information
  columnIndex: number;                // Always 0 for linear timeline
  rowIndex: number;                   // Vertical row index (time order)
  timelineColor: string;             // Timeline color (consistent naming)
  isCurrent: boolean;                // Whether this is the current checkpoint
}

// Connection line information (for drawing simple vertical timeline connections)
export interface ConnectionLine {
  from: { rowIndex: number; columnIndex: number };   // Start coordinates (always column 0)
  to: { rowIndex: number; columnIndex: number };     // End coordinates (always column 0)
  color: string;                    // Line color
  strokeWidth: number;              // Line width
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
  getHistory(projectPath: string): Promise<_CheckpointInfo[]>;
  getCheckpointDiff(projectPath: string, fromRef: string, toRef: string): Promise<_CheckpointDiff>;
  optimizeStorage(projectPath: string): Promise<StorageOptimizationResult>;
}



// Timeline navigation context (simplified for linear history)
export interface TimelineNavigationContext {
  currentCheckpoint: string;
  parentCheckpoint: string | null;
  childCheckpoint: string | null;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
}

// Keyboard shortcuts configuration
export interface KeyboardShortcuts {
  navigateUp: string;
  navigateDown: string;
  createCheckpoint: string;
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
