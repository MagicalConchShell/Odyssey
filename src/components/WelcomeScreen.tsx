import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Loader2, 
  Sparkles
} from 'lucide-react'
import { CommandPalette } from './CommandPalette'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { useToast } from '../hooks/useToast'
import { ToastComponent } from './ui/toast'

interface ClaudeProjectImportCandidate {
  name: string
  path: string
  claude_project_id: string
  session_count: number
  last_modified: number
  stats: {
    fileCount: number
    totalSize: number
    lastModified: string
  }
}

interface WelcomeScreenProps {
  onSelectProject: (projectPath: string) => void
  onNavigate: (view: 'welcome' | 'settings' | 'usage-dashboard' | 'mcp' | 'project-workspace' | 'editor' | 'claude-editor' | 'claude-file-editor') => void
  className?: string
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSelectProject,
  onNavigate,
  className = '',
}) => {
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importCandidates, setImportCandidates] = useState<ClaudeProjectImportCandidate[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set())
  const [refreshFunction, setRefreshFunction] = useState<(() => Promise<void>) | null>(null)
  const { toast, showSuccess, showError } = useToast()

  // Handle navigation to different app views
  const handleNavigate = (view: 'welcome' | 'settings' | 'usage-dashboard' | 'mcp' | 'project-workspace' | 'editor' | 'claude-editor' | 'claude-file-editor') => {
    onNavigate(view)
  }

  // Handle folder opening
  const handleOpenFolder = async () => {
    try {
      const response = await window.electronAPI.projectManagement.openFolder()
      if (response.success && response.data) {
        // Navigate to the project
        onSelectProject(response.data.path)
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
      const response = await window.electronAPI.projectManagement.getClaudeProjectImportCandidates()
      if (response.success) {
        setImportCandidates(response.data || [])
        // Pre-select all candidates
        setSelectedCandidates(new Set(response.data?.map((c: ClaudeProjectImportCandidate) => c.claude_project_id) || []))
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
      const response = await window.electronAPI.projectManagement.importClaudeProjects(
        Array.from(selectedCandidates)
      )
      if (response.success) {
        setShowImportDialog(false)
        showSuccess(`Successfully imported ${response.data?.imported || 0} projects`)
        
        // Refresh the CommandPalette to show newly imported projects
        if (refreshFunction) {
          await refreshFunction()
        }
      } else {
        throw new Error(response.error || 'Failed to import projects')
      }
    } catch (err) {
      console.error('Failed to import projects:', err)
      showError(err instanceof Error ? err.message : 'Failed to import projects')
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
                    <div className="w-full">
                      <Progress value={undefined} className="w-full" />
                      <span className="mt-2 text-sm text-muted-foreground">Scanning projects...</span>
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
                            {candidate.session_count} sessions • {candidate.stats.fileCount} files
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
                      Importing...
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

      {/* Toast Component */}
      <ToastComponent toast={toast} />
    </div>
  )
}