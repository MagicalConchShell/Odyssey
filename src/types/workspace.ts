/**
 * Frontend Workspace State Type Definitions
 * 
 * Re-exports and extends backend workspace types for frontend use
 */

import type { Terminal } from './terminal'

/**
 * Persisted terminal configuration (matches backend PersistedTerminal)
 */
export interface PersistedTerminal {
  id: string;
  title: string;
  type: 'claude-code' | 'gemini' | 'bash' | string;
  cwd: string;
  shell?: string;
  createdAt: number;
  isActive: boolean;
  buffer?: string[]; // Terminal output history lines
  currentCwd?: string; // Dynamic CWD that may differ from initial cwd
  runningProcess?: string; // Currently running process name
}

/**
 * Complete workspace state (matches backend WorkspaceState)
 */
export interface WorkspaceState {
  terminals: PersistedTerminal[];
  activeTerminalId: string | null;
  lastSaved: number;
  version: string;
}

/**
 * Workspace state service configuration (matches backend WorkspaceStateConfig)
 */
export interface WorkspaceStateConfig {
  basePath?: string;
  autoSave?: boolean;
  maxHistorySize?: number;
}

/**
 * Project workspace metadata (matches backend ProjectWorkspaceMeta)
 */
export interface ProjectWorkspaceMeta {
  projectPath: string;
  projectHash: string;
  lastModified: number;
  terminalCount: number;
  activeTerminalId: string | null;
}

/**
 * Utility type for converting Terminal to PersistedTerminal
 */
export function terminalToPersistedTerminal(terminal: Terminal, buffer?: string[], currentCwd?: string, runningProcess?: string): PersistedTerminal {
  return {
    id: terminal.id,
    title: terminal.title,
    type: terminal.type,
    cwd: terminal.cwd,
    shell: terminal.shell,
    createdAt: terminal.createdAt,
    isActive: terminal.isActive,
    buffer: buffer, // Include buffer data if provided
    currentCwd: currentCwd, // Include dynamic CWD if provided
    runningProcess: runningProcess, // Include running process if provided
  };
}

/**
 * Utility type for converting PersistedTerminal to Terminal
 */
export function persistedTerminalToTerminal(persisted: PersistedTerminal): Terminal {
  return {
    id: persisted.id,
    title: persisted.title,
    type: persisted.type as 'claude-code' | 'gemini' | 'terminal',
    cwd: persisted.cwd,
    shell: persisted.shell,
    isActive: persisted.isActive,
    createdAt: persisted.createdAt,
  };
}

/**
 * Workspace persistence operations result type
 */
export interface WorkspacePersistenceResult {
  success: boolean;
  error?: string;
}

/**
 * Workspace state validation utilities
 */
export class WorkspaceStateValidator {
  /**
   * Validate workspace state structure
   */
  static isValidWorkspaceState(state: any): state is WorkspaceState {
    if (!state || typeof state !== 'object') {
      return false;
    }

    // Check required properties
    if (!Array.isArray(state.terminals)) {
      return false;
    }

    if (state.activeTerminalId !== null && typeof state.activeTerminalId !== 'string') {
      return false;
    }

    if (typeof state.lastSaved !== 'number') {
      return false;
    }

    if (typeof state.version !== 'string') {
      return false;
    }

    // Validate terminals
    for (const terminal of state.terminals) {
      if (!this.isValidPersistedTerminal(terminal)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate persisted terminal structure
   */
  static isValidPersistedTerminal(terminal: any): terminal is PersistedTerminal {
    if (!terminal || typeof terminal !== 'object') {
      return false;
    }

    const required = ['id', 'title', 'type', 'cwd', 'createdAt', 'isActive'];
    for (const prop of required) {
      if (!(prop in terminal)) {
        return false;
      }
    }

    const isValidBasic = typeof terminal.id === 'string' &&
                        typeof terminal.title === 'string' &&
                        typeof terminal.type === 'string' &&
                        typeof terminal.cwd === 'string' &&
                        typeof terminal.createdAt === 'number' &&
                        typeof terminal.isActive === 'boolean';

    if (!isValidBasic) {
      return false;
    }

    // Validate buffer if present
    if (terminal.buffer !== undefined) {
      if (!Array.isArray(terminal.buffer)) {
        return false;
      }
      // Ensure all buffer entries are strings
      if (!terminal.buffer.every((line: any) => typeof line === 'string')) {
        return false;
      }
    }

    // Validate optional fields
    if (terminal.currentCwd !== undefined && typeof terminal.currentCwd !== 'string') {
      return false;
    }

    if (terminal.runningProcess !== undefined && typeof terminal.runningProcess !== 'string') {
      return false;
    }

    return true;
  }

  /**
   * Create a default empty workspace state
   */
  static createEmptyState(): WorkspaceState {
    return {
      terminals: [],
      activeTerminalId: null,
      lastSaved: Date.now(),
      version: '1.0.0'
    };
  }

  /**
   * Sanitize workspace state for persistence
   */
  static sanitizeState(state: WorkspaceState): WorkspaceState {
    return {
      terminals: state.terminals.filter(terminal => 
        this.isValidPersistedTerminal(terminal)
      ),
      activeTerminalId: state.activeTerminalId,
      lastSaved: Date.now(),
      version: state.version || '1.0.0'
    };
  }
}