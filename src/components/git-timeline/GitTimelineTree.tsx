import { useState, useEffect, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  GitBranch as GitBranchIcon
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
import { DiffViewer } from '../editor/DiffViewer'
import { FileContentDiff } from '../editor/FileContentDiff'
import type { GitCheckpointInfo, TimelineTreeNode, ConnectionLine, BranchInfo, FileDiff, GitHistory, GitCommit, GitBranch } from '@/types/checkpoint'

// Branch color system (similar to GitFork color scheme)
import { calculateGitGraphLayout } from './lib/git-graph-layout';

interface GitTimelineTreeProps {
  projectPath: string
  compact?: boolean
  onCheckpointRestore?: (commitHash: string) => Promise<void>
  onCheckpointDelete?: (commitHash: string) => Promise<void>
  className?: string
}

export interface GitTimelineTreeRef {
  refreshTimeline: () => Promise<void>
}

// Constants for layout (should match git-graph-layout.ts)
const NODE_HEIGHT = 48; // Height of each commit node in pixels
const COLUMN_WIDTH = 32; // Width of each branch column in pixels
const NODE_RADIUS = 4; // Radius of the commit circle

/**
 * Git-style timeline tree component
 * Similar to GitFork's branch view, using vertical lines and nodes to display checkpoints
 */
export const GitTimelineTree = forwardRef<GitTimelineTreeRef, GitTimelineTreeProps>(({ projectPath, compact = false, onCheckpointRestore, onCheckpointDelete, className }, ref) => {
  const [checkpoints, setCheckpoints] = useState<GitCheckpointInfo[]>([])
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [currentRef, setCurrentRef] = useState<string | null>(null) // Can be a branch name or a detached commit hash
  const [isDetachedHead, setIsDetachedHead] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRestoreDialog, setShowRestoreDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<GitCheckpointInfo | null>(null)
  const [treeNodes, setTreeNodes] = useState<TimelineTreeNode[]>([])
  const [connectionLines, setConnectionLines] = useState<ConnectionLine[]>([])
  const [maxColumns, setMaxColumns] = useState(0); // New state for max columns
  const [showFileChangesDialog, setShowFileChangesDialog] = useState(false)
  const [fileChanges, setFileChanges] = useState<FileDiff[] | null>(null)
  const [showFileContentDiff, setShowFileContentDiff] = useState(false)
  const [selectedFileDiff, setSelectedFileDiff] = useState<FileDiff | null>(null)
  const [restorePreviewDiffs, setRestorePreviewDiffs] = useState<FileDiff[] | null>(null)
  const [loadingRestorePreview, setLoadingRestorePreview] = useState(false)

  // Memoized graph layout calculation for performance
  const { layoutNodes, layoutConnections, calculatedMaxColumns } = useMemo(() => {
    if (checkpoints.length > 0) {
      const { nodes, connections, maxColumns } = calculateGitGraphLayout(
        checkpoints,
        branches,
        currentRef
      );
      return { 
        layoutNodes: nodes, 
        layoutConnections: connections, 
        calculatedMaxColumns: maxColumns 
      };
    }
    return { 
      layoutNodes: [], 
      layoutConnections: [], 
      calculatedMaxColumns: 0 
    };
  }, [checkpoints, branches, currentRef]);
  
  // Update state when layout changes
  useEffect(() => {
    setTreeNodes(layoutNodes);
    setConnectionLines(layoutConnections);
    setMaxColumns(calculatedMaxColumns);
  }, [layoutNodes, layoutConnections, calculatedMaxColumns]);

  // Load history (memoized with performance optimization)
  const loadHistory = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const startTime = performance.now()
      const historyResult = await window.electronAPI.gitCheckpoint.getHistory(projectPath)
      const branchesResult = await window.electronAPI.gitCheckpoint.listBranches(projectPath)

      if (historyResult.success && branchesResult.success) {
        // FIX: Correctly access the data property
        const historyData = (historyResult.data as unknown as GitHistory)?.commits || [];
        const branchesData = (branchesResult.data as unknown as GitBranch[]) || [];
        
        // Convert GitBranch[] to BranchInfo[]
        const branchInfoData: BranchInfo[] = branchesData.map(branch => ({
          name: branch.name,
          commitHash: branch.hash
        }));

        // Map GitCommit to GitCheckpointInfo
        const mappedCheckpoints: GitCheckpointInfo[] = historyData.map((commit: GitCommit) => ({
          hash: commit.hash,
          description: commit.message,
          author: commit.author,
          timestamp: commit.date,
          parents: commit.parents,
          treeHash: commit.hash, // Use commit hash as tree hash fallback
        }));
        
        // Performance optimization: limit displayed commits for very large histories
        const MAX_DISPLAYED_COMMITS = 1000;
        const displayedCheckpoints = mappedCheckpoints.length > MAX_DISPLAYED_COMMITS 
          ? mappedCheckpoints.slice(0, MAX_DISPLAYED_COMMITS)
          : mappedCheckpoints;
        
        setCheckpoints(displayedCheckpoints)
        setBranches(branchInfoData)
        
        // Detect current HEAD state
        if (mappedCheckpoints.length > 0 && branchInfoData.length > 0) {
          const currentCommit = mappedCheckpoints[0] // Most recent commit
          const currentBranch = branchInfoData.find((branch: BranchInfo) => branch.commitHash === currentCommit.hash)
          
          if (currentBranch) {
            // We're on a branch
            setCurrentRef(currentBranch.name)
            setIsDetachedHead(false)
          } else {
            // We're in detached HEAD state
            setCurrentRef(currentCommit.hash)
            setIsDetachedHead(true)
          }
        } else {
          setCurrentRef(null)
          setIsDetachedHead(false)
        }
        
        // Log performance metrics
        const loadTime = performance.now() - startTime
        if (loadTime > 1000) {
          console.warn(`Timeline loading took ${loadTime.toFixed(2)}ms for ${mappedCheckpoints.length} commits`)
        }
        
        // Show warning for large histories
        if (mappedCheckpoints.length > MAX_DISPLAYED_COMMITS) {
          console.warn(`Large history detected: showing ${MAX_DISPLAYED_COMMITS} of ${mappedCheckpoints.length} commits`)
        }
      } else {
        // Ensure arrays are set even on error
        setCheckpoints([])
        setBranches([])
        setCurrentRef(null)
        setIsDetachedHead(false)
        setError(historyResult.error || branchesResult.error || 'Failed to load history')
      }
    } catch (err: any) {
      // Ensure arrays are set even on exception
      setCheckpoints([])
      setBranches([])
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

  // Expose refresh method to parent component
  useImperativeHandle(ref, () => ({
    refreshTimeline: loadHistory
  }), [])

  // Restore checkpoint
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

  // Delete checkpoint - DISABLED due to complexity and safety concerns
  const handleDeleteCheckpoint = async () => {
    if (!selectedCheckpoint) return

    try {
      setLoading(true)
      if (onCheckpointDelete) {
        await onCheckpointDelete(selectedCheckpoint.hash)
      } else {
        // SAFETY: Deleting commits is a complex and potentially dangerous operation
        // in Git-like systems. It requires careful handling of:
        // 1. Reference updates (branches pointing to deleted commits)
        // 2. Parent-child relationships (orphaned commits)
        // 3. Garbage collection
        // 4. History rewriting
        // 
        // This feature is disabled until a proper implementation is available
        // that handles all these cases safely.
        throw new Error('Checkpoint deletion is not currently supported for safety reasons. This feature requires a more sophisticated implementation to handle Git-like commit relationships safely.')
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
      
      // Show only changes in this checkpoint
      const result = await window.electronAPI.gitCheckpoint.getCheckpointChanges(projectPath, commitHash)
      if (result.success) {
        if (result.data) {
          // Parse serialized files if available, otherwise use direct files (for backward compatibility or direct calls)
          const diffFiles: FileDiff[] = result.data.serializedFiles 
            ? JSON.parse(result.data.serializedFiles) 
            : (result.data.files || []);

          setFileChanges(diffFiles)
        } else {
          // No changes found - set empty array
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

  // Load file changes when selected checkpoint changes
  useEffect(() => {
    if (showFileChangesDialog && selectedCheckpoint) {
      loadFileChanges(selectedCheckpoint.hash)
    }
  }, [showFileChangesDialog, selectedCheckpoint])

  // Load restore preview when restore dialog is opened
  useEffect(() => {
    if (showRestoreDialog && selectedCheckpoint) {
      loadRestorePreview(selectedCheckpoint.hash)
    }
  }, [showRestoreDialog, selectedCheckpoint])

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  // Handle file click to show detailed diff
  const handleFileClick = (fileDiff: FileDiff) => {
    setSelectedFileDiff(fileDiff)
    setShowFileContentDiff(true)
  }

  // Load restore preview (current working directory vs target checkpoint)
  const loadRestorePreview = async (targetRef: string) => {
    setLoadingRestorePreview(true)
    setRestorePreviewDiffs(null)
    
    try {
      // Get current HEAD reference
      const currentResult = await window.electronAPI.gitCheckpoint.getHistory(projectPath, 'HEAD')
      if (!currentResult.success || !currentResult.data || currentResult.data.length === 0) {
        throw new Error('Could not get current HEAD reference')
      }
      
      const currentRef = currentResult.data[0].hash
      
      // Get diff between current HEAD and target checkpoint
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

  if (loading && checkpoints.length === 0) {
    return (
      <div className={cn("flex items-center justify-center p-8", className)}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">Loading history...</p>
        </div>
      </div>
    )
  }

  if (checkpoints.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full p-4", className)}>
        <div className="text-center">
          <div className="w-8 h-8 rounded-full border-2 border-dashed border-muted-foreground mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">No checkpoints yet</p>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className={cn("relative", className)}>
        {/* Detached HEAD Warning */}
        {isDetachedHead && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Detached HEAD State
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                  You are not on any branch. Create a new branch to save your work, or checkout an existing branch.
                </p>
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Git-style branch tree */}
        <div className="relative" style={{ minHeight: treeNodes.length * (compact ? 36 : 52) + 72, paddingTop: '24px' }}>
          {/* SVG connection lines */}
          <svg
            className="absolute pointer-events-none z-[5]"
            style={{ 
              left: '12px', // Match node positioning offset
              top: 0,
              width: `calc(100% - 12px + ${maxColumns * COLUMN_WIDTH + 24}px)`, // Account for left offset
              height: '100%',
              minWidth: 'calc(100% - 12px)'
            }}
          >
            {/* Debug: SVG boundary visualization */}
            <rect
              x="0"
              y="24"
              width="calc(100% - 12px)"
              height="calc(100% - 24px)"
              fill="none"
              stroke="rgba(255,0,0,0.1)"
              strokeWidth="1"
              strokeDasharray="5,5"
            />
            
            {Array.isArray(connectionLines) && connectionLines.map((line, index) => (
              <g key={index}>
                {/* Debug: Connection line endpoints */}
                <circle
                  cx={line.from.columnIndex * COLUMN_WIDTH + NODE_RADIUS + NODE_RADIUS / 2}
                  cy={line.from.rowIndex * NODE_HEIGHT + NODE_HEIGHT / 2 + 24}
                  r="2"
                  fill="rgba(255,0,0,0.5)"
                />
                <circle
                  cx={line.to.columnIndex * COLUMN_WIDTH + NODE_RADIUS + NODE_RADIUS / 2}
                  cy={line.to.rowIndex * NODE_HEIGHT + NODE_HEIGHT / 2 + 24}
                  r="2"
                  fill="rgba(0,255,0,0.5)"
                />
                
                {/* Actual connection line */}
                <path
                  d={line.pathData}
                  stroke={line.color || '#6b7280'} // Fallback to gray if no color
                  strokeWidth={Math.max(line.strokeWidth, 3)} // Ensure minimum visibility
                  fill="none"
                  strokeDasharray={line.type === 'merge' ? '5,5' : undefined}
                  className="transition-all duration-200"
                  style={{
                    filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))', // Stronger shadow for better visibility
                    opacity: 0.9, // Slightly transparent for better visual integration
                  }}
                  strokeLinecap="round" // Smoother line endings
                  strokeLinejoin="round" // Smoother line joints
                />
              </g>
            ))}
          </svg>
          
          {/* Checkpoint nodes with performance optimization */}
          <div className="relative z-[10]">
            {Array.isArray(treeNodes) && treeNodes.map((node, index) => (
              <motion.div
                key={node.checkpoint.hash}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ 
                  delay: Math.min(index * 0.02, 0.5), // Limit animation delay for performance
                  duration: 0.2 
                }}
                className="absolute group cursor-pointer"
                style={{
                  left: node.columnIndex * COLUMN_WIDTH + 12, // Add offset to prevent overlap with buttons
                  top: node.rowIndex * NODE_HEIGHT + 24, // Account for top padding
                  width: `calc(100% - ${node.columnIndex * COLUMN_WIDTH + 12}px)`, // Adjust width to fill remaining space
                  height: `${NODE_HEIGHT}px`
                }}
                onClick={() => {
                  setSelectedCheckpoint(node.checkpoint)
                  setShowFileChangesDialog(true)
                }}
              >
                {/* Git-style commit row */}
                <div className="flex items-center w-full h-full hover:bg-accent/50 rounded-md transition-colors relative">
                  {/* Background for better contrast with connection lines - only on hover and only for text area */}
                  <div 
                    className="absolute rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-[1]"
                    style={{
                      left: `${NODE_RADIUS + 20}px`, // Start after the node circle
                      top: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(255,255,255,0.8)',
                    }}
                  />
                  {/* Node circle/square */}
                  <div
                    className={cn(
                      "relative flex items-center justify-center transition-all duration-200 flex-shrink-0 z-[15]",
                      node.isMergeCommit 
                        ? "w-4 h-4 rounded-sm border-2" // Square for merge commits
                        : "w-3 h-3 rounded-full border-2", // Circle for regular commits
                      node.isCurrent 
                        ? "bg-current border-current shadow-lg" 
                        : "bg-background border-current group-hover:scale-150"
                    )}
                    style={{
                      marginLeft: NODE_RADIUS, // Offset for node circle
                      borderColor: node.branchColor,
                      backgroundColor: node.isCurrent ? node.branchColor : 'white',
                      boxShadow: node.isCurrent ? `0 0 15px ${node.branchColor}40` : `0 0 0 1px white, 0 0 0 2px ${node.branchColor}`,
                      position: 'relative',
                    }}
                  >
                    {node.isMergeCommit && (
                      <GitMerge className="w-2 h-2 text-current" style={{ color: node.branchColor }} />
                    )}
                    
                    {/* Enhanced indicator for merge commits */}
                    {node.isMergeCommit && (
                      <div 
                        className="absolute inset-0 rounded-sm border-2 border-dashed opacity-30"
                        style={{ borderColor: node.branchColor }}
                      />
                    )}
                    {node.isCurrent && (
                      <div 
                        className={cn(
                          "absolute inset-0 animate-ping opacity-75",
                          node.isMergeCommit ? "rounded-sm" : "rounded-full"
                        )}
                        style={{ backgroundColor: node.branchColor }}
                      />
                    )}
                  </div>
                  
                  {/* Git-style commit info */}
                  <div className="flex-1 ml-3 min-w-0 relative z-[12]">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        {/* Commit hash and description */}
                        <div className="flex items-center gap-2 mb-1">
                          <div className={cn(
                            "text-sm font-medium truncate transition-colors cursor-pointer",
                            node.isCurrent 
                              ? "text-foreground" 
                              : "text-foreground/90 group-hover:text-foreground"
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            navigator.clipboard.writeText(node.checkpoint.description)
                          }}
                          title="Click to copy commit message"
                          >
                            {node.checkpoint.description}
                          </div>
                          
                          {/* Git-style indicators */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {node.isMergeCommit && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                                    <GitMerge className="w-3 h-3 mr-1" />
                                    merge ({node.checkpoint.parents.length})
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="space-y-2">
                                    <p>Merge commit with {node.checkpoint.parents.length} parents</p>
                                    <div className="space-y-1">
                                      <p className="text-xs text-muted-foreground">Parents:</p>
                                      {Array.isArray(node.checkpoint.parents) && node.checkpoint.parents.map((parent, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                          <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                                            {parent.substring(0, 7)}
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            {idx === 0 ? '(main parent)' : '(merged branch)'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            
                            {node.isCurrent && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                <GitBranchIcon className="w-3 h-3 mr-1" />
                                {isDetachedHead ? "HEAD" : "HEAD"}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Git-style metadata */}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs">{node.checkpoint.hash.substring(0, 7)}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation()
                                navigator.clipboard.writeText(node.checkpoint.hash)
                              }}
                              title="Copy commit hash"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{formatDistanceToNow(new Date(node.checkpoint.timestamp))} ago</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Git-style action buttons */}
                      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        {!node.isCurrent && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-accent"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (onCheckpointRestore) {
                                    setSelectedCheckpoint(node.checkpoint)
                                    setShowRestoreDialog(true)
                                  }
                                }}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{node.isMergeCommit ? 'Checkout merge commit' : 'Checkout this commit'}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-accent"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
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
                            
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                const message = `${node.checkpoint.description}\n\nCommit: ${node.checkpoint.hash}\nDate: ${new Date(node.checkpoint.timestamp).toLocaleString()}`
                                navigator.clipboard.writeText(message)
                              }}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copy commit info
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
                                // TODO: Implement create branch from this commit
                                console.log('Create branch from:', node.checkpoint.hash)
                              }}
                            >
                              <GitBranchIcon className="h-4 w-4 mr-2" />
                              Create branch from here
                            </DropdownMenuItem>
                            
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
                
                {/* Git-style detailed tooltip */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="absolute inset-0" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="z-50 max-w-96">
                    <div className="space-y-3">
                      <div>
                        <p className="font-medium text-sm">{node.checkpoint.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">commit</span>
                          <span className="text-xs font-mono bg-muted px-1 py-0.5 rounded">
                            {node.checkpoint.hash.substring(0, 12)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="text-xs text-muted-foreground space-y-2">
                        
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          <span>{new Date(node.checkpoint.timestamp).toLocaleString()}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <GitBranchIcon className="w-3 h-3 flex-shrink-0" />
                          <span>Branch: </span>
                          <span className="font-mono bg-muted px-1 py-0.5 rounded text-xs">{node.branchName}</span>
                        </div>
                        
                        {node.checkpoint.parents.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground mt-0.5">Parents:</span>
                            <div className="flex flex-col gap-1">
                              {node.checkpoint.parents.map((parent, idx) => (
                                <span key={idx} className="font-mono text-xs">
                                  {parent.substring(0, 7)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground">
                          Click to view changes • Right-click for git operations
                        </p>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </motion.div>
            ))}
          </div>
        </div>

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
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
                <h4 className="font-medium text-blue-900">{selectedCheckpoint.description}</h4>
                <p className="text-sm text-blue-700">
                  Created {formatDistanceToNow(new Date(selectedCheckpoint.timestamp))} ago
                </p>
                <p className="text-sm text-blue-700 font-mono">
                  {selectedCheckpoint.hash.substring(0, 12)}
                </p>
              </div>
            )}

            {/* Backup information */}
            <div className="bg-green-50 border border-green-200 rounded-md p-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-green-900">Automatic Backup</span>
              </div>
              <p className="text-sm text-green-700 mt-1">
                Your current state will be automatically backed up before restoration. You can access backups from the timeline if needed.
              </p>
            </div>

            {/* Diff preview */}
            <div className="flex-1 overflow-hidden">
              <h4 className="font-medium mb-2">Changes Preview:</h4>
              {loadingRestorePreview ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
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
                {loading ? 'Restoring...' : 'Restore Checkpoint'}
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
                  {/* File statistics */}
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
                  
                  {/* Diff viewer */}
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
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <h4 className="font-medium text-red-900">{selectedCheckpoint.description}</h4>
                <p className="text-sm text-red-700">
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
                {loading ? 'Deleting...' : 'Delete Checkpoint'}
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
              className="absolute top-0 left-0 right-0 bg-red-50 border border-red-200 rounded-md p-2 text-sm text-red-800 mb-2"
            >
              <div className="flex items-center justify-between">
                <span>{error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setError(null)}
                  className="h-6 w-6 p-0 text-red-600 hover:text-red-800"
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
})

GitTimelineTree.displayName = 'GitTimelineTree'

export default GitTimelineTree