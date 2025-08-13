/**
 * Terminal IPC Handlers - Clean Architecture Implementation
 * 
 * This file implements the SOTA architecture from terminal_persistence_refactor_plan_v2.md
 * All complex logic has been moved to TerminalManagementService - these handlers are just IPC bridges
 */

import { IpcMainInvokeEvent } from 'electron'
import type { TerminalManagementService } from '../services/terminal-management-service'
import { 
  getTerminalDataChannel,
  getTerminalExitChannel
} from '../ipc-event-channels'

// Service dependencies - injected during setup
let terminalManagementService: TerminalManagementService;

/**
 * Create a new terminal session
 */
export async function createTerminal(event: IpcMainInvokeEvent, workingDirectory: string, shell?: string, projectPath?: string): Promise<{ terminalId: string }> {
  // Generate unique ID on the backend - following common pattern  
  const id = `terminal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  
  console.log(`[TerminalHandler] 🚀 Creating terminal ${id}:`, {
    workingDirectory,
    shell,
    projectPath
  })
  
  // Register WebContents with terminal management service
  terminalManagementService.registerWebContents(id, event.sender)
  
  terminalManagementService.create(id, shell || '', workingDirectory, 80, 30)
  
  console.log(`[TerminalHandler] ✅ Terminal ${id} created successfully`)
  return { terminalId: id }
}

/**
 * Write data to a terminal session
 */
export async function writeToTerminal(_event: IpcMainInvokeEvent, terminalId: string, data: string): Promise<void> {
  const success = terminalManagementService.write(terminalId, data)
  
  if (!success) {
    console.error(`[TerminalHandler] ❌ Terminal ${terminalId} not found for write operation`)
    throw new Error(`Terminal ${terminalId} not found`)
  }

}

/**
 * Resize a terminal session
 */
export async function resizeTerminal(_event: IpcMainInvokeEvent, terminalId: string, cols: number, rows: number): Promise<void> {
  console.log(`[TerminalHandler] 📏 Resizing terminal ${terminalId}:`, {
    cols,
    rows
  })
  
  const success = terminalManagementService.resize(terminalId, cols, rows)
  
  if (!success) {
    console.error(`[TerminalHandler] ❌ Terminal ${terminalId} not found for resize operation`)
    throw new Error(`Terminal ${terminalId} not found`)
  }
  
  console.log(`[TerminalHandler] ✅ Successfully resized terminal ${terminalId} to ${cols}x${rows}`)
}

/**
 * Close a terminal session
 */
export async function closeTerminal(_event: IpcMainInvokeEvent, terminalId: string): Promise<void> {
  const success = terminalManagementService.kill(terminalId)
  
  if (!success) {
    throw new Error(`Terminal ${terminalId} not found`)
  }
}


/**
 * Register WebContents for a terminal (used during restoration)
 */
export async function registerWebContents(event: IpcMainInvokeEvent, terminalId: string): Promise<void> {
  // Register WebContents with terminal management service
  terminalManagementService.registerWebContents(terminalId, event.sender)
  console.log(`[TerminalHandler] 🔗 Registering WebContents for terminal ${terminalId}`)
}

/**
 * Initialize terminal handlers with service dependencies
 */
export function initializeTerminalHandlers(service: TerminalManagementService): void {
  // Inject service dependencies
  terminalManagementService = service;
  
  // Set up TerminalManagementService event forwarding
  setupTerminalServiceEvents()
}

/**
 * Setup TerminalManagementService event forwarding to renderer
 */
function setupTerminalServiceEvents() {
  // Forward data events to renderer
  terminalManagementService.on('data', ({ id, data }) => {
    const webContents = terminalManagementService.getWebContents(id)

    if (webContents && !webContents.isDestroyed()) {
      const channel = getTerminalDataChannel(id)
      // console.log(`[TerminalHandler] 📡 Sending data on channel ${channel}`)
      webContents.send(channel, data)
    } else {
      console.warn(`[TerminalHandler] ⚠️ Cannot forward data - no valid webContents for terminal ${id}`)
      // Clean up invalid WebContents reference
      if (webContents) {
        terminalManagementService.unregisterWebContents(id)
      }
    }
  })


  // Forward exit events to renderer
  terminalManagementService.on('exit', ({ id, exitCode }) => {
    const webContents = terminalManagementService.getWebContents(id)
    
    console.log(`[TerminalHandler] 🚪 Forwarding exit from PTY ${id}:`, { exitCode })
    
    if (webContents && !webContents.isDestroyed()) {
      const channel = getTerminalExitChannel(id)
      console.log(`[TerminalHandler] 📡 Sending exit on channel ${channel}`)
      webContents.send(channel, exitCode)
    } else {
      console.warn(`[TerminalHandler] ⚠️ Cannot forward exit - no valid webContents for terminal ${id}`)
    }
    
    // WebContents cleanup is now handled automatically by TerminalManagementService.kill()
  })
}


