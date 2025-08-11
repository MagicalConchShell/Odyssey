import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'
import { createProjectSlice, ProjectSlice } from './projectSlice'
import { createTerminalSlice, TerminalSlice } from './terminalSlice'
import { createUISlice, UISlice } from './uiSlice'

// Define complete AppState type
export type AppState = ProjectSlice & TerminalSlice & UISlice

// Create the unified store with persistence
export const useAppStore = create<AppState>()(
  subscribeWithSelector(
    persist(
      (set, get, api) => ({
        ...createProjectSlice(set, get, api),
        ...createTerminalSlice(set, get, api),
        ...createUISlice(set, get, api),
      }),
      {
        name: 'odyssey-app-storage', // localStorage item name
        // Selectively persist only needed state
        partialize: (state) => ({
          currentProject: state.currentProject,
          projectPath: state.projectPath,
          projectSettings: state.projectSettings,
          sidebarTab: state.sidebarTab,
          sidebarCollapsed: state.sidebarCollapsed,
          terminalMode: state.terminalMode,
        }),
      }
    )
  )
)

// Derived selectors for convenience
export const useActiveTerminal = () => {
  return useAppStore((state) =>
    state.terminals.find(t => t.id === state.activeTerminalId) || null
  )
}

export const useHasTerminals = () => {
  return useAppStore((state) => state.terminals.length > 0)
}

// The persist middleware now automatically handles state persistence
// No manual initialization needed

// Re-export types for convenience
export type { Project, ProjectSettings } from './projectSlice'
export type { Terminal, CreateTerminalOptions, TerminalMode } from '@/types/terminal'