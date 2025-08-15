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
 * Claude project discovered from .claude/projects directory
 */
export interface ClaudeProject {
  name: string;
  path: string;
  claude_project_id: string;
}