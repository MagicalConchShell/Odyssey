/**
 * Terminal IPC Handlers - Clean Architecture Implementation
 * 
 * This file implements the SOTA architecture from terminal_architecture_v1.md
 * All complex logic has been moved to PtyService - these handlers are just IPC bridges
 */

import { IpcMain, WebContents } from 'electron'
import { ptyService } from '../services/pty-service'
import { 
  getTerminalDataChannel,
  getTerminalExitChannel
} from '../ipc-channels'
import { registerHandler } from './base-handler.js'

let webContentsRef: WebContents | null = null

/**
 * Create a new terminal session
 */
async function createTerminal(workingDirectory: string, shell?: string, _projectPath?: string): Promise<{ sessionId: string }> {
  const id = `terminal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  console.log(`[TerminalHandler] Creating terminal ${id}`)
  ptyService.create(id, shell || '', workingDirectory, 80, 30)
  
  return { sessionId: id }
}

/**
 * Write data to a terminal session
 */
async function writeToTerminal(sessionId: string, data: string): Promise<void> {
  const success = ptyService.write(sessionId, data)
  
  if (!success) {
    throw new Error(`Terminal ${sessionId} not found`)
  }
}

/**
 * Resize a terminal session
 */
async function resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void> {
  const success = ptyService.resize(sessionId, cols, rows)
  
  if (!success) {
    throw new Error(`Terminal ${sessionId} not found`)
  }
}

/**
 * Close a terminal session
 */
async function closeTerminal(sessionId: string): Promise<void> {
  const success = ptyService.kill(sessionId)
  
  if (!success) {
    throw new Error(`Terminal ${sessionId} not found`)
  }
}

/**
 * Setup terminal IPC handlers with clean architecture
 */
export function setupTerminalHandlers(ipcMain: IpcMain) {
  // Register terminal handlers using the standard pattern
  registerHandler(ipcMain, 'terminal:create', createTerminal)
  registerHandler(ipcMain, 'terminal:write', writeToTerminal)
  registerHandler(ipcMain, 'terminal:resize', resizeTerminal)
  registerHandler(ipcMain, 'terminal:close', closeTerminal)

  // Set up PtyService event forwarding
  setupPtyServiceEvents()

  console.log('✅ Terminal handlers registered with clean architecture')
}

/**
 * Setup PtyService event forwarding to renderer
 */
function setupPtyServiceEvents() {
  // Forward data events to renderer
  ptyService.on('data', ({ id, data }) => {
    if (webContentsRef && !webContentsRef.isDestroyed()) {
      const channel = getTerminalDataChannel(id)
      webContentsRef.send(channel, data)
    }
  })

  // Forward exit events to renderer
  ptyService.on('exit', ({ id, exitCode }) => {
    if (webContentsRef && !webContentsRef.isDestroyed()) {
      const channel = getTerminalExitChannel(id)
      webContentsRef.send(channel, exitCode)
    }
  })
}

/**
 * Set the WebContents reference for event forwarding
 */
export function setTerminalWebContents(webContents: WebContents) {
  webContentsRef = webContents
  console.log('[TerminalHandler] WebContents reference set for event forwarding')
}

