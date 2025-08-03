/**
 * Project Management Types
 */

/**
 * Project entity for database storage
 */
export interface Project {
  id: string;
  name: string;
  path: string;
  type: 'manual' | 'claude-imported';
  last_opened: number;
  is_pinned: boolean;
  tags?: string[];
  claude_project_id?: string;
  created_at: number;
  updated_at: number;
}

/**
 * Project creation request payload
 */
export interface ProjectCreateRequest {
  name: string;
  path: string;
  type?: 'manual' | 'claude-imported';
  tags?: string[];
  claude_project_id?: string;
}

/**
 * Project update request payload
 */
export interface ProjectUpdateRequest {
  name?: string;
  is_pinned?: boolean;
  tags?: string[];
}

/**
 * Claude project import candidate
 */
export interface ClaudeProjectImportCandidate {
  name: string;
  path: string;
  claude_project_id: string;
  session_count: number;
  last_modified: number;
  stats: ProjectStats;
}

/**
 * Project session information
 */
export interface Session {
  id: string;
  name: string;
  path: string;
  project_path: string;
  created_at: string;
}

/**
 * CLAUDE.md file information
 */
export interface ClaudeMdFile {
  relative_path: string;
  absolute_path: string;
  size: number;
  modified: number;
}

/**
 * File tree structure for project exploration
 */
export interface FileTreeItem {
  path: string;
  fullPath: string;
  isDirectory: boolean;
  size: number;
  modified: string;
  children?: FileTreeItem[];
}

/**
 * Optimized file node for incremental loading
 */
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  isExpandable?: boolean; // For directories, indicates if it has children
  size?: number;
  modified?: string;
}

/**
 * Project statistics and metadata
 */
export interface ProjectStats {
  fileCount: number;
  totalSize: number;
  lastModified: string;
}