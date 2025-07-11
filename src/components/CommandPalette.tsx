import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { 
  Settings, 
  BarChart3, 
  FolderOpen, 
  Download, 
  BookOpen, 
  MessageSquare, 
  Search,
  FileText,
  Network,
  Pin,
  Folder
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
  onNavigate: (view: 'welcome' | 'settings' | 'usage-dashboard' | 'mcp' | 'claude-session' | 'editor' | 'claude-editor' | 'claude-file-editor') => void
  onSelectProject: (projectPath: string) => void
  onOpenFolder: () => void
  onImportProjects: () => void
  onRefresh?: (refreshFunction: () => Promise<void>) => void
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
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  onNavigate,
  onSelectProject,
  onOpenFolder,
  onImportProjects,
  onRefresh,
  className = ''
}) => {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // Load projects for recent projects commands
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true)
      const response = await window.electronAPI.projectManagement.listProjects()
      
      if (response.success && Array.isArray(response.data)) {
        setProjects(response.data)
      } else {
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

  // Handle project selection
  const handleProjectSelect = useCallback(async (project: Project) => {
    try {
      await window.electronAPI.projectManagement.openProject(project.id)
      onSelectProject(project.path)
    } catch (err) {
      console.error('Failed to open project:', err)
      // Still navigate even if update fails
      onSelectProject(project.path)
    }
  }, [onSelectProject])

  // Handle external links
  const handleExternalLink = useCallback((url: string) => {
    window.electronAPI.openExternal(url)
  }, [])

  // Define all commands
  const commands: CommandItem[] = [
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
    {
      id: 'usage',
      label: 'View Usage Statistics',
      description: 'View token usage and API statistics dashboard',
      icon: <BarChart3 className="h-4 w-4" />,
      shortcut: '⌘U',
      group: 'General',
      action: () => onNavigate('usage-dashboard'),
      keywords: ['usage', 'statistics', 'stats', 'dashboard', 'tokens', 'api']
    },
    {
      id: 'claude-editor',
      label: 'CLAUDE.md Editor',
      description: 'Edit CLAUDE.md configuration files',
      icon: <FileText className="h-4 w-4" />,
      group: 'General',
      action: () => onNavigate('editor'),
      keywords: ['claude', 'md', 'editor', 'markdown', 'config', 'system', 'prompt']
    },
    {
      id: 'mcp',
      label: 'MCP Server Management',
      description: 'Manage Model Context Protocol servers',
      icon: <Network className="h-4 w-4" />,
      group: 'General',
      action: () => onNavigate('mcp'),
      keywords: ['mcp', 'server', 'protocol', 'model', 'context']
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
      action: () => handleExternalLink('https://docs.anthropic.com/en/docs/claude-code'),
      keywords: ['docs', 'documentation', 'help', 'guide', 'manual']
    },
    {
      id: 'feedback',
      label: 'Submit Feedback',
      description: 'Report issues or submit feature requests',
      icon: <MessageSquare className="h-4 w-4" />,
      group: 'Help',
      action: () => handleExternalLink('https://github.com/anthropics/claude-code/issues'),
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
      keywords: [project.name, project.path, 'project', 'recent', 'folder']
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
  const groupOrder = ['Project Management', 'Recent Projects', 'General', 'Help']

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
    </motion.div>
  )
}