/**
 * Core API Response Types
 * 
 * This file contains the unified API response types for all IPC communications
 * between the main process and renderer process.
 */

import * as electron from "electron";

/**
 * Standard API response format for all IPC handlers
 * Combines the best aspects of the previous IpcResponse and ApiResponse types
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string; // For error categorization and handling
  meta?: any; // For additional metadata like recovery suggestions
}

/**
 * Base handler configuration
 */
export interface HandlerConfig {
  name: string;
  requiresValidation?: boolean;
  timeout?: number;
}

/**
 * Handler function type with proper typing
 */
export type HandlerFunction<TInput extends any[] = any[], TOutput = any> = (
  event: electron.IpcMainInvokeEvent,
  ...args: TInput
) => Promise<ApiResponse<TOutput>>;