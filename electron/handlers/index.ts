import { IpcMain } from 'electron';
import { setupClaudeCliHandlers } from './claude-cli.js';
import { setupFileSystemHandlers } from './file-system.js';
import { setupProjectManagementHandlers } from './project-management.js';
import { setupSettingsHandlers } from './settings.js';
import { setupUsageAnalyticsHandlers } from './usage-analytics.js';
import { setupMcpHandlers } from './mcp.js';
import { setupGitCheckpointHandlers } from './git-checkpoint.js';
import { setupSystemHandlers } from './system.js';
import { setupTerminalHandlers } from './terminal.js';

/**
 * Register all IPC handlers in the correct order
 */
export function setupAllHandlers(ipcMain: IpcMain): void {
  console.log('🔧 Setting up IPC handlers...');
  
  // Register all handler modules
  setupSystemHandlers(ipcMain);
  setupClaudeCliHandlers(ipcMain);
  setupFileSystemHandlers(ipcMain);
  setupProjectManagementHandlers(ipcMain);
  setupSettingsHandlers(ipcMain);
  setupUsageAnalyticsHandlers(ipcMain);
  setupMcpHandlers(ipcMain);
  setupGitCheckpointHandlers(ipcMain);
  setupTerminalHandlers(ipcMain);
  
  console.log('✅ All IPC handlers registered successfully');
}
/**
 * Cleanup function to remove all handlers (useful for tests)
 */
export function cleanupHandlers(ipcMain: IpcMain): void {
  console.log('🧹 Cleaning up IPC handlers...');
  
  // Remove all handlers
  ipcMain.removeAllListeners();

}

// Export individual handler setup functions for selective registration
export {
  setupClaudeCliHandlers,
  setupFileSystemHandlers,
  setupProjectManagementHandlers,
  setupSettingsHandlers,
  setupUsageAnalyticsHandlers,
  setupMcpHandlers,
  setupGitCheckpointHandlers,
  setupSystemHandlers,
  setupTerminalHandlers
};

// Export utility functions from individual modules
// export { clearClaudeCliCache, getClaudeCliCacheStatus } from './claude-cli.js';
export { validateWorkingDirectory, resolveProjectPath } from './file-system.js';
export { getProjectPathFromSessions } from './project-management.js';
export { validateSettings, getDefaultSettings, mergeWithDefaults } from './settings.js';
export { executeCommand, commandExists, getSystemInfo } from './system.js';

// Export all types for external use
export * from './types.js';
export * from './base-handler.js';