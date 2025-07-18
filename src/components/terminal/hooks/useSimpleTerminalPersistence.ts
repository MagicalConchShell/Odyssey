/**
 * Simplified Terminal Session Persistence Hook
 * 
 * Clean, simple persistence without complex restoration logic
 */

import { useEffect, useCallback, useRef, useState } from 'react'
import { useTerminalStore } from './useTerminalStore'

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
  } = useTerminalStore()

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
    
    // Validate the project path before processing
    if (!projectPath || typeof projectPath !== 'string' || projectPath.trim() === '') {
      console.warn('[TerminalPersistence] Invalid project path:', projectPath)
      return
    }

    // Only process if the path actually changed
    if (projectPath !== previousPath) {
      console.log('[TerminalPersistence] Project path changing:', { from: previousPath, to: projectPath })
      
      // Save state for previous project (only if it was a valid path)
      if (autoSave && previousPath && previousPath.trim() !== '' && previousPath !== projectPath) {
        console.log('[TerminalPersistence] Saving terminal state for previous project:', previousPath)
        try {
          saveTerminalState(previousPath)
        } catch (error) {
          console.error('[TerminalPersistence] Failed to save state for previous project:', error)
        }
      }

      // Update the ref after successful save
      projectPathRef.current = projectPath

      // Load state for new project (simplified)
      if (autoRestore && projectPath) {
        console.log('[TerminalPersistence] Loading terminal state for new project:', projectPath)
        loadAndRestoreSimple(projectPath)
      }
    }
  }, [projectPath, autoSave, autoRestore, saveTerminalState])

  // Simplified load and restore
  const loadAndRestoreSimple = useCallback(async (path: string) => {
    try {
      // Validate path before loading
      if (!path || typeof path !== 'string' || path.trim() === '') {
        console.warn('[TerminalPersistence] Cannot load state for invalid path:', path)
        initializedRef.current = true
        setIsRestoring(false)
        return
      }

      console.log(`[TerminalPersistence] Loading terminal state for project: ${path}`)
      
      // Mark as initialized immediately to prevent UI blocking
      initializedRef.current = true
      setIsRestoring(true)
      
      // Load terminal metadata
      await loadTerminalState(path)
      
      // Get terminals to restore
      const currentTerminals = useTerminalStore.getState().terminals
      
      if (currentTerminals.length === 0) {
        console.log('[TerminalPersistence] No terminals to restore')
        setIsRestoring(false)
        return
      }
      
      console.log(`[TerminalPersistence] Restoring ${currentTerminals.length} terminals in background...`)
      
      // Restore sessions in background without blocking UI
      restoreTerminalSessions(path)
        .then(() => {
          console.log('[TerminalPersistence] Terminal restoration completed for:', path)
        })
        .catch((error) => {
          console.warn('[TerminalPersistence] Terminal restoration failed for:', path, error)
        })
        .finally(() => {
          setIsRestoring(false)
        })
      
    } catch (error) {
      console.error('[TerminalPersistence] Failed to load terminal state for:', path, error)
      initializedRef.current = true
      setIsRestoring(false)
    }
  }, [loadTerminalState, restoreTerminalSessions])

  // Manual save function
  const saveNow = useCallback(async () => {
    if (projectPath && projectPath.trim() !== '') {
      console.log('[TerminalPersistence] Manual save for:', projectPath)
      try {
        await saveTerminalState(projectPath)
      } catch (error) {
        console.error('[TerminalPersistence] Manual save failed for:', projectPath, error)
      }
    }
  }, [projectPath, saveTerminalState])

  // Manual restore function
  const restoreNow = useCallback(async () => {
    if (projectPath && projectPath.trim() !== '') {
      console.log('[TerminalPersistence] Manual restore for:', projectPath)
      await loadAndRestoreSimple(projectPath)
    }
  }, [projectPath, loadAndRestoreSimple])

  // Cleanup function
  const cleanup = useCallback(() => {
    const currentPath = projectPathRef.current
    if (autoSave && currentPath && currentPath.trim() !== '') {
      console.log('[TerminalPersistence] Cleanup save for:', currentPath)
      try {
        saveTerminalState(currentPath)
      } catch (error) {
        console.error('[TerminalPersistence] Cleanup save failed for:', currentPath, error)
      }
    }
    debouncedSave.cancel()
  }, [autoSave, saveTerminalState, debouncedSave])

  return {
    saveNow,
    restoreNow,
    cleanup,
    isInitialized: initializedRef.current,
    isRestoring
  }
}