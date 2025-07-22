import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import type {
  WorkspaceState,
  WorkspaceStateConfig,
  WorkspaceStateService as IWorkspaceStateService,
  ProjectWorkspaceMeta,
  PersistedTerminal
} from '../types/workspace-state.js';

import { FileSystemService } from './file-system-service';

/**
 * SOTA Workspace State Service
 * 
 * Centralized storage for terminal workspace states following the GitCheckpointService pattern.
 * Stores data in ~/.odyssey/workspaces/{projectHash}/workspace.json
 */
export class WorkspaceStateService implements IWorkspaceStateService {
  private baseDir: string;

  constructor(config: WorkspaceStateConfig = {}) {
    this.baseDir = config.basePath || join(homedir(), '.odyssey', 'workspaces');
    // Note: autoSave and maxHistorySize are reserved for future features
    // const autoSave = config.autoSave ?? true;
    // const maxHistorySize = config.maxHistorySize || 100;
  }

  /**
   * Save workspace state for a project
   */
  async saveWorkspaceState(projectPath: string, state: WorkspaceState): Promise<void> {
    try {
      const projectHash = this.hashProjectPath(projectPath);
      const projectDir = this.getProjectDir(projectHash);
      const statePath = this.getWorkspaceStatePath(projectHash);
      
      console.log(`💾 Starting save workspace state for project: ${projectPath}`);
      console.log(`📂 Project hash: ${projectHash}, directory: ${projectDir}`);
      console.log(`📄 State path: ${statePath}`);
      
      await this.ensureProjectDir(projectHash);

      // Add metadata to state
      const stateWithMeta: WorkspaceState = {
        ...state,
        lastSaved: Date.now(),
        version: '1.0.0'
      };

      console.log(`📋 Saving state with ${stateWithMeta.terminals.length} terminals`);
      await FileSystemService.atomicWrite(statePath, JSON.stringify(stateWithMeta, null, 2));

      console.log(`✅ Workspace state saved for project: ${projectPath} (${projectHash.substring(0, 8)})`);
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

      // Check if state file exists
      try {
        await fs.access(statePath);
      } catch (error) {
        // File doesn't exist, return null
        return null;
      }

      const content = await fs.readFile(statePath, 'utf8');
      const state = JSON.parse(content) as WorkspaceState;

      // Validate state structure
      if (!this.isValidWorkspaceState(state)) {
        console.warn(`Invalid workspace state found for ${projectPath}, returning empty state`);
        return null;
      }

      console.log(`📥 Workspace state loaded for project: ${projectPath} (${state.terminals.length} terminals)`);
      return state;
    } catch (error: any) {
      console.error(`❌ Failed to load workspace state for ${projectPath}:`, error.message);
      // Return null instead of throwing - we want graceful degradation
      return null;
    }
  }

  /**
   * Clear workspace state for a project
   */
  async clearWorkspaceState(projectPath: string): Promise<void> {
    try {
      const projectHash = this.hashProjectPath(projectPath);
      const statePath = this.getWorkspaceStatePath(projectHash);

      try {
        await fs.unlink(statePath);
        console.log(`🗑️ Workspace state cleared for project: ${projectPath}`);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // File doesn't exist, which is fine
      }
    } catch (error: any) {
      console.error(`❌ Failed to clear workspace state for ${projectPath}:`, error.message);
      throw new Error(`Failed to clear workspace state: ${error.message}`);
    }
  }

  /**
   * Check if workspace state exists for a project
   */
  async hasWorkspaceState(projectPath: string): Promise<boolean> {
    try {
      const projectHash = this.hashProjectPath(projectPath);
      const statePath = this.getWorkspaceStatePath(projectHash);

      await fs.access(statePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all projects that have workspace state
   */
  async listWorkspaceProjects(): Promise<string[]> {
    try {
      await this.ensureBaseDir();
      const projects: string[] = [];

      try {
        const projectDirs = await fs.readdir(this.baseDir, { withFileTypes: true });

        for (const dir of projectDirs) {
          if (dir.isDirectory()) {
            const statePath = join(this.baseDir, dir.name, 'workspace.json');
            try {
              await fs.access(statePath);
              
              // Read the state to validate it exists and is valid
              const content = await fs.readFile(statePath, 'utf8');
              JSON.parse(content) as WorkspaceState; // Validate JSON format
              
              // For now, we can only return the hash since we can't reverse it
              // In a production system, we might want to store project path mapping
              projects.push(dir.name);
            } catch (error) {
              // Skip invalid or inaccessible states
              continue;
            }
          }
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.error('Failed to list workspace projects:', error.message);
        }
        // Directory doesn't exist yet, return empty array
      }

      return projects;
    } catch (error: any) {
      console.error('Failed to list workspace projects:', error.message);
      return [];
    }
  }

  /**
   * Delete workspace state for projects that no longer exist
   */
  async cleanupOrphanedStates(): Promise<number> {
    try {
      await this.ensureBaseDir();
      let cleaned = 0;

      try {
        const projectDirs = await fs.readdir(this.baseDir, { withFileTypes: true });

        for (const dir of projectDirs) {
          if (dir.isDirectory()) {
            const projectPath = join(this.baseDir, dir.name);
            await FileSystemService.acquireLock(projectPath);
            try {
              const statePath = join(projectPath, 'workspace.json');
              try {
                // Check if state file exists and is valid
                const content = await fs.readFile(statePath, 'utf8');
                const state = JSON.parse(content) as WorkspaceState;

                if (!this.isValidWorkspaceState(state)) {
                  // Invalid state, clean it up
                  await fs.rm(projectPath, { recursive: true, force: true });
                  cleaned++;
                  console.log(`🧹 Cleaned up invalid workspace state: ${dir.name}`);
                }
              } catch (error) {
                // Invalid or missing state file, clean up the directory
                await fs.rm(projectPath, { recursive: true, force: true });
                cleaned++;
                console.log(`🧹 Cleaned up orphaned workspace directory: ${dir.name}`);
              }
            } finally {
              FileSystemService.releaseLock(projectPath);
            }
          }
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.error('Failed during cleanup:', error.message);
        }
      }

      if (cleaned > 0) {
        console.log(`✅ Cleaned up ${cleaned} orphaned workspace states`);
      }

      return cleaned;
    } catch (error: any) {
      console.error('Failed to cleanup orphaned states:', error.message);
      return 0;
    }
  }

  /**
   * Get project metadata without loading full state
   */
  async getProjectMeta(projectPath: string): Promise<ProjectWorkspaceMeta | null> {
    try {
      const projectHash = this.hashProjectPath(projectPath);
      const statePath = this.getWorkspaceStatePath(projectHash);

      const stats = await fs.stat(statePath);
      const content = await fs.readFile(statePath, 'utf8');
      const state = JSON.parse(content) as WorkspaceState;

      return {
        projectPath,
        projectHash,
        lastModified: stats.mtime.getTime(),
        terminalCount: state.terminals.length,
        activeTerminalId: state.activeTerminalId
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Create a default empty workspace state
   */
  createEmptyState(): WorkspaceState {
    return {
      terminals: [],
      activeTerminalId: null,
      lastSaved: Date.now(),
      version: '1.0.0'
    };
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

    return typeof terminal.id === 'string' &&
           typeof terminal.title === 'string' &&
           typeof terminal.type === 'string' &&
           typeof terminal.cwd === 'string' &&
           typeof terminal.createdAt === 'number' &&
           typeof terminal.isActive === 'boolean';
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