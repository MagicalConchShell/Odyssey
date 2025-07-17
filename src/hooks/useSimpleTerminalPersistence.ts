/**
 * Simplified Terminal Session Persistence Hook
 * 
 * Clean, simple persistence without complex restoration logic
 */

import { useEffect, useCallback, useRef, useState } from 'react'
import { useSimpleTerminalStore } from './useSimpleTerminalStore'

function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T & { cancel: () => void } {
  let timeout: NodeJS.Timeout | null = null
  
  const debounced = ((...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => func(...args), wait)
  }) as T & { cancel: () => void }
  
  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
  }
  
  return debounced
}

export interface SimpleTerminalPersistenceOptions {
  projectPath: string
  autoSave?: boolean
  autoRestore?: boolean
  saveDebounceMs?: number
}

export function useSimpleTerminalPersistence(options: SimpleTerminalPersistenceOptions) {
  const {
    projectPath,
    autoSave = true,
    autoRestore = true,
    saveDebounceMs = 1000
  } = options

  const {
    terminals,
    activeTerminalId,
    saveTerminalState,
    loadTerminalState,
    restoreTerminalSessions
  } = useSimpleTerminalStore()

  const initializedRef = useRef(false)
  const projectPathRef = useRef(projectPath)
  const [isRestoring, setIsRestoring] = useState(false)

  // Create debounced save function
  const debouncedSave = useCallback(
    debounce((path: string) => {
      if (path) {
        saveTerminalState(path)
      }
    }, saveDebounceMs),
    [saveTerminalState, saveDebounceMs]
  )

  // Save terminal state when it changes
  useEffect(() => {
    if (autoSave && projectPath && initializedRef.current) {
      debouncedSave(projectPath)
    }
  }, [terminals, activeTerminalId, projectPath, autoSave, debouncedSave])

  // Handle project path changes
  useEffect(() => {
    const previousPath = projectPathRef.current
    projectPathRef.current = projectPath

    if (projectPath && projectPath !== previousPath) {
      // Save state for previous project
      if (autoSave && previousPath) {
        saveTerminalState(previousPath)
      }

      // Load state for new project (simplified)
      if (autoRestore && projectPath) {
        loadAndRestoreSimple(projectPath)
      }
    }
  }, [projectPath, autoSave, autoRestore])

  // Simplified load and restore
  const loadAndRestoreSimple = useCallback(async (path: string) => {
    try {
      console.log(`Loading terminal state for project: ${path}`)
      
      // Mark as initialized immediately to prevent UI blocking
      initializedRef.current = true
      setIsRestoring(true)
      
      // Load terminal metadata
      await loadTerminalState(path)
      
      // Get terminals to restore
      const currentTerminals = useSimpleTerminalStore.getState().terminals
      
      if (currentTerminals.length === 0) {
        console.log('No terminals to restore')
        setIsRestoring(false)
        return
      }
      
      console.log(`Restoring ${currentTerminals.length} terminals in background...`)
      
      // Restore sessions in background without blocking UI
      restoreTerminalSessions(path)
        .then(() => {
          console.log('Terminal restoration completed')
        })
        .catch((error) => {
          console.warn('Terminal restoration failed:', error)
        })
        .finally(() => {
          setIsRestoring(false)
        })
      
    } catch (error) {
      console.error('Failed to load terminal state:', error)
      initializedRef.current = true
      setIsRestoring(false)
    }
  }, [loadTerminalState, restoreTerminalSessions])

  // Manual save function
  const saveNow = useCallback(async () => {
    if (projectPath) {
      await saveTerminalState(projectPath)
    }
  }, [projectPath, saveTerminalState])

  // Manual restore function
  const restoreNow = useCallback(async () => {
    if (projectPath) {
      await loadAndRestoreSimple(projectPath)
    }
  }, [projectPath, loadAndRestoreSimple])

  // Cleanup function
  const cleanup = useCallback(() => {
    if (autoSave && projectPath) {
      saveTerminalState(projectPath)
    }
    debouncedSave.cancel()
  }, [autoSave, projectPath, saveTerminalState, debouncedSave])

  return {
    saveNow,
    restoreNow,
    cleanup,
    isInitialized: initializedRef.current,
    isRestoring
  }
}