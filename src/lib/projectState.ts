import {createContext, useContext, useCallback} from 'react'
import { TerminalMode } from '@/types/terminal'

/**
 * Project State Management System
 * 
 * Provides centralized state management for project-focused workflows
 * Handles project info, checkpoint linking, and UI state (without AI dependencies)
 */

// Project state interfaces
export interface ProjectState {
  // Project info
  currentProject: Project | null
  projectPath: string
  projectSettings: ProjectSettings
  
  // Checkpoint state
  selectedCheckpoint: string | null
  checkpointHistory: CheckpointInfo[]
  
  // UI state - simplified for two-column layout
  sidebarTab: 'timeline' | 'files' | 'settings'
  sidebarCollapsed: boolean
  
  // Terminal state - simplified for new architecture
  terminalMode: TerminalMode
}

export interface Project {
  id: string
  name: string
  path: string
  type: 'manual' | 'claude-imported'
  last_opened: number
  is_pinned: boolean
  tags?: string[]
  claude_project_id?: string
  created_at: number
  updated_at: number
  settings?: ProjectSettings
}

export interface ProjectSettings {
  autoCheckpoint: boolean
  checkpointInterval: number
  customPromptTemplate: string
  excludePatterns: string[]
  includePatterns: string[]
  maxHistoryLength: number
  enableDebugMode: boolean
  terminalShell?: string
}

export interface CheckpointInfo {
  hash: string
  description: string
  author: string
  timestamp: string
  parents: string[]
}

// Action types
export type ProjectAction = 
  | { type: 'SET_PROJECT'; payload: Project }
  | { type: 'SET_PROJECT_PATH'; payload: string }
  | { type: 'UPDATE_PROJECT_SETTINGS'; payload: Partial<ProjectSettings> }
  | { type: 'SET_SELECTED_CHECKPOINT'; payload: string | null }
  | { type: 'SET_CHECKPOINT_HISTORY'; payload: CheckpointInfo[] }
  | { type: 'SET_SIDEBAR_TAB'; payload: 'timeline' | 'files' | 'settings' }
  | { type: 'SET_SIDEBAR_COLLAPSED'; payload: boolean }
  | { type: 'SET_TERMINAL_MODE'; payload: TerminalMode }
  | { type: 'RESET_PROJECT_STATE' }

// Initial state
const initialState: ProjectState = {
  currentProject: null,
  projectPath: '',
  projectSettings: {
    autoCheckpoint: true,
    checkpointInterval: 5,
    customPromptTemplate: '',
    excludePatterns: ['.git', 'node_modules', '.env', '*.log'],
    includePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.md'],
    maxHistoryLength: 1000,
    enableDebugMode: false,
    terminalShell: undefined
  },
  selectedCheckpoint: null,
  checkpointHistory: [],
  sidebarTab: 'timeline',
  sidebarCollapsed: false,
  terminalMode: 'welcome'
}


// Reducer function
export function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'SET_PROJECT':
      return {
        ...state,
        currentProject: action.payload,
        projectPath: action.payload.path,
        projectSettings: { ...state.projectSettings, ...action.payload.settings }
      }
    
    case 'SET_PROJECT_PATH':
      return {
        ...state,
        projectPath: action.payload
      }
    
    case 'UPDATE_PROJECT_SETTINGS':
      return {
        ...state,
        projectSettings: { ...state.projectSettings, ...action.payload }
      }
    
    case 'SET_SELECTED_CHECKPOINT':
      return {
        ...state,
        selectedCheckpoint: action.payload
      }
    
    case 'SET_CHECKPOINT_HISTORY':
      return {
        ...state,
        checkpointHistory: action.payload
      }
    
    case 'SET_SIDEBAR_TAB':
      return {
        ...state,
        sidebarTab: action.payload
      }
    
    case 'SET_SIDEBAR_COLLAPSED':
      return {
        ...state,
        sidebarCollapsed: action.payload
      }
    
    case 'SET_TERMINAL_MODE':
      return {
        ...state,
        terminalMode: action.payload
      }
    
    case 'RESET_PROJECT_STATE':
      return initialState
    
    default:
      return state
  }
}

// Context
export const ProjectStateContext = createContext<{
  state: ProjectState
  dispatch: React.Dispatch<ProjectAction>
} | null>(null)

