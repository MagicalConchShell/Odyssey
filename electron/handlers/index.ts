import { IpcMain } from 'electron';
import type { TerminalManagementService } from '../services/terminal-management-service.js';
import type { WorkspaceStateService } from '../services/workspace-state-service.js';

// Define service dependencies interface
export interface HandlerServices {
  terminalManagementService: TerminalManagementService;
  workspaceStateService: WorkspaceStateService;
}

/**
 * Cleanup function to remove all handlers (useful for tests)
 */
export function cleanupHandlers(ipcMain: IpcMain): void {
  console.log('🧹 Cleaning up IPC handlers...');
  
  // Remove all handlers
  ipcMain.removeAllListeners();
}

// // Export utility functions from individual modules
export { getProjectPathFromSessions } from './project-management-handler.js';
export { validateSettings, getDefaultSettings, mergeWithDefaults } from './settings-handler.js';
export { executeCommand, commandExists, getSystemInfo } from './system-handler.js';