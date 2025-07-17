import { useState, useEffect, useImperativeHandle, forwardRef, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatDistanceToNow } from 'date-fns'
import {
  RotateCcw,
  Trash2,
  Clock,
  FileText,
  MoreHorizontal,
  Loader2,
  AlertTriangle,
  GitMerge,
  Copy,
  GitBranch as GitBranchIcon,
  Hash,
  User
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import DiffViewer from './DiffViewer'
import FileContentDiff from './FileContentDiff'
import type { GitCheckpointInfo, TimelineTreeNode, ConnectionLine, BranchInfo, FileDiff, GitHistory, GitCommit, GitBranch } from '@/types/checkpoint'
import { calculateGitGraphLayout } from '@/lib/git-graph-layout'

interface ModernTimelineTreeProps {
  projectPath: string
  compact?: boolean
  onCheckpointRestore?: (commitHash: string) => Promise<void>
  onCheckpointDelete?: (commitHash: string) => Promise<void>
  className?: string
}

export interface ModernTimelineTreeRef {
  refreshTimeline: () => Promise<void>
  scrollToCommit: (commitHash: string) => void
  focusSearch: () => void
  selectNext: () => void
  selectPrevious: () => void
  clearSelection: () => void
}

// Enhanced layout constants for better visual clarity
const getItemHeight = (compact: boolean) => compact ? 48 : 72 // Dynamic height based on compact mode
const GRAPH_COLUMN_WIDTH = 40 // Wider columns for better branch visualization
const GRAPH_LEFT_PADDING = 16
const CONTENT_LEFT_MARGIN = 200 // Space reserved for graph visualization
const NODE_RADIUS = 6 // Larger nodes for better visibility

/**
 * Modern Git Timeline Tree Component
 * 
 * Features:
 * - Virtual scrolling for performance with thousands of commits
 * - Professional git-like visualization inspired by GitFork and VSCode
 * - Enhanced visual design with smooth animations
 * - Complete information display (graph, commit info, time)
 * - Responsive design with improved accessibility
 */
export const ModernTimelineTree = forwardRef<ModernTimelineTreeRef, ModernTimelineTreeProps>(
  ({ projectPath, compact = false, onCheckpointRestore, onCheckpointDelete, className }, ref) => {
    // Core state
    const [checkpoints, setCheckpoints] = useState<GitCheckpointInfo[]>([])
    const [branches, setBranches] = useState<BranchInfo[]>([])
    const [currentRef, setCurrentRef] = useState<string | null>(null)
    const [isDetachedHead, setIsDetachedHead] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    
    // Dialog state
    const [showRestoreDialog, setShowRestoreDialog] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [selectedCheckpoint, setSelectedCheckpoint] = useState<GitCheckpointInfo | null>(null)
    const [showFileChangesDialog, setShowFileChangesDialog] = useState(false)
    const [fileChanges, setFileChanges] = useState<FileDiff[] | null>(null)
    const [showFileContentDiff, setShowFileContentDiff] = useState(false)
    const [selectedFileDiff, setSelectedFileDiff] = useState<FileDiff | null>(null)
    const [restorePreviewDiffs, setRestorePreviewDiffs] = useState<FileDiff[] | null>(null)
    const [loadingRestorePreview, setLoadingRestorePreview] = useState(false)

    // Enhanced interaction state
    const [searchQuery, setSearchQuery] = useState('')
    const [showSearch, setShowSearch] = useState(false)
    const [filteredCheckpoints, setFilteredCheckpoints] = useState<GitCheckpointInfo[]>([])
    const [focusedCommitIndex, setFocusedCommitIndex] = useState<number>(0)

    // Layout state
    const [treeNodes, setTreeNodes] = useState<TimelineTreeNode[]>([])
    const [connectionLines, setConnectionLines] = useState<ConnectionLine[]>([])
    const [maxColumns, setMaxColumns] = useState(0)

    // Refs for enhanced interactions
    const parentRef = useRef<HTMLDivElement>(null)

    // Filter checkpoints based on search query
    useEffect(() => {
      if (!searchQuery.trim()) {
        setFilteredCheckpoints(checkpoints)
      } else {
        const query = searchQuery.toLowerCase()
        const filtered = checkpoints.filter(checkpoint => 
          checkpoint.description.toLowerCase().includes(query) ||
          checkpoint.hash.toLowerCase().includes(query) ||
          checkpoint.author.toLowerCase().includes(query)
        )
        setFilteredCheckpoints(filtered)
      }
    }, [checkpoints, searchQuery])

    // Virtual scrolling setup
    const ITEM_HEIGHT = getItemHeight(compact)
    const virtualizer = useVirtualizer({
      count: filteredCheckpoints.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => ITEM_HEIGHT,
      overscan: 10, // Render extra items for smooth scrolling
    })

    // Memoized graph layout calculation
    const { layoutNodes, layoutConnections, calculatedMaxColumns } = useMemo(() => {
      if (filteredCheckpoints.length > 0) {
        const { nodes, connections, maxColumns } = calculateGitGraphLayout(
          filteredCheckpoints,
          branches,
          currentRef
        )
        return { 
          layoutNodes: nodes, 
          layoutConnections: connections, 
          calculatedMaxColumns: maxColumns 
        }
      }
      return { 
        layoutNodes: [], 
        layoutConnections: [], 
        calculatedMaxColumns: 0 
      }
    }, [filteredCheckpoints, branches, currentRef])

    // Update layout state when calculation changes
    useEffect(() => {
      setTreeNodes(layoutNodes)
      setConnectionLines(layoutConnections)
      setMaxColumns(calculatedMaxColumns)
    }, [layoutNodes, layoutConnections, calculatedMaxColumns])

    // Load history with enhanced error handling
    const loadHistory = useCallback(async () => {
      try {
        setLoading(true)
        setError(null)
        
        const startTime = performance.now()
        const [historyResult, branchesResult] = await Promise.all([
          window.electronAPI.gitCheckpoint.getHistory(projectPath),
          window.electronAPI.gitCheckpoint.listBranches(projectPath)
        ])

        if (historyResult.success && branchesResult.success) {
          const historyData = (historyResult.data as unknown as GitHistory)?.commits || []
          const branchesData = (branchesResult.data as unknown as GitBranch[]) || []
          
          // Convert to proper format
          const branchInfoData: BranchInfo[] = branchesData.map(branch => ({
            name: branch.name,
            commitHash: branch.hash
          }))

          const mappedCheckpoints: GitCheckpointInfo[] = historyData.map((commit: GitCommit) => ({
            hash: commit.hash,
            description: commit.message,
            author: commit.author,
            timestamp: commit.date,
            parents: commit.parents,
            treeHash: commit.hash,
          }))
          
          setCheckpoints(mappedCheckpoints)
          setBranches(branchInfoData)
          setFilteredCheckpoints(mappedCheckpoints)
          
          // Detect current HEAD state
          if (mappedCheckpoints.length > 0 && branchInfoData.length > 0) {
            const currentCommit = mappedCheckpoints[0]
            const currentBranch = branchInfoData.find((branch: BranchInfo) => branch.commitHash === currentCommit.hash)
            
            if (currentBranch) {
              setCurrentRef(currentBranch.name)
              setIsDetachedHead(false)
            } else {
              setCurrentRef(currentCommit.hash)
              setIsDetachedHead(true)
            }
          } else {
            setCurrentRef(null)
            setIsDetachedHead(false)
          }
          
          // Performance logging
          const loadTime = performance.now() - startTime
          if (loadTime > 1000) {
            console.warn(`Timeline loading took ${loadTime.toFixed(2)}ms for ${mappedCheckpoints.length} commits`)
          }
        } else {
          setCheckpoints([])
          setBranches([])
          setFilteredCheckpoints([])
          setCurrentRef(null)
          setIsDetachedHead(false)
          setError(historyResult.error || branchesResult.error || 'Failed to load history')
        }
      } catch (err: any) {
        setCheckpoints([])
        setBranches([])
        setFilteredCheckpoints([])
        setCurrentRef(null)
        setIsDetachedHead(false)
        setError(err.message || 'Unknown error occurred')
      } finally {
        setLoading(false)
      }
    }, [projectPath])

    // Initial load
    useEffect(() => {
      loadHistory()
    }, [projectPath])

    // Enhanced interaction methods
    const scrollToCommit = useCallback((commitHash: string) => {
      const index = filteredCheckpoints.findIndex(checkpoint => checkpoint.hash === commitHash)
      if (index !== -1) {
        virtualizer.scrollToIndex(index, { align: 'center' })
        setFocusedCommitIndex(index)
      }
    }, [filteredCheckpoints, virtualizer])

    const focusSearch = useCallback(() => {
      setShowSearch(true)
    }, [])

    const selectNext = useCallback(() => {
      const nextIndex = Math.min(focusedCommitIndex + 1, filteredCheckpoints.length - 1)
      setFocusedCommitIndex(nextIndex)
      virtualizer.scrollToIndex(nextIndex, { align: 'center' })
    }, [focusedCommitIndex, filteredCheckpoints.length, virtualizer])

    const selectPrevious = useCallback(() => {
      const prevIndex = Math.max(focusedCommitIndex - 1, 0)
      setFocusedCommitIndex(prevIndex)
      virtualizer.scrollToIndex(prevIndex, { align: 'center' })
    }, [focusedCommitIndex, virtualizer])

    const clearSelection = useCallback(() => {
      setSelectedCheckpoint(null)
    }, [])

    // Keyboard navigation
    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        // Don't handle keys when input fields are focused
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
          return
        }

        switch (event.key) {
          case 'ArrowDown':
            event.preventDefault()
            selectNext()
            break
          case 'ArrowUp':
            event.preventDefault()
            selectPrevious()
            break
          case 'Enter':
            event.preventDefault()
            if (filteredCheckpoints[focusedCommitIndex]) {
              setSelectedCheckpoint(filteredCheckpoints[focusedCommitIndex])
              setShowFileChangesDialog(true)
            }
            break
          case 'Escape':
            if (showSearch) {
              setShowSearch(false)
              setSearchQuery('')
            } else {
              clearSelection()
            }
            break
          case 'f':
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault()
              focusSearch()
            }
            break
          case '/':
            event.preventDefault()
            focusSearch()
            break
        }
      }

      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }, [focusedCommitIndex, filteredCheckpoints, showSearch, selectNext, selectPrevious, clearSelection, focusSearch])

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
      refreshTimeline: loadHistory,
      scrollToCommit,
      focusSearch,
      selectNext,
      selectPrevious,
      clearSelection
    }), [loadHistory, scrollToCommit, focusSearch, selectNext, selectPrevious, clearSelection])

    // Restore checkpoint handler
    const handleRestoreCheckpoint = async () => {
      if (!selectedCheckpoint) return

      try {
        setLoading(true)
        if (onCheckpointRestore) {
          await onCheckpointRestore(selectedCheckpoint.hash)
        } else {
          const result = await window.electronAPI.gitCheckpoint.checkout(projectPath, selectedCheckpoint.hash)
          if (!result.success) {
            throw new Error(result.error || 'Failed to restore checkpoint')
          }
        }
        setShowRestoreDialog(false)
        setSelectedCheckpoint(null)
        await loadHistory()
      } catch (err: any) {
        setError(err.message || 'Failed to restore checkpoint')
      } finally {
        setLoading(false)
      }
    }

    // Delete checkpoint handler
    const handleDeleteCheckpoint = async () => {
      if (!selectedCheckpoint) return

      try {
        setLoading(true)
        if (onCheckpointDelete) {
          await onCheckpointDelete(selectedCheckpoint.hash)
        } else {
          throw new Error('Checkpoint deletion is not currently supported for safety reasons.')
        }
        setShowDeleteDialog(false)
        setSelectedCheckpoint(null)
        await loadHistory()
      } catch (err: any) {
        setError(err.message || 'Failed to delete checkpoint')
      } finally {
        setLoading(false)
      }
    }

    // Load file changes
    const loadFileChanges = async (commitHash: string) => {
      try {
        setLoading(true)
        setError(null)
        
        const result = await window.electronAPI.gitCheckpoint.getCheckpointChanges(projectPath, commitHash)
        if (result.success) {
          if (result.data) {
            const diffFiles: FileDiff[] = result.data.serializedFiles 
              ? JSON.parse(result.data.serializedFiles) 
              : (result.data.files || [])
            setFileChanges(diffFiles)
          } else {
            setFileChanges([])
          }
        } else {
          setError(result.error || 'Failed to load file changes')
        }
      } catch (err: any) {
        setError(err.message || 'Unknown error occurred')
        setFileChanges([])
      } finally {
        setLoading(false)
      }
    }

    // Load file changes when dialog opens
    useEffect(() => {
      if (showFileChangesDialog && selectedCheckpoint) {
        loadFileChanges(selectedCheckpoint.hash)
      }
    }, [showFileChangesDialog, selectedCheckpoint])

    // Load restore preview when dialog opens
    useEffect(() => {
      if (showRestoreDialog && selectedCheckpoint) {
        loadRestorePreview(selectedCheckpoint.hash)
      }
    }, [showRestoreDialog, selectedCheckpoint])

    // Load restore preview
    const loadRestorePreview = async (targetRef: string) => {
      setLoadingRestorePreview(true)
      setRestorePreviewDiffs(null)
      
      try {
        const currentResult = await window.electronAPI.gitCheckpoint.getHistory(projectPath, 'HEAD')
        if (!currentResult.success || !currentResult.data || currentResult.data.length === 0) {
          throw new Error('Could not get current HEAD reference')
        }
        
        const currentRef = currentResult.data[0].hash
        const diffResult = await window.electronAPI.gitCheckpoint.getFileDiff(projectPath, currentRef, targetRef)
        
        if (diffResult.success && diffResult.data) {
          const diffFiles: FileDiff[] = diffResult.data.serializedFiles 
            ? JSON.parse(diffResult.data.serializedFiles) 
            : (diffResult.data.files || [])
          setRestorePreviewDiffs(diffFiles)
        } else {
          throw new Error(diffResult.error || 'Failed to get restore preview')
        }
      } catch (err: any) {
        console.error('Error loading restore preview:', err)
        setRestorePreviewDiffs([])
      } finally {
        setLoadingRestorePreview(false)
      }
    }

    // Handle file click
    const handleFileClick = (fileDiff: FileDiff) => {
      setSelectedFileDiff(fileDiff)
      setShowFileContentDiff(true)
    }

    // Format file size
    const formatFileSize = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }

    // Enhanced connection line rendering system
    const renderConnectionLines = useCallback(() => {
      if (!connectionLines.length || !treeNodes.length) return null

      const virtualItems = virtualizer.getVirtualItems()
      const visibleRange = {
        start: Math.max(0, virtualItems[0]?.index - 10),
        end: Math.min(treeNodes.length - 1, virtualItems[virtualItems.length - 1]?.index + 10)
      }

      return connectionLines.map((connection, index) => {
        const fromNode = treeNodes[connection.from.rowIndex]
        const toNode = treeNodes[connection.to.rowIndex]
        
        if (!fromNode || !toNode) return null

        // Skip connections outside visible range for performance
        const isVisible = (
          connection.from.rowIndex >= visibleRange.start && 
          connection.from.rowIndex <= visibleRange.end
        ) || (
          connection.to.rowIndex >= visibleRange.start && 
          connection.to.rowIndex <= visibleRange.end
        )

        if (!isVisible) return null

        // Calculate accurate positions
        const fromX = GRAPH_LEFT_PADDING + connection.from.columnIndex * GRAPH_COLUMN_WIDTH + NODE_RADIUS
        const fromY = connection.from.rowIndex * ITEM_HEIGHT + ITEM_HEIGHT / 2
        const toX = GRAPH_LEFT_PADDING + connection.to.columnIndex * GRAPH_COLUMN_WIDTH + NODE_RADIUS  
        const toY = connection.to.rowIndex * ITEM_HEIGHT + ITEM_HEIGHT / 2

        // Enhanced path generation
        const pathData = generateEnhancedConnectionPath(
          { x: fromX, y: fromY },
          { x: toX, y: toY },
          connection.type || 'direct'
        )

        return (
          <path
            key={`connection-${index}-${fromNode.checkpoint.hash}-${toNode.checkpoint.hash}`}
            d={pathData}
            stroke={connection.color || fromNode.branchColor}
            strokeWidth={connection.strokeWidth || 2.5}
            fill="none"
            strokeDasharray={connection.type === 'merge' ? '4,4' : undefined}
            className="transition-all duration-200"
            style={{
              filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.3))',
              opacity: 0.85,
            }}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      }).filter(Boolean)
    }, [connectionLines, treeNodes, virtualizer, maxColumns])

    // Enhanced path generation with proper curve handling
    const generateEnhancedConnectionPath = useCallback((
      from: { x: number; y: number }, 
      to: { x: number; y: number },
      connectionType: string = 'direct'
    ): string => {
      if (from.x === to.x) {
        // Straight vertical line for same column
        return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
      }
      
      // Enhanced curved paths for branch connections
      const deltaX = Math.abs(from.x - to.x)
      const deltaY = to.y - from.y
      
      // Adaptive curve strength based on distance and type
      let curveStrength: number
      switch (connectionType) {
        case 'merge':
          curveStrength = Math.max(20, Math.min(deltaX * 0.7, 60))
          break
        case 'branch':
          curveStrength = Math.max(15, Math.min(deltaX * 0.5, 45))
          break
        default:
          curveStrength = Math.max(10, Math.min(deltaX * 0.4, 30))
      }
      
      // Professional bezier curve with proper control points
      const midY = from.y + deltaY * 0.5
      const tension = 0.4
      
      const controlPoint1X = from.x
      const controlPoint1Y = from.y + (midY - from.y) * tension + curveStrength / 2
      
      const controlPoint2X = to.x
      const controlPoint2Y = to.y - (to.y - midY) * tension - curveStrength / 2
      
      return `M ${from.x} ${from.y} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${to.x} ${to.y}`
    }, [])

    if (loading && checkpoints.length === 0) {
      return (
        <div className={cn("flex items-center justify-center p-8", className)}>
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin mx-auto"></div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Loading timeline...</p>
              <p className="text-xs text-muted-foreground">Fetching commit history</p>
            </div>
          </div>
        </div>
      )
    }

    if (checkpoints.length === 0) {
      return (
        <div className={cn("flex items-center justify-center h-full p-8", className)}>
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-muted-foreground/50 flex items-center justify-center mx-auto">
              <GitBranchIcon className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">No commits found</p>
              <p className="text-xs text-muted-foreground">Create your first checkpoint to get started</p>
            </div>
          </div>
        </div>
      )
    }

    return (
      <TooltipProvider>
        <div className={cn("relative h-full", className)}>
          {/* Detached HEAD Warning */}
          <AnimatePresence>
            {isDetachedHead && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Detached HEAD State
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      You are not on any branch. Create a new branch to save your work.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Timeline Container with Virtual Scrolling */}
          <div 
            ref={parentRef}
            className="h-full overflow-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent"
          >
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {/* Enhanced SVG connection lines system */}
              <svg
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                  width: `${Math.max(CONTENT_LEFT_MARGIN, maxColumns * GRAPH_COLUMN_WIDTH + GRAPH_LEFT_PADDING * 2)}px`,
                  height: `${virtualizer.getTotalSize()}px`,
                  left: 0,
                  top: 0,
                }}
              >
                {/* Render connection lines with virtual scrolling compatibility */}
                {renderConnectionLines()}
              </svg>

              {/* Virtual Items */}
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const node = treeNodes[virtualItem.index]
                if (!node) return null

                return (
                  <motion.div
                    key={node.checkpoint.hash}
                    className="absolute left-0 right-0 group cursor-pointer"
                    style={{
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: virtualItem.index * 0.01 }}
                    onClick={() => {
                      setSelectedCheckpoint(node.checkpoint)
                      setShowFileChangesDialog(true)
                    }}
                  >
                    <div className="h-full flex items-center px-3 hover:bg-accent/30 transition-colors rounded-lg mx-2 relative z-20">
                      {/* Graph section */}
                      <div 
                        className="flex-shrink-0 relative"
                        style={{ width: `${CONTENT_LEFT_MARGIN}px` }}
                      >
                        {/* Commit node */}
                        <div
                          className={cn(
                            "absolute flex items-center justify-center transition-all duration-200",
                            node.isMergeCommit 
                              ? "w-5 h-5 rounded-sm border-2" 
                              : "w-4 h-4 rounded-full border-2",
                            node.isCurrent 
                              ? "scale-125 shadow-lg" 
                              : "group-hover:scale-110"
                          )}
                          style={{
                            left: `${GRAPH_LEFT_PADDING + node.columnIndex * GRAPH_COLUMN_WIDTH}px`,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            borderColor: node.branchColor,
                            backgroundColor: node.isCurrent ? node.branchColor : 'white',
                            boxShadow: node.isCurrent 
                              ? `0 0 20px ${node.branchColor}40, 0 0 10px ${node.branchColor}60` 
                              : `0 0 0 2px white, 0 0 0 3px ${node.branchColor}`,
                          }}
                        >
                          {node.isMergeCommit && (
                            <GitMerge className="w-2.5 h-2.5" style={{ color: node.branchColor }} />
                          )}
                          
                          {node.isCurrent && (
                            <div 
                              className={cn(
                                "absolute inset-0 animate-ping",
                                node.isMergeCommit ? "rounded-sm" : "rounded-full"
                              )}
                              style={{ 
                                backgroundColor: node.branchColor,
                                opacity: 0.6
                              }}
                            />
                          )}
                        </div>
                      </div>

                      {/* Content section */}
                      <div className="flex-1 min-w-0 ml-4">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex-1 min-w-0">
                            {/* Commit message */}
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className={cn(
                                "text-sm font-medium truncate transition-colors",
                                node.isCurrent 
                                  ? "text-foreground" 
                                  : "text-foreground/90 group-hover:text-foreground"
                              )}>
                                {node.checkpoint.description}
                              </h3>
                              
                              {/* Status badges */}
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {node.isMergeCommit && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                        <GitMerge className="w-3 h-3 mr-1" />
                                        merge
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Merge commit with {node.checkpoint.parents.length} parents</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                
                                {node.isCurrent && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                    <GitBranchIcon className="w-3 h-3 mr-1" />
                                    HEAD
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* Metadata */}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Hash className="w-3 h-3" />
                                <span className="font-mono">{node.checkpoint.hash.substring(0, 7)}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-3 w-3 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigator.clipboard.writeText(node.checkpoint.hash)
                                  }}
                                  title="Copy commit hash"
                                >
                                  <Copy className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                              
                              <div className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                <span>{node.checkpoint.author}</span>
                              </div>
                              
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{formatDistanceToNow(new Date(node.checkpoint.timestamp))} ago</span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Action buttons */}
                          <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            {!node.isCurrent && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-accent"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (onCheckpointRestore) {
                                        setSelectedCheckpoint(node.checkpoint)
                                        setShowRestoreDialog(true)
                                      }
                                    }}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Checkout this commit</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-accent"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedCheckpoint(node.checkpoint)
                                    setShowFileChangesDialog(true)
                                  }}
                                >
                                  <FileText className="h-4 w-4 mr-2" />
                                  View changes
                                </DropdownMenuItem>
                                
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigator.clipboard.writeText(node.checkpoint.hash)
                                  }}
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy commit hash
                                </DropdownMenuItem>
                                
                                {!node.isCurrent && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (onCheckpointRestore) {
                                        setSelectedCheckpoint(node.checkpoint)
                                        setShowRestoreDialog(true)
                                      }
                                    }}
                                  >
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Checkout
                                  </DropdownMenuItem>
                                )}
                                
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (onCheckpointDelete) {
                                      setSelectedCheckpoint(node.checkpoint)
                                      setShowDeleteDialog(true)
                                    }
                                  }}
                                  className="text-destructive"
                                  disabled={node.isCurrent}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete commit
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Dialogs */}
          {/* Restore checkpoint dialog */}
          <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Restore Checkpoint</DialogTitle>
                <DialogDescription>
                  This will replace your current project files with the checkpoint state.
                  A backup will be created automatically before restoration.
                </DialogDescription>
              </DialogHeader>
              
              {selectedCheckpoint && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 mb-4">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100">{selectedCheckpoint.description}</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Created {formatDistanceToNow(new Date(selectedCheckpoint.timestamp))} ago
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-mono">
                    {selectedCheckpoint.hash.substring(0, 12)}
                  </p>
                </div>
              )}

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-green-900 dark:text-green-100">Automatic Backup</span>
                </div>
                <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                  Your current state will be automatically backed up before restoration.
                </p>
              </div>

              <div className="flex-1 overflow-hidden">
                <h4 className="font-medium mb-2">Changes Preview:</h4>
                {loadingRestorePreview ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Loading changes preview...</p>
                    </div>
                  </div>
                ) : restorePreviewDiffs ? (
                  <div className="border rounded-lg bg-background h-full overflow-hidden">
                    {restorePreviewDiffs.length > 0 ? (
                      <DiffViewer
                        diffs={restorePreviewDiffs}
                        onFileClick={handleFileClick}
                        formatFileSize={formatFileSize}
                        showFileInfo={true}
                        className="p-2 h-full overflow-auto"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-32">
                        <div className="text-center">
                          <FileText className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No changes will be made</p>
                          <p className="text-xs text-muted-foreground">Current state matches target checkpoint</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="border rounded-lg bg-background h-32 flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">Failed to load changes preview</p>
                  </div>
                )}
              </div>
              
              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowRestoreDialog(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRestoreCheckpoint}
                  disabled={loading || loadingRestorePreview}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Restoring...</> : 'Restore Checkpoint'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* File changes dialog */}
          <Dialog open={showFileChangesDialog} onOpenChange={setShowFileChangesDialog}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Checkpoint Changes</DialogTitle>
                <DialogDescription>
                  {selectedCheckpoint && (
                    <span>
                      {selectedCheckpoint.description} • {formatDistanceToNow(new Date(selectedCheckpoint.timestamp))} ago
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>
              
              <div className="flex-1 overflow-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Loading file changes...</span>
                    </div>
                  </div>
                ) : fileChanges && fileChanges.length > 0 ? (
                  <div className="space-y-4">
                    <div className="bg-muted/50 rounded-lg p-4">
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                          <div className="text-2xl font-bold text-green-600">
                            {fileChanges.filter(f => !f.isDirectory).length}
                          </div>
                          <div className="text-sm text-muted-foreground">Changed Files</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-blue-600">
                            {formatFileSize(fileChanges.filter(f => !f.isDirectory).reduce((sum, f) => sum + (f.newSize || f.oldSize || 0), 0))}
                          </div>
                          <div className="text-sm text-muted-foreground">Total Size</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="border rounded-lg bg-background">
                      <DiffViewer
                        diffs={fileChanges}
                        onFileClick={handleFileClick}
                        formatFileSize={formatFileSize}
                        showFileInfo={true}
                        className="p-2"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-center">
                    <div>
                      <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No file changes found for this checkpoint
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowFileChangesDialog(false)}>
                  Close
                </Button>
                {selectedCheckpoint && !loading && (
                  <Button
                    onClick={() => {
                      if (onCheckpointRestore) {
                        setShowFileChangesDialog(false)
                        setShowRestoreDialog(true)
                      }
                    }}
                    disabled={selectedCheckpoint.hash === currentRef}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restore This Version
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete checkpoint dialog */}
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Checkpoint</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. The checkpoint will be permanently deleted.
                </DialogDescription>
              </DialogHeader>
              
              {selectedCheckpoint && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                  <h4 className="font-medium text-red-900 dark:text-red-100">{selectedCheckpoint.description}</h4>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Created {formatDistanceToNow(new Date(selectedCheckpoint.timestamp))} ago
                  </p>
                </div>
              )}
              
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteDialog(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteCheckpoint}
                  disabled={loading}
                  variant="destructive"
                >
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : 'Delete Checkpoint'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* File content diff dialog */}
          {selectedFileDiff && selectedCheckpoint && (
            <FileContentDiff
              projectPath={projectPath}
              fromRef={selectedCheckpoint.parents[0] || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'}
              toRef={selectedCheckpoint.hash}
              fileDiff={selectedFileDiff}
              isOpen={showFileContentDiff}
              onClose={() => setShowFileContentDiff(false)}
            />
          )}

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-0 left-0 right-0 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-red-800 dark:text-red-200 mb-2 z-50"
              >
                <div className="flex items-center justify-between">
                  <span>{error}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setError(null)}
                    className="h-6 w-6 p-0 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
                  >
                    ×
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </TooltipProvider>
    )
  }
)

ModernTimelineTree.displayName = 'ModernTimelineTree'

export default ModernTimelineTree