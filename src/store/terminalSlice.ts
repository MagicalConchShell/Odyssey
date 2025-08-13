import { StateCreator } from 'zustand'
import { Terminal, CreateTerminalOptions } from '@/types/terminal'
import { storeLogger } from '@/utils/logger'
import {
  getTerminalDataChannel,
  getTerminalExitChannel
} from '../../electron/ipc-event-channels'
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
  
  // Serialization methods for workspace saving
  terminalSerializeMethods: Map<string, () => string>
  setTerminalSerializeMethod: (terminalId: string, method: () => string) => void
  getTerminalSerializeMethod: (terminalId: string) => (() => string) | undefined

  // Event management
  subscribeToTerminalEvents: (terminalId: string) => void
  unsubscribeFromTerminalEvents: (terminalId: string) => void


  // Utility
  clearAll: () => void
  getTerminal: (id: string) => Terminal | undefined
  

  // Session persistence
  saveTerminalState: (projectId: string) => Promise<void>
  setWorkspaceState: (state: { terminals: any[]; activeTerminalId: string | null; terminalStates?: Record<string, string> }) => void
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
  terminalSerializeMethods: new Map<string, () => string>(),

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
      const newSerializeMethodsMap = new Map(state.terminalSerializeMethods)
      newInstancesMap.delete(id)
      newSerializeMethodsMap.delete(id)
      return { 
        terminalInstances: newInstancesMap,
        terminalSerializeMethods: newSerializeMethodsMap
      }
    })
  },

  // Serialization methods management
  setTerminalSerializeMethod: (terminalId, method) => {
    set((state) => ({
      terminalSerializeMethods: new Map(state.terminalSerializeMethods).set(terminalId, method)
    }))
  },

  getTerminalSerializeMethod: (terminalId) => {
    return get().terminalSerializeMethods.get(terminalId)
  },

  // Event management
  subscribeToTerminalEvents: (terminalId) => {
    storeLogger.debug('[AppStore] 🎧 Starting terminal event subscription', { 
      terminalId
    })

    // Force cleanup of any existing listeners for this terminal
    // This prevents duplicate handleData instances
    const existingListeners = get().eventListeners.get(terminalId)
    const dataChannel = getTerminalDataChannel(terminalId)
    const exitChannel = getTerminalExitChannel(terminalId)
    
    // Remove all existing listeners from channels
    if (window.electronAPI?.removeAllListeners) {
      try {
        window.electronAPI.removeAllListeners(dataChannel)
        window.electronAPI.removeAllListeners(exitChannel)
      } catch (error) {
        storeLogger.warn(`[AppStore] removeAllListeners failed for ${terminalId}:`, error)
      }
    }
    
    // Clean up stored listeners
    if (existingListeners) {
      existingListeners.forEach(cleanup => {
        try {
          cleanup()
        } catch (error) {
          storeLogger.error(`[AppStore] Error cleaning up stored listener for ${terminalId}:`, error)
        }
      })
    }

    // Remove from state
    set((state) => {
      const newEventListeners = new Map(state.eventListeners)
      newEventListeners.delete(terminalId)
      return { eventListeners: newEventListeners }
    })

    // Channels already defined above for cleanup

    storeLogger.verbose('[AppStore] Event channels configured', {
      terminalId,
      dataChannel,
      exitChannel
    })

    // Create event handlers
    const handleData = (_event: any, data: string) => {
      try {
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
      storeLogger.debug('[AppStore] 📡 Adding event listeners for terminal', {
        terminalId,
        dataChannel,
        exitChannel
      })

      // Register event listeners
      window.electronAPI.on(dataChannel, handleData)
      window.electronAPI.on(exitChannel, handleExit)

      storeLogger.info('[AppStore] ✅ Event listeners registered successfully', { 
        terminalId, 
        dataChannel,
        exitChannel 
      })

      // Store cleanup functions
      const cleanupFunctions = [
        () => {
          storeLogger.debug(`[AppStore] 🧹 Removing IPC listeners for ${terminalId}`)
          
          if (window.electronAPI.removeListener) {
            window.electronAPI.removeListener(dataChannel, handleData)
            window.electronAPI.removeListener(exitChannel, handleExit)
          } else {
            storeLogger.warn(`[AppStore] ⚠️ removeListener API not available for ${terminalId}`)
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
      terminalSerializeMethods: new Map(),
      terminalMode: 'welcome'
    })
  },

  getTerminal: (id) => {
    return get().terminals.find(t => t.id === id)
  },



  // Session persistence
  saveTerminalState: async (projectId) => {
    if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
      storeLogger.error('[AppStore] Cannot save terminal state: invalid project ID', { projectId })
      return
    }

    try {
      const state = get()
      storeLogger.info('[AppStore] 💾 Saving terminal state with serialization', { 
        projectId, 
        terminalCount: state.terminals.length 
      })

      // Collect terminal serialization states
      storeLogger.debug('[AppStore] 🔍 Terminal serialization debug info', {
        totalTerminals: state.terminals.length,
        terminalIds: state.terminals.map(t => t.id),
        registeredMethods: Array.from(state.terminalSerializeMethods.keys()),
        methodsCount: state.terminalSerializeMethods.size
      })

      const terminalStates: Record<string, string> = {}
      for (const terminal of state.terminals) {
        const serializeMethod = state.terminalSerializeMethods.get(terminal.id)
        storeLogger.debug('[AppStore] 🔍 Checking terminal for serialization', {
          terminalId: terminal.id,
          hasSerializeMethod: !!serializeMethod
        })
        
        if (serializeMethod) {
          try {
            const serializedState = serializeMethod()
            storeLogger.debug('[AppStore] 📊 Serialization attempt result', {
              terminalId: terminal.id,
              serializedLength: serializedState ? serializedState.length : 0,
              hasData: !!serializedState
            })
            
            if (serializedState) {
              terminalStates[terminal.id] = serializedState
              storeLogger.debug('[AppStore] ✅ Collected serialized state', { 
                terminalId: terminal.id,
                stateLength: serializedState.length
              })
            } else {
              storeLogger.warn('[AppStore] ⚠️ Serialization returned empty data', { terminalId: terminal.id })
            }
          } catch (error) {
            storeLogger.error('[AppStore] ❌ Failed to serialize terminal', { 
              terminalId: terminal.id, 
              error 
            })
          }
        } else {
          storeLogger.warn('[AppStore] ⚠️ No serialize method found for terminal', { terminalId: terminal.id })
        }
      }

      storeLogger.info('[AppStore] Sending terminal states to backend', { 
        terminalStateCount: Object.keys(terminalStates).length 
      })

      // Send terminalStates directly to backend
      const result = await window.electronAPI.workspace.save(projectId, terminalStates)

      if (result.success) {
        storeLogger.info('[AppStore] ✅ Terminal state saved successfully with serialization', { projectId })
      } else {
        storeLogger.error('[AppStore] Failed to save terminal state with serialization', { projectId, error: result.error })
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
    const { terminals: serializedTerminals, activeTerminalId, terminalStates } = workspaceData
    
    storeLogger.info('[AppStore] Setting workspace state from backend', { 
      terminalCount: serializedTerminals ? serializedTerminals.length : 0,
      activeTerminalId,
      hasTerminalStates: !!terminalStates,
      terminalStatesCount: terminalStates ? Object.keys(terminalStates).length : 0
    })

    // FORCE cleanup all existing terminal state and listeners
    // This is critical to prevent multiple handleData instances
    const currentState = get()
    
    
    storeLogger.debug('[AppStore] Cleaning up existing frontend terminal state', {
      existingTerminals: currentState.terminals.length,
      existingInstances: currentState.terminalInstances.size,
      existingEventListeners: currentState.eventListeners.size
    })

    // Force unsubscribe from ALL existing terminal events
    currentState.terminals.forEach(terminal => {
      
      try {
        // Force cleanup using direct channel manipulation if possible
        const dataChannel = getTerminalDataChannel(terminal.id)
        const exitChannel = getTerminalExitChannel(terminal.id)
        
        if (window.electronAPI?.removeAllListeners) {
          try {
            window.electronAPI.removeAllListeners(dataChannel)
            window.electronAPI.removeAllListeners(exitChannel)
          } catch (error) {
          }
        }
        
        currentState.unsubscribeFromTerminalEvents(terminal.id)
      } catch (error) {
        storeLogger.error('[AppStore] Error unsubscribing from terminal events during cleanup', { 
          terminalId: terminal.id, 
          error 
        })
      }
    })

    // Dispose all existing XTerm instances without killing backend PTY processes
    currentState.terminalInstances.forEach((instance, terminalId) => {
      try {
        storeLogger.debug('[AppStore] 🧹 Disposing XTerm instance during cleanup', { 
          terminalId,
          hasDisposables: !!instance?.disposables,
          disposablesCount: instance?.disposables?.length || 0,
          hasXterm: !!instance?.xterm
        })
        
        if (instance?.disposables) {
          instance.disposables.forEach((disposable: any) => {
            try {
              disposable.dispose()
            } catch (error) {
              storeLogger.error('[AppStore] Error disposing terminal event listener during cleanup', {
                terminalId,
                error
              })
            }
          })
          // Clear disposables array to prevent reuse
          instance.disposables = []
        }
        
        if (instance?.xterm) {
          // Mark as not attached before disposal
          instance.isAttached = false
          instance.xterm.dispose()
          storeLogger.debug('[AppStore] ✅ Disposed XTerm instance during cleanup', { terminalId })
        }
      } catch (error) {
        storeLogger.error('[AppStore] Error disposing XTerm instance during cleanup', { terminalId, error })
      }
    })

    // Clear frontend state
    set({
      terminals: [],
      activeTerminalId: null,
      terminalInstances: new Map(),
      eventListeners: new Map(),
      terminalSerializeMethods: new Map()
    })

    storeLogger.info('[AppStore] ✅ Frontend terminal state cleanup completed')

    // Convert serialized terminals to frontend Terminal objects
    const terminals: Terminal[] = serializedTerminals ? serializedTerminals.map(serialized => ({
      id: serialized.id,
      title: serialized.title || 'Terminal',
      type: 'terminal',
      cwd: serialized.cwd,
      shell: serialized.shell,
      isActive: false,
      createdAt: serialized.createdAt || Date.now()
    })) : []

    // Re-establish event subscriptions for restored terminals
    // This is critical for terminal interaction after project switching
    storeLogger.debug('[AppStore] Setting up event subscriptions for restored terminals', { 
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

    // Store terminal states for restoration
    if (terminalStates && Object.keys(terminalStates).length > 0) {
      storeLogger.info('[AppStore] Storing terminal serialization states for restoration', { 
        stateCount: Object.keys(terminalStates).length 
      })
      // Temporarily store in window for access by Terminal components
      ;(window as any)._odysseyTerminalStatesForRestore = terminalStates
    } else {
      // Clear any existing states if none provided
      ;(window as any)._odysseyTerminalStatesForRestore = undefined
    }

    // Apply the complete state atomically
    set({
      terminals,
      activeTerminalId: finalActiveTerminalId,
      terminalMode: terminals.length > 0 ? 'active' : 'welcome'
    })

    // Re-establish event subscriptions for all restored terminals synchronously
    // Backend has already created terminals, so we can subscribe immediately
    
    storeLogger.info('[AppStore] 🔄 Starting synchronous event subscription restoration', { 
      totalTerminals: terminals.length
    })
    
    const subscribeToTerminalEvents = get().subscribeToTerminalEvents
    let successfulSubscriptions = 0
    
    terminals.forEach(terminal => {
      try {
        storeLogger.debug('[AppStore] Subscribing to events for restored terminal', { 
          terminalId: terminal.id 
        })
        subscribeToTerminalEvents(terminal.id)
        successfulSubscriptions++
        
        
        storeLogger.debug('[AppStore] ✅ Event subscription established for terminal', { 
          terminalId: terminal.id 
        })
      } catch (error) {
        storeLogger.error('[AppStore] ❌ Failed to restore event subscription for terminal', { 
          terminalId: terminal.id, 
          error 
        })
        // Don't retry - if it fails, something is fundamentally wrong
        throw new Error(`Failed to establish event subscription for terminal ${terminal.id}: ${error}`)
      }
    })
    
    storeLogger.info('[AppStore] 🎉 Event subscriptions restoration completed', { 
      totalTerminals: terminals.length,
      successfulSubscriptions
    })

    storeLogger.info('[AppStore] ✅ Workspace state applied successfully', { 
      terminalCount: terminals.length,
      activeTerminalId: finalActiveTerminalId,
      terminalMode: terminals.length > 0 ? 'active' : 'welcome',
    })
  }
})