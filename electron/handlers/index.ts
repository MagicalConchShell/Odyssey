import { IpcMain } from 'electron';
import { setupClaudeCliHandlers } from './claude-cli-handler.js';
import { setupProjectManagementHandlers } from './project-management-handler.js';
import { setupSettingsHandlers } from './settings-handler.js';
import { setupUsageAnalyticsHandlers } from './usage-analytics-handler.js';
import { setupMcpHandlers } from './mcp-handler.js';
import { setupSystemHandlers } from './system-handler.js';
import { setupTerminalHandlers } from './terminal-handler.js';
import { setupWorkspaceStateHandlers } from './workspace-state-handler.js';

/**
 * Register all IPC handlers in the correct order
 */
export function setupAllHandlers(ipcMain: IpcMain): void {
  console.log('🔧 Setting up IPC handlers...');
  
  // Register all handler modules
  setupSystemHandlers(ipcMain);
  setupClaudeCliHandlers(ipcMain);
  setupProjectManagementHandlers(ipcMain);
  setupSettingsHandlers(ipcMain);
  setupUsageAnalyticsHandlers(ipcMain);
  setupMcpHandlers(ipcMain);
  setupWorkspaceStateHandlers(ipcMain);
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
  setupProjectManagementHandlers,
  setupSettingsHandlers,
  setupUsageAnalyticsHandlers,
  setupMcpHandlers,
  setupSystemHandlers,
  setupTerminalHandlers,
  setupWorkspaceStateHandlers
};

// Export utility functions from individual modules
// export { clearClaudeCliCache, getClaudeCliCacheStatus } from './claude-cli.js';
export { getProjectPathFromSessions } from './project-management-handler.js';
export { validateSettings, getDefaultSettings, mergeWithDefaults } from './settings-handler.js';
export { executeCommand, commandExists, getSystemInfo } from './system-handler.js';

// Export all types for external use
export * from './types.js';
export * from './base-handler.js';