import React, { useRef } from 'react'
import clsx from 'clsx'

// Import our new components
import {ProjectInfoSidebar} from './ProjectInfoSidebar'
import {TerminalContainer} from '@/components/terminal'
import {ProjectHeader} from './ProjectHeader'

// Import unified state management
import {
  useAppStore,
  type Project
} from '@/store'

// Import timeline ref type
import type { CheckpointTimelineRef } from '@/components/checkpoint-timeline/CheckpointTimeline'

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
  // Use project state management - no longer need to sync with props
  const currentProject = useAppStore((state) => state.currentProject)
  const projectPath = useAppStore((state) => state.projectPath)
  const selectedCheckpoint = useAppStore((state) => state.selectedCheckpoint)
  const setSelectedCheckpoint = useAppStore((state) => state.setSelectedCheckpoint)
  const sidebarTab = useAppStore((state) => state.sidebarTab)
  const setSidebarTab = useAppStore((state) => state.setSidebarTab)

  // Timeline ref to access refresh method
  const timelineRef = useRef<CheckpointTimelineRef>(null)

  // No more useEffect for syncing props to state - state is managed entirely by store

  const handleCheckpointRestore = async (commitHash: string) => {
    try {
      const result = await window.electronAPI.checkpoint.checkout(projectPath, commitHash)
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
      const result = await window.electronAPI.checkpoint.createCheckpoint(projectPath, description)
      if (result.success) {
        console.log('Checkpoint created successfully:', result)
        // Switch to timeline tab
        setSidebarTab('timeline')
        
        // Refresh the timeline to show the new checkpoint
        timelineRef.current?.refreshTimeline()
      } else {
        console.error('Failed to create checkpoint:', result.error)
      }
    } catch (error) {
      console.error('Error creating checkpoint:', error)
    }
  }

  const handleCheckpointDelete = async (commitHash: string) => {
    try {
      const result = await window.electronAPI.checkpoint.deleteCheckpoint(projectPath, commitHash)
      if (result.success) {
        console.log('Checkpoint deleted successfully:', result)
        // Refresh the timeline to reflect the deletion
        timelineRef.current?.refreshTimeline()
      } else {
        console.error('Failed to delete checkpoint:', result.error)
      }
    } catch (error) {
      console.error('Error deleting checkpoint:', error)
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
          timelineRef={timelineRef}
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