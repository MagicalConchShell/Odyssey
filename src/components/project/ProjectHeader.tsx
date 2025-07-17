import React, { useState, useEffect } from 'react'
import { ChevronDown, Folder, Pin, Plus, RefreshCw } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { type Project } from './lib/projectState'

interface ProjectHeaderProps {
  currentProject?: Project
  onProjectSelect: (project: Project) => void
  onNewProject: () => void
  onOpenFolder: () => void
  className?: string
}

export const ProjectHeader: React.FC<ProjectHeaderProps> = ({
  currentProject,
  onProjectSelect,
  onNewProject,
  onOpenFolder,
  className
}) => {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadProjects = async () => {
    try {
      setIsLoading(true)
      const result = await window.electronAPI.projectManagement.listProjects()
      if (result.success) {
        // Sort: pinned first, then by last_opened
        const sortedProjects = result.data.sort((a: Project, b: Project) => {
          if (a.is_pinned && !b.is_pinned) return -1
          if (!a.is_pinned && b.is_pinned) return 1
          return b.last_opened - a.last_opened
        })
        setProjects(sortedProjects.slice(0, 10)) // Show up to 10 recent projects
      }
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  const handleProjectSelect = async (project: Project) => {
    try {
      // Update last_opened time in database
      await window.electronAPI.projectManagement.openProject(project.id)
      onProjectSelect(project)
      // Refresh project list to update order
      loadProjects()
    } catch (error) {
      console.error('Failed to select project:', error)
    }
  }

  const handleOpenFolder = async () => {
    try {
      const result = await window.electronAPI.projectManagement.openFolder()
      if (result.success && result.data) {
        onProjectSelect(result.data)
        loadProjects()
      }
    } catch (error) {
      console.error('Failed to open folder:', error)
      onOpenFolder()
    }
  }

  const getProjectDisplayName = (project: Project) => {
    if (project.name) return project.name
    // Extract folder name from path
    const parts = project.path.split(/[/\\]/)
    return parts[parts.length - 1] || project.path
  }

  const formatProjectPath = (path: string) => {
    // Shorten long paths for display
    const maxLength = 60
    if (path.length <= maxLength) return path
    
    const parts = path.split(/[/\\]/)
    if (parts.length <= 2) return path
    
    return `.../${parts.slice(-2).join('/')}`
  }

  return (
    <div className={`flex items-center gap-2 px-4 py-2 bg-background border-b border-border ${className}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            className="flex items-center gap-2 h-8 px-3 text-sm font-medium hover:bg-accent"
          >
            <Folder className="h-4 w-4" />
            <span className="truncate max-w-[200px]">
              {currentProject ? getProjectDisplayName(currentProject) : 'Select Project'}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel className="flex items-center justify-between">
            Recent Projects
            <Button
              variant="ghost"
              size="sm"
              onClick={loadProjects}
              disabled={isLoading}
              className="h-6 w-6 p-0"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {projects.length > 0 ? (
            projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => handleProjectSelect(project)}
                className="flex flex-col items-start gap-1 p-3 cursor-pointer"
              >
                <div className="flex items-center gap-2 w-full">
                  {project.is_pinned ? (
                    <Pin className="h-4 w-4 text-primary" />
                  ) : (
                    <Folder className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium truncate flex-1">
                    {getProjectDisplayName(project)}
                  </span>
                  {project.type === 'claude-imported' && (
                    <Badge variant="secondary" className="text-xs">Claude</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground pl-6 w-full">
                  {formatProjectPath(project.path)}
                </div>
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled className="text-center text-muted-foreground">
              No recent projects
            </DropdownMenuItem>
          )}
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={handleOpenFolder} className="flex items-center gap-2">
            <Folder className="h-4 w-4" />
            Open Folder...
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={onNewProject} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Project...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      {currentProject && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>•</span>
          <span className="truncate max-w-[300px]">
            {formatProjectPath(currentProject.path)}
          </span>
          {currentProject.is_pinned && <Pin className="h-3 w-3" />}
        </div>
      )}
    </div>
  )
}