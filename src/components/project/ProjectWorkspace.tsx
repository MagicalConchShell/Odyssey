import React from 'react'
import clsx from 'clsx'

// Import components
import {TerminalContainer} from '@/components/terminal'
import {ProjectHeader} from './ProjectHeader'

// Import unified state management
import {
  useAppStore,
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
  // Use project state management
  const currentProject = useAppStore((state) => state.currentProject)
  const projectPath = useAppStore((state) => state.projectPath)

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

      {/* Main Terminal Area */}
      <div className="flex-1 overflow-hidden">
        <TerminalContainer
          projectPath={projectPath}
          project={currentProject || undefined}
          className="h-full"
        />
      </div>
    </div>
  )
}