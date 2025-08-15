import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Loader2, 
  Sparkles
} from 'lucide-react'
import { CommandPalette } from './command/CommandPalette'
import { Button } from './ui/button'
import { toast } from "sonner"
import { Project } from '@/store'

interface ClaudeProject {
  name: string
  path: string
  claude_project_id: string
}

interface WelcomeScreenProps {
  onSelectProject: (project: Project) => void
  onNavigate: (view: 'welcome' | 'settings' | 'project-workspace') => void
  className?: string
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSelectProject,
  onNavigate,
  className = '',
}) => {
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importCandidates, setImportCandidates] = useState<ClaudeProject[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importPhase, setImportPhase] = useState<'scanning' | 'importing'>('scanning')
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set())
  const [refreshFunction, setRefreshFunction] = useState<(() => Promise<void>) | null>(null)

  // Handle navigation to different app views
  const handleNavigate = (view: 'welcome' | 'settings' | 'project-workspace') => {
    onNavigate(view)
  }

  // Handle folder opening
  const handleOpenFolder = async () => {
    try {
      const response = await window.electronAPI.project.openFolder()
      if (response.success && response.data) {
        // Navigate to the project using the full project object
        onSelectProject(response.data)
      } else {
        console.warn('Failed to open folder:', response.error)
      }
    } catch (err) {
      console.error('Failed to open folder:', err)
    }
  }

  // Handle project import
  const handleImportProjects = async () => {
    setShowImportDialog(true)
    await loadImportCandidates()
  }

  const loadImportCandidates = async () => {
    try {
      setImportLoading(true)
      setImportPhase('scanning')
      const response = await window.electronAPI.project.scanClaudeProjects()
      if (response.success) {
        setImportCandidates(response.data || [])
        // Pre-select all candidates
        setSelectedCandidates(new Set(response.data?.map((c: ClaudeProject) => c.claude_project_id) || []))
      } else {
        throw new Error(response.error || 'Failed to load import candidates')
      }
    } catch (err) {
      console.error('Failed to load import candidates:', err)
    } finally {
      setImportLoading(false)
    }
  }

  const handleImportProjectsConfirm = async () => {
    try {
      setImportLoading(true)
      setImportPhase('importing')
      const response = await window.electronAPI.project.importClaudeProjects(
        Array.from(selectedCandidates)
      )
      if (response.success) {
        setShowImportDialog(false)
        toast.success(`Successfully imported ${response.data?.imported || 0} projects`)
        
        // Refresh the CommandPalette to show newly imported projects
        if (refreshFunction) {
          await refreshFunction()
        }
      } else {
        throw new Error(response.error || 'Failed to import projects')
      }
    } catch (err) {
      console.error('Failed to import projects:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to import projects')
    } finally {
      setImportLoading(false)
    }
  }

  const handleToggleCandidate = (claudeProjectId: string) => {
    const newSelected = new Set(selectedCandidates)
    if (newSelected.has(claudeProjectId)) {
      newSelected.delete(claudeProjectId)
    } else {
      newSelected.add(claudeProjectId)
    }
    setSelectedCandidates(newSelected)
  }

  const handleRefresh = (refreshFn: () => Promise<void>) => {
    setRefreshFunction(() => refreshFn)
  }

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${className}`}>
      {/* Main Content - Centered Layout */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl mx-auto">
          {/* Welcome Section */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-8"
          >
            {/* Odyssey Logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex justify-center mb-6"
            >
              <motion.img
                src="./Odyssey.png"
                alt="Odyssey Logo"
                className="h-20 w-20 sm:h-24 sm:w-24 object-contain transition-transform duration-300 hover:scale-110"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              />
            </motion.div>

            {/* Title */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex items-center justify-center space-x-3 mb-4"
            >
              {/*<Sparkles className="h-8 w-8 text-primary animate-pulse" />*/}
              <Sparkles className="h-8 w-8 text-yellow-500 animate-pulse" />
              <h1 className="text-3xl sm:text-4xl font-bold gradient-text">Hello, Odyssey</h1>
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="text-lg text-muted-foreground"
            >
              What would you like to create today?
            </motion.p>
          </motion.div>

          {/* Command Palette */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="mb-8"
          >
            <CommandPalette
              onNavigate={handleNavigate}
              onSelectProject={onSelectProject}
              onOpenFolder={handleOpenFolder}
              onImportProjects={handleImportProjects}
              onRefresh={handleRefresh}
            />
          </motion.div>

          {/* Subtle hint text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1.0 }}
            className="text-center"
          >
            <p className="text-sm text-muted-foreground">
              Type to search or use ↑ ↓ to navigate
            </p>
          </motion.div>
        </div>
      </div>

      {/* Import Dialog */}
      <AnimatePresence>
        {showImportDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-background rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-hidden"
            >
              <div className="p-6 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Import Claude Projects</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Select which Claude projects to import into your workspace
                </p>
              </div>
              
              <div className="p-6 overflow-auto max-h-96">
                {importLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex flex-col items-center space-y-3">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">
                        {importPhase === 'scanning' ? 'Scanning for Claude projects...' : 'Importing selected projects...'}
                      </span>
                    </div>
                  </div>
                ) : importCandidates.length > 0 ? (
                  <div className="space-y-3">
                    {importCandidates.map((candidate) => (
                      <div
                        key={candidate.claude_project_id}
                        className="flex items-center space-x-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-accent"
                        onClick={() => handleToggleCandidate(candidate.claude_project_id)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedCandidates.has(candidate.claude_project_id)}
                          onChange={() => handleToggleCandidate(candidate.claude_project_id)}
                          className="rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{candidate.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{candidate.path}</p>
                          <p className="text-xs text-muted-foreground">
                            Claude project
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">No Claude projects found to import</p>
                  </div>
                )}
              </div>
              
              <div className="p-6 border-t border-border flex justify-end space-x-3">
                <Button
                  variant="outline"
                  onClick={() => setShowImportDialog(false)}
                  disabled={importLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleImportProjectsConfirm}
                  disabled={importLoading || selectedCandidates.size === 0}
                >
                  {importLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {importPhase === 'scanning' ? 'Scanning...' : 'Importing...'}
                    </>
                  ) : (
                    `Import ${selectedCandidates.size} projects`
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}