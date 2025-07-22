import React, { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Plus, Minus, Edit, ArrowRight, FileText, FolderOpen, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FileDiff, DiffType } from '../../../electron/types/git-checkpoint'

export interface DiffViewerProps {
  diffs: FileDiff[]
  onFileClick?: (diff: FileDiff) => void
  className?: string
  formatFileSize?: (bytes: number) => string
  showFileInfo?: boolean
}

interface DiffTreeNode {
  path: string
  isDirectory: boolean
  diff?: FileDiff
  children?: DiffTreeNode[]
}

const getDiffTypeIcon = (type: DiffType) => {
  switch (type) {
    case 'added':
      return <Plus className="h-4 w-4 text-green-600" />
    case 'deleted':
      return <Minus className="h-4 w-4 text-red-600" />
    case 'modified':
      return <Edit className="h-4 w-4 text-blue-600" />
    case 'renamed':
      return <ArrowRight className="h-4 w-4 text-orange-600" />
    default:
      return <FileText className="h-4 w-4 text-gray-600" />
  }
}

const getDiffTypeColor = (type: DiffType) => {
  switch (type) {
    case 'added':
      return 'text-green-600 bg-green-50 border-green-200'
    case 'deleted':
      return 'text-red-600 bg-red-50 border-red-200'
    case 'modified':
      return 'text-blue-600 bg-blue-50 border-blue-200'
    case 'renamed':
      return 'text-orange-600 bg-orange-50 border-orange-200'
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}

const getDiffTypeLabel = (type: DiffType) => {
  switch (type) {
    case 'added':
      return 'Added'
    case 'deleted':
      return 'Deleted'
    case 'modified':
      return 'Modified'
    case 'renamed':
      return 'Renamed'
    default:
      return 'Unknown'
  }
}

const buildDiffTree = (diffs: FileDiff[]): DiffTreeNode[] => {
  const tree: DiffTreeNode[] = []
  const nodeMap = new Map<string, DiffTreeNode>()

  // Create directory nodes first
  diffs.forEach(diff => {
    if (!diff.path) return
    const pathParts = diff.path.split('/')
    let currentPath = ''
    
    pathParts.forEach((part, index) => {
      const isLast = index === pathParts.length - 1
      currentPath = currentPath ? `${currentPath}/${part}` : part
      
      if (!nodeMap.has(currentPath)) {
        const node: DiffTreeNode = {
          path: currentPath,
          isDirectory: !isLast,
          diff: isLast ? diff : undefined,
          children: []
        }
        nodeMap.set(currentPath, node)
        
        if (index === 0) {
          tree.push(node)
        } else {
          const parentPath = pathParts.slice(0, index).join('/')
          const parentNode = nodeMap.get(parentPath)
          if (parentNode) {
            parentNode.children!.push(node)
          }
        }
      }
    })
  })

  // Sort tree nodes: directories first, then files
  const sortNodes = (nodes: DiffTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.path.localeCompare(b.path)
    })
    nodes.forEach(node => {
      if (node.children) {
        sortNodes(node.children)
      }
    })
  }

  sortNodes(tree)
  return tree
}

interface DiffTreeNodeProps {
  node: DiffTreeNode
  level: number
  onFileClick?: (diff: FileDiff) => void
  formatFileSize?: (bytes: number) => string
  showFileInfo?: boolean
}

const DiffTreeNode: React.FC<DiffTreeNodeProps> = ({ 
  node, 
  level, 
  onFileClick, 
  formatFileSize, 
  showFileInfo 
}) => {
  const [isExpanded, setIsExpanded] = useState(true)
  
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }
  
  const handleClick = () => {
    if (node.diff && onFileClick) {
      onFileClick(node.diff)
    }
  }
  
  const hasChildren = node.children && node.children.length > 0
  const fileName = node.path ? node.path.split('/').pop() || node.path : 'Unknown'
  
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-1 px-2 hover:bg-accent/50 cursor-pointer rounded-sm transition-colors group",
          node.diff && "hover:bg-accent/70"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse button for directories */}
        {hasChildren && (
          <button
            onClick={handleToggle}
            className="flex items-center justify-center w-4 h-4 rounded hover:bg-accent"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}
        
        {/* File/directory icon */}
        <div className="flex items-center gap-2">
          {node.isDirectory ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-blue-600" />
            ) : (
              <Folder className="h-4 w-4 text-blue-600" />
            )
          ) : (
            node.diff && getDiffTypeIcon(node.diff.type)
          )}
          
          {/* File name */}
          <span className={cn(
            "text-sm font-medium",
            node.diff && "group-hover:text-foreground cursor-pointer"
          )}>
            {fileName}
          </span>
          
          {/* Diff type badge */}
          {node.diff && (
            <span className={cn(
              "text-xs px-2 py-1 rounded-full border font-medium",
              getDiffTypeColor(node.diff.type)
            )}>
              {getDiffTypeLabel(node.diff.type)}
            </span>
          )}
          
          {/* Renamed path info */}
          {node.diff && node.diff.type === 'renamed' && node.diff.oldPath && (
            <span className="text-xs text-muted-foreground">
              from {node.diff.oldPath}
            </span>
          )}
        </div>
        
        {/* File size info */}
        {showFileInfo && node.diff && !node.isDirectory && formatFileSize && (
          <div className="ml-auto text-xs text-muted-foreground">
            {node.diff.type === 'modified' && node.diff.oldSize && node.diff.newSize ? (
              <div className="flex items-center gap-1">
                <span>{formatFileSize(node.diff.oldSize)}</span>
                <ArrowRight className="h-3 w-3" />
                <span>{formatFileSize(node.diff.newSize)}</span>
                <span className={cn(
                  "ml-1 font-medium",
                  node.diff.newSize > node.diff.oldSize ? "text-red-600" : "text-green-600"
                )}>
                  ({node.diff.newSize > node.diff.oldSize ? '+' : ''}{formatFileSize(node.diff.newSize - node.diff.oldSize)})
                </span>
              </div>
            ) : (
              <span>{formatFileSize(node.diff.newSize || node.diff.oldSize || 0)}</span>
            )}
          </div>
        )}
      </div>
      
      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <DiffTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onFileClick={onFileClick}
              formatFileSize={formatFileSize}
              showFileInfo={showFileInfo}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  diffs,
  onFileClick,
  className,
  formatFileSize,
  showFileInfo = true
}) => {
  const diffTree = useMemo(() => buildDiffTree(diffs), [diffs])
  
  if (diffs.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-32 text-center", className)}>
        <div>
          <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No file changes found
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div className={cn("space-y-1", className)}>
      {diffTree.map((node) => (
        <DiffTreeNode
          key={node.path}
          node={node}
          level={0}
          onFileClick={onFileClick}
          formatFileSize={formatFileSize}
          showFileInfo={showFileInfo}
        />
      ))}
    </div>
  )
}

export default DiffViewer