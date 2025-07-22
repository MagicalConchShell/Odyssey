import { StateCreator } from 'zustand'
import { TerminalSlice } from './terminalSlice'
import { UISlice } from './uiSlice'

// Project interfaces (migrated from projectState.ts)
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

// Project slice state
export interface ProjectSlice {
  // Project info
  currentProject: Project | null
  projectPath: string
  projectSettings: ProjectSettings
  
  // Checkpoint state
  selectedCheckpoint: string | null
  checkpointHistory: CheckpointInfo[]
  
  // Project actions
  setProject: (project: Project) => Promise<void>
  setProjectPath: (path: string) => void
  updateProjectSettings: (settings: Partial<ProjectSettings>) => void
  setSelectedCheckpoint: (checkpoint: string | null) => void
  setCheckpointHistory: (history: CheckpointInfo[]) => void
  resetProject: () => void
  
  // Persistence is now handled automatically by persist middleware
}

// Initial project settings
const initialProjectSettings: ProjectSettings = {
  autoCheckpoint: true,
  checkpointInterval: 5,
  customPromptTemplate: '',
  excludePatterns: ['.git', 'node_modules', '.env', '*.log'],
  includePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.md'],
  maxHistoryLength: 1000,
  enableDebugMode: false,
  terminalShell: undefined
}

export const createProjectSlice: StateCreator<
  ProjectSlice & TerminalSlice & UISlice,
  [],
  [],
  ProjectSlice
> = (set, get) => ({
  // Initial state
  currentProject: null,
  projectPath: '',
  projectSettings: initialProjectSettings,
  selectedCheckpoint: null,
  checkpointHistory: [],

  // Core project switching action - this is the key improvement
  setProject: async (newProject: Project) => {
    // Validate project data first
    if (!newProject || !newProject.path || newProject.path.trim() === '') {
      console.error('[AppStore] Invalid project data provided:', newProject)
      throw new Error('Invalid project data: missing path')
    }

    const normalizedPath = newProject.path.trim()
    const currentPath = get().projectPath

    // Skip if the project is already selected
    if (normalizedPath === currentPath && get().currentProject?.id === newProject.id) {
      console.log('[AppStore] Project already selected, skipping switch:', normalizedPath)
      return
    }

    console.log('[AppStore] Starting project switch:', { 
      from: currentPath, 
      to: normalizedPath 
    })

    let operationSuccessful = false

    try {
      const oldProjectPath = get().projectPath

      // 1. Save current project's terminal state (if exists)
      if (oldProjectPath && oldProjectPath.trim() !== '') {
        console.log('[AppStore] Saving terminal state for previous project:', oldProjectPath)
        try {
          await get().saveTerminalState(oldProjectPath)
        } catch (error) {
          console.warn('[AppStore] Failed to save terminal state for previous project:', error)
          // Continue with project switch even if save fails
        }
      }

      // 2. Clear all current terminal instances and state
      console.log('[AppStore] Clearing all terminal instances')
      try {
        get().clearAll()
      } catch (error) {
        console.warn('[AppStore] Failed to clear terminals:', error)
        // Continue with project switch
      }

      // 3. Update project state atomically
      console.log('[AppStore] Updating project state')
      set({
        currentProject: { ...newProject, path: normalizedPath },
        projectPath: normalizedPath,
        projectSettings: { ...initialProjectSettings, ...newProject.settings },
        // Reset related UI state
        selectedCheckpoint: null,
        sidebarTab: 'files',
        terminalMode: 'welcome'
      })

      // 4. Load new project's terminal state and restore sessions
      console.log('[AppStore] Loading terminal state for new project:', normalizedPath)
      try {
        await get().loadTerminalState(normalizedPath)
        await get().restoreTerminalSessions()
      } catch (error) {
        console.warn('[AppStore] Failed to restore terminal state:', error)
        // Continue - user can manually create terminals
      }

      // Persistence is now handled automatically by persist middleware

      operationSuccessful = true
      console.log('[AppStore] Project switch completed successfully')
    } catch (error) {
      console.error('[AppStore] Error during project switch:', error)
      
      // Failsafe: If operation failed, try to restore a minimal state
      if (!operationSuccessful) {
        console.log('[AppStore] Attempting to restore minimal state after failure')
        try {
          set({
            currentProject: null,
            projectPath: '',
            selectedCheckpoint: null,
            terminalMode: 'welcome'
          })
        } catch (failsafeError) {
          console.error('[AppStore] Failsafe state restoration also failed:', failsafeError)
        }
      }
      
      throw error
    }
  },

  setProjectPath: (path: string) => {
    // Validate and normalize the project path
    if (!path || path.trim() === '') {
      console.warn('[AppStore] Invalid project path:', path)
      return
    }

    const normalizedPath = path.trim()
    const currentPath = get().projectPath

    // Prevent redundant updates
    if (normalizedPath === currentPath) {
      console.log('[AppStore] Project path unchanged, skipping update:', normalizedPath)
      return
    }

    console.log('[AppStore] Setting project path:', { 
      from: currentPath, 
      to: normalizedPath 
    })

    set({ projectPath: normalizedPath })
    // Persistence is now handled automatically by persist middleware
  },

  updateProjectSettings: (settings: Partial<ProjectSettings>) => {
    set((state) => ({
      projectSettings: { ...state.projectSettings, ...settings }
    }))
    // Persistence is now handled automatically by persist middleware
  },

  setSelectedCheckpoint: (checkpoint: string | null) => {
    set({ selectedCheckpoint: checkpoint })
  },

  setCheckpointHistory: (history: CheckpointInfo[]) => {
    set({ checkpointHistory: history })
  },

  resetProject: () => {
    console.log('[AppStore] Resetting project state')
    
    // Clear all terminals first
    get().clearAll()
    
    // Reset project state
    set({
      currentProject: null,
      projectPath: '',
      projectSettings: initialProjectSettings,
      selectedCheckpoint: null,
      checkpointHistory: [],
      sidebarTab: 'files',
      sidebarCollapsed: false,
      terminalMode: 'welcome'
    })
    
    // Persistence clearing is now handled automatically by persist middleware
  },

  // Persistence is now handled automatically by persist middleware
})