import React, { useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'

// Import components
import { TerminalWelcome } from './TerminalWelcome'
import { TerminalTabs } from './TerminalTabs'
import { Terminal } from './Terminal'

// Import unified state management
import { 
  useAppStore,
  useActiveTerminal, 
  type Project 
} from '@/store'

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
  // Terminal state from unified store
  const terminals = useAppStore((state) => state.terminals)
  const activeTerminalId = useAppStore((state) => state.activeTerminalId)
  const createTerminal = useAppStore((state) => state.createTerminal)
  const activeTerminal = useActiveTerminal()
  
  // Terminal mode from unified store
  const terminalMode = useAppStore((state) => state.terminalMode)
  
  // No need for separate persistence hook - it's all handled in the unified store

  // Handle AI model selection from welcome screen
  const handleModelSelect = useCallback(async (model: 'claude-code' | 'gemini' | 'terminal') => {
    console.log('Creating terminal:', { model, projectPath })
    
    try {
      // Create terminal using unified store
      await createTerminal({
        type: model,
        cwd: projectPath,
        makeActive: true
      })
      
      // Terminal mode is automatically set to 'active' in the store
    } catch (error) {
      console.error('Failed to create terminal:', error)
    }
  }, [createTerminal, projectPath])

  // Auto-switch to welcome mode when no terminals (handled automatically in store)
  // No need for manual useEffect - the store handles this automatically

  // Cleanup terminals when project changes - handled by the unified store
  // No need for manual cleanup - project switching is atomic in the store

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
      {/* Terminal restoration is handled seamlessly in the unified store */}
      
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
              {terminals.map((terminal) => {
                console.log('Rendering terminal:', terminal);
                return (
                  <Terminal
                    key={terminal.id}
                    terminalId={terminal.id}
                    className={`absolute inset-0 w-full h-full ${
                      terminal.id === activeTerminalId ? 'block' : 'hidden'
                    }`}
                  />
                )
              })}
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