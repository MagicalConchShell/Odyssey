/**
 * File Tree Store - Centralized expansion state management
 * 
 * Manages the expansion/collapse state of directories in the file tree
 * with bulk operations (expand all, collapse all) similar to PyCharm
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

// State interface
interface FileTreeState {
  // Track expanded paths - using Set for O(1) lookups
  expandedPaths: Set<string>
  // Default expansion state for new directories
  defaultExpanded: boolean
}

// Actions interface
interface FileTreeActions {
  // Path-specific operations
  isExpanded: (path: string) => boolean
  togglePath: (path: string) => void
  setExpanded: (path: string, expanded: boolean) => void
  
  // Bulk operations
  expandAll: (allPaths: string[]) => void
  collapseAll: () => void
  
  // Configuration
  setDefaultExpanded: (expanded: boolean) => void
  
  // Utility
  reset: () => void
}

type FileTreeStore = FileTreeState & FileTreeActions

// Create the store
export const useFileTreeStore = create<FileTreeStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state - default to collapsed for better UX
    expandedPaths: new Set<string>(),
    defaultExpanded: false,

    // Actions
    isExpanded: (path: string) => {
      const state = get()
      return state.expandedPaths.has(path)
    },

    togglePath: (path: string) => {
      set((state) => {
        const newExpandedPaths = new Set(state.expandedPaths)
        if (newExpandedPaths.has(path)) {
          newExpandedPaths.delete(path)
        } else {
          newExpandedPaths.add(path)
        }
        return { expandedPaths: newExpandedPaths }
      })
    },

    setExpanded: (path: string, expanded: boolean) => {
      set((state) => {
        const newExpandedPaths = new Set(state.expandedPaths)
        if (expanded) {
          newExpandedPaths.add(path)
        } else {
          newExpandedPaths.delete(path)
        }
        return { expandedPaths: newExpandedPaths }
      })
    },

    expandAll: (allPaths: string[]) => {
      set((state) => ({
        expandedPaths: new Set([...state.expandedPaths, ...allPaths])
      }))
    },

    collapseAll: () => {
      set({ expandedPaths: new Set<string>() })
    },

    setDefaultExpanded: (expanded: boolean) => {
      set({ defaultExpanded: expanded })
    },

    reset: () => {
      set({
        expandedPaths: new Set<string>(),
        defaultExpanded: false
      })
    }
  }))
)

// Derived selectors
export const useExpandedPaths = () => {
  return useFileTreeStore((state) => state.expandedPaths)
}

export const useDefaultExpanded = () => {
  return useFileTreeStore((state) => state.defaultExpanded)
}