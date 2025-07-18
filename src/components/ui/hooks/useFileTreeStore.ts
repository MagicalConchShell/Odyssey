/**
 * File Tree Store - Optimized for incremental loading and performance
 * 
 * Manages file tree state using a flattened structure for efficient operations:
 * - Incremental loading of directory contents
 * - Virtual scrolling support
 * - Expansion/collapse state management
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

// Define the tree node structure optimized for lazy loading
interface TreeNode {
  id: string // path
  name: string
  type: 'file' | 'directory'
  level: number
  parentId?: string
  children?: string[] // Array of children IDs (paths)
  isExpanded: boolean
  isLoading: boolean
  isExpandable?: boolean // For directories, indicates if it has children
  size?: number
  modified?: string
}

// State interface
interface FileTreeState {
  // Flattened tree structure using path as key
  nodes: Record<string, TreeNode>
  // Root level node IDs
  rootIds: string[]
  // Track expanded paths for backward compatibility
  expandedPaths: Set<string>
  // Default expansion state for new directories
  defaultExpanded: boolean
}

// Actions interface
interface FileTreeActions {
  // Node management
  addNode: (node: TreeNode) => void
  addChildren: (parentPath: string, children: TreeNode[]) => void
  removeNode: (path: string) => void
  
  // Loading state management
  setNodeLoading: (path: string, isLoading: boolean) => void
  
  // Path-specific operations (backward compatibility)
  isExpanded: (path: string) => boolean
  togglePath: (path: string) => void
  setExpanded: (path: string, expanded: boolean) => void
  
  // New lazy loading operations
  expandNode: (path: string) => Promise<void>
  
  // Bulk operations
  expandAll: (allPaths: string[]) => void
  collapseAll: () => void
  
  // Configuration
  setDefaultExpanded: (expanded: boolean) => void
  
  // Utility
  reset: () => void
  
  // Computed properties
  getVisibleNodes: () => TreeNode[]
}

type FileTreeStore = FileTreeState & FileTreeActions

// Create the store
export const useFileTreeStore = create<FileTreeStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    nodes: {},
    rootIds: [],
    expandedPaths: new Set<string>(),
    defaultExpanded: false,

    // Node management actions
    addNode: (node: TreeNode) => {
      set((state) => ({
        nodes: {
          ...state.nodes,
          [node.id]: node
        }
      }))
    },

    addChildren: (parentPath: string, children: TreeNode[]) => {
      set((state) => {
        const newNodes = { ...state.nodes }
        const childIds: string[] = []

        // Add all children nodes
        children.forEach((child) => {
          newNodes[child.id] = child
          childIds.push(child.id)
        })

        // Update parent node with children
        if (newNodes[parentPath]) {
          newNodes[parentPath] = {
            ...newNodes[parentPath],
            children: childIds,
            isLoading: false
          }
        }

        return { nodes: newNodes }
      })
    },

    removeNode: (path: string) => {
      set((state) => {
        const newNodes = { ...state.nodes }
        delete newNodes[path]
        
        // Remove from parent's children array
        Object.values(newNodes).forEach((node) => {
          if (node.children) {
            node.children = node.children.filter(childId => childId !== path)
          }
        })

        return { nodes: newNodes }
      })
    },

    setNodeLoading: (path: string, isLoading: boolean) => {
      set((state) => {
        const node = state.nodes[path]
        if (!node) return state

        return {
          nodes: {
            ...state.nodes,
            [path]: { ...node, isLoading }
          }
        }
      })
    },

    // Backward compatibility operations
    isExpanded: (path: string) => {
      const state = get()
      return state.nodes[path]?.isExpanded || state.expandedPaths.has(path)
    },

    togglePath: (path: string) => {
      set((state) => {
        const node = state.nodes[path]
        if (!node) {
          // Fallback to old behavior for compatibility
          const newExpandedPaths = new Set(state.expandedPaths)
          if (newExpandedPaths.has(path)) {
            newExpandedPaths.delete(path)
          } else {
            newExpandedPaths.add(path)
          }
          return { expandedPaths: newExpandedPaths }
        }

        return {
          nodes: {
            ...state.nodes,
            [path]: { ...node, isExpanded: !node.isExpanded }
          },
          expandedPaths: node.isExpanded 
            ? new Set([...state.expandedPaths].filter(p => p !== path))
            : new Set([...state.expandedPaths, path])
        }
      })
    },

    setExpanded: (path: string, expanded: boolean) => {
      set((state) => {
        const node = state.nodes[path]
        if (!node) {
          // Fallback to old behavior for compatibility
          const newExpandedPaths = new Set(state.expandedPaths)
          if (expanded) {
            newExpandedPaths.add(path)
          } else {
            newExpandedPaths.delete(path)
          }
          return { expandedPaths: newExpandedPaths }
        }

        return {
          nodes: {
            ...state.nodes,
            [path]: { ...node, isExpanded: expanded }
          },
          expandedPaths: expanded 
            ? new Set([...state.expandedPaths, path])
            : new Set([...state.expandedPaths].filter(p => p !== path))
        }
      })
    },

    // New lazy loading operation - will be implemented by components
    expandNode: async (path: string) => {
      const state = get()
      const node = state.nodes[path]
      if (!node || node.type !== 'directory' || node.children) {
        return // Already loaded or not a directory
      }

      // Set loading state
      get().setNodeLoading(path, true)

      try {
        // This will be implemented by the component that uses the store
        // For now, just mark as expanded
        get().setExpanded(path, true)
      } catch (error) {
        console.error('Error expanding node:', error)
      } finally {
        get().setNodeLoading(path, false)
      }
    },

    expandAll: (allPaths: string[]) => {
      set((state) => {
        const newNodes = { ...state.nodes }
        const newExpandedPaths = new Set([...state.expandedPaths, ...allPaths])

        // Update node states
        allPaths.forEach(path => {
          if (newNodes[path]) {
            newNodes[path] = { ...newNodes[path], isExpanded: true }
          }
        })

        return {
          nodes: newNodes,
          expandedPaths: newExpandedPaths
        }
      })
    },

    collapseAll: () => {
      set((state) => {
        const newNodes = { ...state.nodes }
        
        // Update all directory nodes to collapsed
        Object.keys(newNodes).forEach(path => {
          if (newNodes[path].type === 'directory') {
            newNodes[path] = { ...newNodes[path], isExpanded: false }
          }
        })

        return {
          nodes: newNodes,
          expandedPaths: new Set<string>()
        }
      })
    },

    setDefaultExpanded: (expanded: boolean) => {
      set({ defaultExpanded: expanded })
    },

    reset: () => {
      set({
        nodes: {},
        rootIds: [],
        expandedPaths: new Set<string>(),
        defaultExpanded: false
      })
    },

    // Compute visible nodes for virtual scrolling
    getVisibleNodes: () => {
      const state = get()
      const visibleNodes: TreeNode[] = []

      const addNodeAndChildren = (nodeId: string, level: number = 0) => {
        const node = state.nodes[nodeId]
        if (!node) return

        // Add current node with level info
        visibleNodes.push({ ...node, level })

        // Add children if expanded
        if (node.isExpanded && node.children) {
          node.children.forEach(childId => {
            addNodeAndChildren(childId, level + 1)
          })
        }
      }

      // Start with root nodes
      state.rootIds.forEach(rootId => {
        addNodeAndChildren(rootId, 0)
      })

      return visibleNodes
    }
  }))
)

// Export TreeNode type for use in components
export type { TreeNode }

// Derived selectors
export const useExpandedPaths = () => {
  return useFileTreeStore((state) => state.expandedPaths)
}

export const useDefaultExpanded = () => {
  return useFileTreeStore((state) => state.defaultExpanded)
}

export const useVisibleNodes = () => {
  return useFileTreeStore((state) => state.getVisibleNodes())
}