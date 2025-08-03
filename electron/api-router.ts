/**
 * API Router - Simple Type-Safe Binding
 * 
 * This is the central API router that directly binds the IElectronAPI contract
 * with the actual handler implementations. TypeScript enforces that this
 * object structure and types exactly match the IElectronAPI interface.
 * 
 * All handlers now follow the unified signature: (event: IpcMainInvokeEvent, ...args) => Promise<T>
 */

import { IElectronAPI } from './types/api-contract.js';
import type { HandlerServices } from './handlers/index.js';

// Import all handler functions
import * as systemHandlers from './handlers/system-handler.js';
import * as claudeCliHandlers from './handlers/claude-cli-handler.js';
import * as terminalHandlers from './handlers/terminal-handler.js';
import * as projectHandlers from './handlers/project-management-handler.js';
import * as settingsHandlers from './handlers/settings-handler.js';
import * as usageHandlers from './handlers/usage-analytics-handler.js';
import * as mcpHandlers from './handlers/mcp-handler.js';
import * as workspaceHandlers from './handlers/workspace-handler.js';

/**
 * Initialize the API router with required services
 */
export function initializeApiRouter(services: HandlerServices): void {
  // Initialize handlers that need services
  terminalHandlers.initializeTerminalHandlers(services);
  workspaceHandlers.injectServices(services);
  
  console.log('✅ API Router initialized with services');
}

/**
 * The API router object that MUST exactly match IElectronAPI structure.
 * TypeScript will enforce compile-time type safety here.
 * All functions are directly mapped without any wrappers or transformations.
 */
export const apiRouter: IElectronAPI = {
  // System utilities - direct mapping
  ping: systemHandlers.ping,
  getPlatform: systemHandlers.getPlatform,
  openExternal: systemHandlers.openExternal,
  captureWebviewScreenshot: systemHandlers.captureWebviewScreenshot,

  // Terminal handlers - direct mapping
  terminal: {
    create: terminalHandlers.createTerminal,
    write: terminalHandlers.writeToTerminal,
    resize: terminalHandlers.resizeTerminal,
    close: terminalHandlers.closeTerminal,
    info: terminalHandlers.getTerminalInfo,
    list: terminalHandlers.listTerminals,
    pause: terminalHandlers.pauseTerminal,
    resume: terminalHandlers.resumeTerminal,
    getState: terminalHandlers.getTerminalState,
    cwdChanged: terminalHandlers.handleCwdChanged,
    registerWebContents: terminalHandlers.registerWebContents,
    updateCleanBuffer: terminalHandlers.updateCleanBuffer,
  },

  // Claude CLI handlers - direct mapping
  claudeCli: {
    getBinaryPath: claudeCliHandlers.getBinaryPath,
    setBinaryPath: claudeCliHandlers.setBinaryPath,
    getInfo: claudeCliHandlers.getInfo,
    executeCommand: claudeCliHandlers.executeCommand,
  },

  // Event listeners (these are handled differently in preload)
  on: undefined,
  removeListener: undefined,

  // Settings handlers - direct mapping
  settings: {
    getClaudeSettings: settingsHandlers.getClaudeSettings,
    saveClaudeSettings: settingsHandlers.saveClaudeSettings,
  },

  // MCP handlers - direct mapping
  mcp: {
    list: mcpHandlers.list,
    clearCache: mcpHandlers.clearCache,
    add: mcpHandlers.add,
    remove: mcpHandlers.remove,
    testConnection: mcpHandlers.testConnection,
    addFromClaudeDesktop: mcpHandlers.addFromClaudeDesktop,
    addJson: mcpHandlers.addJson,
    serve: mcpHandlers.serve,
  },

  // Usage analytics handlers - direct mapping
  usage: {
    createEntry: usageHandlers.createEntry,
    getAllEntries: usageHandlers.getAllEntries,
    getStats: usageHandlers.getStats,
    getByDateRange: usageHandlers.getByDateRange,
    clearCache: usageHandlers.clearCache,
    getCacheStats: usageHandlers.getCacheStats,
  },

  // Project management handlers - direct mapping
  projectManagement: {
    openFolder: projectHandlers.openFolder,
    listProjects: projectHandlers.listProjects,
    createProject: projectHandlers.createProject,
    updateProject: projectHandlers.updateProject,
    deleteProject: projectHandlers.deleteProject,
    openProject: projectHandlers.openProject,
    getClaudeProjectImportCandidates: projectHandlers.getClaudeProjectImportCandidates,
    importClaudeProjects: projectHandlers.importClaudeProjects,
    getProjectSessions: projectHandlers.getProjectSessions,
    getProjectStats: projectHandlers.getProjectStats,
  },

  // Business-oriented workspace operations - direct mapping
  workspace: {
    load: workspaceHandlers.load,
    save: workspaceHandlers.save,
    listProjects: workspaceHandlers.listProjects,
    cleanupOrphanedStates: workspaceHandlers.cleanupOrphanedStates,
  },

};

/**
 * Type utilities for API routing
 */
export type ApiChannel = keyof IElectronAPI;
export type ApiMethod<T extends ApiChannel> = keyof IElectronAPI[T];

/**
 * Get all IPC channel names that should be registered
 */
export function getIpcChannels(): string[] {
  const channels: string[] = [];
  
  for (const channelName in apiRouter) {
    const channel = channelName as ApiChannel;
    const methods = apiRouter[channel];
    
    // Skip special properties
    if (channel === 'on' || channel === 'removeListener') {
      continue;
    }
    
    if (typeof methods === 'object' && methods !== null) {
      // Module with methods
      for (const methodName in methods) {
        const method = methodName as string;
        const handler = (methods as any)[method];
        
        if (typeof handler === 'function') {
          channels.push(`${channel}:${method}`);
        }
      }
    } else if (typeof methods === 'function') {
      // Direct function
      channels.push(channel);
    }
  }
  
  return channels;
}