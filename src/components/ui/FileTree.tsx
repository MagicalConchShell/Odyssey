import React, { useRef } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, FileText, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getFileIcon } from '../project/lib/file-utils'
import { useFileTreeStore, TreeNode } from './hooks/useFileTreeStore'
import { useVirtualizer } from '@tanstack/react-virtual'

// Legacy interface for backward compatibility
export interface FileTreeItem {
  path: string
  fullPath?: string
  isDirectory: boolean
  size?: number
  modified?: string
  hash?: string
  children?: FileTreeItem[]
  gitStatus?: 'modified' | 'untracked' | 'deleted' | 'staged'
}

// New optimized interface for lazy loading
export interface FileTreeProps {
  // For lazy loading mode (new)
  rootPath?: string
  onNodeExpand?: (path: string) => Promise<void>
  
  // For legacy mode (backward compatibility)
  items?: FileTreeItem[]
  
  // Virtual scrolling options
  enableVirtualScrolling?: boolean
  itemHeight?: number
  
  // Common props
  onItemClick?: (item: FileTreeItem | TreeNode) => void
  className?: string
  formatFileSize?: (bytes: number) => string
  showFileInfo?: boolean
  showGitStatus?: boolean
  recentlyChangedFiles?: Set<string>
}

// Legacy component props
interface FileTreeNodeProps {
  item: FileTreeItem
  level: number
  onItemClick?: (item: FileTreeItem) => void
  formatFileSize?: (bytes: number) => string
  showFileInfo?: boolean
  showGitStatus?: boolean
  recentlyChangedFiles?: Set<string>
}

// New optimized component props
interface TreeNodeProps {
  node: TreeNode
  onItemClick?: (item: TreeNode) => void
  onNodeExpand?: (path: string) => Promise<void>
  formatFileSize?: (bytes: number) => string
  showFileInfo?: boolean
  recentlyChangedFiles?: Set<string>
}

