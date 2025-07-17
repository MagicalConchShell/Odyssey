/**
 * Terminal IPC Handlers - Clean Architecture Implementation
 * 
 * This file implements the SOTA architecture from terminal_architecture_v1.md
 * All complex logic has been moved to PtyService - these handlers are just IPC bridges
 */

import { IpcMain, WebContents, IpcMainInvokeEvent } from 'electron'
import { ptyService } from '../services/pty-service'
import { 
  getTerminalDataChannel,
  getTerminalExitChannel
} from '../ipc-channels'
import { registerHandlerWithEvent } from './base-handler.js'

// Map to store WebContents for each terminal
const terminalWebContentsMap = new Map<string, WebContents>()

/**
 * Create a new terminal session
 */
async function createTerminal(event: IpcMainInvokeEvent, workingDirectory: string, shell?: string, projectPath?: string): Promise<{ terminalId: string }> {
  // Generate unique ID on the backend - following common pattern
  const id = `terminal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  
  console.log(`[TerminalHandler] 🚀 Creating terminal ${id}:`, {
    workingDirectory,
    shell,
    projectPath
  })
  
  // Store WebContents for this terminal
  terminalWebContentsMap.set(id, event.sender)
  
  ptyService.create(id, shell || '', workingDirectory, 80, 30)
  
  console.log(`[TerminalHandler] ✅ Terminal ${id} created successfully`)
  return { terminalId: id }
}

/**
 * Write data to a terminal session
 */
async function writeToTerminal(_event: IpcMainInvokeEvent, terminalId: string, data: string): Promise<void> {
  console.log(`[TerminalHandler] 📝 Writing to terminal ${terminalId}:`, {
    dataLength: data.length,
    dataPreview: data.slice(0, 50)
  })
  
  const success = ptyService.write(terminalId, data)
  
  if (!success) {
    console.error(`[TerminalHandler] ❌ Terminal ${terminalId} not found for write operation`)
    throw new Error(`Terminal ${terminalId} not found`)
  }
  
  console.log(`[TerminalHandler] ✅ Successfully wrote to terminal ${terminalId}`)
}

/**
 * Resize a terminal session
 */
async function resizeTerminal(_event: IpcMainInvokeEvent, terminalId: string, cols: number, rows: number): Promise<void> {
  console.log(`[TerminalHandler] 📏 Resizing terminal ${terminalId}:`, {
    cols,
    rows
  })
  
  const success = ptyService.resize(terminalId, cols, rows)
  
  if (!success) {
    console.error(`[TerminalHandler] ❌ Terminal ${terminalId} not found for resize operation`)
    throw new Error(`Terminal ${terminalId} not found`)
  }
  
  console.log(`[TerminalHandler] ✅ Successfully resized terminal ${terminalId} to ${cols}x${rows}`)
}

/**
 * Close a terminal session
 */
async function closeTerminal(_event: IpcMainInvokeEvent, terminalId: string): Promise<void> {
  const success = ptyService.kill(terminalId)
  
  // Clean up WebContents mapping
  terminalWebContentsMap.delete(terminalId)
  
  if (!success) {
    throw new Error(`Terminal ${terminalId} not found`)
  }
}

/**
 * Setup terminal IPC handlers with clean architecture
 */
export function setupTerminalHandlers(ipcMain: IpcMain) {
  // Register terminal handlers using the event-aware pattern
  registerHandlerWithEvent(ipcMain, 'terminal:create', createTerminal)
  registerHandlerWithEvent(ipcMain, 'terminal:write', writeToTerminal)
  registerHandlerWithEvent(ipcMain, 'terminal:resize', resizeTerminal)
  registerHandlerWithEvent(ipcMain, 'terminal:close', closeTerminal)

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
    const webContents = terminalWebContentsMap.get(id)
    
    console.log(`[TerminalHandler] 📨 Forwarding data from PTY ${id}:`, {
      dataLength: data.length,
      hasWebContents: !!webContents,
      isDestroyed: webContents?.isDestroyed()
    })
    
    if (webContents && !webContents.isDestroyed()) {
      const channel = getTerminalDataChannel(id)
      console.log(`[TerminalHandler] 📡 Sending data on channel ${channel}`)
      webContents.send(channel, data)
    } else {
      console.warn(`[TerminalHandler] ⚠️ Cannot forward data - no valid webContents for terminal ${id}`)
      // Clean up invalid WebContents reference
      if (webContents) {
        terminalWebContentsMap.delete(id)
      }
    }
  })

  // Forward exit events to renderer
  ptyService.on('exit', ({ id, exitCode }) => {
    const webContents = terminalWebContentsMap.get(id)
    
    console.log(`[TerminalHandler] 🚪 Forwarding exit from PTY ${id}:`, { exitCode })
    
    if (webContents && !webContents.isDestroyed()) {
      const channel = getTerminalExitChannel(id)
      console.log(`[TerminalHandler] 📡 Sending exit on channel ${channel}`)
      webContents.send(channel, exitCode)
    } else {
      console.warn(`[TerminalHandler] ⚠️ Cannot forward exit - no valid webContents for terminal ${id}`)
    }
    
    // Clean up WebContents mapping when terminal exits
    terminalWebContentsMap.delete(id)
  })
}


