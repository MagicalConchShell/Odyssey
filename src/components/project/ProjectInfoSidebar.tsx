import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  FolderOpen,
  GitBranch,
  Settings,
  Loader2,
  AlertCircle,
  Plus,
  ChevronsDownUp,
  ChevronsUpDown
} from 'lucide-react'
import clsx from 'clsx'

// Import existing components
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

// Import timeline and file components
import { CheckpointTimeline, type CheckpointTimelineRef } from '../checkpoint-timeline/CheckpointTimeline'
import { FileTree } from '@/components/ui/FileTree'
import { useFileTreeStore, TreeNode } from '@/components/ui/hooks/useFileTreeStore'

// Types
import type { Project, ProjectSettings } from '@/store'
import type { FileSystemChangeEvent } from '@/types/electron'
import type { FileNode } from '../../../electron/handlers/types'

interface ProjectInfoSidebarProps {
  project?: Project
  projectPath: string
  selectedCheckpoint?: string | null
  activeTab: 'timeline' | 'files' | 'settings'
  onTabChange: (tab: 'timeline' | 'files' | 'settings') => void
  onCheckpointCreate?: (description: string) => Promise<void>
  onCheckpointRestore?: (commitHash: string) => Promise<void>
  onCheckpointDelete?: (commitHash: string) => Promise<void>
  timelineRef?: React.RefObject<CheckpointTimelineRef>
  className?: string
}

