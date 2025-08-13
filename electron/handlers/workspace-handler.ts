/**
 * Workspace Handler - Business-Oriented API Implementation
 * 
 * This handler implements the new unified workspace API that focuses on
 * business actions rather than low-level data operations. It abstracts away
 * implementation details like project paths and workspace state files.
 */

import { IpcMainInvokeEvent } from 'electron';
import type { HandlerServices } from './index.js';
import type { Project, ProjectWorkspaceMeta } from '../types/index.js';
import type { WorkspaceStateService } from '../services/workspace-state-service.js';
import type { TerminalManagementService } from '../services/terminal-management-service.js';

// Service dependencies - injected during setup
let workspaceStateService: WorkspaceStateService;
let terminalManagementService: TerminalManagementService;

/**
 * Loads a project into the workspace. This closes all current terminals
 * and restores all terminals and state for the target project.
 * This is the core method called when a user clicks "Open Project".
 */
export async function load(
  _event: IpcMainInvokeEvent,
  projectId: string
): Promise<{
  project: Project;
  terminals: any[];
  activeTerminalId: string | null;
  terminalStates?: Record<string, string>;
}> {
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
  
  // Load workspace state from storage
  const workspaceState = await service.loadWorkspaceState(project.path);
  
  // Update project's last_opened timestamp
  const updatedProject = dbManager.updateProject(projectId, {
    last_opened: Date.now()
  });

  if (!updatedProject) {
    throw new Error('Failed to update project timestamp');
  }

  if (!workspaceState) {
    console.log(`📄 No workspace state found for project: ${project.path}`);
    return {
      terminals: [],
      activeTerminalId: null,
      project: updatedProject,
      terminalStates: {}
    };
  }
  
  console.log(`✅ Loaded workspace: ${workspaceState.terminals.length} terminals, ${Object.keys(workspaceState.terminalStates || {}).length} serialized states`);
  
  // Clean current terminals before restoring
  terminalManagementService.cleanup();
  
  // Rebuild terminal instances from saved state
  console.log(`🔄 Rebuilding ${workspaceState.terminals.length} terminal instances...`);
  let successfulRestorations = 0;
  
  for (const terminalInfo of workspaceState.terminals) {
    try {
      console.log(`🔧 Creating terminal instance: ${terminalInfo.id} with shell: ${terminalInfo.shell || 'default'} in: ${terminalInfo.currentCwd || terminalInfo.cwd}`);
      
      // Create terminal instance with saved information
      terminalManagementService.create(
        terminalInfo.id,
        terminalInfo.shell || '',
        terminalInfo.currentCwd || terminalInfo.cwd,
        80, // Default cols, will be resized by frontend
        30  // Default rows, will be resized by frontend
      );
      
      // Restore dynamic state if available
      const terminalInstance = terminalManagementService.getTerminal(terminalInfo.id);
      if (terminalInstance) {
        if (terminalInfo.currentCwd) {
          terminalInstance.updateCurrentCwd(terminalInfo.currentCwd);
          console.log(`📁 Restored CWD for ${terminalInfo.id}: ${terminalInfo.currentCwd}`);
        }
        if (terminalInfo.runningProcess) {
          terminalInstance.updateRunningProcess(terminalInfo.runningProcess);
          console.log(`⚙️ Restored process for ${terminalInfo.id}: ${terminalInfo.runningProcess}`);
        }
        successfulRestorations++;
      } else {
        console.warn(`⚠️ Terminal instance not found after creation: ${terminalInfo.id}`);
      }
      
      console.log(`✅ Rebuilt terminal instance: ${terminalInfo.id} (${terminalInfo.title})`);
    } catch (error) {
      console.error(`❌ Failed to rebuild terminal ${terminalInfo.id}:`, error);
      console.error(`🔍 Terminal info:`, {
        id: terminalInfo.id,
        title: terminalInfo.title,
        shell: terminalInfo.shell,
        cwd: terminalInfo.cwd,
        currentCwd: terminalInfo.currentCwd
      });
    }
  }
  
  console.log(`🎉 Terminal instance rebuild complete: ${successfulRestorations}/${workspaceState.terminals.length} terminals successfully restored, ${terminalManagementService.getCount()} terminals active`);
  
  return {
    terminals: workspaceState.terminals || [],
    activeTerminalId: workspaceState.activeTerminalId || null,
    project: updatedProject,
    terminalStates: workspaceState.terminalStates || {}
  };
}


export async function save(
  _event: IpcMainInvokeEvent,
  projectId: string,
  terminalStates?: Record<string, string> // Frontend serialized terminal states
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
  console.log(`📦 Terminal states provided:`, terminalStates ? Object.keys(terminalStates).length : 0);
  
  // Get basic terminal info from management service
  const terminals = terminalManagementService.getAllInstances().map(instance => ({
    id: instance.id,
    title: instance.title,
    type: 'terminal' as const,
    cwd: instance.cwd,
    shell: instance.shell,
    createdAt: instance.createdAt,
    isActive: true,
    currentCwd: instance.getCurrentCwd(),
    runningProcess: instance.getRunningProcess() || undefined
  }));

  // Create workspace state with frontend terminalStates
  const workspaceState = {
    terminals,
    activeTerminalId: null, // Will be set by frontend
    terminalStates: terminalStates || {},
    lastSaved: Date.now(),
    version: '1.0.0'
  };

  // Save to a file system
  await service.saveWorkspaceState(project.path, workspaceState);
  
  console.log(`✅ Saved workspace state for project: ${project.path} with ${terminals.length} terminals and ${Object.keys(terminalStates || {}).length} serialized states`);

  // Note: DO NOT cleanup terminals here - they should remain alive until the next project is loaded
  // Terminal cleanup is handled in the load() function to ensure proper project switching
}


export async function listProjects(
  _event: IpcMainInvokeEvent
): Promise<ProjectWorkspaceMeta[]> {
  const service = workspaceStateService;
  
  // Get all project paths that have workspace state
  const projectPaths = await service.listWorkspaceProjects();
  
  // Get metadata for each project
  const projectMetas: ProjectWorkspaceMeta[] = [];
  
  for (const projectPath of projectPaths) {
    const meta = await service.getProjectMeta(projectPath);
    if (meta) {
      projectMetas.push(meta);
    }
  }
  
  // Sort by last modified time (newest first)
  projectMetas.sort((a, b) => b.lastModified - a.lastModified);
  
  return projectMetas;
}


/**
 * Initialize workspace handlers with service dependencies
 */
export function initializeWorkspaceHandlers(services: HandlerServices): void {
  // Inject service dependencies
  workspaceStateService = services.workspaceStateService;
  terminalManagementService = services.terminalManagementService;
  console.log('✅ Workspace handlers initialized with services')
}