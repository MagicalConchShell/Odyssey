import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { 
  Settings, 
 
  FolderOpen, 
  Download, 
  BookOpen, 
  MessageSquare, 
  Search,
  Pin,
  Folder,
  Trash2
} from 'lucide-react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface Project {
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
}

interface CommandPaletteProps {
  onNavigate: (view: 'welcome' | 'settings' | 'project-workspace') => void
  onSelectProject: (project: Project) => void
  onOpenFolder: () => void
  onImportProjects: () => void
  onRefresh?: (refreshFunction: () => Promise<void>) => void
  currentView?: 'welcome' | 'settings' | 'project-workspace'
  className?: string
}

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  shortcut?: string
  group: string
  action: () => void
  keywords?: string[]
  project?: Project // Add project reference for context menu
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  onNavigate,
  onSelectProject,
  onOpenFolder,
  onImportProjects,
  onRefresh,
  currentView = 'welcome',
  className = ''
}) => {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    show: boolean
    x: number
    y: number
    project: Project | null
  }>({ show: false, x: 0, y: 0, project: null })

  // Load projects for recent projects commands
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true)
      const response = await window.electronAPI.project.listProjects()
      
      if (response.success && Array.isArray(response.data)) {
        // Filter out any invalid projects
        const validProjects = response.data.filter((project: Project) => 
          project && project.id && project.name && project.path
        )
        setProjects(validProjects)
        
        if (validProjects.length !== response.data.length) {
          console.warn(`Filtered out ${response.data.length - validProjects.length} invalid projects from command palette`)
        }
      } else {
        console.error('Invalid project list response in command palette:', response)
        setProjects([])
      }
    } catch (err) {
      console.error('Failed to load projects:', err)
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // Pass the refresh function to the parent component
  useEffect(() => {
    if (onRefresh) {
      onRefresh(loadProjects)
    }
  }, [onRefresh, loadProjects])

  // Handle project selection - delegates to store
  const handleProjectSelect = useCallback(async (project: Project) => {
    try {
      // Delegate to parent component which uses store's setProject
      onSelectProject(project)
    } catch (err) {
      console.error('Failed to select project:', err)
    }
  }, [onSelectProject])

  // Handle external links
  const handleExternalLink = useCallback((url: string) => {
    window.electronAPI.openExternal(url)
  }, [])

  // Handle project deletion
  const handleDeleteProject = useCallback((project: Project) => {
    setProjectToDelete(project)
    setDeleteDialogOpen(true)
  }, [])

  const confirmDeleteProject = useCallback(async () => {
    if (!projectToDelete) return

    try {
      setDeleting(true)
      const response = await window.electronAPI.project.deleteProject(projectToDelete.id)
      
      if (response.success) {
        toast.success(`Project "${projectToDelete.name}" deleted`)
        // Refresh project list
        await loadProjects()
      } else {
        throw new Error(response.error || 'Failed to delete project')
      }
    } catch (err) {
      console.error('Failed to delete project:', err)
      toast.error(`Failed to delete project: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setProjectToDelete(null)
    }
  }, [projectToDelete, loadProjects])

  const cancelDeleteProject = useCallback(() => {
    setDeleteDialogOpen(false)
    setProjectToDelete(null)
  }, [])

  // Handle context menu
  const handleProjectContextMenu = useCallback((event: React.MouseEvent, project: Project) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({
      show: true,
      x: event.clientX,
      y: event.clientY,
      project
    })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu({ show: false, x: 0, y: 0, project: null })
  }, [])

  const handleContextMenuDelete = useCallback(() => {
    if (contextMenu.project) {
      handleDeleteProject(contextMenu.project)
    }
    closeContextMenu()
  }, [contextMenu.project, handleDeleteProject, closeContextMenu])

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.show) {
        closeContextMenu()
      }
    }
    
    if (contextMenu.show) {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeContextMenu()
        }
      })
    }

    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu.show, closeContextMenu])

  // Define all commands
  const commands: CommandItem[] = [
    // Navigation Commands (context-aware)
    ...(currentView !== 'welcome' ? [{
      id: 'go-home',
      label: 'Go to Home',
      description: 'Return to the main screen',
      icon: <FolderOpen className="h-4 w-4" />,
      shortcut: '⌘H',
      group: 'Navigation',
      action: () => onNavigate('welcome'),
      keywords: ['home', 'welcome', 'main', 'back']
    }] : []),
    
    // General Commands
    {
      id: 'settings',
      label: 'Go to Settings',
      description: 'Open application settings and preferences',
      icon: <Settings className="h-4 w-4" />,
      shortcut: '⌘,',
      group: 'General',
      action: () => onNavigate('settings'),
      keywords: ['settings', 'config', 'preferences', 'options']
    },

    // Project Management Commands
    {
      id: 'open-folder',
      label: 'Open Project...',
      description: 'Browse and open a project directory',
      icon: <FolderOpen className="h-4 w-4" />,
      shortcut: '⌘O',
      group: 'Project Management',
      action: onOpenFolder,
      keywords: ['open', 'folder', 'project', 'directory', 'browse']
    },
    {
      id: 'import-projects',
      label: 'Import Claude Projects',
      description: 'Scan and import existing Claude projects',
      icon: <Download className="h-4 w-4" />,
      group: 'Project Management',
      action: onImportProjects,
      keywords: ['import', 'claude', 'projects', 'scan', 'existing']
    },

    // Help Commands
    {
      id: 'documentation',
      label: 'View Documentation',
      description: 'Open official documentation in browser',
      icon: <BookOpen className="h-4 w-4" />,
      shortcut: 'F1',
      group: 'Help',
      action: () => handleExternalLink('https://github.com/MagicalConchShell/Odyssey'),
      keywords: ['docs', 'documentation', 'help', 'guide', 'manual']
    },
    {
      id: 'feedback',
      label: 'Submit Feedback',
      description: 'Report issues or submit feature requests',
      icon: <MessageSquare className="h-4 w-4" />,
      group: 'Help',
      action: () => handleExternalLink('https://github.com/MagicalConchShell/Odyssey/issues'),
      keywords: ['feedback', 'issue', 'bug', 'report', 'feature', 'request']
    }
  ]

  // Generate recent project commands
  const recentProjectCommands: CommandItem[] = projects
    .filter(project => project.last_opened > 0)
    .sort((a, b) => {
      // Sort by pinned first, then by last opened
      if (a.is_pinned && !b.is_pinned) return -1
      if (!a.is_pinned && b.is_pinned) return 1
      return b.last_opened - a.last_opened
    })
    .slice(0, 8) // Limit to 8 most recent projects
    .map(project => ({
      id: `project-${project.id}`,
      label: project.name,
      description: project.path,
      icon: project.is_pinned ? <Pin className="h-4 w-4 text-primary" /> : <Folder className="h-4 w-4" />,
      group: 'Recent Projects',
      action: () => handleProjectSelect(project),
      keywords: [project.name, project.path, 'project', 'recent', 'folder'],
      project: project // Add project reference for context menu
    }))

  // Combine all commands
  const allCommands = [...commands, ...recentProjectCommands]

  // Group commands by their group property
  const groupedCommands = allCommands.reduce((acc, command) => {
    if (!acc[command.group]) {
      acc[command.group] = []
    }
    acc[command.group].push(command)
    return acc
  }, {} as Record<string, CommandItem[]>)

  // Define group order
  const groupOrder = ['Navigation', 'Project Management', 'Recent Projects', 'General', 'Help']

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`w-full max-w-2xl mx-auto ${className}`}
    >
      <Command className="rounded-lg border shadow-md bg-background">
        <CommandInput 
          placeholder="Search commands or open projects..." 
          className="border-0"
        />
        <CommandList className="max-h-[400px]">
          <CommandEmpty>
            <div className="flex flex-col items-center space-y-3 py-6">
              <Search className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">No commands found</p>
                <p className="text-xs text-muted-foreground">Try searching with different keywords</p>
              </div>
            </div>
          </CommandEmpty>
          
          {groupOrder.map((groupName, index) => {
            const groupCommands = groupedCommands[groupName]
            if (!groupCommands || groupCommands.length === 0) return null
            
            return (
              <React.Fragment key={groupName}>
                {index > 0 && <CommandSeparator />}
                <CommandGroup heading={groupName}>
                  {groupCommands.map((command) => (
                    <CommandItem
                      key={command.id}
                      onSelect={() => command.action()}
                      onContextMenu={command.project ? (e) => handleProjectContextMenu(e, command.project!) : undefined}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center space-x-3 flex-1">
                        {command.icon}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{command.label}</div>
                          {command.description && (
                            <div className="text-xs text-muted-foreground truncate">
                              {command.description}
                            </div>
                          )}
                        </div>
                      </div>
                      {command.shortcut && (
                        <CommandShortcut>{command.shortcut}</CommandShortcut>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </React.Fragment>
            )
          })}
          
          {loading && (
            <CommandGroup heading="Loading">
              <CommandItem disabled>
                <div className="flex items-center space-x-3">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
                  <span>Loading projects...</span>
                </div>
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>

      {/* Delete Project Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete project "<strong>{projectToDelete?.name}</strong>"?
              <br />
              <span className="text-muted-foreground text-xs mt-2 block">
                Path: {projectToDelete?.path}
              </span>
              <br />
              This will only remove the project from Odyssey, actual files will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDeleteProject} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteProject} disabled={deleting}>
              {deleting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Context Menu */}
      {contextMenu.show && (
        <div
          className="fixed z-50 min-w-[180px] bg-background border rounded-md shadow-lg py-1"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleContextMenuDelete}
            className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-accent hover:text-destructive flex items-center space-x-2"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete Project</span>
          </button>
        </div>
      )}
    </motion.div>
  )
}