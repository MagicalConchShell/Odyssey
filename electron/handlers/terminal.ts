import { ipcMain } from 'electron';
import * as pty from 'node-pty';
import { ApiResponse } from './types';

// Terminal session management
interface TerminalSession {
  id: string;
  process: pty.IPty;
  isActive: boolean;
  workingDirectory: string;
  shell: string;
}

class TerminalHandler {
  private sessions: Map<string, TerminalSession> = new Map();
  private nextSessionId = 1;

  /**
   * Create a new terminal session
   */
  async createTerminal(workingDirectory: string, shell?: string): Promise<ApiResponse<{ sessionId: string }>> {
    try {
      const sessionId = `terminal_${this.nextSessionId++}`;
      
      // Determine shell to use
      const defaultShell = process.platform === 'win32' ? 'powershell.exe' : 
                          process.platform === 'darwin' ? process.env.SHELL || '/bin/zsh' :
                          '/bin/bash';
      const selectedShell = shell || defaultShell;

      // Create pty process
      const ptyProcess = pty.spawn(selectedShell, [], {
        cwd: workingDirectory,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          // Add any project-specific environment variables here
        },
        cols: 80,
        rows: 30
      });

      const session: TerminalSession = {
        id: sessionId,
        process: ptyProcess,
        isActive: true,
        workingDirectory,
        shell: selectedShell
      };

      this.sessions.set(sessionId, session);

      // Handle process events
      ptyProcess.onExit(({ exitCode }) => {
        console.log(`Terminal session ${sessionId} exited with code ${exitCode}`);
        this.sessions.delete(sessionId);
      });

      return {
        success: true,
        data: { sessionId }
      };
    } catch (error: any) {
      console.error('Failed to create terminal:', error);
      return {
        success: false,
        error: error.message || 'Failed to create terminal session'
      };
    }
  }

  /**
   * Write data to terminal session
   */
  async writeToTerminal(sessionId: string, data: string): Promise<ApiResponse<void>> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session || !session.isActive) {
        throw new Error(`Terminal session ${sessionId} not found or inactive`);
      }

      session.process.write(data);
      
      return { success: true };
    } catch (error: any) {
      console.error(`Failed to write to terminal ${sessionId}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to write to terminal'
      };
    }
  }

  /**
   * Resize terminal session
   */
  async resizeTerminal(sessionId: string, cols: number, rows: number): Promise<ApiResponse<void>> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session || !session.isActive) {
        throw new Error(`Terminal session ${sessionId} not found or inactive`);
      }

      session.process.resize(cols, rows);
      
      return { success: true };
    } catch (error: any) {
      console.error(`Failed to resize terminal ${sessionId}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to resize terminal'
      };
    }
  }

  /**
   * Close terminal session
   */
  async closeTerminal(sessionId: string): Promise<ApiResponse<void>> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        // Session already closed
        return { success: true };
      }

      session.isActive = false;
      session.process.kill();
      this.sessions.delete(sessionId);
      
      return { success: true };
    } catch (error: any) {
      console.error(`Failed to close terminal ${sessionId}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to close terminal'
      };
    }
  }

  /**
   * Get terminal session info
   */
  async getTerminalInfo(sessionId: string): Promise<ApiResponse<{ isActive: boolean; workingDirectory: string; shell: string }>> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Terminal session ${sessionId} not found`);
      }

      return {
        success: true,
        data: {
          isActive: session.isActive,
          workingDirectory: session.workingDirectory,
          shell: session.shell
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get terminal info'
      };
    }
  }

  /**
   * List all active terminal sessions
   */
  async listTerminals(): Promise<ApiResponse<string[]>> {
    try {
      const activeSessionIds = Array.from(this.sessions.keys()).filter(id => {
        const session = this.sessions.get(id);
        return session?.isActive;
      });

      return {
        success: true,
        data: activeSessionIds
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to list terminals'
      };
    }
  }

  /**
   * Setup event listeners for terminal data streams
   */
  setupTerminalDataStreams(sessionId: string, webContents: Electron.WebContents) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`Cannot setup data streams for non-existent session ${sessionId}`);
      return;
    }

    // Forward data to renderer
    session.process.onData((data) => {
      webContents.send(`terminal-data-${sessionId}`, data);
    });

    // Notify when process exits
    session.process.onExit(({ exitCode }) => {
      webContents.send(`terminal-exit-${sessionId}`, exitCode);
    });
  }

  /**
   * Cleanup all sessions
   */
  cleanup() {
    console.log('Cleaning up terminal sessions...');
    for (const [, session] of this.sessions) {
      if (session.isActive) {
        session.process.kill();
      }
    }
    this.sessions.clear();
  }
}

// Create singleton instance
const terminalHandler = new TerminalHandler();

/**
 * Setup terminal IPC handlers
 */
export function setupTerminalHandlers() {
  // Create terminal
  ipcMain.handle('terminal:create', async (event, workingDirectory: string, shell?: string) => {
    const result = await terminalHandler.createTerminal(workingDirectory, shell);
    
    // If successful, setup data streams
    if (result.success && result.data) {
      terminalHandler.setupTerminalDataStreams(result.data.sessionId, event.sender);
    }
    
    return result;
  });

  // Write to terminal
  ipcMain.handle('terminal:write', async (_, sessionId: string, data: string) => {
    return await terminalHandler.writeToTerminal(sessionId, data);
  });

  // Resize terminal
  ipcMain.handle('terminal:resize', async (_, sessionId: string, cols: number, rows: number) => {
    return await terminalHandler.resizeTerminal(sessionId, cols, rows);
  });

  // Close terminal
  ipcMain.handle('terminal:close', async (_, sessionId: string) => {
    return await terminalHandler.closeTerminal(sessionId);
  });

  // Get terminal info
  ipcMain.handle('terminal:info', async (_, sessionId: string) => {
    return await terminalHandler.getTerminalInfo(sessionId);
  });

  // List terminals
  ipcMain.handle('terminal:list', async (_) => {
    return await terminalHandler.listTerminals();
  });

  console.log('✅ Terminal handlers registered');
}

/**
 * Cleanup terminal handlers
 */
export function cleanupTerminalHandlers() {
  // Remove IPC handlers
  ipcMain.removeHandler('terminal:create');
  ipcMain.removeHandler('terminal:write');
  ipcMain.removeHandler('terminal:resize');
  ipcMain.removeHandler('terminal:close');
  ipcMain.removeHandler('terminal:info');
  ipcMain.removeHandler('terminal:list');

  // Cleanup terminal sessions
  terminalHandler.cleanup();
  
  console.log('✅ Terminal handlers cleaned up');
}

export { terminalHandler };
