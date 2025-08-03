import { StateCreator } from 'zustand'
import { Terminal, CreateTerminalOptions } from '@/types/terminal'
import { storeLogger } from '@/utils/logger'
import {
  getTerminalDataChannel,
  getTerminalExitChannel,
  getTerminalBufferReplayChannel
} from '../../electron/ipc-channels'
import { ProjectSlice } from './projectSlice'
import { UISlice } from './uiSlice'

// Terminal slice state
export interface TerminalSlice {
  // Terminal state
  terminals: Terminal[]
  activeTerminalId: string | null
  terminalInstances: Map<string, any>
  eventListeners: Map<string, Array<() => void>>

  // Core terminal lifecycle
  createTerminal: (options: CreateTerminalOptions) => Promise<string>
  removeTerminal: (id: string) => void
  setActiveTerminal: (id: string) => void
  setTerminalTitle: (id: string, title: string) => void

  // IPC communication
  writeToTerminal: (terminalId: string, data: string) => Promise<boolean>
  resizeTerminal: (terminalId: string, cols: number, rows: number) => Promise<boolean>

  // Instance management
  setTerminalInstance: (terminalId: string, instance: any) => void
  getTerminalInstance: (terminalId: string) => any | undefined
  removeTerminalInstance: (terminalId: string) => void

  // Event management
  subscribeToTerminalEvents: (terminalId: string) => void
  unsubscribeFromTerminalEvents: (terminalId: string) => void

  // Clean buffer management
  saveCleanBufferBeforeClose: (terminalId: string) => Promise<void>

  // Utility
  clearAll: () => void
  getTerminal: (id: string) => Terminal | undefined

  // Session persistence
  saveTerminalState: (projectId: string) => Promise<void>
  setWorkspaceState: (state: { terminals: any[]; activeTerminalId: string | null }) => void
}

export const createTerminalSlice: StateCreator<
  TerminalSlice & ProjectSlice & UISlice,
  [],
  [],
  TerminalSlice
