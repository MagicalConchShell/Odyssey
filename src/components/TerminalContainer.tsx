import React, { useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'

// Import components
import { TerminalWelcome } from './TerminalWelcome'
import { RealTerminal } from './RealTerminal'

// Import state management
import { useTerminal } from '@/lib/projectState'

// Types
import type { Project } from '@/lib/projectState'

interface TerminalContainerProps {
  projectPath: string
  project?: Project
  mode: 'welcome' | 'active'
  selectedAIModel: 'claude-code' | 'gemini' | null
  className?: string
}

export const TerminalContainer: React.FC<TerminalContainerProps> = ({
  projectPath,
  project,
  mode,
  selectedAIModel,
  className
}) => {
  const { 
    terminalSessionId, 
    setTerminalSessionId, 
    setTerminalMode, 
    setSelectedAIModel 
  } = useTerminal()

  // Handle AI model selection
  const handleModelSelect = useCallback((model: 'claude-code' | 'gemini') => {
    setSelectedAIModel(model)
    setTerminalMode('active')
  }, [setSelectedAIModel, setTerminalMode])

  // Handle terminal ready
  const handleTerminalReady = useCallback(() => {
    console.log('Terminal is ready')
  }, [])

  // Handle terminal exit
  const handleTerminalExit = useCallback(() => {
    setTerminalSessionId(null)
    setTerminalMode('welcome')
    setSelectedAIModel(null)
  }, [setTerminalSessionId, setTerminalMode, setSelectedAIModel])

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
      <AnimatePresence mode="wait">
        {mode === 'welcome' ? (
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
            key="terminal"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex-1"
          >
            <RealTerminal
              sessionId={terminalSessionId}
              project={project}
              projectPath={projectPath}
              selectedAIModel={selectedAIModel}
              onTerminalReady={handleTerminalReady}
              onTerminalExit={handleTerminalExit}
              className="flex-1"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}