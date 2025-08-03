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
 * 加载一个项目到工作区，这会关闭当前所有终端，并恢复目标项目的所有终端和状态。
 * 这是用户点击"打开项目"时调用的核心方法。
 */
export async function load(
  _event: IpcMainInvokeEvent,
  projectId: string
): Promise<{
  project: Project;
  terminals: any[];
  activeTerminalId: string | null;
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
 * 保存当前活动项目的工作区状态（例如，打开的终端、布局等）。
 * 这个方法可以在关闭窗口或切换项目前自动调用。
 */
export async function save(
  _event: IpcMainInvokeEvent,
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
 * 获取所有已知项目的元数据列表，用于在欢迎屏幕上显示项目列表。
 */
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
 * 清理那些已经不存在于文件系统上的项目的状态文件。
 */
export async function cleanupOrphanedStates(
  _event: IpcMainInvokeEvent
): Promise<number> {
  const service = workspaceStateService;
  const cleanedCount = await service.cleanupOrphanedStates();

  return cleanedCount;
}

/**
 * Service initialization function for dependency injection
 */
export function injectServices(services: HandlerServices): void {
  console.log('🔧 Injecting workspace handler dependencies...');
  
  // Inject service dependencies
  workspaceStateService = services.workspaceStateService;
  terminalManagementService = services.terminalManagementService;

  console.log('✅ Workspace handler dependencies injected successfully');
}