const FileTreeNode = ({ item, level, onItemClick, formatFileSize, showFileInfo, showGitStatus, recentlyChangedFiles }: FileTreeNodeProps) => {
  const { isExpanded: isPathExpanded, togglePath } = useFileTreeStore()
  
  // Use store-based expansion state for directories
  // New directories not in the store will return false (collapsed by default)
  const isExpanded = item.isDirectory ? 
    isPathExpanded(item.fullPath || item.path) : 
    false
  
  // Check if this file is recently changed
  const isRecentlyChanged = recentlyChangedFiles?.has(item.path) || false
  
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (item.isDirectory) {
      togglePath(item.fullPath || item.path)
    }
  }
  
  const handleClick = () => {
    if (onItemClick) {
      onItemClick(item)
    }
  }
  
  const hasChildren = item.children && item.children.length > 0
  
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-1 px-2 hover:bg-accent/50 cursor-pointer rounded-sm transition-all duration-300",
          "group",
          {
            "bg-blue-50/30 border-l-2 border-l-blue-400 animate-pulse": isRecentlyChanged
          }
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse button for directories */}
        {item.isDirectory && hasChildren && (
          <button
            onClick={handleToggle}
            className="flex items-center justify-center w-4 h-4 hover:bg-accent rounded-sm transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
        )}
        
        {/* Spacer for files or directories without children */}
        {(!item.isDirectory || !hasChildren) && (
          <div className="w-4 h-4" />
        )}
        
        {/* File/folder icon with git status indicator */}
        <div className="flex-shrink-0 relative">
          {item.isDirectory ? (
            isExpanded ? (
              <FolderOpen className="w-4 h-4 text-blue-500" />
            ) : (
              <Folder className="w-4 h-4 text-blue-500" />
            )
          ) : (() => {
            const fileName = item.path ? item.path.split('/').pop() || '' : ''
            const { icon: FileIcon, color } = getFileIcon(fileName)
            return <FileIcon className={cn("w-4 h-4", color)} />
          })()}
          
          {/* Git status indicator */}
          {showGitStatus && item.gitStatus && (
            <div className={cn(
              "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-background",
              {
                'bg-green-500': item.gitStatus === 'untracked',
                'bg-yellow-500': item.gitStatus === 'modified',
                'bg-red-500': item.gitStatus === 'deleted',
                'bg-blue-500': item.gitStatus === 'staged',
              }
            )} />
          )}
        </div>
        
        {/* File/folder name */}
        <div className="flex-1 min-w-0">
          <div className="text-xs truncate font-mono">
            {item.path ? item.path.split('/').pop() : 'Unknown'}
          </div>
        </div>
        
        {/* File info (size, hash) */}
        {showFileInfo && !item.isDirectory && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            {item.size !== undefined && formatFileSize && (
              <span>{formatFileSize(item.size)}</span>
            )}
            {item.hash && (
              <span className="font-mono">{item.hash.substring(0, 6)}</span>
            )}
          </div>
        )}
      </div>
      
      {/* Children */}
      {item.isDirectory && hasChildren && isExpanded && (
        <div>
          {item.children!.map((child, index) => (
            <FileTreeNode
              key={`${child.path}-${index}`}
              item={child}
              level={level + 1}
              onItemClick={onItemClick}
              formatFileSize={formatFileSize}
              showFileInfo={showFileInfo}
              showGitStatus={showGitStatus}
              recentlyChangedFiles={recentlyChangedFiles}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// New optimized TreeNode component for lazy loading
const TreeNodeComponent = ({ node, onItemClick, onNodeExpand, formatFileSize, showFileInfo, recentlyChangedFiles }: TreeNodeProps) => {
  // Check if this file is recently changed
  const isRecentlyChanged = recentlyChangedFiles?.has(node.name) || false
  
  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (node.type === 'directory') {
      if (!node.children && onNodeExpand) {
        // First time expanding - load children
        await onNodeExpand(node.id)
        // After loading, expand the node
        const { setExpanded } = useFileTreeStore.getState()
        setExpanded(node.id, true)
      } else {
        // Just toggle expansion state
        const { togglePath } = useFileTreeStore.getState()
        togglePath(node.id)
      }
    }
  }
  
  const handleClick = () => {
    if (onItemClick) {
      onItemClick(node)
    }
  }
  
  const hasChildren = node.type === 'directory' && (node.isExpandable || (node.children && node.children.length > 0))
  
  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1 px-2 hover:bg-accent/50 cursor-pointer rounded-sm transition-all duration-300",
        "group",
        {
          "bg-blue-50/30 border-l-2 border-l-blue-400 animate-pulse": isRecentlyChanged
        }
      )}
      style={{ paddingLeft: `${node.level * 16 + 8}px` }}
      onClick={handleClick}
    >
      {/* Expand/collapse button for directories */}
      {node.type === 'directory' && hasChildren && (
        <button
          onClick={handleToggle}
          className="flex items-center justify-center w-4 h-4 hover:bg-accent rounded-sm transition-colors"
          disabled={node.isLoading}
        >
          {node.isLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : node.isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>
      )}
      
      {/* Spacer for files or directories without children */}
      {(node.type === 'file' || !hasChildren) && (
        <div className="w-4 h-4" />
      )}
      
      {/* File/folder icon */}
      <div className="flex-shrink-0 relative">
        {node.type === 'directory' ? (
          node.isExpanded ? (
            <FolderOpen className="w-4 h-4 text-blue-500" />
          ) : (
            <Folder className="w-4 h-4 text-blue-500" />
          )
        ) : (() => {
          const { icon: FileIcon, color } = getFileIcon(node.name)
          return <FileIcon className={cn("w-4 h-4", color)} />
        })()}
      </div>
      
      {/* File/folder name */}
      <div className="flex-1 min-w-0">
        <div className="text-xs truncate font-mono">
          {node.name}
        </div>
      </div>
      
      {/* File info (size) */}
      {showFileInfo && node.type === 'file' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          {node.size !== undefined && formatFileSize && (
            <span>{formatFileSize(node.size)}</span>
          )}
        </div>
      )}
    </div>
  )
}

export const FileTree = ({ 
  items, 
  rootPath,
  onNodeExpand,
  enableVirtualScrolling = true,
  itemHeight = 24,
  onItemClick, 
  className, 
  formatFileSize,
  showFileInfo = true,
  showGitStatus = false,
  recentlyChangedFiles
}: FileTreeProps) => {
  const { getVisibleNodes } = useFileTreeStore()
  const parentRef = useRef<HTMLDivElement>(null)
  
  // Determine which mode to use
  const isLazyLoadingMode = rootPath && onNodeExpand
  const isLegacyMode = items && items.length > 0
  
  if (isLazyLoadingMode) {
    // New lazy loading mode
    const visibleNodes = getVisibleNodes()
    
    if (visibleNodes.length === 0) {
      return (
        <div className={cn("text-center py-8 text-muted-foreground", className)}>
          <FileText className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">No files found</p>
        </div>
      )
    }
    
    if (enableVirtualScrolling && visibleNodes.length > 100) {
      // Use virtual scrolling for large lists
      const rowVirtualizer = useVirtualizer({
        count: visibleNodes.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => itemHeight,
        overscan: 10, // Render extra items for smooth scrolling
      })
      
      return (
        <div 
          ref={parentRef} 
          className={cn("h-full overflow-auto", className)}
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const node = visibleNodes[virtualItem.index]
              return (
                <div
                  key={node.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <TreeNodeComponent
                    node={node}
                    onItemClick={onItemClick}
                    onNodeExpand={onNodeExpand}
                    formatFileSize={formatFileSize}
                    showFileInfo={showFileInfo}
                    recentlyChangedFiles={recentlyChangedFiles}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )
    } else {
      // Regular rendering for smaller lists
      return (
        <div className={cn("space-y-1", className)}>
          {visibleNodes.map((node) => (
            <TreeNodeComponent
              key={node.id}
              node={node}
              onItemClick={onItemClick}
              onNodeExpand={onNodeExpand}
              formatFileSize={formatFileSize}
              showFileInfo={showFileInfo}
              recentlyChangedFiles={recentlyChangedFiles}
            />
          ))}
        </div>
      )
    }
  }
  
  if (isLegacyMode) {
    // Legacy mode for backward compatibility
    return (
      <div className={cn("space-y-1", className)}>
        {items!.map((item, index) => (
          <FileTreeNode
            key={`${item.path}-${index}`}
            item={item}
            level={0}
            onItemClick={onItemClick}
            formatFileSize={formatFileSize}
            showFileInfo={showFileInfo}
            showGitStatus={showGitStatus}
            recentlyChangedFiles={recentlyChangedFiles}
          />
        ))}
      </div>
    )
  }
  
  // No data provided
  return (
    <div className={cn("text-center py-8 text-muted-foreground", className)}>
      <FileText className="w-8 h-8 mx-auto mb-2" />
      <p className="text-sm">No files found</p>
    </div>
  )
}