// Custom hook for using project state
export function useProjectState() {
  const context = useContext(ProjectStateContext)
  if (!context) {
    throw new Error('useProjectState must be used within a ProjectStateProvider')
  }
  return context
}

// Custom hooks for specific functionality
export function useProject() {
  const { state, dispatch } = useProjectState()
  
  const setProject = useCallback((project: Project) => {
    dispatch({ type: 'SET_PROJECT', payload: project })
  }, [dispatch])
  
  const setProjectPath = useCallback((path: string) => {
    dispatch({ type: 'SET_PROJECT_PATH', payload: path })
  }, [dispatch])
  
  const updateProjectSettings = useCallback((settings: Partial<ProjectSettings>) => {
    dispatch({ type: 'UPDATE_PROJECT_SETTINGS', payload: settings })
  }, [dispatch])
  
  const resetProject = useCallback(() => {
    dispatch({ type: 'RESET_PROJECT_STATE' })
  }, [dispatch])
  
  return {
    currentProject: state.currentProject,
    projectPath: state.projectPath,
    projectSettings: state.projectSettings,
    setProject,
    setProjectPath,
    updateProjectSettings,
    resetProject
  }
}

export function useCheckpoints() {
  const { state, dispatch } = useProjectState()
  
  const setSelectedCheckpoint = useCallback((checkpoint: string | null) => {
    dispatch({ type: 'SET_SELECTED_CHECKPOINT', payload: checkpoint })
  }, [dispatch])
  
  const setCheckpointHistory = useCallback((history: CheckpointInfo[]) => {
    dispatch({ type: 'SET_CHECKPOINT_HISTORY', payload: history })
  }, [dispatch])
  
  return {
    selectedCheckpoint: state.selectedCheckpoint,
    checkpointHistory: state.checkpointHistory,
    setSelectedCheckpoint,
    setCheckpointHistory
  }
}

export function useUI() {
  const { state, dispatch } = useProjectState()
  
  const setSidebarTab = useCallback((tab: 'timeline' | 'files' | 'settings') => {
    dispatch({ type: 'SET_SIDEBAR_TAB', payload: tab })
  }, [dispatch])
  
  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    dispatch({ type: 'SET_SIDEBAR_COLLAPSED', payload: collapsed })
  }, [dispatch])
  
  return {
    sidebarTab: state.sidebarTab,
    sidebarCollapsed: state.sidebarCollapsed,
    setSidebarTab,
    setSidebarCollapsed
  }
}

// Simple terminal mode hook - terminal state is now managed by Zustand
export function useTerminalMode() {
  const { state, dispatch } = useProjectState()
  
  const setTerminalMode = useCallback((mode: TerminalMode) => {
    dispatch({ 
      type: 'SET_TERMINAL_MODE', 
      payload: mode
    })
  }, [dispatch])
  
  return {
    terminalMode: state.terminalMode,
    setTerminalMode
  }
}

// Persistence helpers
export function saveProjectState(state: ProjectState) {
  try {
    const serializedState = JSON.stringify({
      currentProject: state.currentProject,
      projectPath: state.projectPath,
      projectSettings: state.projectSettings,
      sidebarTab: state.sidebarTab,
      sidebarCollapsed: state.sidebarCollapsed,
      terminalMode: state.terminalMode
    })
    localStorage.setItem('projectState', serializedState)
  } catch (error) {
    console.warn('Failed to save project state:', error)
  }
}

export function loadProjectState(): Partial<ProjectState> {
  try {
    const serializedState = localStorage.getItem('projectState')
    if (serializedState) {
      const loadedState = JSON.parse(serializedState)
      // If terminalMode is missing, initialize it
      if (!loadedState.terminalMode) {
        loadedState.terminalMode = initialState.terminalMode
      }
      return loadedState
    }
  } catch (error) {
    console.warn('Failed to load project state:', error)
  }
  return {}
}

// State persistence middleware
export function createProjectStateMiddleware() {
  return (state: ProjectState, action: ProjectAction) => {
    const newState = projectReducer(state, action)
    
    // Save state to localStorage on certain actions
    if ([
      'SET_PROJECT',
      'UPDATE_PROJECT_SETTINGS',
      'SET_SIDEBAR_TAB',
      'SET_SIDEBAR_COLLAPSED',
      'SET_TERMINAL_MODE'
    ].includes(action.type)) {
      saveProjectState(newState)
    }
    
    return newState
  }
}