/**
 * Terminal IPC Handlers - Clean Architecture Implementation
 * 
 * This file implements the SOTA architecture from terminal_persistence_refactor_plan_v2.md
 * All complex logic has been moved to TerminalManagementService - these handlers are just IPC bridges
 */

import { WebContents, IpcMainInvokeEvent } from 'electron'
import type { TerminalManagementService } from '../services/terminal-management-service'
import type { HandlerServices } from './index.js'
import { 
  getTerminalDataChannel,
  getTerminalExitChannel,
  getTerminalBufferReplayChannel
} from '../ipc-channels'

// Service dependencies - injected during setup
let terminalManagementService: TerminalManagementService;

// Map to store WebContents for each terminal
const terminalWebContentsMap = new Map<string, WebContents>()

// Track terminals that are currently replaying buffers to avoid data mixing
const replayingTerminals = new Set<string>()

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
  
  // Store WebContents for this terminal
  terminalWebContentsMap.set(id, event.sender)
  
  terminalManagementService.create(id, shell || '', workingDirectory, 80, 30)
  
  console.log(`[TerminalHandler] ✅ Terminal ${id} created successfully`)
  return { terminalId: id }
}

/**
 * Write data to a terminal session
 */
export async function writeToTerminal(_event: IpcMainInvokeEvent, terminalId: string, data: string): Promise<void> {
  console.log(`[TerminalHandler] 📝 Writing to terminal ${terminalId}:`, {
    dataLength: data.length,
    dataPreview: data.slice(0, 50)
  })
  
  const success = terminalManagementService.write(terminalId, data)
  
  if (!success) {
    console.error(`[TerminalHandler] ❌ Terminal ${terminalId} not found for write operation`)
    throw new Error(`Terminal ${terminalId} not found`)
  }
  
  console.log(`[TerminalHandler] ✅ Successfully wrote to terminal ${terminalId}`)
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
  
  // Clean up WebContents mapping
  terminalWebContentsMap.delete(terminalId)
  
  if (!success) {
    throw new Error(`Terminal ${terminalId} not found`)
  }
}

/**
 * Handle CWD changes from OSC sequences
 */
export async function handleCwdChanged(_event: IpcMainInvokeEvent, terminalId: string, newCwd: string): Promise<void> {
  console.log(`[TerminalHandler] 📍 CWD changed for terminal ${terminalId}:`, { newCwd })
  
  const terminal = terminalManagementService.getTerminal(terminalId)
  if (!terminal) {
    console.warn(`[TerminalHandler] ⚠️ Terminal ${terminalId} not found for CWD update`)
    return
  }
  
  // Update the terminal's current CWD
  terminal.updateCurrentCwd(newCwd)
  
  console.log(`[TerminalHandler] ✅ Successfully updated CWD for terminal ${terminalId}`)
}

/**
 * Update terminal buffer with clean text from frontend XTerm
 */
export async function updateCleanBuffer(_event: IpcMainInvokeEvent, terminalId: string, cleanLines: string[]): Promise<void> {
  console.log(`[TerminalHandler] 🧽 Updating clean buffer for terminal ${terminalId}:`, { lineCount: cleanLines.length })
  
  const terminal = terminalManagementService.getTerminal(terminalId)
  if (!terminal) {
    console.warn(`[TerminalHandler] ⚠️ Terminal ${terminalId} not found for buffer update`)
    return
  }
  
  try {
    // Update the terminal's buffer with clean text
    terminal.updateCleanBuffer(cleanLines)
    console.log(`[TerminalHandler] ✅ Successfully updated clean buffer for terminal ${terminalId}`)
  } catch (error) {
    console.error(`[TerminalHandler] ❌ Failed to update clean buffer for terminal ${terminalId}:`, error)
    throw error
  }
}

/**
 * Register WebContents for a terminal (used during restoration)
 */
export async function registerWebContents(event: IpcMainInvokeEvent, terminalId: string): Promise<void> {
  console.log(`[TerminalHandler] 🔗 Registering WebContents for terminal ${terminalId}`)
  
  // Store WebContents for this terminal
  terminalWebContentsMap.set(terminalId, event.sender)
  
  // Check if this terminal has buffer contents to replay (for restoration)
  const terminal = terminalManagementService.getTerminal(terminalId)
  if (terminal) {
    const buffer = terminal.getBuffer()
    if (buffer && buffer.length > 0) {
      console.log(`[TerminalHandler] 🎬 Triggering buffer replay for terminal ${terminalId} (${buffer.length} lines)`)
      
      // Mark terminal as replaying to prevent data mixing
      replayingTerminals.add(terminalId)
      
      // Trigger buffer replay now that WebContents is ready
      setTimeout(() => {
        try {
          terminal.replayBuffer()
          console.log(`[TerminalHandler] ✅ Buffer replay completed for terminal ${terminalId}`)
          
          // Mark replay as complete
          setTimeout(() => {
            replayingTerminals.delete(terminalId)
            console.log(`[TerminalHandler] 🎯 Buffer replay state cleared for terminal ${terminalId}`)
          }, 500) // Wait a bit more to ensure replay data is processed
        } catch (error) {
          console.error(`[TerminalHandler] ❌ Failed to replay buffer for terminal ${terminalId}:`, error)
          replayingTerminals.delete(terminalId) // Clean up on error
        }
      }, 100) // Small delay to ensure WebContents is fully ready
    } else {
      console.log(`[TerminalHandler] 📭 No buffer to replay for terminal ${terminalId}`)
    }
  }
  
  console.log(`[TerminalHandler] ✅ WebContents registered for terminal ${terminalId}`)
}

