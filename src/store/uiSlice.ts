import { StateCreator } from 'zustand'
import { TerminalMode } from '@/types/terminal'
import { ProjectSlice } from './projectSlice'
import { TerminalSlice } from './terminalSlice'

// Persistence is now handled automatically by persist middleware

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
  sidebarTab: 'files',
  sidebarCollapsed: false,
  terminalMode: 'welcome',

  // UI actions
  setSidebarTab: (tab) => {
    set({ sidebarTab: tab })
    // Persistence is now handled automatically by persist middleware
  },

  setSidebarCollapsed: (collapsed) => {
    set({ sidebarCollapsed: collapsed })
    // Persistence is now handled automatically by persist middleware
  },

  setTerminalMode: (mode) => {
    const currentMode = get().terminalMode
    if (currentMode !== mode) {
      console.log('[AppStore] Setting terminal mode:', { from: currentMode, to: mode })
      set({ terminalMode: mode })
      // Persistence is now handled automatically by persist middleware
    }
  }
})