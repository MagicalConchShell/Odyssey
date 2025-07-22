import { StateCreator } from 'zustand'
import { TerminalMode } from '@/types/terminal'
import { ProjectSlice } from './projectSlice'
import { TerminalSlice } from './terminalSlice'

// Debounce utility for persistence
let persistenceTimer: NodeJS.Timeout | null = null
const debouncedPersist = (persistFn: () => void) => {
  if (persistenceTimer) {
    clearTimeout(persistenceTimer)
  }
  persistenceTimer = setTimeout(persistFn, 100) // 100ms debounce
}

// UI slice state
export interface UISlice {
  // UI state
  sidebarTab: 'timeline' | 'files' | 'settings'
  sidebarCollapsed: boolean
  terminalMode: TerminalMode

  // UI actions
  setSidebarTab: (tab: 'timeline' | 'files' | 'settings') => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setTerminalMode: (mode: TerminalMode) => void
}

export const createUISlice: StateCreator<
  UISlice & ProjectSlice & TerminalSlice,
  [],
  [],
  UISlice
> = (set, get) => ({
  // Initial state
  sidebarTab: 'timeline',
  sidebarCollapsed: false,
  terminalMode: 'welcome',

  // UI actions
  setSidebarTab: (tab) => {
    set({ sidebarTab: tab })
    // Debounced persistence to prevent rapid updates
    debouncedPersist(() => get().persistProjectState())
  },

  setSidebarCollapsed: (collapsed) => {
    set({ sidebarCollapsed: collapsed })
    // Debounced persistence to prevent rapid updates
    debouncedPersist(() => get().persistProjectState())
  },

  setTerminalMode: (mode) => {
    const currentMode = get().terminalMode
    if (currentMode !== mode) {
      console.log('[AppStore] Setting terminal mode:', { from: currentMode, to: mode })
      set({ terminalMode: mode })
      // Debounced persistence to prevent rapid updates
      debouncedPersist(() => get().persistProjectState())
    }
  }
})