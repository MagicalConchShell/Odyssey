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
  Copy,
  Zap,
  Shield
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
import type { CheckpointInfo, TimelineTreeNode, ConnectionLine, FileDiff } from '@/types/checkpoint'

// Import the simplified layout algorithm
import { calculateGitGraphLayout } from './lib/checkpoint-layout';

interface CheckpointTimelineProps {
  projectPath: string
  compact?: boolean
  onCheckpointRestore?: (commitHash: string) => Promise<void>
  onCheckpointDelete?: (commitHash: string) => Promise<void>
  className?: string
}

export interface CheckpointTimelineRef {
  refreshTimeline: () => Promise<void>
}

// Constants for layout (simplified for linear timeline)
const NODE_HEIGHT = 48; // Height of each checkpoint node in pixels
const COLUMN_WIDTH = 32; // Width of the single column in pixels
const NODE_RADIUS = 4; // Radius of the checkpoint circle

/**
 * Simplified checkpoint timeline component
 * Displays checkpoints in a clean, linear timeline view
 */
export const CheckpointTimeline = forwardRef<CheckpointTimelineRef, CheckpointTimelineProps>(({ projectPath, compact = false, onCheckpointRestore, onCheckpointDelete, className }, ref) => {
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([])
  const [currentRef, setCurrentRef] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRestoreDialog, setShowRestoreDialog] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<CheckpointInfo | null>(null)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [treeNodes, setTreeNodes] = useState<TimelineTreeNode[]>([])
  const [connectionLines, setConnectionLines] = useState<ConnectionLine[]>([])
  // maxColumns is always 1 for linear timeline, but keeping for compatibility
  const [, setMaxColumns] = useState(0)
  const [showFileChangesDialog, setShowFileChangesDialog] = useState(false)
  const [fileChanges, setFileChanges] = useState<FileDiff[] | null>(null)
  const [showFileContentDiff, setShowFileContentDiff] = useState(false)
  const [selectedFileDiff, setSelectedFileDiff] = useState<FileDiff | null>(null)
  const [restorePreviewDiffs, setRestorePreviewDiffs] = useState<FileDiff[] | null>(null)
  const [loadingRestorePreview, setLoadingRestorePreview] = useState(false)

  // Memoized graph layout calculation for performance (now much simpler!)
  const { layoutNodes, layoutConnections, calculatedMaxColumns } = useMemo(() => {
    if (checkpoints.length > 0) {
      const { nodes, connections, maxColumns } = calculateGitGraphLayout(
        checkpoints,
        [],
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
  }, [checkpoints, currentRef]);
  
  // Update state when layout changes
  useEffect(() => {
    setTreeNodes(layoutNodes);
    setConnectionLines(layoutConnections);
    setMaxColumns(calculatedMaxColumns);
  }, [layoutNodes, layoutConnections, calculatedMaxColumns]);

  // Load history (simplified - no complex branch logic needed)
  const loadHistory = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const startTime = performance.now()
      const historyResult = await window.electronAPI.checkpoint.getHistory(projectPath)

      if (historyResult.success) {
        const checkpointData = historyResult.data || [];
        
        // Performance optimization: limit displayed checkpoints for very large histories
        const MAX_DISPLAYED_CHECKPOINTS = 1000;
        const displayedCheckpoints = checkpointData.length > MAX_DISPLAYED_CHECKPOINTS 
          ? checkpointData.slice(0, MAX_DISPLAYED_CHECKPOINTS)
          : checkpointData;
        
        setCheckpoints(displayedCheckpoints)
        
        // Set current checkpoint (most recent)
        if (displayedCheckpoints.length > 0) {
          const currentCheckpoint = displayedCheckpoints[0] // Most recent checkpoint
          setCurrentRef(currentCheckpoint.hash)
        } else {
          setCurrentRef(null)
        }
        
        // Log performance metrics
        const loadTime = performance.now() - startTime
        if (loadTime > 1000) {
          console.warn(`Timeline loading took ${loadTime.toFixed(2)}ms for ${checkpointData.length} checkpoints`)
        }
        
        // Show warning for large histories
        if (checkpointData.length > MAX_DISPLAYED_CHECKPOINTS) {
          console.warn(`Large history detected: showing ${MAX_DISPLAYED_CHECKPOINTS} of ${checkpointData.length} checkpoints`)
        }
      } else {
        setCheckpoints([])
        setCurrentRef(null)
        setError(historyResult.error || 'Failed to load history')
      }
    } catch (err: any) {
      setCheckpoints([])
      setCurrentRef(null)
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
        const result = await window.electronAPI.checkpoint.checkout(projectPath, selectedCheckpoint.hash)
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

  // Reset to checkpoint handler (destructive, truncates history)
  const handleResetToCheckpoint = async () => {
    if (!selectedCheckpoint) return
    
    // Validate confirmation text
    if (resetConfirmText !== 'RESET') {
      setError('Please type "RESET" to confirm this destructive operation')
      return
    }

    try {
      setLoading(true)
      const result = await window.electronAPI.checkpoint.resetToCheckpoint(projectPath, selectedCheckpoint.hash)
      if (!result.success) {
        throw new Error(result.error || 'Failed to reset to checkpoint')
      }
      
      setShowResetDialog(false)
      setSelectedCheckpoint(null)
      setResetConfirmText('')
      await loadHistory()
    } catch (err: any) {
      setError(err.message || 'Failed to reset to checkpoint')
    } finally {
      setLoading(false)
    }
  }

  // Delete checkpoint - SAFE implementation (only supports deleting latest checkpoint)
  const handleDeleteCheckpoint = async () => {
    if (!selectedCheckpoint) return

    try {
      setLoading(true)
      if (onCheckpointDelete) {
        await onCheckpointDelete(selectedCheckpoint.hash)
      } else {
        const result = await window.electronAPI.checkpoint.deleteCheckpoint(projectPath, selectedCheckpoint.hash)
        if (!result.success) {
          throw new Error(result.error || 'Failed to delete checkpoint')
        }
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
      const result = await window.electronAPI.checkpoint.getCheckpointChanges(projectPath, commitHash)
      if (result.success) {
        if (result.data) {
          // Parse serialized files if available, otherwise use direct files
          const diffFiles: FileDiff[] = result.data.serializedFiles 
            ? JSON.parse(result.data.serializedFiles) 
            : (result.data.files || []);

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

  // Load file changes when selected checkpoint changes
  useEffect(() => {
    if (showFileChangesDialog && selectedCheckpoint) {
      loadFileChanges(selectedCheckpoint.hash)
    }
  }, [showFileChangesDialog, selectedCheckpoint])

  // Load restore preview when restore dialog is opened
  useEffect(() => {
    if ((showRestoreDialog || showResetDialog) && selectedCheckpoint) {
      loadRestorePreview(selectedCheckpoint.hash)
    }
  }, [showRestoreDialog, showResetDialog, selectedCheckpoint])

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
      // Get current checkpoint reference
      const currentResult = await window.electronAPI.checkpoint.getHistory(projectPath)
      if (!currentResult.success || !currentResult.data || currentResult.data.length === 0) {
        throw new Error('Could not get current checkpoint reference')
      }
      
      const currentRef = currentResult.data[0].hash
      
      // Get diff between current checkpoint and target checkpoint
      const diffResult = await window.electronAPI.checkpoint.getFileDiff(projectPath, currentRef, targetRef)
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
          <p className="text-sm text-gray-600">Loading checkpoints...</p>
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
        {/* Checkpoint timeline - simplified linear view */}
        <div className="relative" style={{ minHeight: treeNodes.length * (compact ? 36 : 52) + 48 }}>
          {/* Simple SVG connection lines - no complex curves needed */}
          <svg
            className="absolute pointer-events-none z-[5]"
            style={{ 
              left: '12px',
              top: 0,
              width: `100%`,
              height: '100%',
            }}
          >
            {connectionLines.map((line, index) => (
              <line
                key={index}
                x1={line.from.columnIndex * COLUMN_WIDTH + NODE_RADIUS + NODE_RADIUS / 2}
                y1={line.from.rowIndex * NODE_HEIGHT + NODE_HEIGHT / 2 + 24}
                x2={line.to.columnIndex * COLUMN_WIDTH + NODE_RADIUS + NODE_RADIUS / 2}
                y2={line.to.rowIndex * NODE_HEIGHT + NODE_HEIGHT / 2 + 24}
                stroke={line.color}
                strokeWidth={line.strokeWidth}
                className="transition-all duration-200"
              />
            ))}
          </svg>
          
          {/* Checkpoint nodes - simplified without merge commit complexity */}
          <div className="relative z-[10]">
            {treeNodes.map((node, index) => (
              <motion.div
                key={node.checkpoint.hash}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ 
                  delay: Math.min(index * 0.02, 0.5),
                  duration: 0.2 
                }}
                className="absolute group cursor-pointer"
                style={{
                  left: node.columnIndex * COLUMN_WIDTH + 12,
                  top: node.rowIndex * NODE_HEIGHT + 24,
                  width: `calc(100% - ${node.columnIndex * COLUMN_WIDTH + 12}px)`,
                  height: `${NODE_HEIGHT}px`
                }}
                onClick={() => {
                  setSelectedCheckpoint(node.checkpoint)
                  setShowFileChangesDialog(true)
                }}
              >
                {/* Simplified checkpoint row */}
                <div className="flex items-center w-full h-full hover:bg-accent/50 rounded-md transition-colors relative">
                  {/* Simple checkpoint circle (no merge commit squares) */}
                  <div
                    className={cn(
                      "relative flex items-center justify-center transition-all duration-200 flex-shrink-0 z-[15]",
                      "w-3 h-3 rounded-full border-2", // Always circle for consistency
                      node.isCurrent 
                        ? "bg-current border-current shadow-lg" 
                        : "bg-background border-current group-hover:scale-150"
                    )}
                    style={{
                      marginLeft: NODE_RADIUS,
                      borderColor: node.timelineColor,
                      backgroundColor: node.isCurrent ? node.timelineColor : 'white',
                      boxShadow: node.isCurrent ? `0 0 15px ${node.timelineColor}40` : `0 0 0 1px white, 0 0 0 2px ${node.timelineColor}`,
                    }}
                  >
                    {node.isCurrent && (
                      <div 
                        className="absolute inset-0 animate-ping opacity-75 rounded-full"
                        style={{ backgroundColor: node.timelineColor }}
                      />
                    )}
                  </div>
                  
                  {/* Checkpoint info - simplified without Git terminology */}
                  <div className="flex-1 ml-3 min-w-0 relative z-[12]">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        {/* Checkpoint description and metadata */}
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
                          title="Click to copy checkpoint description"
                          >
                            {node.checkpoint.description}
                          </div>
                          
                          {/* Current checkpoint indicator */}
                          {node.isCurrent && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              Current
                            </span>
                          )}
                        </div>
                        
                        {/* Checkpoint metadata */}
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
                              title="Copy checkpoint hash"
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
                      
                      {/* Action buttons */}
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
                              <p>Restore to this checkpoint</p>
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
                              Copy checkpoint hash
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                const message = `${node.checkpoint.description}\n\nCheckpoint: ${node.checkpoint.hash}\nDate: ${new Date(node.checkpoint.timestamp).toLocaleString()}`
                                navigator.clipboard.writeText(message)
                              }}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copy checkpoint info
                            </DropdownMenuItem>
                            
                            {!node.isCurrent && (
                              <>
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
                                  Restore (safe)
                                </DropdownMenuItem>
                                
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedCheckpoint(node.checkpoint)
                                    setShowResetDialog(true)
                                  }}
                                  className="text-orange-600 dark:text-orange-400"
                                >
                                  <Zap className="h-4 w-4 mr-2" />
                                  Reset here (destructive)
                                </DropdownMenuItem>
                              </>
                            )}
                            
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedCheckpoint(node.checkpoint)
                                setShowDeleteDialog(true)
                              }}
                              className="text-destructive"
                              disabled={node.isCurrent || node !== treeNodes[0]}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {node === treeNodes[0] ? 'Delete latest checkpoint' : 'Cannot delete (not latest)'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Simplified tooltip */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="absolute inset-0" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="z-50 max-w-96">
                    <div className="space-y-3">
                      <div>
                        <p className="font-medium text-sm">{node.checkpoint.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">checkpoint</span>
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
                        
                        {node.checkpoint.parent && (
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground mt-0.5">Parent:</span>
                            <span className="font-mono text-xs">
                              {node.checkpoint.parent.substring(0, 7)}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground">
                          Click to view changes • Right-click for operations
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
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-600" />
                Safe Restore Checkpoint
              </DialogTitle>
              <DialogDescription>
                This will replace your current project files with the checkpoint state without deleting history.
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

        {/* Reset to checkpoint dialog (destructive) */}
        <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-orange-600" />
                Reset to Checkpoint (Destructive)
              </DialogTitle>
              <DialogDescription>
                <strong className="text-orange-600">⚠️ WARNING:</strong> This will permanently delete all checkpoints after this one and cannot be undone.
                Your project files will be restored to this checkpoint state.
              </DialogDescription>
            </DialogHeader>
            
            {selectedCheckpoint && (
              <div className="space-y-4">
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md p-3">
                  <h4 className="font-medium text-orange-900 dark:text-orange-100">{selectedCheckpoint.description}</h4>
                  <p className="text-sm text-orange-700 dark:text-orange-300">
                    Created {formatDistanceToNow(new Date(selectedCheckpoint.timestamp))} ago
                  </p>
                  <p className="text-sm text-orange-700 dark:text-orange-300 font-mono">
                    {selectedCheckpoint.hash.substring(0, 12)}
                  </p>
                </div>

                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <h4 className="font-medium text-red-900 dark:text-red-100">This operation will:</h4>
                      <ul className="text-sm text-red-700 dark:text-red-300 space-y-1 list-disc ml-4">
                        <li><strong>Permanently delete</strong> all checkpoints created after this one</li>
                        <li><strong>Truncate history</strong> - these checkpoints cannot be recovered</li>
                        <li><strong>Reset your files</strong> to exactly match this checkpoint state</li>
                        <li><strong>Create an automatic backup</strong> before proceeding</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Automatic Backup Protection</span>
                  </div>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Your current state will be automatically backed up before any changes are made.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Type <span className="font-mono bg-muted px-1 rounded">RESET</span> to confirm this destructive operation:
                  </label>
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value.toUpperCase())}
                    placeholder="Type RESET to confirm"
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    autoComplete="off"
                  />
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
                          className="p-2 h-full overflow-auto max-h-48"
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
              </div>
            )}
            
            <DialogFooter className="mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowResetDialog(false)
                  setResetConfirmText('')
                }}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleResetToCheckpoint}
                disabled={loading || loadingRestorePreview || resetConfirmText !== 'RESET'}
                variant="destructive"
                className="bg-orange-600 hover:bg-orange-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Reset & Delete History
                  </>
                )}
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
              {selectedCheckpoint && !loading && selectedCheckpoint.hash !== currentRef && (
                <div className="flex gap-2">
                  <Button
                    variant="outline" 
                    onClick={() => {
                      if (onCheckpointRestore) {
                        setShowFileChangesDialog(false)
                        setShowRestoreDialog(true)
                      }
                    }}
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Safe Restore
                  </Button>
                  <Button
                    onClick={() => {
                      setShowFileChangesDialog(false)
                      setShowResetDialog(true)
                    }}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Reset Here
                  </Button>
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete checkpoint dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-600" />
                Delete Latest Checkpoint
              </DialogTitle>
              <DialogDescription>
                This will permanently delete the latest checkpoint and reset your project to the previous state.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            
            {selectedCheckpoint && (
              <div className="space-y-4">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                  <h4 className="font-medium text-red-900 dark:text-red-100">{selectedCheckpoint.description}</h4>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Created {formatDistanceToNow(new Date(selectedCheckpoint.timestamp))} ago
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 font-mono">
                    {selectedCheckpoint.hash.substring(0, 12)}
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Safe Delete</span>
                  </div>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Only the latest checkpoint can be deleted. Your project will revert to the previous checkpoint state.
                  </p>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-900 dark:text-amber-100">Automatic Backup</span>
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    A backup will be created automatically before deletion.
                  </p>
                </div>
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
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : 'Delete Latest Checkpoint'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* File content diff dialog */}
        {selectedFileDiff && selectedCheckpoint && (
          <FileContentDiff
            projectPath={projectPath}
            fromRef={selectedCheckpoint.parent || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'}
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

CheckpointTimeline.displayName = 'CheckpointTimeline'

export default CheckpointTimeline