export const ProjectInfoSidebar: React.FC<ProjectInfoSidebarProps> = ({
  project,
  projectPath,
  selectedCheckpoint: _selectedCheckpoint,
  timelineRef,
  activeTab,
  onTabChange,
  onCheckpointCreate,
  onCheckpointRestore,
  onCheckpointDelete,
  className
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [projectFiles, setProjectFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recentlyChangedFiles, setRecentlyChangedFiles] = useState<Set<string>>(new Set())
  
  // Checkpoint dialog state
  const [checkpointDialogOpen, setCheckpointDialogOpen] = useState(false)
  const [checkpointDescription, setCheckpointDescription] = useState('')
  
  // Timeline ref
  const timelineTreeRef = useRef<CheckpointTimelineRef>(null)
  
  // Ref to hold the latest loadProjectFiles function
  const loadProjectFilesRef = useRef<() => Promise<void>>()
  
  // Ref to track current projectPath for proper cleanup
  const projectPathRef = useRef<string>(projectPath)
  
  // Refs to track current values for event handler
  const activeTabRef = useRef<string>(activeTab)
  
  // File tree store - updated for lazy loading
  const { expandAll, collapseAll, addNode, addChildren, reset: resetFileTree, setNodeLoading } = useFileTreeStore()

  // Project settings state
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({
    autoCheckpoint: true,
    checkpointInterval: 5,
    customPromptTemplate: '',
    excludePatterns: ['.git', 'node_modules', '.env', '*.log'],
    includePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.md'],
    maxHistoryLength: 1000,
    enableDebugMode: false,
    terminalShell: undefined
  })

  // Fixed sidebar widths
  const collapsedWidth = 64
  const expandedWidth = 320
  const currentWidth = isCollapsed ? collapsedWidth : expandedWidth

  // Function to add a file to recently changed and auto-remove after timeout
  const addRecentlyChangedFile = useCallback((filePath: string) => {
    setRecentlyChangedFiles(prev => new Set(prev).add(filePath))
    
    // Remove the file from recently changed after 3 seconds
    setTimeout(() => {
      setRecentlyChangedFiles(prev => {
        const newSet = new Set(prev)
        newSet.delete(filePath)
        return newSet
      })
    }, 3000)
  }, [])

  // Ref to track addRecentlyChangedFile function
  const addRecentlyChangedFileRef = useRef<(filePath: string) => void>(addRecentlyChangedFile)

  // File tree expansion handlers - updated for new store structure
  const handleExpandAll = useCallback(() => {
    const { nodes } = useFileTreeStore.getState()
    const allDirectoryPaths = Object.keys(nodes).filter(path => nodes[path].type === 'directory')
    expandAll(allDirectoryPaths)
  }, [expandAll])

  const handleCollapseAll = useCallback(() => {
    collapseAll()
  }, [collapseAll])

  // Convert FileNode to TreeNode format
  const convertFileNodeToTreeNode = useCallback((fileNode: FileNode, parentPath?: string, level: number = 0): TreeNode => {
    // Validate required fileNode properties
    if (!fileNode || !fileNode.path || typeof fileNode.path !== 'string') {
      console.warn('[ProjectInfoSidebar] Invalid FileNode path:', fileNode)
      return {
        id: `invalid-${Date.now()}-${Math.random()}`,
        name: 'Invalid Item',
        type: 'file',
        level,
        parentId: parentPath,
        isExpanded: false,
        isLoading: false,
        isExpandable: false,
        size: 0,
        modified: undefined,
      }
    }

    return {
      id: fileNode.path,
      name: fileNode.name || fileNode.path.split('/').pop() || 'Unknown',
      type: fileNode.type || 'file',
      level,
      parentId: parentPath,
      isExpanded: false,
      isLoading: false,
      isExpandable: fileNode.isExpandable || false,
      size: fileNode.size,
      modified: fileNode.modified,
    }
  }, [])

  // Handle lazy loading of directory children
  const handleNodeExpand = useCallback(async (path: string) => {
    if (!projectPath) return

    setNodeLoading(path, true)

    try {
      console.log('[ProjectInfoSidebar] Loading children for:', path)
      const result = await window.electronAPI.fileSystem.getDirectoryChildren(path)

      if (result.success && result.data) {
        // Convert FileNodes to TreeNodes
        const parentNode = useFileTreeStore.getState().nodes[path]
        const level = parentNode ? parentNode.level + 1 : 0
        
        const childNodes = result.data.map((fileNode: FileNode) => 
          convertFileNodeToTreeNode(fileNode, path, level)
        )

        // Add children to store
        addChildren(path, childNodes)
        
        console.log('[ProjectInfoSidebar] Added', childNodes.length, 'children to', path)
      } else {
        console.error('[ProjectInfoSidebar] Failed to load directory children:', result.error)
      }
    } catch (err: any) {
      console.error('[ProjectInfoSidebar] Error loading directory children:', err)
    } finally {
      setNodeLoading(path, false)
    }
  }, [projectPath, convertFileNodeToTreeNode, addChildren, setNodeLoading])

  const loadProjectFiles = useCallback(async () => {
    
    if (!projectPath) {
      setError('No project path provided')
      return
    }
    
    if (typeof projectPath !== 'string' || projectPath.trim() === '') {
      setError('Invalid project path')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Reset the file tree store
      resetFileTree()
      
      // Load root directory using new optimized API
      const result = await window.electronAPI.fileSystem.getDirectoryChildren(projectPath)

      if (result.success && result.data) {
        // Convert FileNodes to TreeNodes and add to store
        const rootNodes = result.data.map((fileNode: FileNode) => 
          convertFileNodeToTreeNode(fileNode, undefined, 0)
        )

        // Add root nodes to store
        rootNodes.forEach((node: TreeNode) => addNode(node))
        
        // Set root IDs in store
        const rootIds = rootNodes.map((node: TreeNode) => node.id)
        useFileTreeStore.setState({ rootIds })
        
        // For backward compatibility, also set projectFiles
        // This can be removed once everything uses the new store
        setProjectFiles(result.data)
        
        console.log('[ProjectInfoSidebar] Loaded', rootNodes.length, 'root nodes')
      } else {
        setProjectFiles([])
        if (!result.success) {
          setError(result.error || 'Failed to read directory')
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load project files')
      setProjectFiles([])
    } finally {
      setLoading(false)
    }
  }, [projectPath, resetFileTree, convertFileNodeToTreeNode, addNode])

  // Update the ref whenever loadProjectFiles changes
  useEffect(() => {
    loadProjectFilesRef.current = loadProjectFiles
  }, [loadProjectFiles])

  // Load project files when files tab is active
  useEffect(() => {
    if (activeTab === 'files' && loadProjectFilesRef.current) {
      loadProjectFilesRef.current()
    }
  }, [activeTab])

  // Update refs when values change
  useEffect(() => {
    projectPathRef.current = projectPath
    activeTabRef.current = activeTab
    addRecentlyChangedFileRef.current = addRecentlyChangedFile
  }, [projectPath, activeTab, addRecentlyChangedFile])

  // Start file system watcher when project path changes
  useEffect(() => {
    if (projectPath) {
      window.electronAPI.fileSystem.startFileSystemWatcher(projectPath)
        .then(() => {
          console.log('[ProjectInfoSidebar] File system watcher started successfully')
        })
        .catch((error) => {
          console.error('[ProjectInfoSidebar] Failed to start file system watcher:', error)
        })
    }

    return () => {
      // Use the ref to get the correct projectPath for cleanup
      const pathToCleanup = projectPathRef.current
      if (pathToCleanup) {
        window.electronAPI.fileSystem.stopFileSystemWatcher(pathToCleanup)
          .catch((error) => {
            console.error('[ProjectInfoSidebar] Failed to stop file system watcher:', error)
          })
      }
    }
  }, [projectPath])

  // Listen for file system changes
  useEffect(() => {
    const handleFileSystemChange = (_event: any, changeEvent: FileSystemChangeEvent) => {
      if (changeEvent.projectPath === projectPathRef.current) {
        console.log('[ProjectInfoSidebar] File system change detected:', changeEvent)
        
        // Add visual feedback for the changed file
        addRecentlyChangedFileRef.current(changeEvent.relativePath)
        
        // Only reload if files tab is active to avoid unnecessary work
        if (activeTabRef.current === 'files') {
          // Handle incremental updates based on event type
          switch (changeEvent.eventType) {
            case 'add':
            case 'addDir':
              // For now, reload the entire tree to ensure proper parent-child relationships
              // TODO: Implement smart incremental insertion
              loadProjectFilesRef.current?.()
              break
            
            case 'change':
              // File content changed, we may want to update file metadata (size, modified time)
              // For now, reload to get updated metadata
              loadProjectFilesRef.current?.()
              break
            
            case 'unlink':
            case 'unlinkDir':
              // File or directory was deleted, reload to remove from tree
              // TODO: Implement smart incremental removal
              loadProjectFilesRef.current?.()
              break
            
            default:
              // Unknown event type, reload as fallback
              loadProjectFilesRef.current?.()
              break
          }
        }
      }
    }

    if (window.electronAPI.on) {
      window.electronAPI.on('file-system-changed', handleFileSystemChange)
    }

    return () => {
      if (window.electronAPI.removeListener) {
        window.electronAPI.removeListener('file-system-changed', handleFileSystemChange)
      }
    }
  }, []) // Empty dependency array - using refs for dynamic values

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when not in input fields
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      // Handle Ctrl/Cmd + K for Create Checkpoint
      if ((event.ctrlKey || event.metaKey) && event.key === 'k' && onCheckpointCreate && activeTab === 'timeline') {
        event.preventDefault()
        setCheckpointDialogOpen(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCheckpointCreate, activeTab])

  // Load project settings when settings tab is active
  useEffect(() => {
    if (activeTab === 'settings' && project) {
      loadProjectSettings()
    }
  }, [activeTab, project?.id]) // Use stable project.id instead of project object




  const loadProjectSettings = async () => {
    if (!project) return

    // TODO: Load project-specific settings from database or config file
    // For now, use default settings
    console.log('Loading project settings for:', project.id)
  }

  const saveProjectSettings = async () => {
    if (!project) return

    setLoading(true)
    try {
      // TODO: Save project-specific settings to database or config file
      console.log('Saving project settings:', projectSettings)
      await new Promise(resolve => setTimeout(resolve, 500)) // Simulate save
    } catch (err: any) {
      setError(err.message || 'Failed to save project settings')
    } finally {
      setLoading(false)
    }
  }

  const handleFileClick = (item: any) => {
    // TODO: Implement file preview or open in editor
    console.log('File clicked:', item)
  }

  const handleCreateCheckpoint = () => {
    if (checkpointDescription.trim() && onCheckpointCreate) {
      onCheckpointCreate(checkpointDescription.trim())
      setCheckpointDialogOpen(false)
      setCheckpointDescription('')
    }
  }

  // Handle tab click with toggle collapse functionality
  const handleTabClick = (tab: 'timeline' | 'files' | 'settings') => {
    if (activeTab === tab) {
      // If clicking the currently active tab, collapse the sidebar
      setIsCollapsed(true)
    } else {
      // If clicking a different tab, switch to that tab
      onTabChange(tab)
    }
  }




  return (
    <TooltipProvider>
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: currentWidth, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0.0, 0.2, 1] }}
        className={clsx(
          "bg-background border-r border-border flex flex-col flex-shrink-0 relative",
          className
        )}
        style={{
          minWidth: currentWidth,
          maxWidth: currentWidth
        }}
      >

        {/* Collapsed state */}
        {isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.15, duration: 0.15 }}
            className="flex-1 flex flex-col items-center py-4 gap-3"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    setIsCollapsed(false)
                    onTabChange('files')
                  }}
                  className={clsx(
                    "w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
                    activeTab === 'files' ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                >
                  <FolderOpen className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Project Files</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    setIsCollapsed(false)
                    onTabChange('timeline')
                  }}
                  className={clsx(
                    "w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
                    activeTab === 'timeline' ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                >
                  <GitBranch className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Git Timeline</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    setIsCollapsed(false)
                    onTabChange('settings')
                  }}
                  className={clsx(
                    "w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
                    activeTab === 'settings' ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                >
                  <Settings className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Project Settings</p>
              </TooltipContent>
            </Tooltip>
          </motion.div>
        )}

        {/* Expanded content - PyCharm Style */}
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.15, duration: 0.15 }}
            className="flex-1 flex overflow-hidden"
          >
            {/* Navigation Button Bar */}
            <div className="flex flex-col border-r border-border bg-muted/20 py-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleTabClick('files')}
                    className={clsx(
                      "flex items-center justify-center w-12 h-12 transition-colors",
                      activeTab === 'files'
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent text-muted-foreground"
                    )}
                  >
                    <FolderOpen className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Project Files</p>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleTabClick('timeline')}
                    className={clsx(
                      "flex items-center justify-center w-12 h-12 transition-colors",
                      activeTab === 'timeline'
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent text-muted-foreground"
                    )}
                  >
                    <GitBranch className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Git Timeline</p>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleTabClick('settings')}
                    className={clsx(
                      "flex items-center justify-center w-12 h-12 transition-colors",
                      activeTab === 'settings'
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent text-muted-foreground"
                    )}
                  >
                    <Settings className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Project Settings</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Git Timeline Content */}
              {activeTab === 'timeline' && (
                <div className="h-full flex flex-col">
                  {/* Timeline Content */}
                  <div className="flex-1 overflow-hidden">
                    {projectPath ? (
                      <div className="h-full overflow-auto">
                        <CheckpointTimeline
                          ref={timelineRef || timelineTreeRef}
                          projectPath={projectPath}
                          onCheckpointRestore={onCheckpointRestore}
                          onCheckpointDelete={onCheckpointDelete}
                          compact={false}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-center p-4">
                        <div className="space-y-2">
                          <GitBranch className="h-8 w-8 text-muted-foreground mx-auto" />
                          <p className="text-sm text-muted-foreground">
                            Select a project to view timeline
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Actions - Moved to bottom */}
                  {onCheckpointCreate && (
                    <div className="p-3 border-t border-border">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => setCheckpointDialogOpen(true)}
                            className="w-full text-xs"
                            size="sm"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Create Checkpoint
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Create a new checkpoint (Ctrl/Cmd+K)</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
              )}

              {/* Project Files Content */}
              {activeTab === 'files' && (
                <div className="h-full flex flex-col">
                  <div className="flex-1 overflow-auto">
                    {loading ? (
                      <div className="flex items-center justify-center h-32">
                        <div className="text-center">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground">Loading files...</p>
                        </div>
                      </div>
                    ) : error ? (
                      <div className="p-3">
                        <div className="flex items-center gap-2 text-sm text-destructive">
                          <AlertCircle className="h-4 w-4" />
                          {error}
                        </div>
                      </div>
                    ) : projectFiles.length > 0 ? (
                      <div className="flex flex-col h-full">
                        {/* File Tree Controls */}
                        <div className="flex items-center justify-between p-2 border-b border-border">
                          <span className="text-xs font-medium text-muted-foreground">Files</span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleExpandAll}
                              className="h-6 w-6 p-0"
                              title="Expand All"
                            >
                              <ChevronsUpDown className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleCollapseAll}
                              className="h-6 w-6 p-0"
                              title="Collapse All"
                            >
                              <ChevronsDownUp className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* File Tree */}
                        <div className="flex-1 overflow-auto p-2">
                          <FileTree
                            rootPath={projectPath}
                            onNodeExpand={handleNodeExpand}
                            onItemClick={handleFileClick}
                            className="text-xs"
                            showGitStatus={true}
                            recentlyChangedFiles={recentlyChangedFiles}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-32 text-center p-4">
                        <div>
                          <FolderOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground mb-2">
                            {!projectPath ? 'No project path set' : `No files found in directory (${projectFiles.length} items in state)`}
                          </p>
                          <p className="text-xs text-muted-foreground/70">
                            {projectPath && `Path: ${projectPath}`}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Project Settings Content */}
              {activeTab === 'settings' && (
                <div className="h-full overflow-auto">
                  <div className="p-3 space-y-4">
                    {/* Terminal Configuration */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Terminal Configuration</CardTitle>
                        <CardDescription className="text-xs">
                          Configure terminal behavior and shell
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Default Shell</Label>
                          <Select
                            value={projectSettings.terminalShell || 'default'}
                            onValueChange={(value) => setProjectSettings(prev => ({
                              ...prev, 
                              terminalShell: value === 'default' ? undefined : value
                            }))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">System Default</SelectItem>
                              <SelectItem value="/bin/bash">Bash</SelectItem>
                              <SelectItem value="/bin/zsh">Zsh</SelectItem>
                              <SelectItem value="/bin/fish">Fish</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Checkpoint Settings */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Checkpoint Settings</CardTitle>
                        <CardDescription className="text-xs">
                          Configure automatic checkpoint creation
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Auto-create checkpoints</Label>
                          <Switch
                            checked={projectSettings.autoCheckpoint}
                            onCheckedChange={(checked) => setProjectSettings(prev => ({
                              ...prev,
                              autoCheckpoint: checked
                            }))}
                          />
                        </div>

                        {projectSettings.autoCheckpoint && (
                          <div className="space-y-1">
                            <Label className="text-xs">Checkpoint interval (minutes)</Label>
                            <Input
                              type="number"
                              value={projectSettings.checkpointInterval}
                              onChange={(e) => setProjectSettings(prev => ({
                                ...prev,
                                checkpointInterval: parseInt(e.target.value) || 5
                              }))}
                              className="h-8 text-xs"
                              min="1"
                              max="60"
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Save Button */}
                    <Button
                      onClick={saveProjectSettings}
                      disabled={loading}
                      className="w-full text-xs"
                      size="sm"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Settings'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
        
        
        {/* Checkpoint Creation Dialog */}
        <Dialog open={checkpointDialogOpen} onOpenChange={setCheckpointDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create Checkpoint</DialogTitle>
              <DialogDescription>
                Create a snapshot of your current project state to save your progress.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="description" className="text-right">
                  Description
                </Label>
                <Input
                  id="description"
                  value={checkpointDescription}
                  onChange={(e) => setCheckpointDescription(e.target.value)}
                  className="col-span-3"
                  placeholder="Enter checkpoint description..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && checkpointDescription.trim()) {
                      handleCreateCheckpoint()
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setCheckpointDialogOpen(false)
                  setCheckpointDescription('')
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCreateCheckpoint}
                disabled={!checkpointDescription.trim()}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    </TooltipProvider>
  )
}