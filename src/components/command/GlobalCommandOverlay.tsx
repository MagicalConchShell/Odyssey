import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CommandPalette } from './CommandPalette'

type View = 
  | "welcome"
  | "settings" 
  | "usage-dashboard"
  | "mcp"
  | "project-workspace"
  | "editor"
  | "claude-editor"
  | "claude-file-editor"

interface GlobalCommandOverlayProps {
  isOpen: boolean
  onClose: () => void
  currentView: View
  onNavigate: (view: View) => void
  onSelectProject: (projectPath: string) => void
  onOpenFolder: () => void
  onImportProjects: () => void
  className?: string
}

export const GlobalCommandOverlay: React.FC<GlobalCommandOverlayProps> = ({
  isOpen,
  onClose,
  currentView,
  onNavigate,
  onSelectProject,
  onOpenFolder,
  onImportProjects,
  className = ''
}) => {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Handle ESC key press
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscKey)
      // Prevent scrolling on background
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  // Handle overlay click
  const handleOverlayClick = (event: React.MouseEvent) => {
    if (event.target === overlayRef.current) {
      onClose()
    }
  }

  // Auto-close after command execution
  const handleNavigate = (view: View) => {
    onNavigate(view)
    onClose()
  }

  const handleSelectProject = (projectPath: string) => {
    onSelectProject(projectPath)
    onClose()
  }

  const handleOpenFolder = () => {
    onOpenFolder()
    onClose()
  }

  const handleImportProjects = () => {
    onImportProjects()
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 pt-[20vh] px-4 ${className}`}
          onClick={handleOverlayClick}
        >
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CommandPalette
              onNavigate={handleNavigate}
              onSelectProject={handleSelectProject}
              onOpenFolder={handleOpenFolder}
              onImportProjects={handleImportProjects}
              onRefresh={() => {}} // We can add this functionality later if needed
              currentView={currentView}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}