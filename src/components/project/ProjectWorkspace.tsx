import React from 'react'
import clsx from 'clsx'

// Import our new components
import {ProjectInfoSidebar} from './ProjectInfoSidebar'
import {TerminalContainer} from '@/components/terminal'
import {ProjectHeader} from './ProjectHeader'

// Import unified state management
import {
  useProject,
  useCheckpoints,
  useUI,
  useTerminalMode,
  type Project
} from '@/store'

interface ProjectWorkspaceProps {
  onProjectSelect?: (project: Project) => void
  onNewProject?: () => void
  className?: string
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
                                                                    onProjectSelect,
                                                                    onNewProject,
                                                                    className,
                                                                  }) => {
  // Use project state management hooks - no longer need to sync with props
  const {currentProject, projectPath} = useProject()
  const {selectedCheckpoint, setSelectedCheckpoint} = useCheckpoints()
  const {sidebarTab, setSidebarTab} = useUI()
  const {terminalMode: _mode} = useTerminalMode()

  // No more useEffect for syncing props to state - state is managed entirely by store

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

        // Timeline will automatically refresh through ProjectInfoSidebar
        // No need to update project state as it causes infinite loops
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
    // Validate project data before setting
    if (!newProject || !newProject.path || newProject.path.trim() === '') {
      console.error('[ProjectWorkspace] Invalid project selected:', newProject)
      return
    }
    
    // Let parent handle the project selection - it will call store methods
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
          key={`project-${currentProject?.id || 'none'}`}
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