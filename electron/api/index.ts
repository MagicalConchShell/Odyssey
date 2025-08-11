/**
 * API Bootstrap - Unified API Initialization
 *
 * This module provides a unified API initialization process that combines:
 * 1. Handler registration to IPC main process
 * 2. API structure generation for preload script
 * 3. Service dependency injection
 *
 * All in a single traversal to eliminate duplicate logic and improve performance.
 */

import { IpcMain } from 'electron';
import { apiRegistry } from './registry.js';
import { registerHandler } from './base-handler';
import type { HandlerServices } from '../handlers/index.js';
import * as terminalHandlers from '../handlers/terminal-handler.js';
import * as workspaceHandlers from '../handlers/workspace-handler.js';

/**
 * Initialize handlers that require service dependencies
 */
export function initializeHandlers(services: HandlerServices): void {
  // Initialize handlers that need services
  terminalHandlers.initializeTerminalHandlers(services.terminalManagementService);
  workspaceHandlers.initializeWorkspaceHandlers(services);

  console.log('✅ Handlers initialized with services');
}

/**
 * Register all handlers to IPC and generate API structure from registry
 * This uses the flat apiRegistry array for simple, efficient processing
 *
 * @param ipcMain - Electron IPC main instance
 * @returns API structure object for frontend
 */
function registerHandlersAndGenerateApi(
  ipcMain: IpcMain
): Record<string, string | Record<string, string>> {
  console.log('🔧 Registering handlers from API registry...');

  const structure: Record<string, string | Record<string, string>> = {};

  // Direct traversal of the flat apiRegistry array
  for (const route of apiRegistry) {
    const { channel, method, handler } = route;

    // Generate IPC channel name
    const ipcChannel = method ? `${channel}:${method}` : channel;

    // Register handler to IPC
    registerHandler(ipcMain, ipcChannel, handler);

    // Build API structure for frontend
    if (method) {
      // Module with methods (e.g., terminal, mcp, etc.)
      if (!structure[channel]) {
        structure[channel] = {};
      }
      (structure[channel] as Record<string, string>)[method] = ipcChannel;
    } else {
      // Direct function (e.g., ping, getPlatform)
      structure[channel] = ipcChannel;
    }

    console.log(`📡 Registered handler: ${ipcChannel}`);
  }

  console.log(`✅ Registered ${apiRegistry.length} handlers and generated API structure`);
  return structure;
}


/**
 * Bootstrap the entire API system
 * Combines handler registration and API structure generation in a single operation
 *
 * @param ipcMain - Electron IPC main instance
 * @param services - Required services for handlers
 * @returns API structure object for a preload script
 */
export async function bootstrapApi(
  ipcMain: IpcMain,
  services: HandlerServices
): Promise<Record<string, string | Record<string, string>>> {
  console.log('🚀 Bootstrapping API system...');

  // Step 1: Initialize handlers with services
  initializeHandlers(services);
  console.log('✅ Handlers initialized with services');

  // Step 2: Register handlers and generate API structure in single traversal
  const apiStructure = registerHandlersAndGenerateApi(ipcMain);
  console.log('✅ Handlers registered and API structure generated');

  console.log('🎉 API bootstrap completed successfully');
  return apiStructure;
}