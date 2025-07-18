/**
 * Terminal Store - Clean Architecture with Integrated Event Management
 *
 * This implements the SOTA architecture from terminal_architecture_v1.md
 * Clean, centralized state management for terminals with integrated IPC event handling
 */

import {create} from 'zustand'
import {subscribeWithSelector} from 'zustand/middleware'
import {Terminal, CreateTerminalOptions} from '@/types/terminal'
import {storeLogger} from '@/utils/logger'
import {
  getTerminalDataChannel,
  getTerminalExitChannel
} from '../../../../electron/ipc-channels'

// State interface
interface TerminalState {
  terminals: Terminal[]
  activeTerminalId: string | null
  terminalInstances: Map<string, any> // Terminal ID -> XTerm Instance
  eventListeners: Map<string, Array<() => void>> // Terminal ID -> Cleanup functions
}

// Actions interface
interface TerminalActions {
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

  // Event management (replaces TerminalEventManager)
  subscribeToTerminalEvents: (terminalId: string) => void
  unsubscribeFromTerminalEvents: (terminalId: string) => void

  // Utility
  clearAll: () => void
  getTerminal: (id: string) => Terminal | undefined

  // Session persistence
  saveTerminalState: (projectPath: string) => Promise<void>
  loadTerminalState: (projectPath: string) => Promise<void>
  restoreTerminalSessions: (projectPath?: string) => Promise<void>
}

type TerminalStore = TerminalState & TerminalActions

