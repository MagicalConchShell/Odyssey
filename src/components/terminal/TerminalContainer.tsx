import React, { useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'

// Import components
import { TerminalWelcome } from './TerminalWelcome'
import { TerminalTabs } from './TerminalTabs'
import { Terminal } from './Terminal'

// Import simplified state management
import { useSimpleTerminalStore, useSimpleActiveTerminal, useSimpleHasTerminals } from './hooks/useSimpleTerminalStore'
import { useTerminalMode } from '../project/lib/projectState'
import { terminalEventManager } from './lib/TerminalEventManager'
import { useSimpleTerminalPersistence } from './hooks/useSimpleTerminalPersistence'

// Types
import type { Project } from '../project/lib/projectState'

interface TerminalContainerProps {
  projectPath: string
  project?: Project
  className?: string
}

export const TerminalContainer: React.FC<TerminalContainerProps> = ({
  projectPath,
  project,
  className
}) => {
  // Terminal state from simplified Zustand store
  const { terminals, activeTerminalId, createTerminal, clearAll } = useSimpleTerminalStore()
  const activeTerminal = useSimpleActiveTerminal()
  const hasTerminals = useSimpleHasTerminals()
  
  // Terminal mode from simplified project state
  const { terminalMode, setTerminalMode } = useTerminalMode()
  
  // Simplified session persistence
  const { cleanup, isRestoring } = useSimpleTerminalPersistence({
    projectPath,
    autoSave: true,
    autoRestore: true,
    saveDebounceMs: 1000
  })

  // Handle AI model selection from welcome screen
  const handleModelSelect = useCallback((model: 'claude-code' | 'gemini' | 'terminal') => {
    console.log('Creating terminal:', { model, projectPath })
    
    // Create terminal using Zustand store
    createTerminal({
      type: model,
      cwd: projectPath,
      makeActive: true
    })
    
    // Switch to active mode
    setTerminalMode('active')
  }, [createTerminal, projectPath, setTerminalMode])

  // Auto-switch to welcome mode when no terminals
  useEffect(() => {
    if (!hasTerminals && terminalMode === 'active') {
      setTerminalMode('welcome')
    }
  }, [hasTerminals, terminalMode, setTerminalMode])

  // Cleanup terminals when project changes
  useEffect(() => {
    return () => {
      // Clean up terminal event manager
      terminalEventManager.cleanup()
      // Clean up persistence
      cleanup()
      // Clear all terminals
      clearAll()
    }
  }, [projectPath, clearAll, cleanup])

  // Global cleanup on component unmount
  useEffect(() => {
    return () => {
      console.log('[TerminalContainer] Component unmounting, cleaning up all terminals')
      terminalEventManager.cleanup()
      cleanup()
      clearAll()
    }
  }, [cleanup, clearAll])

  // Global keyboard shortcuts for performance monitoring
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+P or Cmd+Shift+P to open performance monitor
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Ensure we have a project path before rendering terminal
  if (!projectPath) {
    return (
      <div className={clsx("flex-1 flex items-center justify-center", className)}>
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-2xl">📁</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold">No Project Selected</h3>
            <p className="text-sm text-muted-foreground">
              Please select a project to start using the terminal
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx("flex flex-col h-full", className)}>
      {/* Optional restoration indicator - only shows during background restoration */}
      {projectPath && isRestoring && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b">
          <div className="flex items-center justify-center h-8 text-sm text-muted-foreground">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary mr-2"></div>
            Restoring terminal sessions in background...
          </div>
        </div>
      )}
      
      <AnimatePresence mode="wait">
        {terminalMode === 'welcome' ? (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <TerminalWelcome
              project={project}
              projectPath={projectPath}
              onModelSelect={handleModelSelect}
              className="flex-1"
            />
          </motion.div>
        ) : (
          <motion.div
            key="active"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col"
          >
            {/* Terminal tabs */}
            <TerminalTabs 
              projectPath={projectPath}
              onNewTab={handleModelSelect}
            />
            
            {/* All terminals - show/hide based on active state */}
            <div className="flex-1 relative min-h-0">
              {terminals.map((terminal) => (
                <Terminal
                  key={terminal.id}
                  terminalId={terminal.id}
                  className={`absolute inset-0 w-full h-full ${
                    terminal.id === activeTerminalId ? 'block' : 'hidden'
                  }`}
                />
              ))}
              {!activeTerminal && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <div className="text-muted-foreground">No active terminal</div>
                    <div className="text-sm text-muted-foreground">
                      Create a new terminal to get started
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}