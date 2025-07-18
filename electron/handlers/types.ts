// ===================
// Core Response Types
// ===================

export interface ApiResponse<T = any> {
  success: boolean
  error?: string
  data?: T
  meta?: any // For additional metadata like recovery suggestions
}

export interface FileResponse {
  success: boolean
  content?: string
  error?: string
}

export interface McpResponse {
  success: boolean
  message?: string
  error?: string
  servers?: McpServer[]
  output?: string
  imported_count?: number
  failed_count?: number
}

export interface ScreenshotResponse {
  success: boolean
  path?: string
  error?: string
}

// ===================
// MCP Server Types
// ===================

export interface McpServer {
  name: string
  transport: string
  command: string
  args: string[]
  env: Record<string, string>
  url?: string | null
  scope: string
  is_active: boolean
  status: {
    running: boolean
    error: string | null
    last_checked: string | null
  }
}

export interface McpServerListCache {
  servers: McpServer[]
  timestamp: number
}

// ===================
// Claude CLI Types
// ===================

export interface ClaudeCliInfo {
  path: string
  version: string
  isAvailable: boolean
  error?: string
  installMethod?: string
  isAuthenticated?: boolean
  apiKeySet?: boolean
}

export interface ClaudeExecutionOptions {
  cwd?: string
  timeout?: number
  args?: string[]
}

export interface ClaudeExecutionResult {
  success: boolean
  stdout?: string
  stderr?: string
  error?: string
}

export interface ClaudeCliInfoCache {
  info: ClaudeCliInfo
  timestamp: number
}

// ===================
// Database Types
// ===================

export interface UsageEntry {
  id?: number
  timestamp: string
  model: string
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  cost: number
  session_id: string
  project_path: string
}

// ===================
// Project Types
// ===================

export interface Project {
  id: string
  name: string
  path: string
  type: 'manual' | 'claude-imported'
  last_opened: number
  is_pinned: boolean
  tags?: string[]
  claude_project_id?: string
  created_at: number
  updated_at: number
}

export interface ProjectCreateRequest {
  name: string
  path: string
  type?: 'manual' | 'claude-imported'
  tags?: string[]
  claude_project_id?: string
}

export interface ProjectUpdateRequest {
  name?: string
  is_pinned?: boolean
  tags?: string[]
}

export interface ClaudeProjectImportCandidate {
  name: string
  path: string
  claude_project_id: string
  session_count: number
  last_modified: number
  stats: ProjectStats
}

export interface Session {
  id: string
  name: string
  path: string
  project_path: string
  created_at: string
}

export interface ClaudeMdFile {
  relative_path: string
  absolute_path: string
  size: number
  modified: number
}

export interface FileTreeItem {
  path: string
  fullPath: string
  isDirectory: boolean
  size: number
  modified: string
  children?: FileTreeItem[]
}

// Optimized file node for incremental loading
export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  isExpandable?: boolean // For directories, indicates if it has children
  size?: number
  modified?: string
}

export interface ProjectStats {
  fileCount: number
  totalSize: number
  lastModified: string
}

// ===================
// Usage Statistics Types
// ===================

export interface UsageStats {
  total_cost: number
  total_sessions: number
  total_tokens: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_creation_tokens: number
  total_cache_read_tokens: number
  by_model: ModelUsageStats[]
  by_project: ProjectUsageStats[]
  by_date: DateUsageStats[]
}

export interface ModelUsageStats {
  model: string
  total_cost: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  session_count: number
}

export interface ProjectUsageStats {
  project_path: string
  total_cost: number
  total_tokens: number
  session_count: number
}

export interface DateUsageStats {
  date: string
  total_cost: number
  total_tokens: number
  models_used: string[]
}

// ===================
// Git Checkpoint Types
// ===================

export interface GitCheckpoint {
  commitHash: string
  description?: string
  author?: string
}

export interface GitBranch {
  name: string
  current: boolean
  hash: string
}

export interface GitHistory {
  commits: GitCommit[]
  branches: GitBranch[]
}

export interface GitCommit {
  hash: string
  message: string
  author: string
  date: string
  parents: string[]
}

export interface GitFileInfo {
  path: string
  hash: string
  size: number
  mode: string
}

export interface GitDiff {
  files: GitFileDiff[]
  stats: {
    additions: number
    deletions: number
    changes: number
  }
}

export interface GitFileDiff {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  oldPath?: string
  additions: number
  deletions: number
  content?: string
}

export interface GitStorageStats {
  totalSize: number
  objectCount: number
  branchCount: number
  commitCount: number
}

// ===================
// Git Status Types
// ===================

export interface GitFileStatus {
  path: string
  status: 'modified' | 'untracked' | 'deleted' | 'staged'
}

export interface GitStatusSummary {
  staged: number
  unstaged: number
  untracked: number
  modified: number
  added: number
  deleted: number
}

export interface GitStatusResult {
  files: GitFileStatus[]
  summary: GitStatusSummary
}

// ===================
// File System Watching Types
// ===================

export type FileSystemEventType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

export interface FileSystemChangeEvent {
  projectPath: string;
  eventType: FileSystemEventType;
  filePath: string;
  relativePath: string;
  stats?: {
    size: number;
    modified: string;
    isDirectory: boolean;
  };
}