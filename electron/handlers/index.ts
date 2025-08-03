import { IpcMain } from 'electron';
import { apiRouter, initializeApiRouter, ApiChannel } from '../api-router.js';
import { registerHandler } from './base-handler.js';
import type { TerminalManagementService } from '../services/terminal-management-service.js';
import type { WorkspaceStateService } from '../services/workspace-state-service.js';

// Define service dependencies interface
export interface HandlerServices {
  terminalManagementService: TerminalManagementService;
  workspaceStateService: WorkspaceStateService;
}

/**
 * Register all IPC handlers using the API router
 * Now extremely simple - no wrapper functions, no complex logic, just direct registration
 */
export function setupAllHandlers(ipcMain: IpcMain, services: HandlerServices): void {
  console.log('🔧 Setting up IPC handlers from API router...');
  
  // Initialize the API router with services
  initializeApiRouter(services);
  
  // Auto-register all handlers from the API router
  let registeredCount = 0;
  
  for (const channelName in apiRouter) {
    const channel = channelName as ApiChannel;
    const methods = apiRouter[channel];
    
    // Skip special properties that aren't IPC handlers
    if (channel === 'on' || channel === 'removeListener') {
      continue;
    }
    
    if (typeof methods === 'object' && methods !== null) {
      // Module with methods (e.g., terminal, mcp, etc.)
      for (const methodName in methods) {
        const method = methodName as string;
        const handler = (methods as any)[method];
        
        if (typeof handler === 'function') {
          // Construct IPC channel name: 'terminal:create', 'mcp:list', etc.
          const ipcChannel = `${channel}:${method}`;
          
          // Register directly - all handlers now have the same signature
          registerHandler(ipcMain, ipcChannel, handler);
          registeredCount++;
          
          console.log(`📡 Registered handler: ${ipcChannel}`);
        }
      }
    } else if (typeof methods === 'function') {
      // Direct function (e.g., ping, getPlatform)
      registerHandler(ipcMain, channel, methods as any);
      registeredCount++;
      
      console.log(`📡 Registered handler: ${channel}`);
    }
  }
  
  console.log(`✅ All ${registeredCount} IPC handlers registered successfully via API router`);
}

/**
 * Cleanup function to remove all handlers (useful for tests)
 */
export function cleanupHandlers(ipcMain: IpcMain): void {
  console.log('🧹 Cleaning up IPC handlers...');
  
  // Remove all handlers
  ipcMain.removeAllListeners();
}

// Export the API router for external use
export { apiRouter, initializeApiRouter, getIpcChannels } from '../api-router.js';

// Export utility functions from individual modules
export { getProjectPathFromSessions } from './project-management-handler.js';
export { validateSettings, getDefaultSettings, mergeWithDefaults } from './settings-handler.js';
export { executeCommand, commandExists, getSystemInfo } from './system-handler.js';
export { registerTerminalWebContents } from './terminal-handler.js';

// Export all types for external use
export * from '../types/index.js';
export * from './base-handler.js';