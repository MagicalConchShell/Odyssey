import React, { useReducer, useEffect, ReactNode } from 'react'
import { 
  ProjectStateContext, 
  ProjectState,
  ProjectAction,
  loadProjectState,
  createProjectStateMiddleware
} from '@/lib/projectState'

interface ProjectStateProviderProps {
  children: ReactNode
}

export const ProjectStateProvider: React.FC<ProjectStateProviderProps> = ({ children }) => {
  // Load initial state from localStorage
  const savedState = loadProjectState()
  
  // Initialize state with saved data merged with defaults
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
    terminalMode: 'welcome',
    // Merge saved state
    ...savedState
  }
  
  // Create middleware for persistence
  const middlewareReducer = createProjectStateMiddleware()
  
  // Use reducer with middleware
  const [state, dispatch] = useReducer(
    (state: ProjectState, action: ProjectAction) => middlewareReducer(state, action),
    initialState
  )
  
  // Debug logging in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Project State:', state)
    }
  }, [state])
  
  // Restore terminal sessions when project changes
  useEffect(() => {
    if (state.currentProject && state.projectPath) {
      console.log('Project changed, attempting to restore terminal sessions')
      // Add a small delay to ensure the state is fully initialized
      setTimeout(() => {
        // We'll trigger this through the useTerminal hook when needed
      }, 100)
    }
  }, [state.currentProject, state.projectPath])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Perform any cleanup if needed
    }
  }, [])
  
  return (
    <ProjectStateContext.Provider value={{ state, dispatch }}>
      {children}
    </ProjectStateContext.Provider>
  )
}