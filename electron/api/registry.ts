/**
 * API Route Registry - Single Source of Truth
 * 
 * This file provides a flat, declarative registry of all API routes.
 * It serves as the single source of truth for API routing, eliminating
 * the need for complex nested objects and reducing maintenance overhead.
 */

import * as systemHandlers from '../handlers/system-handler.js';
import * as claudeCliHandlers from '../handlers/claude-cli-handler.js';
import * as terminalHandlers from '../handlers/terminal-handler.js';
import * as projectHandlers from '../handlers/project-management-handler.js';
import * as settingsHandlers from '../handlers/settings-handler.js';
import * as usageHandlers from '../handlers/usage-analytics-handler.js';
import * as mcpHandlers from '../handlers/mcp-handler.js';
import * as workspaceHandlers from '../handlers/workspace-handler.js';

/**
 * Defines the structure of a single API route
 */
export interface ApiRoute {
  channel: string;  // Module name like 'terminal' or 'system', or the function name for top-level functions
  method: string;   // Method name like 'create' or 'ping', empty string for top-level functions
  handler: (...args: any[]) => any; // The actual handler function
}

/**
 * Complete API route registry - flat array of all available routes
 * Each entry represents one IPC channel registration
 */
export const apiRegistry: ApiRoute[] = [
  // System utilities - top-level functions
  { channel: 'ping', method: '', handler: systemHandlers.ping },
  { channel: 'getPlatform', method: '', handler: systemHandlers.getPlatform },

  // Terminal handlers
  { channel: 'terminal', method: 'create', handler: terminalHandlers.createTerminal },
  { channel: 'terminal', method: 'write', handler: terminalHandlers.writeToTerminal },
  { channel: 'terminal', method: 'resize', handler: terminalHandlers.resizeTerminal },
  { channel: 'terminal', method: 'close', handler: terminalHandlers.closeTerminal },
  { channel: 'terminal', method: 'getState', handler: terminalHandlers.getTerminalState },
  { channel: 'terminal', method: 'cwdChanged', handler: terminalHandlers.handleCwdChanged },
  { channel: 'terminal', method: 'registerWebContents', handler: terminalHandlers.registerWebContents },
  { channel: 'terminal', method: 'updateCleanBuffer', handler: terminalHandlers.updateCleanBuffer },

  // Claude CLI handlers
  { channel: 'claudeCli', method: 'getBinaryPath', handler: claudeCliHandlers.getBinaryPath },
  { channel: 'claudeCli', method: 'setBinaryPath', handler: claudeCliHandlers.setBinaryPath },
  { channel: 'claudeCli', method: 'getInfo', handler: claudeCliHandlers.getInfo },
  { channel: 'claudeCli', method: 'executeCommand', handler: claudeCliHandlers.executeCommand },

  // Settings handlers
  { channel: 'settings', method: 'getClaudeSettings', handler: settingsHandlers.getClaudeSettings },
  { channel: 'settings', method: 'saveClaudeSettings', handler: settingsHandlers.saveClaudeSettings },

  // MCP handlers
  { channel: 'mcp', method: 'list', handler: mcpHandlers.list },
  { channel: 'mcp', method: 'clearCache', handler: mcpHandlers.clearCache },
  { channel: 'mcp', method: 'add', handler: mcpHandlers.add },
  { channel: 'mcp', method: 'remove', handler: mcpHandlers.remove },
  { channel: 'mcp', method: 'testConnection', handler: mcpHandlers.testConnection },
  { channel: 'mcp', method: 'addFromClaudeDesktop', handler: mcpHandlers.addFromClaudeDesktop },
  { channel: 'mcp', method: 'addJson', handler: mcpHandlers.addJson },
  { channel: 'mcp', method: 'serve', handler: mcpHandlers.serve },

  // Usage analytics handlers
  { channel: 'usage', method: 'createEntry', handler: usageHandlers.createEntry },
  { channel: 'usage', method: 'getAllEntries', handler: usageHandlers.getAllEntries },
  { channel: 'usage', method: 'getStats', handler: usageHandlers.getStats },
  { channel: 'usage', method: 'getByDateRange', handler: usageHandlers.getByDateRange },
  { channel: 'usage', method: 'clearCache', handler: usageHandlers.clearCache },
  { channel: 'usage', method: 'getCacheStats', handler: usageHandlers.getCacheStats },

  // Project management handlers
  { channel: 'projectManagement', method: 'openFolder', handler: projectHandlers.openFolder },
  { channel: 'projectManagement', method: 'listProjects', handler: projectHandlers.listProjects },
  { channel: 'projectManagement', method: 'createProject', handler: projectHandlers.createProject },
  { channel: 'projectManagement', method: 'updateProject', handler: projectHandlers.updateProject },
  { channel: 'projectManagement', method: 'deleteProject', handler: projectHandlers.deleteProject },
  { channel: 'projectManagement', method: 'openProject', handler: projectHandlers.openProject },
  { channel: 'projectManagement', method: 'getClaudeProjectImportCandidates', handler: projectHandlers.getClaudeProjectImportCandidates },
  { channel: 'projectManagement', method: 'importClaudeProjects', handler: projectHandlers.importClaudeProjects },
  { channel: 'projectManagement', method: 'getProjectSessions', handler: projectHandlers.getProjectSessions },
  { channel: 'projectManagement', method: 'getProjectStats', handler: projectHandlers.getProjectStats },

  // Workspace handlers
  { channel: 'workspace', method: 'load', handler: workspaceHandlers.load },
  { channel: 'workspace', method: 'save', handler: workspaceHandlers.save },
  { channel: 'workspace', method: 'listProjects', handler: workspaceHandlers.listProjects },
  { channel: 'workspace', method: 'cleanupOrphanedStates', handler: workspaceHandlers.cleanupOrphanedStates },
];