/**
 * Simplified Terminal Store - Clean Architecture
 * 
 * This implements the SOTA architecture from terminal_architecture_v1.md
 * Clean, centralized state management for terminals without pane complexity
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { Terminal, CreateTerminalOptions } from '@/types/terminal'
import { storeLogger } from '@/utils/logger'

// Simplified state interface
interface SimpleTerminalState {
  terminals: Terminal[]
  activeTerminalId: string | null
  terminalSessionMap: Map<string, string> // Terminal ID -> Backend Session ID
  terminalInstances: Map<string, any> // Terminal ID -> XTerm Instance
}

// Simplified actions interface
interface SimpleTerminalActions {
  // Core terminal lifecycle
  createTerminal: (options: CreateTerminalOptions) => string
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
  
  // Utility
  clearAll: () => void
  getTerminal: (id: string) => Terminal | undefined
  
  // Session persistence
  saveTerminalState: (projectPath: string) => Promise<void>
  loadTerminalState: (projectPath: string) => Promise<void>
  restoreTerminalSessions: (projectPath?: string) => Promise<void>
}

type SimpleTerminalStore = SimpleTerminalState & SimpleTerminalActions

// Create the simplified store
export const useSimpleTerminalStore = create<SimpleTerminalStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    terminals: [],
    activeTerminalId: null,
    terminalSessionMap: new Map<string, string>(),
    terminalInstances: new Map<string, any>(),

    // Actions
    createTerminal: (options) => {
      const { type, title, cwd, shell, makeActive = true } = options
      
      // Generate unique ID - unified ID system
      const terminalId = `terminal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      storeLogger.info('Starting terminal creation', {
        terminalId,
        type,
        title,
        cwd,
        makeActive
      })
      
      // Create terminal
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

      storeLogger.debug('Frontend terminal added to store, calling backend', { terminalId })

      // Create backend PTY process with unified ID
      window.electronAPI.terminal.create(cwd, shell || '', cwd, terminalId)
        .then((result) => {
          storeLogger.debug('Backend response received', { terminalId, success: result.success })
          
          if (!result.success) {
            storeLogger.error('Failed to create backend terminal', { terminalId, error: result.error })
            // Update terminal title to show error
            set((state) => ({
              terminals: state.terminals.map(terminal => 
                terminal.id === terminalId ? { ...terminal, title: `${terminal.title} (Error)` } : terminal
              )
            }))
            // Remove after delay
            setTimeout(() => {
              get().removeTerminal(terminalId)
            }, 3000)
          } else {
            const backendSessionId = result.data?.sessionId
            storeLogger.debug('Backend session ID received', { terminalId, backendSessionId })
            
            if (backendSessionId && backendSessionId === terminalId) {
              // Unified ID system - no mapping needed, but keep for compatibility
              set((state) => ({
                terminalSessionMap: new Map(state.terminalSessionMap).set(terminalId, backendSessionId)
              }))
              storeLogger.info('Terminal unified ID confirmed', { terminalId })
              storeLogger.debug('Session mappings updated', { totalMappings: get().terminalSessionMap.size })
            } else {
              storeLogger.error('Backend terminal created but session ID mismatch', {
                expected: terminalId,
                received: backendSessionId
              })
              get().removeTerminal(terminalId)
            }
          }
        })
        .catch((error) => {
          storeLogger.error('Error creating backend terminal', { terminalId, error })
          set((state) => ({
            terminals: state.terminals.map(terminal => 
              terminal.id === terminalId ? { ...terminal, title: `${terminal.title} (Connection Error)` } : terminal
            )
          }))
          setTimeout(() => {
            get().removeTerminal(terminalId)
          }, 3000)
        })

      return terminalId
    },

    removeTerminal: (id) => {
      storeLogger.info('Removing terminal', { terminalId: id })
      
      const backendSessionId = get().terminalSessionMap.get(id)
      
      if (backendSessionId) {
        window.electronAPI.terminal.close(backendSessionId)
          .then((result) => {
            if (!result.success) {
              storeLogger.error('Failed to close backend terminal', { backendSessionId, error: result.error })
            } else {
              storeLogger.debug('Backend terminal closed successfully', { backendSessionId })
            }
          })
          .catch((error) => {
            storeLogger.error('Error killing backend terminal', { backendSessionId, error })
          })
      }

      // Clean up XTerm instance
      const terminalInstance = get().terminalInstances.get(id)
      if (terminalInstance) {
        try {
          if (terminalInstance.disposables) {
            terminalInstance.disposables.forEach((disposable: any) => {
              try {
                disposable.dispose()
              } catch (error) {
                storeLogger.error('Error disposing terminal event listener', { terminalId: id, error })
              }
            })
          }
          
          if (terminalInstance.xterm) {
            terminalInstance.xterm.dispose()
          }
        } catch (error) {
          storeLogger.error('Error disposing XTerm instance', { terminalId: id, error })
        }
      }

      set((state) => {
        const terminals = state.terminals.filter(t => t.id !== id)
        let activeTerminalId = state.activeTerminalId
        
        const newSessionMap = new Map(state.terminalSessionMap)
        newSessionMap.delete(id)
        
        const newInstancesMap = new Map(state.terminalInstances)
        newInstancesMap.delete(id)
        
        if (activeTerminalId === id) {
          activeTerminalId = terminals.length > 0 ? terminals[terminals.length - 1].id : null
        }
        
        return {
          terminals,
          activeTerminalId,
          terminalSessionMap: newSessionMap,
          terminalInstances: newInstancesMap
        }
      })
    },

    setActiveTerminal: (id) => {
      const terminal = get().getTerminal(id)
      if (terminal) {
        set({ activeTerminalId: id })
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
      // With unified ID system, terminalId === backendSessionId
      const backendSessionId = terminalId
      
      storeLogger.verbose('Writing to terminal', {
        terminalId,
        dataLength: data.length
      })
      
      try {
        const result = await window.electronAPI.terminal.write(backendSessionId, data)
        storeLogger.verbose('Write result', { terminalId, success: result.success })
        
        if (result.success) {
          storeLogger.verbose('Successfully wrote to terminal', { terminalId })
          return true
        } else {
          storeLogger.error('Failed to write to terminal', { terminalId, error: result.error })
          return false
        }
      } catch (error) {
        storeLogger.error('Error writing to terminal', { terminalId, error })
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
        storeLogger.verbose('Resize result', { terminalId, success: result.success })
        
        if (result.success) {
          storeLogger.verbose('Successfully resized terminal', { terminalId, cols, rows })
          return true
        } else {
          storeLogger.error('Failed to resize terminal', { terminalId, error: result.error })
          return false
        }
      } catch (error) {
        storeLogger.error('Error resizing terminal', { terminalId, error })
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
            instance.disposables.forEach((disposable: any) => {
              try {
                disposable.dispose()
              } catch (error) {
                storeLogger.error('Error disposing terminal event listener in removeTerminalInstance', { terminalId: id, error })
              }
            })
          }
          
          if (instance.xterm) {
            instance.xterm.dispose()
          }
        } catch (error) {
          storeLogger.error('Error disposing XTerm instance in removeTerminalInstance', { terminalId: id, error })
        }
      }
      
      set((state) => {
        const newInstancesMap = new Map(state.terminalInstances)
        newInstancesMap.delete(id)
        return { terminalInstances: newInstancesMap }
      })
    },

    clearAll: () => {
      const { terminals, terminalSessionMap, terminalInstances } = get()
      
      // Kill all backend terminals
      terminals.forEach(terminal => {
        const backendSessionId = terminalSessionMap.get(terminal.id)
        if (backendSessionId) {
          window.electronAPI.terminal.close(backendSessionId)
            .catch((error) => {
              storeLogger.error('Error killing terminal during clearAll', { terminalId: terminal.id, error })
            })
        }
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
        terminalSessionMap: new Map(),
        terminalInstances: new Map()
      })
    },

    getTerminal: (id) => {
      return get().terminals.find(t => t.id === id)
    },

    // Session persistence - simplified
    saveTerminalState: async (projectPath) => {
      try {
        const state = get()
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
        storeLogger.info('Terminal state saved for project', { projectPath })
      } catch (error) {
        storeLogger.error('Failed to save terminal state', { projectPath, error })
      }
    },

    loadTerminalState: async (projectPath) => {
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
          
          storeLogger.info('Terminal state loaded for project', { projectPath })
        }
      } catch (error) {
        storeLogger.debug('No terminal state found to load', { projectPath, message: error instanceof Error ? error.message : String(error) })
      }
    },

    restoreTerminalSessions: async () => {
      try {
        const state = get()
        storeLogger.info('Restoring terminal sessions', { count: state.terminals.length })
        
        for (const terminal of state.terminals) {
          try {
            const result = await Promise.race([
              window.electronAPI.terminal.create(terminal.cwd, terminal.shell || '', terminal.cwd),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('PTY creation timeout')), 5000)
              )
            ])
            
            if (result.success && result.data?.sessionId) {
              set((state) => ({
                terminalSessionMap: new Map(state.terminalSessionMap).set(terminal.id, result.data.sessionId)
              }))
              storeLogger.info('Terminal restored with backend session', { terminalId: terminal.id, sessionId: result.data.sessionId })
            } else {
              storeLogger.error('Failed to restore terminal', { terminalId: terminal.id, error: result.error })
              get().setTerminalTitle(terminal.id, `${terminal.title} (Restore Failed)`)
            }
          } catch (error) {
            storeLogger.error('Error restoring terminal', { terminalId: terminal.id, error })
            get().setTerminalTitle(terminal.id, `${terminal.title} (Connection Error)`)
          }
        }
        
        storeLogger.info('Terminal restoration complete')
      } catch (error) {
        storeLogger.error('Failed to restore terminal sessions', { error })
      }
    }
  }))
)

// Derived selectors
export const useSimpleActiveTerminal = () => {
  return useSimpleTerminalStore((state) => 
    state.terminals.find(t => t.id === state.activeTerminalId) || null
  )
}

export const useSimpleHasTerminals = () => {
  return useSimpleTerminalStore((state) => state.terminals.length > 0)
}