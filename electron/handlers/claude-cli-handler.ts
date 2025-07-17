import { IpcMain } from 'electron';
import { registerHandler } from './base-handler.js';
import { claudeCliManager, ClaudeExecutionOptions, ClaudeExecutionResult, ClaudeCliInfo } from '../services/claude-cli-service.js';

async function getClaudeBinaryPath(): Promise<string> {
  const claudePath = claudeCliManager.getClaudePath();
  if (claudePath) {
    return claudePath;
  }
  
  // Try to find Claude CLI if not already discovered
  const claudeInfo = await claudeCliManager.findClaudeCli();
  return claudeInfo.path || '';
}

async function getClaudeCliInfo(): Promise<ClaudeCliInfo> {
  return await claudeCliManager.findClaudeCli();
}

async function executeClaudeCommand(
  args: string[],
  options?: ClaudeExecutionOptions
): Promise<ClaudeExecutionResult> {
  try {
    return await claudeCliManager.executeClaudeCommand(args, options || {});
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

async function setClaudeBinaryPath(path: string): Promise<void> {
  claudeCliManager.setClaudePath(path);
  console.log('Claude binary path set to:', path);
}

export function setupClaudeCliHandlers(ipcMain: IpcMain): void {
  registerHandler(
    ipcMain,
    'get-claude-binary-path',
    getClaudeBinaryPath
  );

  registerHandler(
    ipcMain,
    'get-claude-cli-info',
    getClaudeCliInfo
  );

  registerHandler(
    ipcMain,
    'execute-claude-command',
    executeClaudeCommand
  );

  registerHandler(
    ipcMain,
    'set-claude-binary-path',
    setClaudeBinaryPath
  );

  console.log('✅ Claude CLI handlers registered successfully');
}

// Export functions for direct use within Electron main process
export {
  getClaudeBinaryPath,
  getClaudeCliInfo,
  executeClaudeCommand,
  setClaudeBinaryPath
};