import { spawn } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { IpcMainInvokeEvent } from 'electron';
import {
  McpServer,
  McpServerListCache,
  McpResponse
} from '../types/mcp.js';

// Cache for MCP server list
let mcpServerListCache: McpServerListCache | null = null;
const MCP_CACHE_TTL = 30 * 1000; // 30 seconds

/**
 * Get MCP server list with caching
 */
export async function list(_event: IpcMainInvokeEvent): Promise<McpServer[]> {
  const now = Date.now();
  
  // Check cache first
  if (mcpServerListCache && (now - mcpServerListCache.timestamp) < MCP_CACHE_TTL) {
    return mcpServerListCache.servers;
  }

  // Read from Claude Desktop config
  const claudeDesktopConfigPath = join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  
  try {
    const configContent = await readFile(claudeDesktopConfigPath, 'utf8');
    const config = JSON.parse(configContent);
    
    const servers: McpServer[] = [];
    
    if (config.mcpServers) {
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        const server = serverConfig as any;
        servers.push({
          name,
          transport: server.transport || 'stdio',
          command: server.command || '',
          args: server.args || [],
          env: server.env || {},
          url: server.url || null,
          scope: server.scope || 'global',
          is_active: true,
          status: {
            running: false,
            error: null,
            last_checked: null
          }
        });
      }
    }
    
    // Cache the result
    mcpServerListCache = {
      servers,
      timestamp: now
    };
    
    return servers;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Clear MCP server list cache
 */
export async function clearCache(_event: IpcMainInvokeEvent): Promise<void> {
  mcpServerListCache = null;
}

/**
 * Add a new MCP server
 */
export async function add(
  _event: IpcMainInvokeEvent,
  name: string,
  command: string,
  transport?: string,
  args?: string[],
  env?: Record<string, string>,
  url?: string,
  scope?: string
): Promise<McpResponse> {
  try {
    const claudeDesktopConfigPath = join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    
    let config: any = {};
    
    try {
      const configContent = await readFile(claudeDesktopConfigPath, 'utf8');
      config = JSON.parse(configContent);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    if (!config.mcpServers) {
      config.mcpServers = {};
    }
    
    config.mcpServers[name] = {
      transport: transport || 'stdio',
      command,
      args: args || [],
      env: env || {},
      url,
      scope: scope || 'global'
    };
    
    await writeFile(claudeDesktopConfigPath, JSON.stringify(config, null, 2), 'utf8');
    
    // Clear cache
    mcpServerListCache = null;
    
    return { success: true, message: `MCP server '${name}' added successfully` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Remove an MCP server
 */
export async function remove(_event: IpcMainInvokeEvent, name: string): Promise<McpResponse> {
  try {
    const claudeDesktopConfigPath = join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    
    try {
      const configContent = await readFile(claudeDesktopConfigPath, 'utf8');
      const config = JSON.parse(configContent);
      
      if (config.mcpServers && config.mcpServers[name]) {
        delete config.mcpServers[name];
        await writeFile(claudeDesktopConfigPath, JSON.stringify(config, null, 2), 'utf8');
        
        // Clear cache
        mcpServerListCache = null;
        
        return { success: true, message: `MCP server '${name}' removed successfully` };
      } else {
        return { success: false, error: `MCP server '${name}' not found` };
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { success: false, error: 'Claude Desktop config not found' };
      }
      throw error;
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Test MCP server connection
 */
export async function testConnection(_event: IpcMainInvokeEvent, name: string): Promise<McpResponse> {
  // Get server config
  const servers = await list(_event);
  
  const server = servers.find(s => s.name === name);
  if (!server) {
    return { success: false, error: `MCP server '${name}' not found` };
  }
  
  // Test connection based on transport type
  if (server.transport === 'stdio') {
    return testStdioConnection(server);
  } else if (server.transport === 'sse') {
    return testSseConnection(server);
  } else {
    return { success: false, error: `Unsupported transport type: ${server.transport}` };
  }
}

/**
 * Test stdio MCP connection
 */
function testStdioConnection(server: McpServer): Promise<McpResponse> {
  return new Promise((resolve) => {
    try {
      const child = spawn(server.command, server.args, {
        env: { ...process.env, ...server.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      let errorOutput = '';
      
      const timeout = setTimeout(() => {
        child.kill();
        resolve({ 
          success: false, 
          error: 'Connection test timed out after 5 seconds' 
        });
      }, 5000);
      
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ 
            success: true, 
            message: 'Connection test passed',
            output: output.trim()
          });
        } else {
          resolve({ 
            success: false, 
            error: `Process exited with code ${code}. Error: ${errorOutput}` 
          });
        }
      });
      
      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({ 
          success: false, 
          error: error.message 
        });
      });
    } catch (error: any) {
      resolve({ 
        success: false, 
        error: error.message 
      });
    }
  });
}

/**
 * Test SSE MCP connection
 */
async function testSseConnection(server: McpServer): Promise<McpResponse> {
  try {
    if (!server.url) {
      return { success: false, error: 'SSE server URL not provided' };
    }
    
    const response = await fetch(server.url);
    
    if (response.ok) {
      return { 
        success: true, 
        message: 'SSE connection test passed' 
      };
    } else {
      return { 
        success: false, 
        error: `HTTP ${response.status}: ${response.statusText}` 
      };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Import MCP servers from Claude Desktop config
 */
export async function addFromClaudeDesktop(_event: IpcMainInvokeEvent, _configPath?: string): Promise<McpResponse> {
  const servers = await list(_event);
  
  return { 
    success: true, 
    message: `Found ${servers.length} MCP servers in Claude Desktop config`,
    imported_count: servers.length
  };
}

/**
 * Add MCP server from JSON config
 */
export async function addJson(
  _event: IpcMainInvokeEvent,
  name: string,
  configJson: string,
  scope?: string
): Promise<McpResponse> {
  try {
    const config = JSON.parse(configJson);
    
    return add(
      _event,
      name,
      config.command,
      config.transport || 'stdio',
      config.args,
      config.env,
      config.url,
      scope
    );
  } catch (error: any) {
    return { success: false, error: `Invalid JSON config: ${error.message}` };
  }
}

/**
 * Serve MCP (placeholder for future implementation)
 */
export async function serve(_event: IpcMainInvokeEvent): Promise<McpResponse> {
  try {
    // This would implement MCP server functionality
    return { 
      success: true, 
      message: 'MCP server functionality not yet implemented' 
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

