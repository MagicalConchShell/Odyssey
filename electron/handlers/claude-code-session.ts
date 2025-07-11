import { IpcMain, BrowserWindow } from 'electron';
import { ChildProcess } from 'child_process';
import { registerHandler } from './base-handler.js';

/**
 * Process registry for tracking active Claude processes
 */
const activeProcesses = new Map<string, ChildProcess>();

/**
 * Get the main window instance
 */
function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

/**
 * Registers a new Claude process for tracking and cleanup
 */
export function registerProcess(sessionId: string, process: ChildProcess): void {
  activeProcesses.set(sessionId, process);

  // Automatically remove from registry when process ends
  process.on('close', () => {
    activeProcesses.delete(sessionId);
  });

  process.on('error', () => {
    activeProcesses.delete(sessionId);
  });
}

/**
 * Cleanup all active processes gracefully
 */
export function cleanupAllProcesses(): void {
  console.log(`🧹 Cleaning up ${activeProcesses.size} active processes...`);

  for (const [sessionId, process] of activeProcesses) {
    try {
      if (process.pid && !process.killed) {
        console.log(`Terminating process for session ${sessionId} (PID: ${process.pid})`);
        process.kill('SIGTERM');

        // Force kill after 5 seconds if process doesn't respond to SIGTERM
        setTimeout(() => {
          if (!process.killed) {
            console.log(`Force killing process for session ${sessionId} (PID: ${process.pid})`);
            process.kill('SIGKILL');
          }
        }, 5000);
      }
    } catch (error) {
      console.error(`Failed to terminate process for session ${sessionId}:`, error);
    }
  }

  activeProcesses.clear();
}

/**
 * Get active processes for monitoring
 */
export function getActiveProcesses(): Map<string, ChildProcess> {
  return activeProcesses;
}

/**
 * Execute Claude Code command
 */
async function executeClaudeCode(
  projectPath: string, 
  prompt: string, 
  model?: string
): Promise<{ sessionId: string }> {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`🚀 Starting Claude Code session ${sessionId} for project: ${projectPath}`);

  const args = ['code', '--cwd', projectPath];
  if (model) {
    args.push('--model', model);
  }

  const options = {
    cwd: projectPath,
    timeout: 0 // No timeout for interactive sessions
  };

  // Execute the command (placeholder implementation)
  // TODO: Implement executeClaudeCommandWithProcess method
  console.log(`Would execute Claude Code with args:`, args, `and options:`, options);

  const mainWindow = getMainWindow();
  
  // For now, simulate a successful session start
  // In real implementation, this would spawn the actual Claude process

  // Simulate some output
  setTimeout(() => {
    mainWindow?.webContents.send(`claude-output:${sessionId}`, `Starting Claude Code session...`);
    mainWindow?.webContents.send('claude-output', `Starting Claude Code session...`);

    if (prompt) {
      mainWindow?.webContents.send(`claude-output:${sessionId}`, `Prompt: ${prompt}`);
      mainWindow?.webContents.send('claude-output', `Prompt: ${prompt}`);
    }

    // Simulate completion
    setTimeout(() => {
      mainWindow?.webContents.send(`claude-complete:${sessionId}`, true);
      mainWindow?.webContents.send('claude-complete', true);
    }, 1000);
  }, 100);

  return { sessionId };
}

/**
 * Resume Claude Code session
 */
async function resumeClaudeCode(
  projectPath: string, 
  sessionId: string, 
  prompt: string, 
  model?: string
): Promise<void> {
  console.log(`🔄 Resuming Claude Code session ${sessionId} for project: ${projectPath}`);

  const args = ['code', '--cwd', projectPath, '--resume', sessionId];
  if (model) {
    args.push('--model', model);
  }

  const options = {
    cwd: projectPath,
    timeout: 0
  };

  // Resume Claude Code session (placeholder implementation)
  // TODO: Implement executeClaudeCommandWithProcess method
  console.log(`Would resume Claude Code with args:`, args, `and options:`, options);

  const mainWindow = getMainWindow();

  // Simulate resuming the session
  setTimeout(() => {
    mainWindow?.webContents.send(`claude-output:${sessionId}`, `Resuming Claude Code session...`);
    mainWindow?.webContents.send('claude-output', `Resuming Claude Code session...`);

    if (prompt) {
      mainWindow?.webContents.send(`claude-output:${sessionId}`, `Prompt: ${prompt}`);
      mainWindow?.webContents.send('claude-output', `Prompt: ${prompt}`);
    }

    // Simulate completion
    setTimeout(() => {
      mainWindow?.webContents.send(`claude-complete:${sessionId}`, true);
      mainWindow?.webContents.send('claude-complete', true);
    }, 1000);
  }, 100);
}

/**
 * Cancel Claude execution
 */
async function cancelClaudeExecution(sessionId?: string): Promise<void> {
  if (sessionId) {
    const process = activeProcesses.get(sessionId);
    if (process && !process.killed) {
      process.kill('SIGTERM');
      console.log(`Cancelled Claude Code session ${sessionId}`);
    }
  } else {
    // Cancel all active processes
    for (const [id, process] of activeProcesses) {
      if (!process.killed) {
        process.kill('SIGTERM');
        console.log(`Cancelled Claude Code session ${id}`);
      }
    }
  }
}

/**
 * Load session history
 */
async function loadSessionHistory(_sessionId: string, _projectId: string): Promise<any[]> {
  // This would load session history from files or database
  // For now, return empty array
  return [];
}

/**
 * Setup Claude Code session handlers
 */
export function setupClaudeCodeSessionHandlers(ipcMain: IpcMain): void {
  console.log('🔧 Setting up Claude Code session handlers...');

  // Register handlers with proper type safety
  registerHandler(
    ipcMain,
    'execute-claude-code',
    executeClaudeCode,
    { requiresValidation: true }
  );

  registerHandler(
    ipcMain,
    'resume-claude-code',
    resumeClaudeCode,
    { requiresValidation: true }
  );

  registerHandler(
    ipcMain,
    'cancel-claude-execution',
    cancelClaudeExecution
  );

  registerHandler(
    ipcMain,
    'load-session-history',
    loadSessionHistory,
    { requiresValidation: true }
  );

  console.log('✅ Claude Code session handlers registered successfully');
}

/**
 * Get handler statistics for monitoring
 */
export function getClaudeCodeSessionStats(): {
  totalHandlers: number;
  activeProcesses: number;
} {
  return {
    totalHandlers: 4,
    activeProcesses: activeProcesses.size
  };
}