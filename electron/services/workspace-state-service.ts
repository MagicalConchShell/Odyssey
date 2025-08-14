import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import type {
  WorkspaceState,
  PersistedTerminal
} from '../types/workspace-state.js';


/**
 * SOTA Workspace State Service
 * 
 * Centralized storage for terminal workspace states
 * Stores data in ~/.odyssey/workspaces/{projectHash}/workspace.json
 */
export class WorkspaceStateService {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = join(homedir(), '.odyssey', 'workspaces');
  }

  /**
   * Save workspace state for a project
   */
  async saveWorkspaceState(projectPath: string, state: WorkspaceState): Promise<void> {
    try {
      const projectHash = this.hashProjectPath(projectPath);
      const statePath = this.getWorkspaceStatePath(projectHash);
      
      console.log(`Starting save project ${projectPath} workspace state : ${statePath}`);
      
      await this.ensureProjectDir(projectHash);

      // Add metadata to state
      const stateWithMeta: WorkspaceState = {
        ...state,
        lastSaved: Date.now(),
        version: '1.0.0'
      };

      await fs.writeFile(statePath, JSON.stringify(stateWithMeta, null, 2), 'utf8');
    } catch (error: any) {
      console.error(`❌ Failed to save workspace state for ${projectPath}:`, error.message);
      console.error(`🔍 Error details:`, {
        projectPath,
        projectHash: this.hashProjectPath(projectPath),
        projectDir: this.getProjectDir(this.hashProjectPath(projectPath)),
        statePath: this.getWorkspaceStatePath(this.hashProjectPath(projectPath)),
        error: error.stack
      });
      throw new Error(`Failed to save workspace state: ${error.message}`);
    }
  }

  /**
   * Load workspace state for a project
   */
  async loadWorkspaceState(projectPath: string): Promise<WorkspaceState | null> {
    try {
      const projectHash = this.hashProjectPath(projectPath);
      const statePath = this.getWorkspaceStatePath(projectHash);

      // Check if a state file exists
      try {
        await fs.access(statePath);
      } catch (error) {
        return null;
      }

      const content = await fs.readFile(statePath, 'utf8');
      const state = JSON.parse(content) as WorkspaceState;

      // Validate state structure
      if (!this.isValidWorkspaceState(state)) {
        console.warn(`Invalid workspace state found for ${projectPath}, returning empty state`);
        return null;
      }
      return state;
    } catch (error: any) {
      console.error(`❌ Failed to load workspace state for ${projectPath}:`, error.message);
      return null;
    }
  }

  /**
   * Validate workspace state structure
   */
  private isValidWorkspaceState(state: any): state is WorkspaceState {
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
  private isValidPersistedTerminal(terminal: any): terminal is PersistedTerminal {
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
   * Generate project path hash (same method as GitCheckpointService)
   */
  private hashProjectPath(projectPath: string): string {
    const absolutePath = resolve(projectPath);
    const hash = createHash('sha256').update(absolutePath).digest('hex');
    return hash.substring(0, 16);
  }

  /**
   * Get workspace state file path
   */
  private getWorkspaceStatePath(projectHash: string): string {
    return join(this.baseDir, projectHash, 'workspace.json');
  }

  /**
   * Get project directory path
   */
  private getProjectDir(projectHash: string): string {
    return join(this.baseDir, projectHash);
  }

  /**
   * Ensure base directory exists
   */
  private async ensureBaseDir(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      console.log(`✅ Ensured base directory exists: ${this.baseDir}`);
    } catch (error: any) {
      console.error(`❌ Failed to create base directory: ${this.baseDir}`, error.message);
      throw error;
    }
  }

  /**
   * Ensure project directory exists
   */
  private async ensureProjectDir(projectHash: string): Promise<void> {
    // First ensure base directory exists
    await this.ensureBaseDir();
    
    const projectDir = this.getProjectDir(projectHash);
    try {
      await fs.mkdir(projectDir, { recursive: true });
      console.log(`✅ Ensured project directory exists: ${projectDir}`);
    } catch (error: any) {
      console.error(`❌ Failed to create project directory: ${projectDir}`, error.message);
      throw error;
    }
  }
}