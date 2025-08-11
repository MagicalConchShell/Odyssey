/**
 * MCP (Model Context Protocol) Server Types
 */

/**
 * MCP Server configuration and status
 */
export interface McpServer {
  name: string;
  transport: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  url?: string | null;
  scope: string;
  is_active: boolean;
  status: {
    running: boolean;
    error: string | null;
    last_checked: string | null;
  };
}

/**
 * MCP Server list cache for performance optimization
 */
export interface McpServerListCache {
  servers: McpServer[];
  timestamp: number;
}

/**
 * MCP operation response format
 */
export interface McpResponse {
  success: boolean;
  message?: string;
  error?: string;
  servers?: McpServer[];
  output?: string;
  imported_count?: number;
  failed_count?: number;
}