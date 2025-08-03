/**
 * Core API Response Types
 * 
 * This file contains the unified API response types for all IPC communications
 * between the main process and renderer process.
 */

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
 * File operation response format
 */
export interface FileResponse {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * Screenshot operation response format
 */
export interface ScreenshotResponse {
  success: boolean;
  path?: string;
  error?: string;
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
  event: Electron.IpcMainInvokeEvent,
  ...args: TInput
) => Promise<ApiResponse<TOutput>>;