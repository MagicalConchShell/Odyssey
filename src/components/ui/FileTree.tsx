import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getFileIcon } from '../project/lib/file-utils'

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

export interface FileTreeProps {
  items: FileTreeItem[]
  onItemClick?: (item: FileTreeItem) => void
  className?: string
  formatFileSize?: (bytes: number) => string
  showFileInfo?: boolean
  showGitStatus?: boolean
}

interface FileTreeNodeProps {
  item: FileTreeItem
  level: number
  onItemClick?: (item: FileTreeItem) => void
  formatFileSize?: (bytes: number) => string
  showFileInfo?: boolean
  showGitStatus?: boolean
}

const FileTreeNode = ({ item, level, onItemClick, formatFileSize, showFileInfo, showGitStatus }: FileTreeNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(true)
  
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
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
          "flex items-center gap-2 py-1 px-2 hover:bg-accent/50 cursor-pointer rounded-sm transition-colors",
          "group"
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
            const fileName = item.path.split('/').pop() || ''
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
            {item.path.split('/').pop()}
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
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const FileTree = ({ 
  items, 
  onItemClick, 
  className, 
  formatFileSize,
  showFileInfo = true,
  showGitStatus = false 
}: FileTreeProps) => {
  if (items.length === 0) {
    return (
      <div className={cn("text-center py-8 text-muted-foreground", className)}>
        <FileText className="w-8 h-8 mx-auto mb-2" />
        <p className="text-sm">No files found</p>
      </div>
    )
  }
  
  return (
    <div className={cn("space-y-1", className)}>
      {items.map((item, index) => (
        <FileTreeNode
          key={`${item.path}-${index}`}
          item={item}
          level={0}
          onItemClick={onItemClick}
          formatFileSize={formatFileSize}
          showFileInfo={showFileInfo}
          showGitStatus={showGitStatus}
        />
      ))}
    </div>
  )
}