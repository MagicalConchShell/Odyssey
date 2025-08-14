/**
 * Terminal Handlers
 */
import { IpcMainInvokeEvent } from 'electron'
import type { TerminalManagementService } from '../services/terminal-management-service'
import { 
  getTerminalDataChannel,
  getTerminalExitChannel
} from '../ipc-event-channels'
import { dbManager } from '../services/database-service.js'

// Service dependencies - injected during setup
let terminalManagementService: TerminalManagementService;

/**
 * Create a new terminal session
 */
export async function createTerminal(event: IpcMainInvokeEvent, workingDirectory: string, shell?: string, projectPath?: string): Promise<{ terminalId: string }> {
  // Generate unique ID on the backend - following common pattern  
  const id = `terminal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  
  console.log(`[TerminalHandler] Creating terminal ${id}:`, {
    workingDirectory,
    shell,
    projectPath
  })

  // Load user-configured environment variables from database
  let customEnv: Record<string, string> = {}
  try {
    customEnv = dbManager.getEnvironmentVariables()
    console.log(`[TerminalHandler] 📦 Loaded ${Object.keys(customEnv).length} environment variables for terminal ${id}`)
  } catch (error) {
    console.warn(`[TerminalHandler] ⚠️ Failed to load environment variables for terminal ${id}:`, error)
  }
  
  // Register WebContents with terminal management service
  terminalManagementService.registerWebContents(id, event.sender)
  
  terminalManagementService.create(id, shell || '', workingDirectory, 80, 30, customEnv)
  
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
  const success = terminalManagementService.resize(terminalId, cols, rows)
  if (!success) {
    console.error(`[TerminalHandler] ❌ Terminal ${terminalId} not found for resize operation`)
    throw new Error(`Terminal ${terminalId} not found`)
  }
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
  terminalManagementService.registerWebContents(terminalId, event.sender)
}

/**
 * Initialize terminal handlers with service dependencies
 */
export function initializeTerminalHandlers(service: TerminalManagementService): void {
  terminalManagementService = service;
  setupTerminalServiceEvents()
}

/**
 * Setup TerminalManagementService event forwarding to renderer
 */
function setupTerminalServiceEvents() {
  terminalManagementService.on('data', ({ id, data }) => {
    const webContents = terminalManagementService.getWebContents(id)

    if (webContents && !webContents.isDestroyed()) {
      const channel = getTerminalDataChannel(id)
      webContents.send(channel, data)
    } else {
      console.warn(`[TerminalHandler] Cannot forward data - no valid webContents for terminal ${id}`)
      if (webContents) {
        terminalManagementService.unregisterWebContents(id)
      }
    }
  })


  // Forward exit events to renderer
  terminalManagementService.on('exit', ({ id, exitCode }) => {
    const webContents = terminalManagementService.getWebContents(id)
    if (webContents && !webContents.isDestroyed()) {
      const channel = getTerminalExitChannel(id)
      webContents.send(channel, exitCode)
    } else {
      console.warn(`[TerminalHandler] Cannot forward exit - no valid webContents for terminal ${id}`)
    }
  })
}


