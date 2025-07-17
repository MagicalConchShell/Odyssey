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
async function createTerminal(workingDirectory: string, shell?: string, _projectPath?: string, terminalId?: string): Promise<{ sessionId: string }> {
  // Use provided terminalId or generate new one - unified ID system
  const id = terminalId || `terminal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  console.log(`[TerminalHandler] 🚀 Creating terminal ${id}:`, {
    workingDirectory,
    shell,
    _projectPath,
    providedId: !!terminalId
  })
  
  ptyService.create(id, shell || '', workingDirectory, 80, 30)
  
  console.log(`[TerminalHandler] ✅ Terminal ${id} created successfully`)
  return { sessionId: id }
}

/**
 * Write data to a terminal session
 */
async function writeToTerminal(sessionId: string, data: string): Promise<void> {
  console.log(`[TerminalHandler] 📝 Writing to terminal ${sessionId}:`, {
    dataLength: data.length,
    dataPreview: data.slice(0, 50)
  })
  
  const success = ptyService.write(sessionId, data)
  
  if (!success) {
    console.error(`[TerminalHandler] ❌ Terminal ${sessionId} not found for write operation`)
    throw new Error(`Terminal ${sessionId} not found`)
  }
  
  console.log(`[TerminalHandler] ✅ Successfully wrote to terminal ${sessionId}`)
}

/**
 * Resize a terminal session
 */
async function resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void> {
  console.log(`[TerminalHandler] 📏 Resizing terminal ${sessionId}:`, {
    cols,
    rows
  })
  
  const success = ptyService.resize(sessionId, cols, rows)
  
  if (!success) {
    console.error(`[TerminalHandler] ❌ Terminal ${sessionId} not found for resize operation`)
    throw new Error(`Terminal ${sessionId} not found`)
  }
  
  console.log(`[TerminalHandler] ✅ Successfully resized terminal ${sessionId} to ${cols}x${rows}`)
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
    console.log(`[TerminalHandler] 📨 Forwarding data from PTY ${id}:`, {
      dataLength: data.length,
      hasWebContents: !!webContentsRef,
      isDestroyed: webContentsRef?.isDestroyed()
    })
    
    if (webContentsRef && !webContentsRef.isDestroyed()) {
      const channel = getTerminalDataChannel(id)
      console.log(`[TerminalHandler] 📡 Sending data on channel ${channel}`)
      webContentsRef.send(channel, data)
    } else {
      console.warn(`[TerminalHandler] ⚠️ Cannot forward data - no valid webContents for terminal ${id}`)
    }
  })

  // Forward exit events to renderer
  ptyService.on('exit', ({ id, exitCode }) => {
    console.log(`[TerminalHandler] 🚪 Forwarding exit from PTY ${id}:`, { exitCode })
    
    if (webContentsRef && !webContentsRef.isDestroyed()) {
      const channel = getTerminalExitChannel(id)
      console.log(`[TerminalHandler] 📡 Sending exit on channel ${channel}`)
      webContentsRef.send(channel, exitCode)
    } else {
      console.warn(`[TerminalHandler] ⚠️ Cannot forward exit - no valid webContents for terminal ${id}`)
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

