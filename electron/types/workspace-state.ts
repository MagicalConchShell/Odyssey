/**
 * Workspace state type definitions for terminal persistence
 */

/**
 * Terminal configuration for persistence
 */
export interface PersistedTerminal {
  id: string;
  title: string;
  type: 'claude-code' | 'gemini' | 'bash' | string;
  cwd: string;
  shell?: string;
  createdAt: number;
  isActive: boolean;
}

/**
 * Complete workspace state
 */
export interface WorkspaceState {
  terminals: PersistedTerminal[];
  activeTerminalId: string | null;
  lastSaved: number;
  version: string; // For future migration support
}

/**
 * Workspace state service configuration
 */
export interface WorkspaceStateConfig {
  basePath?: string;           // Base storage directory (defaults to ~/.odyssey/workspaces)
  autoSave?: boolean;          // Whether to auto-save state changes
  maxHistorySize?: number;     // Maximum number of state history entries to keep
}

/**
 * Workspace state service interface
 */
export interface WorkspaceStateService {
  /**
   * Save workspace state for a project
   */
  saveWorkspaceState(projectPath: string, state: WorkspaceState): Promise<void>;

  /**
   * Load workspace state for a project
   */
  loadWorkspaceState(projectPath: string): Promise<WorkspaceState | null>;

  /**
   * Clear workspace state for a project
   */
  clearWorkspaceState(projectPath: string): Promise<void>;

  /**
   * Check if workspace state exists for a project
   */
  hasWorkspaceState(projectPath: string): Promise<boolean>;

  /**
   * Get all projects that have workspace state
   */
  listWorkspaceProjects(): Promise<string[]>;

  /**
   * Delete workspace state for projects that no longer exist
   */
  cleanupOrphanedStates(): Promise<number>;
}

/**
 * Workspace state operation result
 */
export interface WorkspaceStateResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Project workspace metadata
 */
export interface ProjectWorkspaceMeta {
  projectPath: string;
  projectHash: string;
  lastModified: number;
  terminalCount: number;
  activeTerminalId: string | null;
}