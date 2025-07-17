import React, { useEffect } from 'react'
import clsx from 'clsx'

// Import our new components
import { ProjectInfoSidebar } from './ProjectInfoSidebar'
import { TerminalContainer } from './TerminalContainer'
import { ProjectHeader } from './ProjectHeader'

// Import project state management
import { 
  useProject, 
  useCheckpoints, 
  useUI,
  useTerminalMode,
  type Project
} from '@/lib/projectState'

interface ProjectWorkspaceProps {
  project?: Project
  initialProjectPath?: string
  onProjectSelect?: (project: Project) => void
  onNewProject?: () => void
  className?: string
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  project,
  initialProjectPath = '',
  onProjectSelect,
  onNewProject,
  className,
}) => {
  // Use project state management hooks
  const { currentProject, projectPath, setProject, setProjectPath } = useProject()
  const { selectedCheckpoint, setSelectedCheckpoint } = useCheckpoints()
  const { sidebarTab, setSidebarTab } = useUI()
  const { terminalMode: _mode } = useTerminalMode()
  
  // Local state
  
  // Initialize project state
  useEffect(() => {
    console.log('[ProjectWorkspace] Initializing project state:')
    console.log('[ProjectWorkspace] project:', project)
    console.log('[ProjectWorkspace] initialProjectPath:', initialProjectPath)
    console.log('[ProjectWorkspace] current projectPath:', projectPath)
    
    if (project) {
      console.log('[ProjectWorkspace] Setting project from prop:', project.path)
      setProject(project)
    } else if (initialProjectPath) {
      console.log('[ProjectWorkspace] Setting projectPath from initialProjectPath:', initialProjectPath)
      setProjectPath(initialProjectPath)
    }
  }, [project, initialProjectPath, setProject, setProjectPath, projectPath])

  const handleCheckpointRestore = async (commitHash: string) => {
    try {
      const result = await window.electronAPI.gitCheckpoint.checkout(projectPath, commitHash)
      if (result.success) {
        setSelectedCheckpoint(commitHash)
        setSidebarTab('timeline')
      } else {
        console.error('Failed to restore checkpoint:', result.error)
      }
    } catch (error) {
      console.error('Error restoring checkpoint:', error)
    }
  }

  const handleCheckpointCreate = async (description: string) => {
    try {
      const result = await window.electronAPI.gitCheckpoint.createCheckpoint(projectPath, description)
      if (result.success) {
        console.log('Checkpoint created successfully:', result)
        // Force refresh of timeline by switching to timeline tab and triggering state update
        setSidebarTab('timeline')
        
        // Create a small delay to ensure the timeline component is rendered
        // then trigger a refresh by updating the key of the component
        setTimeout(() => {
          // Force re-render of the ProjectInfoSidebar which will refresh the timeline
          if (currentProject) {
            const updatedProject = { ...currentProject, updated_at: Date.now() }
            setProject(updatedProject)
          }
        }, 100)
      } else {
        console.error('Failed to create checkpoint:', result.error)
      }
    } catch (error) {
      console.error('Error creating checkpoint:', error)
    }
  }

  const handleCheckpointDelete = async (branchName: string) => {
    try {
      const result = await window.electronAPI.gitCheckpoint.deleteBranch(projectPath, branchName)
      if (result.success) {
        console.log('Branch deleted successfully:', branchName)
        // Refresh will be handled by ProjectInfoSidebar
      } else {
        console.error('Failed to delete branch:', result.error)
      }
    } catch (error) {
      console.error('Error deleting branch:', error)
    }
  }

  const handleProjectSelect = (newProject: Project) => {
    setProject(newProject)
    if (onProjectSelect) {
      onProjectSelect(newProject)
    }
  }

  const handleNewProject = () => {
    if (onNewProject) {
      onNewProject()
    }
  }

  const handleOpenFolder = () => {
    // This will be handled by the ProjectHeader component itself
  }

  return (
    <div className={clsx("flex h-full bg-background text-foreground flex-col", className)}>
      {/* Project Header */}
      <ProjectHeader
        currentProject={currentProject || undefined}
        onProjectSelect={handleProjectSelect}
        onNewProject={handleNewProject}
        onOpenFolder={handleOpenFolder}
        className="flex-shrink-0"
      />
      
      {/* Two-Column Layout */}
      <div className="w-full flex-1 flex">
        {/* Left Sidebar - Project Info & Context */}
        <ProjectInfoSidebar
          key={`project-${currentProject?.id || 'none'}-${currentProject?.updated_at || 0}`}
          project={currentProject || undefined}
          projectPath={projectPath}
          selectedCheckpoint={selectedCheckpoint}
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          onCheckpointCreate={handleCheckpointCreate}
          onCheckpointRestore={handleCheckpointRestore}
          onCheckpointDelete={handleCheckpointDelete}
          className="flex-shrink-0"
        />
        
        {/* Right Main Area - Terminal */}
        <div 
          className="flex-1 overflow-hidden flex flex-col"
        >
          <TerminalContainer
            projectPath={projectPath}
            project={currentProject || undefined}
            className="flex-1"
          />
        </div>
      </div>
    </div>
  )
}