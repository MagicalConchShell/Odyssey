/**
 * Claude CLI Types
 */

/**
 * Claude CLI binary information and status
 */
export interface ClaudeCliInfo {
  path: string;
  version: string;
  isAvailable: boolean;
  error?: string;
  installMethod?: string;
  isAuthenticated?: boolean;
  apiKeySet?: boolean;
}

/**
 * Claude CLI execution options
 */
export interface ClaudeExecutionOptions {
  cwd?: string;
  timeout?: number;
  args?: string[];
}

/**
 * Claude CLI execution result
 */
export interface ClaudeExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
}

/**
 * Claude CLI info cache for performance optimization
 */
export interface ClaudeCliInfoCache {
  info: ClaudeCliInfo;
  timestamp: number;
}