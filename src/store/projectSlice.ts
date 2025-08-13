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
  customPromptTemplate: string
  excludePatterns: string[]
  includePatterns: string[]
  maxHistoryLength: number
  enableDebugMode: boolean
  terminalShell?: string
}


// Project slice state
export interface ProjectSlice {
  // Project info
  currentProject: Project | null
  projectPath: string
  projectSettings: ProjectSettings
  
  // Project actions
  setProject: (project: Project) => Promise<void>
  setProjectPath: (path: string) => void
  updateProjectSettings: (settings: Partial<ProjectSettings>) => void
  resetProject: () => void
  
  // Persistence is now handled automatically by persist middleware
}

// Initial project settings
const initialProjectSettings: ProjectSettings = {
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

  // Pure atomic project switching - uses workspace:save + workspace:load
  setProject: async (newProject: Project) => {
    // Validate project data first
    if (!newProject || !newProject.path || newProject.path.trim() === '') {
      console.error('[AppStore] Invalid project data provided:', newProject)
      throw new Error('Invalid project data: missing path')
    }

    const currentProject = get().currentProject

    // Skip if the project is already selected
    if (currentProject?.id === newProject.id) {
      console.log('[AppStore] Project already selected, skipping switch:', newProject.name)
      return
    }

    console.log('[AppStore] Starting pure atomic project switch:', { 
      from: currentProject?.name || 'none', 
      to: newProject.name 
    })

    try {
      // Step 1: Save current project state (if exists)
      if (currentProject?.id) {
        console.log(`[AppStore] Saving current project state: ${currentProject.name}`)
        // Use saveTerminalState to collect and send terminal serialization states
        await get().saveTerminalState(currentProject.id)
        console.log(`[AppStore] ✅ Saved current project state with terminal serialization`)
      }

      // Step 2: Load new project state
      console.log(`[AppStore] Loading new project state: ${newProject.name}`)
      const result = await window.electronAPI.workspace.load(newProject.id)

      if (!result.success) {
        throw new Error(result.error || 'Workspace load failed')
      }

      const { terminals, activeTerminalId, project, terminalStates } = result.data

      console.log(`[AppStore] ✅ Loaded project: ${terminals.length} terminals restored`)

      // Step 3: Batch register WebContents for all terminals
      if (terminals && terminals.length > 0) {
        console.log(`[AppStore] 🔗 Registering WebContents for ${terminals.length} terminals...`)
        for (const terminal of terminals) {
          try {
            await window.electronAPI.terminal.registerWebContents(terminal.id)
            console.log(`[AppStore] ✅ WebContents registered for terminal: ${terminal.id}`)
          } catch (error) {
            console.error(`[AppStore] ❌ Failed to register WebContents for terminal ${terminal.id}:`, error)
          }
        }
        console.log(`[AppStore] 🎉 WebContents registration complete`)
      }

      // Step 4: Apply complete state atomically
      set({
        currentProject: project,
        projectPath: project.path,
        projectSettings: { ...initialProjectSettings, ...project.settings },
        // Reset related UI state
        sidebarTab: 'files',
        terminalMode: terminals.length > 0 ? 'active' : 'welcome'
      })

      // Step 5: Apply terminal state with all data
      const setWorkspaceState = get().setWorkspaceState
      if (setWorkspaceState) {
        setWorkspaceState({
          terminals: terminals,
          activeTerminalId: activeTerminalId,
          terminalStates: terminalStates
        })
      } else {
        console.warn('[AppStore] setWorkspaceState action not available, terminals may not be properly restored')
      }

      console.log('[AppStore] ✅ Pure atomic project switch completed successfully')
    } catch (error) {
      console.error('[AppStore] Error during pure atomic project switch:', error)
      
      // Failsafe: Reset to minimal state on failure
      try {
        set({
          currentProject: null,
          projectPath: '',
          terminalMode: 'welcome'
        })
      } catch (failsafeError) {
        console.error('[AppStore] Failsafe state restoration also failed:', failsafeError)
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


  resetProject: () => {
    console.log('[AppStore] Resetting project state')
    
    // Clear all terminals first
    get().clearAll()
    
    // Reset project state
    set({
      currentProject: null,
      projectPath: '',
      projectSettings: initialProjectSettings,
      sidebarTab: 'files',
      sidebarCollapsed: false,
      terminalMode: 'welcome'
    })
    
    // Persistence clearing is now handled automatically by persist middleware
  },

  // Persistence is now handled automatically by persist middleware
})