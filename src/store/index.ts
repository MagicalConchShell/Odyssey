import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { useMemo } from 'react'
import { createProjectSlice, ProjectSlice } from './projectSlice'
import { createTerminalSlice, TerminalSlice } from './terminalSlice'
import { createUISlice, UISlice } from './uiSlice'

// Define complete AppState type
export type AppState = ProjectSlice & TerminalSlice & UISlice

// Create the unified store
export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get, api) => ({
    ...createProjectSlice(set, get, api),
    ...createTerminalSlice(set, get, api),
    ...createUISlice(set, get, api),
  }))
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

export const useProject = () => {
  const currentProject = useAppStore((state) => state.currentProject)
  const projectPath = useAppStore((state) => state.projectPath)
  const projectSettings = useAppStore((state) => state.projectSettings)
  const setProject = useAppStore((state) => state.setProject)
  const setProjectPath = useAppStore((state) => state.setProjectPath)
  const updateProjectSettings = useAppStore((state) => state.updateProjectSettings)
  const resetProject = useAppStore((state) => state.resetProject)

  return useMemo(() => ({
    currentProject,
    projectPath,
    projectSettings,
    setProject,
    setProjectPath,
    updateProjectSettings,
    resetProject
  }), [currentProject, projectPath, projectSettings, setProject, setProjectPath, updateProjectSettings, resetProject])
}

export const useCheckpoints = () => {
  const selectedCheckpoint = useAppStore((state) => state.selectedCheckpoint)
  const checkpointHistory = useAppStore((state) => state.checkpointHistory)
  const setSelectedCheckpoint = useAppStore((state) => state.setSelectedCheckpoint)
  const setCheckpointHistory = useAppStore((state) => state.setCheckpointHistory)

  return useMemo(() => ({
    selectedCheckpoint,
    checkpointHistory,
    setSelectedCheckpoint,
    setCheckpointHistory
  }), [selectedCheckpoint, checkpointHistory, setSelectedCheckpoint, setCheckpointHistory])
}

export const useUI = () => {
  const sidebarTab = useAppStore((state) => state.sidebarTab)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const setSidebarTab = useAppStore((state) => state.setSidebarTab)
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed)

  return useMemo(() => ({
    sidebarTab,
    sidebarCollapsed,
    setSidebarTab,
    setSidebarCollapsed
  }), [sidebarTab, sidebarCollapsed, setSidebarTab, setSidebarCollapsed])
}

export const useTerminalMode = () => {
  const terminalMode = useAppStore((state) => state.terminalMode)
  const setTerminalMode = useAppStore((state) => state.setTerminalMode)

  return useMemo(() => ({
    terminalMode,
    setTerminalMode
  }), [terminalMode, setTerminalMode])
}

export const useTerminals = () => {
  const terminals = useAppStore((state) => state.terminals)
  const activeTerminalId = useAppStore((state) => state.activeTerminalId)
  const createTerminal = useAppStore((state) => state.createTerminal)
  const removeTerminal = useAppStore((state) => state.removeTerminal)
  const setActiveTerminal = useAppStore((state) => state.setActiveTerminal)
  const setTerminalTitle = useAppStore((state) => state.setTerminalTitle)
  const writeToTerminal = useAppStore((state) => state.writeToTerminal)
  const resizeTerminal = useAppStore((state) => state.resizeTerminal)
  const clearAll = useAppStore((state) => state.clearAll)
  const getTerminal = useAppStore((state) => state.getTerminal)

  return useMemo(() => ({
    terminals,
    activeTerminalId,
    createTerminal,
    removeTerminal,
    setActiveTerminal,
    setTerminalTitle,
    writeToTerminal,
    resizeTerminal,
    clearAll,
    getTerminal
  }), [terminals, activeTerminalId, createTerminal, removeTerminal, setActiveTerminal, setTerminalTitle, writeToTerminal, resizeTerminal, clearAll, getTerminal])
}

export const useTerminalInstances = () => {
  const terminalInstances = useAppStore((state) => state.terminalInstances)
  const setTerminalInstance = useAppStore((state) => state.setTerminalInstance)
  const getTerminalInstance = useAppStore((state) => state.getTerminalInstance)
  const removeTerminalInstance = useAppStore((state) => state.removeTerminalInstance)
  const subscribeToTerminalEvents = useAppStore((state) => state.subscribeToTerminalEvents)
  const unsubscribeFromTerminalEvents = useAppStore((state) => state.unsubscribeFromTerminalEvents)

  return useMemo(() => ({
    terminalInstances,
    setTerminalInstance,
    getTerminalInstance,
    removeTerminalInstance,
    subscribeToTerminalEvents,
    unsubscribeFromTerminalEvents
  }), [terminalInstances, setTerminalInstance, getTerminalInstance, removeTerminalInstance, subscribeToTerminalEvents, unsubscribeFromTerminalEvents])
}

// Initialize the store with persisted state
export const initializeStore = () => {
  const store = useAppStore.getState()
  
  // Load persisted project state
  store.loadPersistedProjectState()
  
  console.log('[AppStore] Store initialized with persisted state')
}

// Re-export types for convenience
export type { Project, ProjectSettings, CheckpointInfo } from './projectSlice'
export type { Terminal, CreateTerminalOptions, TerminalMode } from '@/types/terminal'