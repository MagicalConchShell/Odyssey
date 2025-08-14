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
 * Project statistics and metadata
 */
export interface ProjectStats {
  fileCount: number;
  totalSize: number;
  lastModified: string;
}