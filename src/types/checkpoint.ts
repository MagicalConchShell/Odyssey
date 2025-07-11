// Git风格检查点系统类型定义
// 导入Git检查点类型

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
} from '../../electron/handlers/types';

// 重新导出为旧的接口名称以保持兼容性
import type {
  GitCheckpointInfo as _GitCheckpointInfo,
  CheckpointDiff as _CheckpointDiff,
  FileRestoreInfo as _FileRestoreInfo,
  BranchInfo as _BranchInfo
} from '../../electron/types/git-checkpoint';

// 兼容性别名
export type CheckpointInfo = _GitCheckpointInfo;
export type BranchInfo = _BranchInfo;
export type FileSnapshot = _FileRestoreInfo;

// 时间线树节点（用于Git风格的时间线可视化）
export interface TimelineTreeNode {
  checkpoint: _GitCheckpointInfo;      // 检查点信息
  columnIndex: number;                // 水平列索引（分支列）
  rowIndex: number;                   // 垂直行索引（时间顺序）
  branchColor: string;               // 分支颜色
  isCurrent: boolean;                // 是否为当前检查点
  isMergeCommit: boolean;            // 是否为合并提交
  isBranchPoint: boolean;            // 是否为分支点
  branchName: string;                // 所属分支名称
}

// 连接线信息（用于绘制时间线连接）
export interface ConnectionLine {
  from: { rowIndex: number; columnIndex: number };   // 起点坐标（行/列索引）
  to: { rowIndex: number; columnIndex: number };     // 终点坐标（行/列索引）
  type: 'direct' | 'branch' | 'merge'; // 连接类型
  color: string;                    // 线条颜色
  strokeWidth: number;              // 线条宽度
  pathData?: string;                // SVG路径数据（用于曲线）
}

// UI状态类型
export interface TimelineViewState {
  selectedCheckpoint: string | null; // 选中的检查点哈希
  hoveredCheckpoint: string | null;  // 悬停的检查点哈希
  searchQuery: string;              // 搜索查询
  sortOrder: 'newest' | 'oldest';   // 排序顺序
  showDetails: boolean;             // 显示详细信息
}

// 检查点操作结果
export interface CheckpointOperationResult {
  success: boolean;
  checkpointId?: string; // 在这里可能仍然指 commit hash
  error?: string;
  metrics?: {
    duration: number;
    filesProcessed: number;
    totalSize: number;
    compressionRatio: number;
  };
}

// 分支操作结果
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

// 分支状态信息
export interface BranchState {
  currentBranch: string | null;
  isDetachedHead: boolean;
  availableBranches: _BranchInfo[];
  uncommittedChanges: boolean;
  ahead: number; // Commits ahead of base
  behind: number; // Commits behind base
}

// 合并操作结果
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

// 存储优化结果
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

// 检查点系统API接口 (面向UI)
export interface CheckpointSystemAPI {
  createCheckpoint(projectPath: string, description?: string): Promise<CheckpointOperationResult>;
  checkout(projectPath: string, ref: string): Promise<CheckpointOperationResult>;
  getHistory(projectPath: string, branch?: string): Promise<_GitCheckpointInfo[]>;
  getBranches(projectPath: string): Promise<_BranchInfo[]>;
  getCheckpointDiff(projectPath: string, fromRef: string, toRef: string): Promise<_CheckpointDiff>;
  optimizeStorage(projectPath: string): Promise<StorageOptimizationResult>;
  
  // 分支操作
  createBranch(projectPath: string, branchName: string, startPoint?: string): Promise<BranchOperationResult>;
  switchBranch(projectPath: string, branchName: string): Promise<BranchOperationResult>;
  deleteBranch(projectPath: string, branchName: string): Promise<BranchOperationResult>;
  getBranchState(projectPath: string): Promise<BranchState>;
  
  // 合并操作
  mergeBranch(projectPath: string, sourceBranch: string, targetBranch: string): Promise<MergeOperationResult>;
  canMerge(projectPath: string, sourceBranch: string, targetBranch: string): Promise<boolean>;
}

// 分支名称验证规则
export interface BranchValidationRules {
  readonly MAX_LENGTH: number;
  readonly MIN_LENGTH: number;
  readonly FORBIDDEN_CHARS: RegExp;
  readonly RESERVED_NAMES: string[];
}

// 分支名称验证结果
export interface BranchValidationResult {
  isValid: boolean;
  error?: string;
  suggestions?: string[];
}

// 时间线导航上下文
export interface TimelineNavigationContext {
  currentCommit: string;
  parentCommits: string[];
  childCommits: string[];
  branchPath: string[];
  canNavigateBack: boolean;
  canNavigateForward: boolean;
}

// 键盘快捷键配置
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

// 性能度量
export interface PerformanceMetrics {
  renderTime: number;
  dataLoadTime: number;
  interactionLatency: number;
  memoryUsage: number;
  lastUpdateTimestamp: number;
}
