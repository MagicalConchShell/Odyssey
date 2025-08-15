/**
 * API Route Registry
 * 
 * This file provides a flat, declarative registry of all API routes.
 * It serves as the single source of truth for API routing, eliminating
 * the need for complex nested objects and reducing maintenance overhead.
 */

import * as systemHandlers from '../handlers/system-handler.js';
import * as terminalHandlers from '../handlers/terminal-handler.js';
import * as projectHandlers from '../handlers/project-handler.js';
import * as settingsHandlers from '../handlers/settings-handler.js';
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
  { channel: 'openExternal', method: '', handler: systemHandlers.openExternal },

    // Project handlers
  { channel: 'project', method: 'openFolder', handler: projectHandlers.openFolder },
  { channel: 'project', method: 'listProjects', handler: projectHandlers.listProjects },
  { channel: 'project', method: 'scanClaudeProjects', handler: projectHandlers.scanClaudeProjects },
  { channel: 'project', method: 'importClaudeProjects', handler: projectHandlers.importClaudeProjects },

  // Workspace handlers
  { channel: 'workspace', method: 'load', handler: workspaceHandlers.load },
  { channel: 'workspace', method: 'save', handler: workspaceHandlers.save },

  // Terminal handlers
  { channel: 'terminal', method: 'create', handler: terminalHandlers.createTerminal },
  { channel: 'terminal', method: 'write', handler: terminalHandlers.writeToTerminal },
  { channel: 'terminal', method: 'resize', handler: terminalHandlers.resizeTerminal },
  { channel: 'terminal', method: 'close', handler: terminalHandlers.closeTerminal },
  { channel: 'terminal', method: 'registerWebContents', handler: terminalHandlers.registerWebContents },

  // Environment variables handlers
  { channel: 'settings', method: 'getEnvironmentVariables', handler: settingsHandlers.getEnvironmentVariables },
  { channel: 'settings', method: 'saveEnvironmentVariables', handler: settingsHandlers.saveEnvironmentVariables },

];