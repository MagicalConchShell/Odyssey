import { claudeCliManager, ClaudeExecutionOptions, ClaudeExecutionResult, ClaudeCliInfo } from '../services/claude-cli-service.js';
import { IpcMainInvokeEvent } from 'electron';

export async function getBinaryPath(_event: IpcMainInvokeEvent): Promise<string | null> {
  const claudePath = claudeCliManager.getClaudePath();
  if (claudePath) {
    return claudePath;
  }
  
  // Try to find Claude CLI if not already discovered
  const claudeInfo = await claudeCliManager.findClaudeCli();
  return claudeInfo.path || null;
}

export async function getInfo(_event: IpcMainInvokeEvent): Promise<ClaudeCliInfo> {
  return await claudeCliManager.findClaudeCli();
}

export async function executeCommand(
  _event: IpcMainInvokeEvent,
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

export async function setBinaryPath(_event: IpcMainInvokeEvent, path: string): Promise<void> {
  claudeCliManager.setClaudePath(path);
  console.log('Claude binary path set to:', path);
}