// Create the store
export const useTerminalStore = create<TerminalStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    terminals: [],
    activeTerminalId: null,
    terminalInstances: new Map<string, any>(),
    eventListeners: new Map<string, Array<() => void>>(),

    // Actions
    createTerminal: async (options) => {
      const {type, title, cwd, shell, makeActive = true} = options

      storeLogger.info('Starting terminal creation', {
        type,
        title,
        cwd,
        makeActive
      })

      try {
        // Create backend PTY process first - backend generates ID
        const result = await window.electronAPI.terminal.create(cwd, shell || '', cwd)

        storeLogger.debug('Backend response received', {success: result.success})

        if (!result.success) {
          storeLogger.error('Failed to create backend terminal', {error: result.error})
          throw new Error(`Failed to create backend terminal: ${result.error}`)
        }

        const backendTerminalId = result.data?.terminalId
        if (!backendTerminalId) {
          storeLogger.error('Backend terminal created but no session ID returned')
          throw new Error('Backend terminal created but no session ID returned')
        }

        storeLogger.debug('Backend terminal ID received', {backendTerminalId})

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

        // Automatically subscribe to events when terminal is created
        try {
          get().subscribeToTerminalEvents(terminalId)
          storeLogger.debug('Event subscription setup automatically', {terminalId})
        } catch (error) {
          storeLogger.error('Failed to setup event subscription', {terminalId, error})
        }

        storeLogger.info('Terminal created successfully', {terminalId})

        // Return the actual terminal ID
        return terminalId

      } catch (error) {
        storeLogger.error('Error creating backend terminal', {error})
        throw error
      }
    },

    removeTerminal: (id) => {
      storeLogger.info('Removing terminal', {terminalId: id})

      // With unified ID system, terminalId === backendSessionId
      const backendSessionId = id

      // Unsubscribe from events first
      get().unsubscribeFromTerminalEvents(id)

      window.electronAPI.terminal.close(backendSessionId)
        .then((result) => {
          if (!result.success) {
            storeLogger.error('Failed to close backend terminal', {backendSessionId, error: result.error})
          } else {
            storeLogger.debug('Backend terminal closed successfully', {backendSessionId})
          }
        })
        .catch((error) => {
          storeLogger.error('Error killing backend terminal', {backendSessionId, error})
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
                storeLogger.error('Error disposing terminal event listener', {terminalId: id, error})
              }
            })
          }

          if (terminalInstance.xterm) {
            terminalInstance.xterm.dispose()
          }
        } catch (error) {
          storeLogger.error('Error disposing XTerm instance', {terminalId: id, error})
        }
      }

      set((state) => {
        const terminals = state.terminals.filter(t => t.id !== id)
        let activeTerminalId = state.activeTerminalId

        const newInstancesMap = new Map(state.terminalInstances)
        newInstancesMap.delete(id)

        if (activeTerminalId === id) {
          activeTerminalId = terminals.length > 0 ? terminals[terminals.length - 1].id : null
        }

        return {
          terminals,
          activeTerminalId,
          terminalInstances: newInstancesMap
        }
      })
    },

    setActiveTerminal: (id) => {
      const terminal = get().getTerminal(id)
      if (terminal) {
        set({activeTerminalId: id})
      }
    },

    setTerminalTitle: (id, title) => {
      set((state) => ({
        terminals: state.terminals.map(t =>
          t.id === id ? {...t, title} : t
        )
      }))
    },

    writeToTerminal: async (terminalId, data) => {
      // With unified ID system, terminalId === backendSessionId
      const backendSessionId = terminalId

      storeLogger.verbose('Writing to terminal', {
        terminalId,
        dataLength: data.length
      })

      try {
        const result = await window.electronAPI.terminal.write(backendSessionId, data)
        storeLogger.verbose('Write result', {terminalId, success: result.success})

        if (result.success) {
          storeLogger.verbose('Successfully wrote to terminal', {terminalId})
          return true
        } else {
          storeLogger.error('Failed to write to terminal', {terminalId, error: result.error})
          return false
        }
      } catch (error) {
        storeLogger.error('Error writing to terminal', {terminalId, error})
        return false
      }
    },

    resizeTerminal: async (terminalId, cols, rows) => {
      // With unified ID system, terminalId === backendSessionId
      const backendSessionId = terminalId

      storeLogger.verbose('Resizing terminal', {
        terminalId,
        cols,
        rows
      })

      try {
        const result = await window.electronAPI.terminal.resize(backendSessionId, cols, rows)
        storeLogger.verbose('Resize result', {terminalId, success: result.success})

        if (result.success) {
          storeLogger.verbose('Successfully resized terminal', {terminalId, cols, rows})
          return true
        } else {
          storeLogger.error('Failed to resize terminal', {terminalId, error: result.error})
          return false
        }
      } catch (error) {
        storeLogger.error('Error resizing terminal', {terminalId, error})
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
                storeLogger.error('Error disposing terminal event listener in removeTerminalInstance', {
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
          storeLogger.error('Error disposing XTerm instance in removeTerminalInstance', {terminalId: id, error})
        }
      }

      set((state) => {
        const newInstancesMap = new Map(state.terminalInstances)
        newInstancesMap.delete(id)
        return {terminalInstances: newInstancesMap}
      })
    },

    // Event management - replaces TerminalEventManager
    subscribeToTerminalEvents: (terminalId) => {
      storeLogger.debug('Subscribing to terminal events', {
        terminalId
      })

      // Clean up any existing listeners ATOMICALLY
      const existingListeners = get().eventListeners.get(terminalId)
      if (existingListeners) {
        storeLogger.debug(`Cleaning up ${existingListeners.length} existing listeners for ${terminalId}`)
        existingListeners.forEach(cleanup => {
          try {
            cleanup()
          } catch (error) {
            storeLogger.error(`Error cleaning up listener for ${terminalId}:`, {error})
          }
        })

        // Remove from map immediately to prevent race conditions
        set((state) => {
          const newEventListeners = new Map(state.eventListeners)
          newEventListeners.delete(terminalId)
          return {eventListeners: newEventListeners}
        })
      }

      // Create event channels
      const dataChannel = getTerminalDataChannel(terminalId)
      const exitChannel = getTerminalExitChannel(terminalId)

      storeLogger.verbose('Event channels configured', {
        terminalId,
        dataChannel,
        exitChannel
      })

      // Create event handlers with error handling
      const handleData = (_event: any, data: string) => {
        try {
          storeLogger.verbose('Received data for terminal', {
            terminalId,
            dataLength: data.length
          })

          // Write data to XTerm instance
          const instance = get().getTerminalInstance(terminalId)
          if (instance?.xterm) {
            instance.xterm.write(data)
          } else {
            storeLogger.warn(`No XTerm instance found for ${terminalId}`)
          }
        } catch (error) {
          storeLogger.error('Error handling terminal data', {terminalId, error})
        }
      }

      const handleExit = (_event: any, exitCode: number) => {
        try {
          storeLogger.info('Terminal exited', {terminalId, exitCode})

          // Write an exit message to terminal
          const instance = get().getTerminalInstance(terminalId)
          if (instance?.xterm) {
            instance.xterm.writeln(`\r\n\x1b[90mProcess exited with code ${exitCode}\x1b[0m`)
          }

          // Remove terminal from store
          get().removeTerminal(terminalId)
        } catch (error) {
          storeLogger.error('Error handling terminal exit', {terminalId, error})
        }
      }

      // Set up event listeners
      if (!window.electronAPI?.on) {
        const error = new Error('electronAPI.on not available')
        storeLogger.error('electronAPI.on not available for terminal', {terminalId})
        throw error
      }

      try {
        storeLogger.debug('Adding event listeners for terminal', {
          terminalId,
          dataChannel,
          exitChannel
        })

        window.electronAPI.on(dataChannel, handleData)
        window.electronAPI.on(exitChannel, handleExit)

        storeLogger.debug('Event listeners setup successfully', {terminalId})

        // Store cleanup functions ATOMICALLY
        const cleanupFunctions = [
          () => {
            storeLogger.debug(`Cleaning up IPC listeners for ${terminalId}`)
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
        storeLogger.error('Failed to setup event listeners for terminal', {terminalId, error})
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
            storeLogger.error('Error during event cleanup', {terminalId, error})
          }
        })

        set((state) => {
          const newEventListeners = new Map(state.eventListeners)
          newEventListeners.delete(terminalId)
          return {eventListeners: newEventListeners}
        })

        storeLogger.debug('Unsubscribed from terminal events', {terminalId})
      }
    },

    clearAll: () => {
      const {terminals, terminalInstances} = get()

      // Kill all backend terminals
      terminals.forEach(terminal => {
        // With unified ID system, terminalId === backendSessionId
        const backendSessionId = terminal.id
        window.electronAPI.terminal.close(backendSessionId)
          .catch((error) => {
            storeLogger.error('Error killing terminal during clearAll', {terminalId: terminal.id, error})
          })
      })

      // Clean up all event listeners
      terminals.forEach(terminal => {
        get().unsubscribeFromTerminalEvents(terminal.id)
      })

      // Dispose all XTerm instances
      terminalInstances.forEach(instance => {
        if (instance?.xterm) {
          instance.xterm.dispose()
        }
      })

      set({
        terminals: [],
        activeTerminalId: null,
        terminalInstances: new Map(),
        eventListeners: new Map()
      })
    },

    getTerminal: (id) => {
      return get().terminals.find(t => t.id === id)
    },

    // Session persistence - simplified
    saveTerminalState: async (projectPath) => {
      // Validate project path
      if (!projectPath || typeof projectPath !== 'string' || projectPath.trim() === '') {
        storeLogger.error('Cannot save terminal state: invalid project path', { projectPath })
        return
      }

      try {
        const state = get()
        storeLogger.info('ℹ️ Terminal state saved for project', { projectPath })
        
        const serializedState = {
          terminals: state.terminals.map(terminal => ({
            id: terminal.id,
            title: terminal.title,
            type: terminal.type,
            cwd: terminal.cwd,
            shell: terminal.shell,
            createdAt: terminal.createdAt,
            isActive: terminal.id === state.activeTerminalId
          })),
          activeTerminalId: state.activeTerminalId,
          lastSaved: Date.now()
        }

        const workspaceFile = `${projectPath}/.odyssey/workspace.json`

        let workspaceData = {}
        try {
          const existingData = await window.electronAPI.fileSystem.readFile(workspaceFile)
          workspaceData = JSON.parse(existingData)
        } catch (error) {
          storeLogger.debug('Creating new workspace file')
        }

        ;(workspaceData as any).terminals = serializedState

        const odysseyDir = `${projectPath}/.odyssey`
        try {
          await window.electronAPI.fileSystem.writeFile(`${odysseyDir}/.gitkeep`, '')
        } catch (error) {
          storeLogger.debug('Creating .odyssey directory via .gitkeep file')
        }

        await window.electronAPI.fileSystem.writeFile(workspaceFile, JSON.stringify(workspaceData, null, 2))
      } catch (error) {
        storeLogger.error('Failed to save terminal state', {projectPath, error})
        throw error
      }
    },

    loadTerminalState: async (projectPath) => {
      // Validate project path
      if (!projectPath || typeof projectPath !== 'string' || projectPath.trim() === '') {
        storeLogger.error('Cannot load terminal state: invalid project path', { projectPath })
        return
      }

      try {
        const workspaceFile = `${projectPath}/.odyssey/workspace.json`
        const data = await window.electronAPI.fileSystem.readFile(workspaceFile)
        const workspaceData = JSON.parse(data)

        if (workspaceData.terminals) {
          const terminals = workspaceData.terminals.terminals || []

          set((state) => ({
            ...state,
            terminals: terminals.map((terminal: any) => ({
              id: terminal.id,
              title: terminal.title,
              type: terminal.type,
              cwd: terminal.cwd,
              shell: terminal.shell,
              isActive: false,
              createdAt: terminal.createdAt
            })),
            activeTerminalId: workspaceData.terminals.activeTerminalId || null
          }))

          storeLogger.info('Terminal state loaded for project', {projectPath, terminalCount: terminals.length})
        } else {
          storeLogger.debug('🔍 No terminal state found to load', { projectPath })
        }
      } catch (error) {
        storeLogger.debug('🔍 No terminal state found to load', {
          projectPath,
          message: error instanceof Error ? error.message : String(error)
        })
      }
    },

    restoreTerminalSessions: async () => {
      try {
        const state = get()
        storeLogger.info('Restoring terminal sessions', {count: state.terminals.length})

        // Clear existing terminals since we'll create new ones with backend-generated IDs
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

              // Create new terminal with backend-generated ID
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

              // Automatically subscribe to events when terminal is restored
              try {
                get().subscribeToTerminalEvents(backendTerminalId)
                storeLogger.debug('Event subscription setup automatically during restore', {terminalId: backendTerminalId})
              } catch (error) {
                storeLogger.error('Failed to setup event subscription during restore', {
                  terminalId: backendTerminalId,
                  error
                })
              }

              storeLogger.info('Terminal restored with backend terminal', {terminalId: backendTerminalId})
            } else {
              storeLogger.error('Failed to restore terminal', {originalId: terminal.id, error: result.error})
            }
          } catch (error) {
            storeLogger.error('Error restoring terminal', {originalId: terminal.id, error})
          }
        }

        storeLogger.info('Terminal restoration complete')
      } catch (error) {
        storeLogger.error('Failed to restore terminal sessions', {error})
      }
    }
  }))
)

// Derived selectors
export const useActiveTerminal = () => {
  return useTerminalStore((state) =>
    state.terminals.find(t => t.id === state.activeTerminalId) || null
  )
}

export const useHasTerminals = () => {
  return useTerminalStore((state) => state.terminals.length > 0)
}