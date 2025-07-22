import type { FileTreeItem } from '@/components/ui/FileTree'
import type { FileRestoreInfo } from '@/types/checkpoint'

/**
 * Transforms a flat list of files into a hierarchical tree structure
 */
export function buildFileTree(files: FileRestoreInfo[]): FileTreeItem[] {
  const tree: FileTreeItem[] = []
  const pathMap = new Map<string, FileTreeItem>()
  
  // Sort files to ensure directories are processed before their contents
  const sortedFiles = [...files].sort((a, b) => {
    // Directories first, then files
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    
    // Then sort by path depth (shallow first)
    const aDepth = a.path ? a.path.split('/').length : 0
    const bDepth = b.path ? b.path.split('/').length : 0
    if (aDepth !== bDepth) return aDepth - bDepth
    
    // Finally sort alphabetically
    return a.path.localeCompare(b.path)
  })
  
  // Process each file
  for (const file of sortedFiles) {
    if (!file.path) continue
    const pathParts = file.path.split('/').filter(Boolean)
    
    // Create the file tree item
    const item: FileTreeItem = {
      path: file.path,
      isDirectory: file.isDirectory,
      size: file.size,
      hash: file.hash,
      children: file.isDirectory ? [] : undefined
    }
    
    pathMap.set(file.path, item)
    
    if (pathParts.length === 1) {
      // Root level item
      tree.push(item)
    } else {
      // Find or create parent directory
      const parentPath = pathParts.slice(0, -1).join('/')
      let parent = pathMap.get(parentPath)
      
      if (!parent) {
        // Create missing parent directories
        parent = createMissingDirectories(parentPath, pathMap, tree)
      }
      
      if (parent && parent.children) {
        parent.children.push(item)
      }
    }
  }
  
  // Sort all children recursively
  sortTreeRecursively(tree)
  
  return tree
}

/**
 * Creates missing parent directories in the tree
 */
function createMissingDirectories(
  path: string,
  pathMap: Map<string, FileTreeItem>,
  tree: FileTreeItem[]
): FileTreeItem {
  if (!path) return tree[0] || { path: '', isDirectory: true, children: [] }
  const pathParts = path.split('/').filter(Boolean)
  let currentPath = ''
  let currentParent: FileTreeItem[] = tree
  let lastCreated: FileTreeItem | null = null
  
  for (const part of pathParts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part
    
    let existing = pathMap.get(currentPath)
    if (!existing) {
      // Create missing directory
      existing = {
        path: currentPath,
        isDirectory: true,
        children: []
      }
      
      pathMap.set(currentPath, existing)
      currentParent.push(existing)
    }
    
    currentParent = existing.children!
    lastCreated = existing
  }
  
  return lastCreated!
}

/**
 * Recursively sorts tree items (directories first, then alphabetically)
 */
function sortTreeRecursively(items: FileTreeItem[]): void {
  items.sort((a, b) => {
    // Directories first
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    
    // Then alphabetically by name
    const aName = a.path ? a.path.split('/').pop() || '' : ''
    const bName = b.path ? b.path.split('/').pop() || '' : ''
    return aName.localeCompare(bName)
  })
  
  // Sort children recursively
  for (const item of items) {
    if (item.children) {
      sortTreeRecursively(item.children)
    }
  }
}

/**
 * Alternative implementation: build tree from paths only (for when directories aren't explicitly listed)
 */
export function buildFileTreeFromPaths(files: FileRestoreInfo[]): FileTreeItem[] {
  const tree: FileTreeItem[] = []
  const pathMap = new Map<string, FileTreeItem>()
  
  for (const file of files) {
    if (!file.path) continue
    const pathParts = file.path.split('/').filter(Boolean)
    
    // Create all parent directories if they don't exist
    for (let i = 0; i < pathParts.length - 1; i++) {
      const dirPath = pathParts.slice(0, i + 1).join('/')
      
      if (!pathMap.has(dirPath)) {
        const dirItem: FileTreeItem = {
          path: dirPath,
          isDirectory: true,
          children: []
        }
        
        pathMap.set(dirPath, dirItem)
        
        if (i === 0) {
          // Root level directory
          tree.push(dirItem)
        } else {
          // Child directory
          const parentPath = pathParts.slice(0, i).join('/')
          const parent = pathMap.get(parentPath)
          if (parent && parent.children) {
            parent.children.push(dirItem)
          }
        }
      }
    }
    
    // Create the file item
    const fileItem: FileTreeItem = {
      path: file.path,
      isDirectory: file.isDirectory,
      size: file.size,
      hash: file.hash,
      children: file.isDirectory ? [] : undefined
    }
    
    pathMap.set(file.path, fileItem)
    
    if (pathParts.length === 1) {
      // Root level file
      tree.push(fileItem)
    } else {
      // Child file
      const parentPath = pathParts.slice(0, -1).join('/')
      const parent = pathMap.get(parentPath)
      if (parent && parent.children) {
        parent.children.push(fileItem)
      }
    }
  }
  
  // Sort all children recursively
  sortTreeRecursively(tree)
  
  return tree
}

/**
 * Counts total files and directories in a tree
 */
export function countTreeItems(items: FileTreeItem[]): { files: number; directories: number } {
  let files = 0
  let directories = 0
  
  for (const item of items) {
    if (item.isDirectory) {
      directories++
      if (item.children) {
        const childCounts = countTreeItems(item.children)
        files += childCounts.files
        directories += childCounts.directories
      }
    } else {
      files++
    }
  }
  
  return { files, directories }
}

/**
 * Filters tree items based on a search query
 */
export function filterTreeItems(items: FileTreeItem[], query: string): FileTreeItem[] {
  if (!query.trim()) return items
  
  const lowercaseQuery = query.toLowerCase()
  
  return items.reduce<FileTreeItem[]>((filtered, item) => {
    const matchesName = item.path.toLowerCase().includes(lowercaseQuery)
    
    if (item.isDirectory && item.children) {
      const filteredChildren = filterTreeItems(item.children, query)
      
      if (matchesName || filteredChildren.length > 0) {
        filtered.push({
          ...item,
          children: filteredChildren
        })
      }
    } else if (matchesName) {
      filtered.push(item)
    }
    
    return filtered
  }, [])
}