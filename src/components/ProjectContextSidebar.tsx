import React, {useState, useEffect} from 'react'
import {motion} from 'framer-motion'
import {
  FileText,
  FolderOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Plus,
  Minus,
  GitBranch
} from 'lucide-react'
import clsx from 'clsx'

// Import existing components
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {FileTree} from '@/components/ui/FileTree'
import {DiffViewer} from '@/components/DiffViewer'
import {Button} from '@/components/ui/button'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Switch} from '@/components/ui/switch'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card'
import {Badge} from '@/components/ui/badge'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'

// Types
import type {FileDiff} from '@/types/checkpoint'
import type {Project} from '@/lib/projectState'

interface ProjectContextSidebarProps {
  projectPath: string
  selectedCheckpoint?: string | null
  activeTab: 'changes' | 'files' | 'settings'
  onTabChange: (tab: 'changes' | 'files' | 'settings') => void
  project?: Project
  className?: string
}

export const ProjectContextSidebar: React.FC<ProjectContextSidebarProps> = ({
                                                                              projectPath,
                                                                              selectedCheckpoint,
                                                                              activeTab,
                                                                              onTabChange,
                                                                              project,
                                                                              className
                                                                            }) => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [fileChanges, setFileChanges] = useState<FileDiff[]>([])
  const [projectFiles, setProjectFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changeStats, setChangeStats] = useState({added: 0, modified: 0, deleted: 0})

  // Project settings state
  const [projectSettings, setProjectSettings] = useState({
    aiModel: 'sonnet' as 'sonnet' | 'opus',
    autoCheckpoint: true,
    checkpointInterval: 5,
    includeNodeModules: false,
    maxHistoryLength: 1000,
    enableDebugMode: false,
    customPromptTemplate: '',
    excludePatterns: ['.git', 'node_modules', '.env', '*.log'],
    includePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.md']
  })

  // Calculate sidebar width
  const sidebarWidth = isCollapsed ? 64 : 400


  // Load file changes when checkpoint is selected
  useEffect(() => {
    if (selectedCheckpoint && activeTab === 'changes') {
      loadFileChanges()
    }
  }, [selectedCheckpoint, activeTab])

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

  const loadFileChanges = async () => {
    if (!selectedCheckpoint || !projectPath) return

    setLoading(true)
    setError(null)

    try {
      const result = await window.electronAPI.gitCheckpoint.getCheckpointChanges(projectPath, selectedCheckpoint)

      if (result.success && result.data) {
        const diffFiles: FileDiff[] = result.data.serializedFiles
          ? JSON.parse(result.data.serializedFiles)
          : (result.data.files || [])

        setFileChanges(diffFiles)

        // Calculate change statistics
        const stats = diffFiles.reduce((acc, file) => {
          if (file.type === 'added') acc.added++
          else if (file.type === 'modified') acc.modified++
          else if (file.type === 'deleted') acc.deleted++
          return acc
        }, {added: 0, modified: 0, deleted: 0})

        setChangeStats(stats)
      } else {
        setFileChanges([])
        setChangeStats({added: 0, modified: 0, deleted: 0})
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load file changes')
      setFileChanges([])
    } finally {
      setLoading(false)
    }
  }

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

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }


  return (
    <TooltipProvider>
      <motion.div
        initial={{width: 0, opacity: 0}}
        animate={{width: sidebarWidth, opacity: 1}}
        exit={{width: 0, opacity: 0}}
        transition={{duration: 0.25, ease: [0.4, 0.0, 0.2, 1]}}
        className={clsx(
          "bg-background border-l border-border flex flex-col flex-shrink-0 relative",
          className
        )}
        style={{
          minWidth: sidebarWidth,
          maxWidth: sidebarWidth
        }}
      >
        {/* Header */}
        <div className={clsx(
          "flex items-center border-b border-border bg-muted/30",
          isCollapsed ? "justify-center p-2" : "justify-between p-3"
        )}>
          {!isCollapsed && (
            <motion.div
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              exit={{opacity: 0}}
              transition={{delay: 0.1}}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4 text-primary"/>
              <span className="text-sm font-medium">Context</span>
            </motion.div>
          )}

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={clsx(
              "hover:bg-accent rounded-md transition-colors",
              isCollapsed ? "p-2" : "p-1.5"
            )}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronLeft className="h-4 w-4"/>
            ) : (
              <ChevronRight className="h-4 w-4"/>
            )}
          </button>
        </div>

        {/* Collapsed state */}
        {isCollapsed && (
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{delay: 0.15, duration: 0.15}}
            className="flex-1 flex flex-col items-center py-4 gap-3"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    setIsCollapsed(false)
                    onTabChange('changes')
                  }}
                  className={clsx(
                    "w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
                    activeTab === 'changes' ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                >
                  <GitBranch className="h-5 w-5"/>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>File Changes</p>
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
                  <FolderOpen className="h-5 w-5"/>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
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
                  <Settings className="h-5 w-5"/>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Project Settings</p>
              </TooltipContent>
            </Tooltip>
          </motion.div>
        )}

        {/* Expanded content */}
        {!isCollapsed && (
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{delay: 0.15, duration: 0.15}}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as any)}
                  className="flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-3 m-3">
                <TabsTrigger value="changes" className="text-xs">
                  <GitBranch className="h-3 w-3 mr-1"/>
                  Changes
                </TabsTrigger>
                <TabsTrigger value="files" className="text-xs">
                  <FolderOpen className="h-3 w-3 mr-1"/>
                  Files
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs">
                  <Settings className="h-3 w-3 mr-1"/>
                  Settings
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-hidden">
                {/* File Changes Tab */}
                <TabsContent value="changes" className="h-full m-0 p-0">
                  <div className="h-full flex flex-col">
                    {/* Change Stats */}
                    {selectedCheckpoint && changeStats.added + changeStats.modified + changeStats.deleted > 0 && (
                      <div className="px-3 py-2 border-b border-border">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Changes</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              <Plus className="h-3 w-3 mr-1 text-green-600"/>
                              {changeStats.added}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              <FileText className="h-3 w-3 mr-1 text-blue-600"/>
                              {changeStats.modified}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              <Minus className="h-3 w-3 mr-1 text-red-600"/>
                              {changeStats.deleted}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* File Changes Content */}
                    <div className="flex-1 overflow-auto">
                      {loading ? (
                        <div className="flex items-center justify-center h-32">
                          <div className="text-center">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2"/>
                            <p className="text-xs text-muted-foreground">Loading changes...</p>
                          </div>
                        </div>
                      ) : error ? (
                        <div className="p-3">
                          <div className="flex items-center gap-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4"/>
                            {error}
                          </div>
                        </div>
                      ) : fileChanges.length > 0 ? (
                        <div className="p-2">
                          <DiffViewer
                            diffs={fileChanges}
                            onFileClick={handleFileClick}
                            formatFileSize={formatFileSize}
                            showFileInfo={true}
                            className="text-xs"
                          />
                        </div>
                      ) : selectedCheckpoint ? (
                        <div className="flex items-center justify-center h-32 text-center">
                          <div>
                            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2"/>
                            <p className="text-xs text-muted-foreground">No changes found</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-32 text-center">
                          <div>
                            <GitBranch className="h-8 w-8 text-muted-foreground mx-auto mb-2"/>
                            <p className="text-xs text-muted-foreground">Select a checkpoint to view changes</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* Project Files Tab */}
                <TabsContent value="files" className="h-full m-0 p-0">
                  <div className="h-full flex flex-col">
                    {/* Project Info */}
                    {project && (
                      <div className="px-3 py-2 border-b border-border">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <FolderOpen className="h-3 w-3 text-muted-foreground"/>
                            <span className="text-xs font-medium truncate">{project.name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {projectPath.length > 40 ? '...' + projectPath.slice(-37) : projectPath}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Project Files Content */}
                    <div className="flex-1 overflow-auto">
                      {loading ? (
                        <div className="flex items-center justify-center h-32">
                          <div className="text-center">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2"/>
                            <p className="text-xs text-muted-foreground">Loading files...</p>
                          </div>
                        </div>
                      ) : error ? (
                        <div className="p-3">
                          <div className="flex items-center gap-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4"/>
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
                            <FolderOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2"/>
                            <p className="text-xs text-muted-foreground">No files found</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* Project Settings Tab */}
                <TabsContent value="settings" className="h-full m-0 p-0">
                  <div className="h-full overflow-auto">
                    <div className="p-3 space-y-4">
                      {/* AI Configuration */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">AI Configuration</CardTitle>
                          <CardDescription className="text-xs">
                            Configure AI model and behavior
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs">AI Model</Label>
                            <Select
                              value={projectSettings.aiModel}
                              onValueChange={(value) => setProjectSettings(prev => ({...prev, aiModel: value as any}))}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue/>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sonnet">Claude Sonnet</SelectItem>
                                <SelectItem value="opus">Claude Opus</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs">Custom Prompt Template</Label>
                            <textarea
                              value={projectSettings.customPromptTemplate}
                              onChange={(e) => setProjectSettings(prev => ({
                                ...prev,
                                customPromptTemplate: e.target.value
                              }))}
                              className="w-full h-16 px-2 py-1 text-xs border border-border rounded-md bg-background resize-none"
                              placeholder="Enter custom prompt template..."
                            />
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

                      {/* File Filters */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">File Filters</CardTitle>
                          <CardDescription className="text-xs">
                            Configure which files to include/exclude
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Include node_modules</Label>
                            <Switch
                              checked={projectSettings.includeNodeModules}
                              onCheckedChange={(checked) => setProjectSettings(prev => ({
                                ...prev,
                                includeNodeModules: checked
                              }))}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs">Exclude patterns</Label>
                            <div className="flex flex-wrap gap-1">
                              {projectSettings.excludePatterns.map((pattern, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {pattern}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs">Include patterns</Label>
                            <div className="flex flex-wrap gap-1">
                              {projectSettings.includePatterns.map((pattern, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {pattern}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Advanced Settings */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Advanced Settings</CardTitle>
                          <CardDescription className="text-xs">
                            Advanced configuration options
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Max history length</Label>
                            <Input
                              type="number"
                              value={projectSettings.maxHistoryLength}
                              onChange={(e) => setProjectSettings(prev => ({
                                ...prev,
                                maxHistoryLength: parseInt(e.target.value) || 1000
                              }))}
                              className="h-8 text-xs"
                              min="100"
                              max="10000"
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Debug mode</Label>
                            <Switch
                              checked={projectSettings.enableDebugMode}
                              onCheckedChange={(checked) => setProjectSettings(prev => ({
                                ...prev,
                                enableDebugMode: checked
                              }))}
                            />
                          </div>
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
                            <Loader2 className="h-3 w-3 mr-2 animate-spin"/>
                            Saving...
                          </>
                        ) : (
                          'Save Settings'
                        )}
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </motion.div>
        )}
      </motion.div>
    </TooltipProvider>
  )
}