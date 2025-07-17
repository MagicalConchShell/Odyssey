import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  GitBranch,
  History,
  Plus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  GitMerge,
  Check,
  AlertTriangle
} from 'lucide-react'
import clsx from 'clsx'

import { ModernTimelineTree, type ModernTimelineTreeRef } from './ModernTimelineTree'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import type { BranchInfo } from '../../../electron/types/git-checkpoint'
import { validateBranchName } from './lib/branch-validation'

interface TimelineSidebarProps {
  projectPath?: string
  onCheckpointCreate?: (description: string) => Promise<void>
  onCheckpointRestore?: (checkpointId: string) => Promise<void>
  onCheckpointDelete?: (checkpointId: string) => Promise<void>
  onSidebarWidthChange?: (width: number) => void
  className?: string
  onTimelineRef?: (ref: ModernTimelineTreeRef | null) => void
}

/**
 * Timeline Sidebar Component
 * 
 * AI tool-style collapsible sidebar, similar to ChatGPT/Claude's conversation history sidebar
 * Main features:
 * - Collapsible sidebar design
 * - Session overview information
 * - Project status display
 * - Timeline navigation
 * - Quick actions
 */
export function TimelineSidebar({
  projectPath,
  onCheckpointCreate,
  onCheckpointRestore,
  onCheckpointDelete,
  onSidebarWidthChange,
  className,
  onTimelineRef
}: TimelineSidebarProps) {
  // Timeline tree ref
  const timelineTreeRef = useRef<ModernTimelineTreeRef>(null)
  
  // Detect screen size
  const [isSmallScreen, setIsSmallScreen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1024
    }
    return false
  })
  // Read collapse state from localStorage
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('timelineSidebar.isCollapsed')
      return saved ? JSON.parse(saved) : false
    } catch {
      return false
    }
  })
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newCheckpointDescription, setNewCheckpointDescription] = useState('')
  const [isCreatingCheckpoint, setIsCreatingCheckpoint] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  
  // Branch management state
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)
  const [isDetachedHead, setIsDetachedHead] = useState(false)
  const [showBranchDialog, setShowBranchDialog] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [isCreatingBranch, setIsCreatingBranch] = useState(false)
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false)
  const [branchError, setBranchError] = useState<string | null>(null)
  const [branchSwitchError, setBranchSwitchError] = useState<string | null>(null)
  const [branchNameValidation, setBranchNameValidation] = useState<{ isValid: boolean; error?: string }>({ isValid: true })
  
  // Focus management related refs
  const sidebarRef = useRef<HTMLDivElement>(null)
  const toggleButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Save collapse state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('timelineSidebar.isCollapsed', JSON.stringify(isCollapsed))
    } catch (error) {
      console.warn('Failed to save sidebar state:', error)
    }
  }, [isCollapsed])

  // Listen for screen size changes
  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 1024)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Notify width changes
  useEffect(() => {
    if (onSidebarWidthChange) {
      // Calculate current sidebar width
      let width = 0
      if (!isSmallScreen) {
        // Use actual width on large screens
        width = isCollapsed ? 64 : 320
      }
      // Width is 0 on small screens because sidebar is in overlay mode and doesn't take up space
      onSidebarWidthChange(width)
    }
  }, [isSmallScreen, isCollapsed, onSidebarWidthChange])

  // Pass timeline ref to parent component
  useEffect(() => {
    if (onTimelineRef) {
      onTimelineRef(timelineTreeRef.current)
    }
  }, [onTimelineRef])

  // Keyboard event handling - ESC key closes sidebar
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle ESC key on small screens when expanded
      if (isSmallScreen && !isCollapsed && event.key === 'Escape') {
        event.preventDefault()
        setIsCollapsed(true)
      }
    }

    if (isSmallScreen && !isCollapsed) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSmallScreen, isCollapsed])

  // Focus management - focus when expanded, restore focus when collapsed
  useEffect(() => {
    if (isSmallScreen) {
      if (!isCollapsed) {
        // When expanded: save current focus and focus on sidebar
        previousFocusRef.current = document.activeElement as HTMLElement
        // Delay focus to ensure animation completes
        setTimeout(() => {
          if (toggleButtonRef.current) {
            toggleButtonRef.current.focus()
          }
        }, 300)
      } else {
        // When collapsed: restore previous focus
        if (previousFocusRef.current) {
          previousFocusRef.current.focus()
          previousFocusRef.current = null
        }
      }
    }
  }, [isSmallScreen, isCollapsed])

  // Focus trap - limit tab navigation within sidebar when expanded on small screens
  useEffect(() => {
    const handleTabKey = (event: KeyboardEvent) => {
      if (!isSmallScreen || isCollapsed || event.key !== 'Tab') return

      const sidebar = sidebarRef.current
      if (!sidebar) return

      const focusableElements = sidebar.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0] as HTMLElement
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

      if (event.shiftKey) {
        // Shift + Tab - if focus is on first element, jump to last
        if (document.activeElement === firstElement) {
          event.preventDefault()
          lastElement?.focus()
        }
      } else {
        // Tab - if focus is on last element, jump to first
        if (document.activeElement === lastElement) {
          event.preventDefault()
          firstElement?.focus()
        }
      }
    }

    if (isSmallScreen && !isCollapsed) {
      document.addEventListener('keydown', handleTabKey)
      return () => document.removeEventListener('keydown', handleTabKey)
    }
  }, [isSmallScreen, isCollapsed])

  const handleCreateCheckpoint = async () => {
    if (!newCheckpointDescription.trim()) return
    
    try {
      setIsCreatingCheckpoint(true)
      setCreateError(null)
      
      if (onCheckpointCreate) {
        await onCheckpointCreate(newCheckpointDescription.trim())
      } else if (projectPath) {
        // Fallback to direct Git checkpoint API call
        const result = await window.electronAPI.gitCheckpoint.createCheckpoint(
          projectPath, 
          newCheckpointDescription.trim()
        )
        if (!result.success) {
          throw new Error(result.error || 'Failed to create checkpoint')
        }
        
        // Trigger timeline refresh for fallback path
        console.log('Checkpoint created via fallback path, refreshing timeline')
        if (timelineTreeRef.current?.refreshTimeline) {
          try {
            // Add delay like in main path
            await new Promise(resolve => setTimeout(resolve, 100))
            await timelineTreeRef.current.refreshTimeline()
            console.log('Timeline refreshed successfully via fallback')
          } catch (error) {
            console.error('Failed to refresh timeline via fallback:', error)
          }
        } else {
          console.warn('Timeline ref not available for fallback refresh')
        }
      }
      
      // Only clean up state and close dialog when successful
      setNewCheckpointDescription('')
      setShowCreateDialog(false)
    } catch (error: any) {
      // Show error message, keep dialog open for retry
      setCreateError(error.message || 'Failed to create checkpoint')
    } finally {
      setIsCreatingCheckpoint(false)
    }
  }

  // Branch management functions (memoized for performance)
  const loadBranches = useCallback(async () => {
    if (!projectPath) return
    
    try {
      const startTime = performance.now()
      
      const result = await window.electronAPI.gitCheckpoint.listBranches(projectPath)
      if (result.success && result.data && Array.isArray(result.data)) {
        setBranches(result.data)
        
        // Check if we're in detached HEAD state
        const history = await window.electronAPI.gitCheckpoint.getHistory(projectPath)
        if (history.success && history.data && Array.isArray(history.data) && history.data.length > 0) {
          const currentCommit = history.data[0]
          const isDetached = !result.data.some((branch: any) => branch.commitHash === currentCommit.hash)
          setIsDetachedHead(isDetached)
          
          if (!isDetached) {
            const branch = result.data.find((branch: any) => branch.commitHash === currentCommit.hash)
            setCurrentBranch(branch?.name || null)
          } else {
            setCurrentBranch(null)
          }
        }
      } else {
        // Ensure branches is always an array
        setBranches([])
        setCurrentBranch(null)
        setIsDetachedHead(false)
      }
      
      // Log performance metrics for debugging
      const loadTime = performance.now() - startTime
      if (loadTime > 100) {
        console.warn(`Branch loading took ${loadTime.toFixed(2)}ms - consider optimization`)
      }
    } catch (error) {
      console.error('Failed to load branches:', error)
      // Ensure branches is always an array even on error
      setBranches([])
      setCurrentBranch(null)
      setIsDetachedHead(false)
    }
  }, [projectPath])

  const handleCreateBranch = async () => {
    if (!newBranchName.trim() || !projectPath) return
    
    // Validate branch name
    const validation = validateBranchName(newBranchName.trim())
    if (!validation.isValid) {
      setBranchError(validation.error || 'Invalid branch name')
      return
    }
    
    try {
      setIsCreatingBranch(true)
      setBranchError(null)
      
      const result = await window.electronAPI.gitCheckpoint.createBranch(
        projectPath, 
        newBranchName.trim()
      )
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create branch')
      }
      
      // Refresh branches and switch to new branch
      await loadBranches()
      
      // Close dialog and reset state
      setNewBranchName('')
      setShowBranchDialog(false)
      
      // Refresh timeline to show new branch
      if (timelineTreeRef.current?.refreshTimeline) {
        timelineTreeRef.current.refreshTimeline()
      }
    } catch (error: any) {
      setBranchError(error.message || 'Failed to create branch')
    } finally {
      setIsCreatingBranch(false)
    }
  }

  const handleSwitchBranch = async (branchName: string) => {
    if (!projectPath || branchName === currentBranch) return
    
    try {
      setIsSwitchingBranch(true)
      setBranchSwitchError(null)
      
      const result = await window.electronAPI.gitCheckpoint.switchBranch(projectPath, branchName)
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to switch branch')
      }
      
      // Update current branch
      setCurrentBranch(branchName)
      setIsDetachedHead(false)
      
      // Refresh timeline to show new branch
      if (timelineTreeRef.current?.refreshTimeline) {
        await timelineTreeRef.current.refreshTimeline()
      }
      
      console.log(`✅ Successfully switched to branch: ${branchName}`)
    } catch (error: any) {
      console.error('Failed to switch branch:', error)
      setBranchSwitchError(error.message || 'Failed to switch branch')
      
      // Show error for 5 seconds then clear
      setTimeout(() => {
        setBranchSwitchError(null)
      }, 5000)
    } finally {
      setIsSwitchingBranch(false)
    }
  }

  // Load branches when projectPath changes
  useEffect(() => {
    if (projectPath) {
      loadBranches()
    }
  }, [projectPath])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when not in input fields
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      // Check if sidebar is visible and focused
      if (isCollapsed || !projectPath) return

      // Handle keyboard shortcuts
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'k': // Ctrl/Cmd + K - Create checkpoint
            event.preventDefault()
            if (onCheckpointCreate) {
              setShowCreateDialog(true)
            }
            break
          case 'b': // Ctrl/Cmd + B - Create branch
            event.preventDefault()
            setShowBranchDialog(true)
            break
          case 'r': // Ctrl/Cmd + R - Refresh timeline
            event.preventDefault()
            if (timelineTreeRef.current?.refreshTimeline) {
              timelineTreeRef.current.refreshTimeline()
            }
            break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isCollapsed, projectPath, onCheckpointCreate])

  return (
    <>
      {/* Background overlay for small screens - only shown when expanded */}
      <AnimatePresence>
        {isSmallScreen && !isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed top-0 left-0 right-0 bg-black/20 backdrop-blur-sm z-40"
            style={{ bottom: '120px' }} // Reserve space for FloatingPromptInput
            onClick={() => setIsCollapsed(true)}
          />
        )}
      </AnimatePresence>
      
      <motion.div
        ref={sidebarRef}
        initial={{ 
          width: 0, 
          opacity: 0,
          x: isSmallScreen ? -320 : 0
        }}
        animate={{ 
          width: isCollapsed ? 64 : 320, 
          opacity: 1,
          x: 0
        }}
        exit={{ 
          width: 0, 
          opacity: 0,
          x: isSmallScreen ? -320 : 0
        }}
        transition={{ 
          duration: 0.25, 
          ease: [0.4, 0.0, 0.2, 1]
        }}
        className={clsx(
          "bg-background border-r border-border flex flex-col relative",
          // Use fixed positioning (overlay) on small screens, normal flow layout on large screens
          isSmallScreen ? "fixed left-0 top-0 h-full z-20" : "flex-shrink-0",
          // Ensure overflow handling is correct
          isCollapsed ? "overflow-visible" : "overflow-hidden",
          className
        )}
        style={{
          // Precisely control width to avoid layout jumping
          minWidth: isCollapsed ? 64 : 320,
          maxWidth: isCollapsed ? 64 : 320
        }}
        role="complementary"
        aria-label="Timeline sidebar"
        aria-expanded={!isCollapsed}
      >
      {/* Header */}
      <div className={clsx(
        "flex items-center border-b border-border bg-muted/30",
        isCollapsed ? "justify-center p-2" : "justify-between p-3"
      )}>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-2"
          >
            <History className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Timeline</span>
          </motion.div>
        )}
        
        <div className={clsx(
          "flex items-center",
          isCollapsed ? "gap-0" : "gap-1"
        )}>
          <button
            ref={toggleButtonRef}
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={clsx(
              "hover:bg-accent rounded-md transition-colors",
              isCollapsed ? "p-2" : "p-1.5"
            )}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand timeline sidebar" : "Collapse timeline sidebar"}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
          
        </div>
      </div>

      {/* Collapsed state */}
      {isCollapsed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ 
            delay: isCollapsed ? 0.15 : 0,
            duration: 0.15 
          }}
          className="flex-1 flex flex-col items-center py-4 gap-3 w-full"
          style={{ width: 64 }}
        >
          <button
            onClick={() => setIsCollapsed(false)}
            className="w-10 h-10 flex items-center justify-center hover:bg-accent rounded-lg transition-colors"
            title="Expand timeline"
            aria-label="Expand timeline sidebar"
          >
            <GitBranch className="h-5 w-5" />
          </button>
          
          {onCheckpointCreate && (
            <button
              onClick={() => setShowCreateDialog(true)}
              className="w-10 h-10 flex items-center justify-center hover:bg-accent rounded-lg transition-colors text-primary"
              title="Create checkpoint"
              aria-label="Create new checkpoint"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
          
          {projectPath && (
            <div className="w-10 h-10 flex items-center justify-center">
              <GitBranch className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </motion.div>
      )}

      {/* Expanded content */}
      {!isCollapsed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ 
            delay: !isCollapsed ? 0.15 : 0,
            duration: 0.15 
          }}
          className="flex-1 flex flex-col min-h-0"
        >


          {/* Quick Actions */}
          {onCheckpointCreate && (
            <div className="p-3 border-b border-border">
              <button
                onClick={() => setShowCreateDialog(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create Checkpoint
              </button>
            </div>
          )}

          {/* Branch Management */}
          {projectPath && (
            <div className="p-3 border-b border-border">
              <div className="space-y-2">
                {/* Current Branch Display */}
                <div className="flex items-center gap-2 text-sm">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  {isDetachedHead ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 text-yellow-500" />
                            <Badge variant="outline" className="text-xs">
                              Detached HEAD
                            </Badge>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>You are not on any branch. Create a new branch to save your work.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      {currentBranch || 'main'}
                    </Badge>
                  )}
                </div>

                {/* Branch Actions */}
                <div className="flex gap-1">
                  {/* Branch Switcher */}
                  <Select
                    value={currentBranch || ''}
                    onValueChange={handleSwitchBranch}
                    disabled={isSwitchingBranch}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Switch branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.isArray(branches) && branches.map((branch) => (
                        <SelectItem key={branch.name} value={branch.name}>
                          <div className="flex items-center gap-2">
                            <span>{branch.name}</span>
                            {branch.name === currentBranch && (
                              <Check className="h-3 w-3 text-green-500" />
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* Branch Switch Error */}
                  {branchSwitchError && (
                    <div className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      <span>{branchSwitchError}</span>
                    </div>
                  )}

                  {/* Create Branch Button */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => setShowBranchDialog(true)}
                          size="sm"
                          variant="outline"
                          className="h-8 px-2"
                        >
                          <GitMerge className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Create new branch</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          )}

          {/* Timeline Content */}
          <div className="flex-1 overflow-hidden">
            {projectPath ? (
              <div className="h-full">
                <ModernTimelineTree
                  ref={timelineTreeRef}
                  projectPath={projectPath}
                  onCheckpointRestore={onCheckpointRestore}
                  onCheckpointDelete={onCheckpointDelete}
                  compact={isCollapsed}
                  className="h-full"
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
        </motion.div>
      )}

      {/* Create Checkpoint Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Checkpoint</DialogTitle>
            <DialogDescription>
              Create a snapshot of your current project state. This allows you to save your progress and return to this exact state later if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Enter checkpoint description..."
                value={newCheckpointDescription}
                onChange={(e) => {
                  setNewCheckpointDescription(e.target.value)
                  // Clear previous error messages
                  if (createError) setCreateError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isCreatingCheckpoint) {
                    e.preventDefault()
                    handleCreateCheckpoint()
                  }
                }}
                disabled={isCreatingCheckpoint}
                autoFocus
              />
            </div>
            
            {/* Error message display */}
            {createError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
                {createError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCreateDialog(false)
                setCreateError(null)
                setNewCheckpointDescription('')
              }}
              disabled={isCreatingCheckpoint}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateCheckpoint}
              disabled={!newCheckpointDescription.trim() || isCreatingCheckpoint}
            >
              {isCreatingCheckpoint && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isCreatingCheckpoint ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Branch Dialog */}
      <Dialog open={showBranchDialog} onOpenChange={setShowBranchDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Branch</DialogTitle>
            <DialogDescription>
              Create a new branch from the current HEAD. This allows you to work on features or experiments without affecting the main branch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="branchName">Branch Name</Label>
              <Input
                id="branchName"
                placeholder="Enter branch name..."
                value={newBranchName}
                onChange={(e) => {
                  const value = e.target.value
                  setNewBranchName(value)
                  
                  // Real-time validation
                  if (value.trim()) {
                    const validation = validateBranchName(value.trim())
                    setBranchNameValidation(validation)
                  } else {
                    setBranchNameValidation({ isValid: true })
                  }
                  
                  // Clear previous error messages
                  if (branchError) setBranchError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isCreatingBranch) {
                    e.preventDefault()
                    handleCreateBranch()
                  }
                }}
                disabled={isCreatingBranch}
                autoFocus
                className={!branchNameValidation.isValid ? 'border-destructive' : ''}
              />
              <div className="mt-1 space-y-1">
                <p className="text-xs text-muted-foreground">
                  Branch will be created from the current HEAD
                </p>
                {!branchNameValidation.isValid && newBranchName.trim() && (
                  <p className="text-xs text-destructive">
                    {branchNameValidation.error}
                  </p>
                )}
              </div>
            </div>
            
            {/* Error message display */}
            {branchError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
                {branchError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowBranchDialog(false)
                setBranchError(null)
                setNewBranchName('')
              }}
              disabled={isCreatingBranch}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateBranch}
              disabled={!newBranchName.trim() || isCreatingBranch || !branchNameValidation.isValid}
            >
              {isCreatingBranch && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isCreatingBranch ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </motion.div>
    </>
  )
}

export default TimelineSidebar