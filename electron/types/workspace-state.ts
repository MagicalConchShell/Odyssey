/**
 * Workspace state type definitions
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
  currentCwd?: string; // Dynamic CWD that may differ from initial cwd
  runningProcess?: string; // Currently running process name
}

/**
 * Complete workspace state
 */
export interface WorkspaceState {
  terminals: PersistedTerminal[];
  activeTerminalId: string | null;
  terminalStates?: Record<string, string>; // Terminal ID -> serialized xterm state
  lastSaved: number;
  version: string; // For future migration support
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