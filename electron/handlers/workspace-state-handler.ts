import { IpcMain } from 'electron';
import { WorkspaceStateService } from '../services/workspace-state-service.js';
import type { TerminalManagementService } from '../services/terminal-management-service.js';
import { registerHandler } from './base-handler.js';
import { ApiResponse } from '../types/api.js';
import type { HandlerServices } from './index.js';
import type {
  WorkspaceState,
  ProjectWorkspaceMeta,
  WorkspaceStateConfig
} from '../types/workspace-state.js';

// Service dependencies - injected during setup
let workspaceStateService: WorkspaceStateService;
let terminalManagementService: TerminalManagementService;

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

    const service = workspaceStateService;
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

    const service = workspaceStateService;
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

    const service = workspaceStateService;
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

    const service = workspaceStateService;
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
    const service = workspaceStateService;
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
    const service = workspaceStateService;
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

    const service = workspaceStateService;
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
    const service = workspaceStateService;
    const emptyState = service.createEmptyState();

    return { success: true, data: emptyState };
  } catch (error: any) {
    console.error('Failed to create empty state:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Pure workspace load operation - only loads state
 */
async function workspaceLoad(
  projectId: string
): Promise<{ terminals: any[]; activeTerminalId: string | null; project: any }> {
  // Validate inputs
  if (!projectId || typeof projectId !== 'string') {
    throw new Error('Invalid project ID provided');
  }

  // Import database manager to get project info
  const { dbManager } = await import('../services/database-service.js');
  
  // Get project from database
  const project = dbManager.getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const service = workspaceStateService;
  
  console.log(`📥 Loading workspace state for project: ${project.path}`);
  
  // Clean current terminals
  terminalManagementService.cleanup();
  
  // Load and restore terminals to backend service
  const result = await service.loadToTerminalService(
    project.path, 
    terminalManagementService, 
    { restoreBuffer: true }
  );

  // Update project's last_opened timestamp
  const updatedProject = dbManager.updateProject(projectId, {
    last_opened: Date.now()
  });

  if (!updatedProject) {
    throw new Error('Failed to update project timestamp');
  }

  // Get serialized terminals for frontend
  const serializedTerminals = terminalManagementService.serializeAll();
  
  console.log(`✅ Loaded workspace: ${result.terminalCount} terminals restored`);
  
  return {
    terminals: Array.isArray(serializedTerminals) ? serializedTerminals : [],
    activeTerminalId: result.activeTerminalId || null,
    project: updatedProject
  };
}

/**
 * Pure workspace save operation - only saves state
 */
async function workspaceSave(
  projectId: string
): Promise<void> {
  // Validate inputs
  if (!projectId || typeof projectId !== 'string') {
    throw new Error('Invalid project ID provided');
  }

  // Import database manager to get project info
  const { dbManager } = await import('../services/database-service.js');
  
  // Get project from database
  const project = dbManager.getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const service = workspaceStateService;
  
  console.log(`💾 Saving workspace state for project: ${project.path}`);
  
  // Save current terminal state
  await service.saveFromTerminalService(
    project.path, 
    terminalManagementService
  );
  
  console.log(`✅ Saved workspace state for project: ${project.path}`);
}

/**
 * Restore workspace state and synchronize with terminal service
 * @deprecated Use workspaceLoad instead
 */
async function restoreWorkspaceState(
  projectPath: string
): Promise<{ activeTerminalId: string | null; terminalCount: number; terminals: any[] }> {
  // Validate inputs
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('Invalid project path provided');
  }

  const service = workspaceStateService;
  
  console.log(`🔄 Restoring workspace state for project: ${projectPath}`);
  
  // Load and restore terminals to backend service
  const result = await service.loadToTerminalService(
    projectPath, 
    terminalManagementService, 
    { restoreBuffer: true }
  );

  if (result.terminalCount === 0) {
    console.log('📭 No terminals to restore');
    return { 
      activeTerminalId: null, 
      terminalCount: 0, 
      terminals: [] 
    };
  }

  // Get serialized terminals for frontend
  const serializedTerminals = terminalManagementService.serializeAll();
  
  console.log(`✅ Restored ${result.terminalCount} terminals with buffer history`);
  
  return {
    activeTerminalId: result.activeTerminalId,
    terminalCount: result.terminalCount,
    terminals: serializedTerminals
  };
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
export function setupWorkspaceStateHandlers(ipcMain: IpcMain, services: HandlerServices): void {
  console.log('🔧 Setting up workspace state handlers...');
  
  // Inject service dependencies
  workspaceStateService = services.workspaceStateService;
  terminalManagementService = services.terminalManagementService;

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

  // Pure atomic operations
  registerHandler(
    ipcMain,
    'workspace:load',
    workspaceLoad
  );

  registerHandler(
    ipcMain,
    'workspace:save',
    workspaceSave
  );

  // Terminal restoration (deprecated)
  registerHandler(
    ipcMain,
    'workspace-state:restore',
    restoreWorkspaceState
  );

  console.log('✅ Workspace state handlers registered successfully');
}