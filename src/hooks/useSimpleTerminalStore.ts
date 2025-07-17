/**
 * Simplified Terminal Store - Clean Architecture
 * 
 * This implements the SOTA architecture from terminal_architecture_v1.md
 * Clean, centralized state management for terminals without pane complexity
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { Terminal, CreateTerminalOptions } from '@/types/terminal'

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
      
      // Generate unique ID
      const terminalId = `terminal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
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

      // Create backend PTY process
      window.electronAPI.terminal.create(cwd, shell || '', cwd)
        .then((result) => {
          if (!result.success) {
            console.error('Failed to create backend terminal:', result.error)
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
            if (backendSessionId) {
              // Map terminal ID to backend session ID
              set((state) => ({
                terminalSessionMap: new Map(state.terminalSessionMap).set(terminalId, backendSessionId)
              }))
              console.log(`Terminal ${terminalId} created with backend session ${backendSessionId}`)
            } else {
              console.error('Backend terminal created but no session ID returned')
              get().removeTerminal(terminalId)
            }
          }
        })
        .catch((error) => {
          console.error('Error creating backend terminal:', error)
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
      console.log(`[SimpleTerminalStore] Removing terminal ${id}`)
      
      const backendSessionId = get().terminalSessionMap.get(id)
      
      if (backendSessionId) {
        window.electronAPI.terminal.close(backendSessionId)
          .then((result) => {
            if (!result.success) {
              console.error('Failed to close backend terminal:', result.error)
            } else {
              console.log(`Backend terminal ${backendSessionId} closed successfully`)
            }
          })
          .catch((error) => {
            console.error('Error killing backend terminal:', error)
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
                console.error('Error disposing terminal event listener:', error)
              }
            })
          }
          
          if (terminalInstance.xterm) {
            terminalInstance.xterm.dispose()
          }
        } catch (error) {
          console.error('Error disposing XTerm instance:', error)
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
      const backendSessionId = get().terminalSessionMap.get(terminalId)
      
      if (!backendSessionId) {
        console.error(`No backend session found for terminal ${terminalId}`)
        return false
      }
      
      try {
        const result = await window.electronAPI.terminal.write(backendSessionId, data)
        if (result.success) {
          return true
        } else {
          console.error('Failed to write to terminal:', result.error)
          return false
        }
      } catch (error) {
        console.error('Error writing to terminal:', error)
        return false
      }
    },

    resizeTerminal: async (terminalId, cols, rows) => {
      const backendSessionId = get().terminalSessionMap.get(terminalId)
      
      if (!backendSessionId) {
        console.error(`No backend session found for terminal ${terminalId}`)
        return false
      }
      
      try {
        const result = await window.electronAPI.terminal.resize(backendSessionId, cols, rows)
        if (result.success) {
          return true
        } else {
          console.error('Failed to resize terminal:', result.error)
          return false
        }
      } catch (error) {
        console.error('Error resizing terminal:', error)
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
                console.error('Error disposing terminal event listener:', error)
              }
            })
          }
          
          if (instance.xterm) {
            instance.xterm.dispose()
          }
        } catch (error) {
          console.error('Error disposing XTerm instance:', error)
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
              console.error('Error killing terminal during clearAll:', error)
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
          console.log('Creating new workspace file')
        }
        
        ;(workspaceData as any).terminals = serializedState
        
        const odysseyDir = `${projectPath}/.odyssey`
        try {
          await window.electronAPI.fileSystem.writeFile(`${odysseyDir}/.gitkeep`, '')
        } catch (error) {
          console.log('Creating .odyssey directory via .gitkeep file')
        }
        
        await window.electronAPI.fileSystem.writeFile(workspaceFile, JSON.stringify(workspaceData, null, 2))
        console.log(`Terminal state saved for project: ${projectPath}`)
      } catch (error) {
        console.error('Failed to save terminal state:', error)
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
          
          console.log(`Terminal state loaded for project: ${projectPath}`)
        }
      } catch (error) {
        console.log('No terminal state found to load:', error instanceof Error ? error.message : String(error))
      }
    },

    restoreTerminalSessions: async () => {
      try {
        const state = get()
        console.log(`Restoring ${state.terminals.length} terminal sessions...`)
        
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
              console.log(`Terminal ${terminal.id} restored with backend session ${result.data.sessionId}`)
            } else {
              console.error(`Failed to restore terminal ${terminal.id}:`, result.error)
              get().setTerminalTitle(terminal.id, `${terminal.title} (Restore Failed)`)
            }
          } catch (error) {
            console.error(`Error restoring terminal ${terminal.id}:`, error)
            get().setTerminalTitle(terminal.id, `${terminal.title} (Connection Error)`)
          }
        }
        
        console.log('Terminal restoration complete')
      } catch (error) {
        console.error('Failed to restore terminal sessions:', error)
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