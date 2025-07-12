import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  FolderOpen,
  GitBranch,
  Settings,
  Loader2,
  AlertCircle,
  Plus
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

// Import timeline and file components
import { GitTimelineTree, type GitTimelineTreeRef } from './GitTimelineTree'
import { FileTree } from '@/components/ui/FileTree'

// Types
import type { Project, ProjectSettings } from '@/lib/projectState'

interface ProjectInfoSidebarProps {
  project?: Project
  projectPath: string
  selectedCheckpoint?: string | null
  activeTab: 'timeline' | 'files' | 'settings'
  onTabChange: (tab: 'timeline' | 'files' | 'settings') => void
  onWidthChange?: (width: number) => void
  onCheckpointCreate?: (description: string) => Promise<void>
  onCheckpointRestore?: (commitHash: string) => Promise<void>
  onCheckpointDelete?: (commitHash: string) => Promise<void>
  className?: string
}

export const ProjectInfoSidebar: React.FC<ProjectInfoSidebarProps> = ({
  project,
  projectPath,
  selectedCheckpoint: _selectedCheckpoint,
  activeTab,
  onTabChange,
  onWidthChange,
  onCheckpointCreate,
  onCheckpointRestore,
  onCheckpointDelete,
  className
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [projectFiles, setProjectFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Timeline ref
  const timelineTreeRef = useRef<GitTimelineTreeRef>(null)

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

  // Calculate sidebar width
  const sidebarWidth = isCollapsed ? 64 : 400

  // Notify parent of width changes
  useEffect(() => {
    if (onWidthChange) {
      onWidthChange(sidebarWidth)
    }
  }, [sidebarWidth, onWidthChange])


  // Load project files when files tab is active
  useEffect(() => {
    if (activeTab === 'files') {
      loadProjectFiles()
    }
  }, [activeTab, projectPath])

  // Load project settings when settings tab is active
  useEffect(() => {
    if (activeTab === 'settings' && project) {
      loadProjectSettings()
    }
  }, [activeTab, project])


  const loadProjectFiles = async () => {
    if (!projectPath) return

    setLoading(true)
    setError(null)

    try {
      // Load project file tree
      const result = await window.electronAPI.fileSystem.readDirectory(projectPath)

      if (result.success && result.data) {
        setProjectFiles(result.data)
      } else {
        setProjectFiles([])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load project files')
      setProjectFiles([])
    } finally {
      setLoading(false)
    }
  }

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
        animate={{ width: sidebarWidth, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0.0, 0.2, 1] }}
        className={clsx(
          "bg-background border-r border-border flex flex-col flex-shrink-0 relative",
          className
        )}
        style={{
          minWidth: sidebarWidth,
          maxWidth: sidebarWidth
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
              <button
                onClick={() => handleTabClick('timeline')}
                className={clsx(
                  "flex flex-col items-center justify-center w-16 h-16 transition-colors",
                  activeTab === 'timeline'
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-muted-foreground"
                )}
                title="Git Timeline"
              >
                <GitBranch className="h-5 w-5 mb-1" />
                <span className="text-xs font-medium">Git</span>
              </button>
              
              <button
                onClick={() => handleTabClick('files')}
                className={clsx(
                  "flex flex-col items-center justify-center w-16 h-16 transition-colors",
                  activeTab === 'files'
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-muted-foreground"
                )}
                title="Project Files"
              >
                <FolderOpen className="h-5 w-5 mb-1" />
                <span className="text-xs font-medium">Files</span>
              </button>
              
              <button
                onClick={() => handleTabClick('settings')}
                className={clsx(
                  "flex flex-col items-center justify-center w-16 h-16 transition-colors",
                  activeTab === 'settings'
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-muted-foreground"
                )}
                title="Project Settings"
              >
                <Settings className="h-5 w-5 mb-1" />
                <span className="text-xs font-medium">Settings</span>
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Git Timeline Content */}
              {activeTab === 'timeline' && (
                <div className="h-full flex flex-col">
                  {/* Quick Actions */}
                  {onCheckpointCreate && (
                    <div className="p-3 border-b border-border">
                      <Button
                        onClick={() => {
                          const description = prompt('Enter checkpoint description:')
                          if (description?.trim()) {
                            onCheckpointCreate(description.trim())
                          }
                        }}
                        className="w-full text-xs"
                        size="sm"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Create Checkpoint
                      </Button>
                    </div>
                  )}

                  {/* Timeline Content */}
                  <div className="flex-1 overflow-hidden">
                    {projectPath ? (
                      <div className="h-full overflow-auto">
                        <GitTimelineTree
                          ref={timelineTreeRef}
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
                      <div className="p-2">
                        <FileTree
                          items={projectFiles}
                          onItemClick={handleFileClick}
                          className="text-xs"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-32 text-center">
                        <div>
                          <FolderOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground">No files found</p>
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
      </motion.div>
    </TooltipProvider>
  )
}