/**
 * Get terminal information
 */
export async function getTerminalInfo(_event: IpcMainInvokeEvent, terminalId: string): Promise<{ isActive: boolean; workingDirectory: string; shell: string }> {
  const terminal = terminalManagementService.getTerminal(terminalId)
  if (!terminal) {
    throw new Error(`Terminal ${terminalId} not found`)
  }
  
  return {
    isActive: true, // Simplified - assume active if exists
    workingDirectory: terminal.getCurrentCwd() || '/tmp',
    shell: 'bash' // Simplified default
  }
}

/**
 * List all terminal IDs
 */
export async function listTerminals(_event: IpcMainInvokeEvent): Promise<string[]> {
  // Simplified implementation - return empty array for now
  return []
}

/**
 * Pause a terminal session
 */
export async function pauseTerminal(_event: IpcMainInvokeEvent, terminalId: string): Promise<void> {
  // Simplified implementation - no-op for now
  console.log(`[TerminalHandler] Pause requested for terminal ${terminalId}`)
}

/**
 * Resume a terminal session
 */
export async function resumeTerminal(_event: IpcMainInvokeEvent, terminalId: string): Promise<void> {
  // Simplified implementation - no-op for now
  console.log(`[TerminalHandler] Resume requested for terminal ${terminalId}`)
}

/**
 * Get terminal state
 */
export async function getTerminalState(_event: IpcMainInvokeEvent, terminalId: string): Promise<any> {
  const terminal = terminalManagementService.getTerminal(terminalId)
  if (!terminal) {
    throw new Error(`Terminal ${terminalId} not found`)
  }
  
  return {
    id: terminalId,
    isActive: true,
    workingDirectory: terminal.getCurrentCwd() || '/tmp',
    shell: 'bash',
    buffer: terminal.getBuffer() || []
  }
}

/**
 * Initialize terminal handlers with service dependencies
 */
export function initializeTerminalHandlers(services: HandlerServices): void {
  // Inject service dependencies
  terminalManagementService = services.terminalManagementService;
  
  // Set up TerminalManagementService event forwarding
  setupTerminalServiceEvents()
  
  console.log('✅ Terminal handlers initialized with services')
}

/**
 * Register WebContents for a terminal (used during restoration)
 */
export function registerTerminalWebContents(terminalId: string, webContents: WebContents): void {
  console.log(`[TerminalHandler] 🔗 Registering WebContents for restored terminal ${terminalId}`)
  
  // Store WebContents for this terminal
  terminalWebContentsMap.set(terminalId, webContents)
  
  console.log(`[TerminalHandler] ✅ WebContents registered for terminal ${terminalId}`)
}

/**
 * Setup TerminalManagementService event forwarding to renderer
 */
function setupTerminalServiceEvents() {
  // Forward data events to renderer (only if not currently replaying buffer)
  terminalManagementService.on('data', ({ id, data }) => {
    const webContents = terminalWebContentsMap.get(id)
    
    // Skip forwarding live data if terminal is currently replaying buffer
    if (replayingTerminals.has(id)) {
      console.log(`[TerminalHandler] 🚫 Skipping live data forward during buffer replay for terminal ${id}`)
      return
    }
    
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

  // Forward buffer replay events to renderer (separate from live data)
  terminalManagementService.on('buffer-replay', ({ id, data }) => {
    const webContents = terminalWebContentsMap.get(id)
    
    console.log(`[TerminalHandler] 🎬 Forwarding buffer replay for terminal ${id}:`, {
      dataLength: data.length,
      hasWebContents: !!webContents,
      isDestroyed: webContents?.isDestroyed()
    })
    
    if (webContents && !webContents.isDestroyed()) {
      const channel = getTerminalBufferReplayChannel(id)
      console.log(`[TerminalHandler] 📡 Sending buffer replay on channel ${channel}`)
      webContents.send(channel, data)
    } else {
      console.warn(`[TerminalHandler] ⚠️ Cannot forward buffer replay - no valid webContents for terminal ${id}`)
      // Clean up invalid WebContents reference
      if (webContents) {
        terminalWebContentsMap.delete(id)
      }
    }
  })

  // Forward exit events to renderer
  terminalManagementService.on('exit', ({ id, exitCode }) => {
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


