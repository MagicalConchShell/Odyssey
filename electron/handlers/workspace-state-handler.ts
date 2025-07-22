import { IpcMain } from 'electron';
import { WorkspaceStateService } from '../services/workspace-state-service.js';
import { registerHandler } from './base-handler.js';
import { ApiResponse } from './types.js';
import type {
  WorkspaceState,
  ProjectWorkspaceMeta,
  WorkspaceStateConfig
} from '../types/workspace-state.js';

// Create a singleton service instance
let workspaceStateService: WorkspaceStateService | null = null;

function getWorkspaceStateService(): WorkspaceStateService {
  if (!workspaceStateService) {
    workspaceStateService = new WorkspaceStateService();
  }
  return workspaceStateService;
}

/**
 * Save workspace state for a project
 */
async function saveWorkspaceState(
  projectPath: string,
  state: WorkspaceState
): Promise<ApiResponse<void>> {
  try {
    // Validate inputs
    if (!projectPath || typeof projectPath !== 'string') {
      return { success: false, error: 'Invalid project path provided' };
    }

    if (!state || typeof state !== 'object') {
      return { success: false, error: 'Invalid workspace state provided' };
    }

    const service = getWorkspaceStateService();
    await service.saveWorkspaceState(projectPath, state);

    return { success: true };
  } catch (error: any) {
    console.error('Failed to save workspace state:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Load workspace state for a project
 */
async function loadWorkspaceState(
  projectPath: string
): Promise<ApiResponse<WorkspaceState | null>> {
  try {
    // Validate inputs
    if (!projectPath || typeof projectPath !== 'string') {
      return { success: false, error: 'Invalid project path provided' };
    }

    const service = getWorkspaceStateService();
    const state = await service.loadWorkspaceState(projectPath);

    return { success: true, data: state };
  } catch (error: any) {
    console.error('Failed to load workspace state:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Clear workspace state for a project
 */
async function clearWorkspaceState(
  projectPath: string
): Promise<ApiResponse<void>> {
  try {
    // Validate inputs
    if (!projectPath || typeof projectPath !== 'string') {
      return { success: false, error: 'Invalid project path provided' };
    }

    const service = getWorkspaceStateService();
    await service.clearWorkspaceState(projectPath);

    return { success: true };
  } catch (error: any) {
    console.error('Failed to clear workspace state:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Check if workspace state exists for a project
 */
async function hasWorkspaceState(
  projectPath: string
): Promise<ApiResponse<boolean>> {
  try {
    // Validate inputs
    if (!projectPath || typeof projectPath !== 'string') {
      return { success: false, error: 'Invalid project path provided' };
    }

    const service = getWorkspaceStateService();
    const exists = await service.hasWorkspaceState(projectPath);

    return { success: true, data: exists };
  } catch (error: any) {
    console.error('Failed to check workspace state existence:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get all projects that have workspace state
 */
async function listWorkspaceProjects(): Promise<ApiResponse<string[]>> {
  try {
    const service = getWorkspaceStateService();
    const projects = await service.listWorkspaceProjects();

    return { success: true, data: projects };
  } catch (error: any) {
    console.error('Failed to list workspace projects:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Clean up orphaned workspace states
 */
async function cleanupOrphanedStates(): Promise<ApiResponse<number>> {
  try {
    const service = getWorkspaceStateService();
    const cleanedCount = await service.cleanupOrphanedStates();

    return { success: true, data: cleanedCount };
  } catch (error: any) {
    console.error('Failed to cleanup orphaned states:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get project workspace metadata
 */
async function getProjectMeta(
  projectPath: string
): Promise<ApiResponse<ProjectWorkspaceMeta | null>> {
  try {
    // Validate inputs
    if (!projectPath || typeof projectPath !== 'string') {
      return { success: false, error: 'Invalid project path provided' };
    }

    const service = getWorkspaceStateService();
    const meta = await service.getProjectMeta(projectPath);

    return { success: true, data: meta };
  } catch (error: any) {
    console.error('Failed to get project meta:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Create an empty workspace state
 */
async function createEmptyState(): Promise<ApiResponse<WorkspaceState>> {
  try {
    const service = getWorkspaceStateService();
    const emptyState = service.createEmptyState();

    return { success: true, data: emptyState };
  } catch (error: any) {
    console.error('Failed to create empty state:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize workspace state service with custom config
 */
async function initializeService(
  config?: WorkspaceStateConfig
): Promise<ApiResponse<void>> {
  try {
    // Create new service instance with config
    workspaceStateService = new WorkspaceStateService(config);

    return { success: true };
  } catch (error: any) {
    console.error('Failed to initialize workspace state service:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Register all workspace state related IPC handlers
 */
export function setupWorkspaceStateHandlers(ipcMain: IpcMain): void {
  console.log('🔧 Setting up workspace state handlers...');

  // Core state operations
  registerHandler(
    ipcMain,
    'workspace-state:save',
    saveWorkspaceState
  );

  registerHandler(
    ipcMain,
    'workspace-state:load',
    loadWorkspaceState
  );

  registerHandler(
    ipcMain,
    'workspace-state:clear',
    clearWorkspaceState
  );

  registerHandler(
    ipcMain,
    'workspace-state:has',
    hasWorkspaceState
  );

  // Project management
  registerHandler(
    ipcMain,
    'workspace-state:list-projects',
    listWorkspaceProjects
  );

  registerHandler(
    ipcMain,
    'workspace-state:cleanup-orphaned',
    cleanupOrphanedStates
  );

  registerHandler(
    ipcMain,
    'workspace-state:get-project-meta',
    getProjectMeta
  );

  // Utility operations
  registerHandler(
    ipcMain,
    'workspace-state:create-empty',
    createEmptyState
  );

  registerHandler(
    ipcMain,
    'workspace-state:initialize',
    initializeService
  );

  console.log('✅ Workspace state handlers registered successfully');
}