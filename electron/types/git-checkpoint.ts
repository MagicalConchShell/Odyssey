/**
 * Git风格的检查点类型定义
 */

/**
 * 检查点信息（Git风格），直接反映一个Commit对象的核心信息
 */
export interface GitCheckpointInfo {
  hash: string;            // Commit 哈希
  description: string;     // 用户描述 (commit message)
  timestamp: string;       // 创建时间戳
  author: string;          // 作者
  parents: string[];       // 父Commit哈希列表
  treeHash: string;        // 根tree对象哈希
}

/**
 * 分支信息
 */
export interface BranchInfo {
  name: string;
  commitHash: string;
}

/**
 * 存储统计信息
 */
export interface StorageStats {
  totalObjects: number;          // 总对象数
  uniqueBlobs: number;           // 唯一blob数
  uniqueTrees: number;           // 唯一tree数
  totalCommits: number;          // 总commit数
  storageSize: number;           // 存储大小
  deduplicationRatio: number;    // 去重比例
}

/**
 * 文件恢复信息
 */
export interface FileRestoreInfo {
  path: string;            // 文件路径
  hash: string;            // 文件哈希
  size: number;            // 文件大小
  mode: number;            // 文件权限
  isDirectory: boolean;    // 是否为目录
}

/**
 * 恢复选项 (现在是 Checkout 选项)
 */
export interface CheckoutOptions {
  overwrite?: boolean;     // 是否覆盖现有文件
  preservePermissions?: boolean; // 是否保留权限
  excludePatterns?: string[]; // 排除模式
  includePatterns?: string[]; // 包含模式
}

/**
 * 差异类型
 */
export type DiffType = 'added' | 'deleted' | 'modified' | 'renamed';

/**
 * 文件差异信息
 */
export interface FileDiff {
  type: DiffType;
  path: string;
  oldPath?: string;        // 重命名的原路径
  oldHash?: string;        // 原哈希
  newHash?: string;        // 新哈希
  oldSize?: number;        // 原大小
  newSize?: number;        // 新大小
  isDirectory?: boolean;   // 是否为目录
}

/**
 * 检查点差异
 */
export interface CheckpointDiff {
  fromRef: string;          // 源 ref (commit hash or branch)
  toRef: string;            // 目标 ref (commit hash or branch)
  files?: FileDiff[];       // 文件差异列表 (optional, will be serialized)
  serializedFiles?: string; // Serialized files array for IPC
  stats: DiffStats;         // 差异统计
}

/**
 * 合并提交信息
 */
export interface MergeInfo {
  isMerge: boolean;
  parentCount: number;
  parents: string[];
  note: string;
}

/**
 * 差异统计
 */
export interface DiffStats {
  filesAdded: number;       // 新增文件数
  filesDeleted: number;     // 删除文件数
  filesModified: number;    // 修改文件数
  filesRenamed: number;     // 重命名文件数
  totalChanges: number;     // 总变更数
  sizeChange: number;       // 大小变化（字节）
  mergeInfo?: MergeInfo;    // 合并提交信息（可选）
}

/**
 * Git风格的检查点系统接口
 */
export interface GitCheckpointSystem {
  // 基础操作
  createCheckpoint(projectPath: string, description?: string, author?: string): Promise<string>;
  checkout(projectPath: string, ref: string, options?: CheckoutOptions): Promise<void>;
  getHistory(projectPath: string, branch?: string): Promise<GitCheckpointInfo[]>;
  
  // 分支管理
  createBranch(projectPath: string, branchName: string, startPoint?: string): Promise<void>;
  switchBranch(projectPath: string, branchName: string): Promise<void>;
  listBranches(projectPath: string): Promise<BranchInfo[]>;
  deleteBranch(projectPath: string, branchName: string): Promise<void>;

  // 高级操作
  getCheckpointInfo(projectPath: string, ref: string): Promise<GitCheckpointInfo | null>;
  listFiles(projectPath: string, ref: string): Promise<FileRestoreInfo[]>;
  getFileDiff(projectPath: string, fromRef: string, toRef: string): Promise<CheckpointDiff>;
  getCheckpointChanges(projectPath: string, ref: string): Promise<CheckpointDiff>;
  
  // 存储管理
  getStorageStats(projectPath: string): Promise<StorageStats>;
  garbageCollect(projectPath: string): Promise<void>;
  
  // 导入导出 (未来实现)
  // exportCheckpoint(ref: string, outputPath: string): Promise<void>;
  // importCheckpoint(archivePath: string, projectPath: string): Promise<string>;
}

/**
 * 配置选项
 */
export interface GitCheckpointConfig {
  basePath?: string;              // 基础存储路径
  compressionLevel?: number;      // 压缩级别
  maxFileSize?: number;           // 最大文件大小
  ignorePatterns?: string[];      // 忽略模式
  author?: string;                // 默认作者
  autoGC?: boolean;               // 自动垃圾回收
  gcThreshold?: number;           // 垃圾回收阈值
}
