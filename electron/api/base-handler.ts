import { IpcMain } from 'electron';
import { ApiResponse, HandlerConfig, HandlerFunction } from '../types/api.js';

/**
 * Common error handling pattern for IPC handlers
 * Now simplified since all handlers have the same unified signature with event parameter
 * @param operation - The async operation to execute with event parameter
 * @param config - Optional configuration for the handler
 * @returns Promise with success/error result structure
 */
export function handleIpcOperation<TInput extends any[] = any[], TOutput = any>(
  operation: (event: Electron.IpcMainInvokeEvent, ...args: TInput) => Promise<TOutput>,
  config?: HandlerConfig
): HandlerFunction<TInput, TOutput> {
  return async (event: Electron.IpcMainInvokeEvent, ...args: TInput): Promise<ApiResponse<TOutput>> => {
    try {
      // Input validation if required
      if (config?.requiresValidation) {
        validateInput(args);
      }

      // Execute the operation with optional timeout, passing event as first parameter
      const result = config?.timeout 
        ? await withTimeout(operation(event, ...args), config.timeout)
        : await operation(event, ...args);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof Error && 'code' in error ? (error as any).code : undefined;
      
      console.error(`IPC Handler Error [${config?.name || 'unknown'}]:`, errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        errorCode
      };
    }
  };
}

/**
 * Basic input validation
 */
function validateInput(args: any[]): void {
  if (!args || args.length === 0) {
    throw new Error('Invalid input: no arguments provided');
  }
  
  // Check for null/undefined in required parameters
  for (let i = 0; i < args.length; i++) {
    if (args[i] === undefined) {
      throw new Error(`Invalid input: argument at index ${i} is undefined`);
    }
  }
}

/**
 * Timeout wrapper for operations
 */
function withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout);
    })
  ]);
}

/**
 * Helper to register a handler with consistent error handling
 * Now simplified since all handlers have the unified signature with event parameter
 */
export function registerHandler<TInput extends any[] = any[], TOutput = any>(
  ipcMain: IpcMain,
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: TInput) => Promise<TOutput>,
  config?: Omit<HandlerConfig, 'name'>
): void {
  const wrappedHandler = handleIpcOperation(handler, { name: channel, ...config });
  ipcMain.handle(channel, wrappedHandler);
}