> = (set, get) => ({
  // Initial state
  terminals: [],
  activeTerminalId: null,
  terminalInstances: new Map<string, any>(),
  eventListeners: new Map<string, Array<() => void>>(),

  // Core terminal lifecycle
  createTerminal: async (options) => {
    const { type, title, cwd, shell, makeActive = true } = options

    storeLogger.info('[AppStore] Starting terminal creation', {
      type,
      title,
      cwd,
      makeActive
    })

    try {
      // Create backend PTY process first - backend generates ID
      const result = await window.electronAPI.terminal.create(cwd, shell || '', cwd)

      storeLogger.debug('[AppStore] Backend response received', { success: result.success })

      if (!result.success) {
        storeLogger.error('[AppStore] Failed to create backend terminal', { error: result.error })
        throw new Error(`Failed to create backend terminal: ${result.error}`)
      }

      const backendTerminalId = result.data?.terminalId
      if (!backendTerminalId) {
        storeLogger.error('[AppStore] Backend terminal created but no session ID returned')
        throw new Error('Backend terminal created but no session ID returned')
      }

      storeLogger.debug('[AppStore] Backend terminal ID received', { backendTerminalId })

      // Use backend-generated ID as terminal ID
      const terminalId = backendTerminalId

      // Create terminal with backend-generated ID
      const newTerminal: Terminal = {
        id: terminalId,
        title: title || `${type === 'claude-code' ? 'Claude Code' : type === 'gemini' ? 'Gemini' : 'Terminal'}`,
        type,
        cwd,
        shell,
        isActive: false,
        createdAt: Date.now()
      }

      set((state) => ({
        terminals: [...state.terminals, newTerminal],
        activeTerminalId: makeActive ? terminalId : state.activeTerminalId
      }))

      // Switch to active terminal mode when terminal is created
      if (makeActive) {
        set({ terminalMode: 'active' })
      }

      // Automatically subscribe to events when terminal is created
      try {
        get().subscribeToTerminalEvents(terminalId)
        storeLogger.debug('[AppStore] Event subscription setup automatically', { terminalId })
      } catch (error) {
        storeLogger.error('[AppStore] Failed to setup event subscription', { terminalId, error })
      }

      storeLogger.info('[AppStore] Terminal created successfully', { terminalId })

      return terminalId
    } catch (error) {
      storeLogger.error('[AppStore] Error creating backend terminal', { error })
      throw error
    }
  },

  removeTerminal: (id) => {
    storeLogger.info('[AppStore] Removing terminal', { terminalId: id })

    // With unified ID system, terminalId === backendSessionId
    const backendSessionId = id

    // Extract and save clean buffer before closing
    get().saveCleanBufferBeforeClose(id).catch((error) => {
      storeLogger.error('[AppStore] Failed to save clean buffer before close', { terminalId: id, error })
    })

    // Unsubscribe from events first
    get().unsubscribeFromTerminalEvents(id)

    window.electronAPI.terminal.close(backendSessionId)
      .then((result) => {
        if (!result.success) {
          storeLogger.error('[AppStore] Failed to close backend terminal', { backendSessionId, error: result.error })
        } else {
          storeLogger.debug('[AppStore] Backend terminal closed successfully', { backendSessionId })
        }
      })
      .catch((error) => {
        storeLogger.error('[AppStore] Error killing backend terminal', { backendSessionId, error })
      })

    // Clean up XTerm instance
    const terminalInstance = get().terminalInstances.get(id)
    if (terminalInstance) {
      try {
        if (terminalInstance.disposables) {
          terminalInstance.disposables.forEach((disposable: any) => {
            try {
              disposable.dispose()
            } catch (error) {
              storeLogger.error('[AppStore] Error disposing terminal event listener', { terminalId: id, error })
            }
          })
        }

        if (terminalInstance.xterm) {
          terminalInstance.xterm.dispose()
        }
      } catch (error) {
        storeLogger.error('[AppStore] Error disposing XTerm instance', { terminalId: id, error })
      }
    }

    set((state) => {
      const terminals = state.terminals.filter(t => t.id !== id)
      let activeTerminalId = state.activeTerminalId
      let terminalMode = state.terminalMode

      const newInstancesMap = new Map(state.terminalInstances)
      newInstancesMap.delete(id)

      if (activeTerminalId === id) {
        activeTerminalId = terminals.length > 0 ? terminals[terminals.length - 1].id : null
      }

      // Switch to welcome mode if no terminals left
      if (terminals.length === 0) {
        terminalMode = 'welcome'
      }

      return {
        terminals,
        activeTerminalId,
        terminalInstances: newInstancesMap,
        terminalMode
      }
    })
  },

  setActiveTerminal: (id) => {
    const terminal = get().getTerminal(id)
    if (terminal) {
      set({ 
        activeTerminalId: id,
        terminalMode: 'active'
      })
    }
  },

  setTerminalTitle: (id, title) => {
    set((state) => ({
      terminals: state.terminals.map(t =>
        t.id === id ? { ...t, title } : t
      )
    }))
  },

  writeToTerminal: async (terminalId, data) => {
    const backendSessionId = terminalId

    storeLogger.verbose('[AppStore] Writing to terminal', {
      terminalId,
      dataLength: data.length
    })

    try {
      const result = await window.electronAPI.terminal.write(backendSessionId, data)
      storeLogger.verbose('[AppStore] Write result', { terminalId, success: result.success })

      if (result.success) {
        storeLogger.verbose('[AppStore] Successfully wrote to terminal', { terminalId })
        return true
      } else {
        storeLogger.error('[AppStore] Failed to write to terminal', { terminalId, error: result.error })
        return false
      }
    } catch (error) {
      storeLogger.error('[AppStore] Error writing to terminal', { terminalId, error })
      return false
    }
  },

  resizeTerminal: async (terminalId, cols, rows) => {
    const backendSessionId = terminalId

    storeLogger.verbose('[AppStore] Resizing terminal', {
      terminalId,
      cols,
      rows
    })

    try {
      const result = await window.electronAPI.terminal.resize(backendSessionId, cols, rows)
      storeLogger.verbose('[AppStore] Resize result', { terminalId, success: result.success })

      if (result.success) {
        storeLogger.verbose('[AppStore] Successfully resized terminal', { terminalId, cols, rows })
        return true
      } else {
        storeLogger.error('[AppStore] Failed to resize terminal', { terminalId, error: result.error })
        return false
      }
    } catch (error) {
      storeLogger.error('[AppStore] Error resizing terminal', { terminalId, error })
      return false
    }
  },

  setTerminalInstance: (id, instance) => {
    set((state) => ({
      terminalInstances: new Map(state.terminalInstances).set(id, instance)
    }))
  },

  getTerminalInstance: (id) => {
    return get().terminalInstances.get(id)
  },

  removeTerminalInstance: (id) => {
    const instance = get().terminalInstances.get(id)
    if (instance) {
      try {
        if (instance.disposables) {
          instance.disposables.forEach((disposable: { dispose: () => void }) => {
            try {
              disposable.dispose()
            } catch (error) {
              storeLogger.error('[AppStore] Error disposing terminal event listener in removeTerminalInstance', {
                terminalId: id,
                error
              })
            }
          })
        }

        if (instance.xterm) {
          instance.xterm.dispose()
        }
      } catch (error) {
        storeLogger.error('[AppStore] Error disposing XTerm instance in removeTerminalInstance', { terminalId: id, error })
      }
    }

    set((state) => {
      const newInstancesMap = new Map(state.terminalInstances)
      newInstancesMap.delete(id)
      return { terminalInstances: newInstancesMap }
    })
  },

  // Event management
  subscribeToTerminalEvents: (terminalId) => {
    storeLogger.debug('[AppStore] Subscribing to terminal events', { terminalId })

    // Clean up any existing listeners ATOMICALLY
    const existingListeners = get().eventListeners.get(terminalId)
    if (existingListeners) {
      storeLogger.debug(`[AppStore] Cleaning up ${existingListeners.length} existing listeners for ${terminalId}`)
      existingListeners.forEach(cleanup => {
        try {
          cleanup()
        } catch (error) {
          storeLogger.error(`[AppStore] Error cleaning up listener for ${terminalId}:`, { error })
        }
      })

      set((state) => {
        const newEventListeners = new Map(state.eventListeners)
        newEventListeners.delete(terminalId)
        return { eventListeners: newEventListeners }
      })
    }

    // Create event channels
    const dataChannel = getTerminalDataChannel(terminalId)
    const exitChannel = getTerminalExitChannel(terminalId)
    const bufferReplayChannel = getTerminalBufferReplayChannel(terminalId)

    storeLogger.verbose('[AppStore] Event channels configured', {
      terminalId,
      dataChannel,
      exitChannel,
      bufferReplayChannel
    })

    // Create event handlers with error handling
    const handleData = (_event: any, data: string) => {
      try {
        storeLogger.verbose('[AppStore] Received data for terminal', {
          terminalId,
          dataLength: data.length
        })

        const instance = get().getTerminalInstance(terminalId)
        if (instance?.xterm) {
          instance.xterm.write(data)
        } else {
          storeLogger.warn(`[AppStore] No XTerm instance found for ${terminalId}`)
        }
      } catch (error) {
        storeLogger.error('[AppStore] Error handling terminal data', { terminalId, error })
      }
    }

    const handleBufferReplay = (_event: any, data: string) => {
      try {
        storeLogger.info('[AppStore] Received buffer replay for terminal', {
          terminalId,
          dataLength: data.length
        })

        const instance = get().getTerminalInstance(terminalId)
        if (instance?.xterm) {
          // Write buffer replay data directly to XTerm (this is historical data)
          instance.xterm.write(data)
          storeLogger.debug('[AppStore] Buffer replay written to XTerm', { terminalId })
        } else {
          storeLogger.warn(`[AppStore] No XTerm instance found for buffer replay ${terminalId}`)
        }
      } catch (error) {
        storeLogger.error('[AppStore] Error handling buffer replay', { terminalId, error })
      }
    }

    const handleExit = (_event: any, exitCode: number) => {
      try {
        storeLogger.info('[AppStore] Terminal exited', { terminalId, exitCode })

        const instance = get().getTerminalInstance(terminalId)
        if (instance?.xterm) {
          instance.xterm.writeln(`\r\n\x1b[90mProcess exited with code ${exitCode}\x1b[0m`)
        }

        get().removeTerminal(terminalId)
      } catch (error) {
        storeLogger.error('[AppStore] Error handling terminal exit', { terminalId, error })
      }
    }

    // Set up event listeners
    if (!window.electronAPI?.on) {
      const error = new Error('electronAPI.on not available')
      storeLogger.error('[AppStore] electronAPI.on not available for terminal', { terminalId })
      throw error
    }

    try {
      storeLogger.debug('[AppStore] Adding event listeners for terminal', {
        terminalId,
        dataChannel,
        exitChannel,
        bufferReplayChannel
      })

      window.electronAPI.on(dataChannel, handleData)
      window.electronAPI.on(exitChannel, handleExit)
      window.electronAPI.on(bufferReplayChannel, handleBufferReplay)

      storeLogger.debug('[AppStore] Event listeners setup successfully', { terminalId })

      // Store cleanup functions ATOMICALLY
      const cleanupFunctions = [
        () => {
          storeLogger.debug(`[AppStore] Cleaning up IPC listeners for ${terminalId}`)
          if (window.electronAPI.removeListener) {
            window.electronAPI.removeListener(dataChannel, handleData)
            window.electronAPI.removeListener(exitChannel, handleExit)
            window.electronAPI.removeListener(bufferReplayChannel, handleBufferReplay)
          }
        }
      ]

      set((state) => ({
        eventListeners: new Map(state.eventListeners).set(terminalId, cleanupFunctions)
      }))
    } catch (error) {
      storeLogger.error('[AppStore] Failed to setup event listeners for terminal', { terminalId, error })
      throw error
    }
  },

  unsubscribeFromTerminalEvents: (terminalId) => {
    const cleanupFunctions = get().eventListeners.get(terminalId)
    if (cleanupFunctions) {
      cleanupFunctions.forEach(cleanup => {
        try {
          cleanup()
        } catch (error) {
          storeLogger.error('[AppStore] Error during event cleanup', { terminalId, error })
        }
      })

      set((state) => {
        const newEventListeners = new Map(state.eventListeners)
        newEventListeners.delete(terminalId)
        return { eventListeners: newEventListeners }
      })

      storeLogger.debug('[AppStore] Unsubscribed from terminal events', { terminalId })
    }
  },

  clearAll: () => {
    const { terminals, terminalInstances } = get()

    storeLogger.info('[AppStore] Clearing all terminals', { count: terminals.length })

    // Kill all backend terminals
    terminals.forEach(terminal => {
      const backendSessionId = terminal.id
      window.electronAPI.terminal.close(backendSessionId)
        .catch((error) => {
          storeLogger.error('[AppStore] Error killing terminal during clearAll', { terminalId: terminal.id, error })
        })
    })

    // Clean up all event listeners
    terminals.forEach(terminal => {
      get().unsubscribeFromTerminalEvents(terminal.id)
    })

    // Dispose all XTerm instances
    terminalInstances.forEach(instance => {
      if (instance?.xterm) {
        try {
          instance.xterm.dispose()
        } catch (error) {
          storeLogger.error('[AppStore] Error disposing XTerm instance during clearAll', { error })
        }
      }
    })

    set({
      terminals: [],
      activeTerminalId: null,
      terminalInstances: new Map(),
      eventListeners: new Map(),
      terminalMode: 'welcome'
    })
  },

  getTerminal: (id) => {
    return get().terminals.find(t => t.id === id)
  },

  // Clean buffer management
  saveCleanBufferBeforeClose: async (terminalId) => {
    storeLogger.info('[AppStore] Saving clean buffer before close', { terminalId })

    try {
      const instance = get().getTerminalInstance(terminalId)
      if (!instance?.xterm) {
        storeLogger.warn('[AppStore] No XTerm instance found for clean buffer extraction', { terminalId })
        return
      }

      const xterm = instance.xterm
      const buffer = xterm.buffer.active
      const cleanLines: string[] = []

      // Extract clean text from XTerm buffer
      for (let i = 0; i < buffer.length; i++) {
        try {
          const line = buffer.getLine(i)
          if (line) {
            // Use translateToString(true) to get clean text without ANSI codes
            const lineText = line.translateToString(true)
            if (lineText.trim().length > 0 || cleanLines.length > 0) {
              // Include non-empty lines or empty lines that are between content
              cleanLines.push(lineText)
            }
          }
        } catch (error) {
          storeLogger.error('[AppStore] Error extracting line from XTerm buffer', { terminalId, lineIndex: i, error })
        }
      }

      // Remove trailing empty lines
      while (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].trim() === '') {
        cleanLines.pop()
      }

      if (cleanLines.length > 0) {
        storeLogger.info('[AppStore] Extracted clean buffer', { terminalId, lineCount: cleanLines.length })

        // Send clean buffer to backend
        if (window.electronAPI?.terminal?.updateCleanBuffer) {
          await window.electronAPI.terminal.updateCleanBuffer(terminalId, cleanLines)
          storeLogger.info('[AppStore] ✅ Clean buffer saved to backend', { terminalId })
        } else {
          storeLogger.warn('[AppStore] updateCleanBuffer API not available', { terminalId })
        }
      } else {
        storeLogger.info('[AppStore] No clean buffer content to save', { terminalId })
      }
    } catch (error) {
      storeLogger.error('[AppStore] Failed to save clean buffer', { terminalId, error })
      throw error
    }
  },

  // Session persistence
  saveTerminalState: async (projectId) => {
    if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
      storeLogger.error('[AppStore] Cannot save terminal state: invalid project ID', { projectId })
      return
    }

    try {
      const state = get()
      storeLogger.info('[AppStore] 💾 Saving terminal state via backend service', { 
        projectId, 
        terminalCount: state.terminals.length 
      })

      // Note: Backend TerminalManagementService automatically handles all terminal state extraction
      // No need to manually construct WorkspaceState object - backend does this internally
      const result = await window.electronAPI.workspace.save(projectId)

      if (result.success) {
        storeLogger.info('[AppStore] ✅ Terminal state saved successfully', { projectId })
      } else {
        storeLogger.error('[AppStore] Failed to save terminal state via backend', { projectId, error: result.error })
        throw new Error(result.error || 'Unknown error saving workspace state')
      }
    } catch (error) {
      storeLogger.error('[AppStore] Failed to save terminal state', { projectId, error })
      throw error
    }
  },

  // Passive state setting - receives complete workspace state from backend
  // Terminal restoration is handled by the project switching flow (setProject -> project:switch)
  setWorkspaceState: (workspaceData) => {
    const { terminals: serializedTerminals, activeTerminalId } = workspaceData
    
    storeLogger.info('[AppStore] Setting workspace state from backend', { 
      terminalCount: serializedTerminals.length,
      activeTerminalId 
    })

    // Convert serialized terminals to frontend Terminal objects
    const terminals: Terminal[] = serializedTerminals.map(serialized => ({
      id: serialized.id,
      title: serialized.title || 'Terminal',
      type: 'terminal',
      cwd: serialized.cwd,
      shell: serialized.shell,
      isActive: false,
      createdAt: serialized.createdAt || Date.now()
    }))

    // Note: Event subscriptions will be handled by individual Terminal components
    // This prevents double subscription and ensures proper cleanup
    storeLogger.debug('[AppStore] Terminal event subscriptions will be handled by Terminal components', { 
      terminalCount: terminals.length 
    })

    // Smart activeTerminalId setting - ensure we always have an active terminal if any exist
    const finalActiveTerminalId = activeTerminalId || (terminals.length > 0 ? terminals[0].id : null)
    
    if (finalActiveTerminalId !== activeTerminalId) {
      storeLogger.info('[AppStore] Auto-selecting first terminal as active', { 
        originalActiveId: activeTerminalId,
        newActiveId: finalActiveTerminalId,
        terminalCount: terminals.length
      })
    }

    // Apply the complete state atomically
    set({
      terminals,
      activeTerminalId: finalActiveTerminalId,
      terminalMode: terminals.length > 0 ? 'active' : 'welcome'
    })

    storeLogger.info('[AppStore] ✅ Workspace state applied successfully', { 
      terminalCount: terminals.length,
      activeTerminalId 
    })
  }
})