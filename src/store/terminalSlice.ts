import { StateCreator } from 'zustand'
import { Terminal, CreateTerminalOptions } from '@/types/terminal'
import { storeLogger } from '@/utils/logger'
import {
  getTerminalDataChannel,
  getTerminalExitChannel
} from '../../electron/ipc-channels'
import {
  WorkspaceState,
  terminalToPersistedTerminal,
  persistedTerminalToTerminal,
  WorkspaceStateValidator
} from '@/types/workspace'
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

  // Utility
  clearAll: () => void
  getTerminal: (id: string) => Terminal | undefined

  // Session persistence
  saveTerminalState: (projectPath: string) => Promise<void>
  loadTerminalState: (projectPath: string) => Promise<void>
  restoreTerminalSessions: () => Promise<void>
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

    storeLogger.verbose('[AppStore] Event channels configured', {
      terminalId,
      dataChannel,
      exitChannel
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
        exitChannel
      })

      window.electronAPI.on(dataChannel, handleData)
      window.electronAPI.on(exitChannel, handleExit)

      storeLogger.debug('[AppStore] Event listeners setup successfully', { terminalId })

      // Store cleanup functions ATOMICALLY
      const cleanupFunctions = [
        () => {
          storeLogger.debug(`[AppStore] Cleaning up IPC listeners for ${terminalId}`)
          if (window.electronAPI.removeListener) {
            window.electronAPI.removeListener(dataChannel, handleData)
            window.electronAPI.removeListener(exitChannel, handleExit)
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

  // Session persistence
  saveTerminalState: async (projectPath) => {
    if (!projectPath || typeof projectPath !== 'string' || projectPath.trim() === '') {
      storeLogger.error('[AppStore] Cannot save terminal state: invalid project path', { projectPath })
      return
    }

    try {
      const state = get()
      storeLogger.info('[AppStore] 💾 Saving terminal state via backend service', { 
        projectPath, 
        terminalCount: state.terminals.length 
      })

      const workspaceState: WorkspaceState = {
        terminals: state.terminals.map(terminal => terminalToPersistedTerminal(terminal)),
        activeTerminalId: state.activeTerminalId,
        lastSaved: Date.now(),
        version: '1.0.0'
      }

      if (!WorkspaceStateValidator.isValidWorkspaceState(workspaceState)) {
        storeLogger.error('[AppStore] Invalid workspace state structure, cannot save', { projectPath })
        return
      }

      const result = await window.electronAPI.workspaceState.save(projectPath, workspaceState)

      if (result.success) {
        storeLogger.info('[AppStore] ✅ Terminal state saved successfully', { projectPath })
      } else {
        storeLogger.error('[AppStore] Failed to save terminal state via backend', { projectPath, error: result.error })
        throw new Error(result.error || 'Unknown error saving workspace state')
      }
    } catch (error) {
      storeLogger.error('[AppStore] Failed to save terminal state', { projectPath, error })
      throw error
    }
  },

  loadTerminalState: async (projectPath) => {
    if (!projectPath || typeof projectPath !== 'string' || projectPath.trim() === '') {
      storeLogger.error('[AppStore] Cannot load terminal state: invalid project path', { projectPath })
      return
    }

    try {
      storeLogger.info('[AppStore] 📥 Loading terminal state via backend service', { projectPath })

      const result = await window.electronAPI.workspaceState.load(projectPath)

      if (!result.success) {
        storeLogger.debug('[AppStore] No terminal state found to load', { projectPath })
        return
      }

      const workspaceState = result.data

      if (!workspaceState) {
        storeLogger.debug('[AppStore] 🔍 No terminal state found to load', { projectPath })
        return
      }

      if (!WorkspaceStateValidator.isValidWorkspaceState(workspaceState)) {
        storeLogger.error('[AppStore] Invalid workspace state structure loaded from backend', { projectPath })
        return
      }

      const terminals = workspaceState.terminals.map(persistedTerminal =>
        persistedTerminalToTerminal(persistedTerminal)
      )

      set((state) => ({
        ...state,
        terminals: terminals.map(terminal => ({
          ...terminal,
          isActive: false
        })),
        activeTerminalId: workspaceState.activeTerminalId
      }))

      storeLogger.info('[AppStore] ✅ Terminal state loaded successfully', {
        projectPath,
        terminalCount: terminals.length,
        activeTerminalId: workspaceState.activeTerminalId
      })
    } catch (error) {
      storeLogger.debug('[AppStore] 🔍 No terminal state found to load', {
        projectPath,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  },

  restoreTerminalSessions: async () => {
    try {
      const state = get()
      storeLogger.info('[AppStore] Restoring terminal sessions', { count: state.terminals.length })

      const terminalsToRestore = [...state.terminals]

      set({
        terminals: [],
        activeTerminalId: null
      })

      for (const terminal of terminalsToRestore) {
        try {
          const result = await Promise.race([
            window.electronAPI.terminal.create(terminal.cwd, terminal.shell || '', terminal.cwd),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('PTY creation timeout')), 5000)
            )
          ])

          if (result.success && result.data?.terminalId) {
            const backendTerminalId = result.data.terminalId

            const restoredTerminal: Terminal = {
              id: backendTerminalId,
              title: terminal.title,
              type: terminal.type,
              cwd: terminal.cwd,
              shell: terminal.shell,
              isActive: false,
              createdAt: terminal.createdAt
            }

            set((state) => ({
              terminals: [...state.terminals, restoredTerminal],
              activeTerminalId: state.activeTerminalId || backendTerminalId
            }))

            try {
              get().subscribeToTerminalEvents(backendTerminalId)
              storeLogger.debug('[AppStore] Event subscription setup automatically during restore', { terminalId: backendTerminalId })
            } catch (error) {
              storeLogger.error('[AppStore] Failed to setup event subscription during restore', {
                terminalId: backendTerminalId,
                error
              })
            }

            storeLogger.info('[AppStore] Terminal restored with backend terminal', { terminalId: backendTerminalId })
          } else {
            storeLogger.error('[AppStore] Failed to restore terminal', { originalId: terminal.id, error: result.error })
          }
        } catch (error) {
          storeLogger.error('[AppStore] Error restoring terminal', { originalId: terminal.id, error })
        }
      }

      // Switch to active mode if we have terminals
      if (get().terminals.length > 0) {
        set({ terminalMode: 'active' })
      }

      storeLogger.info('[AppStore] Terminal restoration complete')
    } catch (error) {
      storeLogger.error('[AppStore] Failed to restore terminal sessions', { error })
    }
  }
})