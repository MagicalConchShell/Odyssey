import {useState, useEffect, useCallback} from 'react'
import {ArrowLeft} from 'lucide-react'
import {ClaudeMdFile} from './types/electron'

// Import components
import {ProjectWorkspace} from '@/components/project'
import {Project} from '@/components/project'
import {ProjectStateProvider} from '@/components/project'
import {Settings} from '@/components/Settings'
import {UsageDashboard} from '@/components/UsageDashboard'
import {MCPManager} from '@/components/mcp'
import {WelcomeScreen} from '@/components/WelcomeScreen'
import {Topbar} from '@/components/layout'
import {ThemeProvider} from '@/components/theme-provider'
import {MarkdownEditor} from '@/components/editor'
import {ClaudeFileEditor} from '@/components/editor'
import {GlobalCommandOverlay} from '@/components/command'
import {Toaster} from '@/components/ui/sonner'

type View =
  "welcome"
  | "settings"
  | "usage-dashboard"
  | "mcp"
  | "project-workspace"
  | "editor"
  | "claude-editor"
  | "claude-file-editor"

function App() {
  const [view, setView] = useState<View>("welcome")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [platform, setPlatform] = useState<string>('unknown')

  // Global command overlay state
  const [isCommandOverlayOpen, setIsCommandOverlayOpen] = useState(false)

  // Project workspace state
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedProjectPath, setSelectedProjectPath] = useState<string>('')

  // CLAUDE.md editor state
  const [selectedClaudeMdFile] = useState<ClaudeMdFile | null>(null)

  // Load platform information
  useEffect(() => {
    const getPlatform = async () => {
      try {
        if (window.electronAPI) {
          const response = await window.electronAPI.getPlatform()
          if (response.success && response.data) {
            setPlatform(response.data)
          } else {
            throw new Error(response.error || 'Failed to get platform')
          }
        }
      } catch (error) {
        // Fallback to user agent detection
        const userAgent = navigator.userAgent.toLowerCase()
        if (userAgent.includes('mac')) {
          setPlatform('darwin')
        } else if (userAgent.includes('win')) {
          setPlatform('win32')
        } else if (userAgent.includes('linux')) {
          setPlatform('linux')
        }
      }
    }
    getPlatform()
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd+K (macOS) or Ctrl+K (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setIsCommandOverlayOpen(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Load data based on current view
  useEffect(() => {
    if (view === "welcome") {
      setLoading(false)
      return
    }

    const loadViewData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Check if electronAPI is available
        if (!window.electronAPI) {
          throw new Error('electronAPI not available - not running in Electron')
        }

      } catch (error) {
        console.error('Failed to load view data:', error)
        setError(error instanceof Error ? error.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    loadViewData()
  }, [view])

  // Move useCallback hooks to component top level to fix React Error #310
  const handleSelectProject = useCallback((projectPath: string) => {
    setSelectedProject(null)
    setSelectedProjectPath(projectPath)
    setView("project-workspace")
  }, [])

  const handleProjectSelect = useCallback((project: Project) => {
    setSelectedProject(project)
    setSelectedProjectPath(project.path)
    setView("project-workspace")
  }, [])

  const handleNewProject = useCallback(() => {
    setView("welcome")
  }, [])

  // Global command overlay handlers
  const handleOpenCommandOverlay = useCallback(() => {
    setIsCommandOverlayOpen(true)
  }, [])

  const handleCloseCommandOverlay = useCallback(() => {
    setIsCommandOverlayOpen(false)
  }, [])

  const handleOpenFolder = useCallback(async () => {
    try {
      const response = await window.electronAPI.projectManagement.openFolder()
      if (response.success && response.data) {
        handleSelectProject(response.data.path)
      } else {
        console.warn('Failed to open folder:', response.error)
      }
    } catch (err) {
      console.error('Failed to open folder:', err)
    }
  }, [handleSelectProject])

  const handleImportProjects = useCallback(async () => {
    // This would trigger the same import flow as in WelcomeScreen
    // For now, navigate to welcome where the import functionality is available
    setView("welcome")
  }, [])


  const renderCurrentView = () => {
    if (loading) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-lg">Loading...</p>
            {error && (
              <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded">
                <p className="font-medium">Loading error:</p>
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>
      )
    }

    switch (view) {
      case "welcome":
        return renderWelcomeView()
      case "project-workspace":
        return renderProjectWorkspaceView()
      case "settings":
        return renderSettingsView()
      case "usage-dashboard":
        return renderUsageView()
      case "mcp":
        return renderMCPView()
      case "editor":
        return renderEditorView()
      case "claude-editor":
        return renderClaudeEditorView()
      case "claude-file-editor":
        return renderClaudeFileEditorView()
      default:
        return renderWelcomeView()
    }
  }

  const renderWelcomeView = () => (
    <WelcomeScreen
      onSelectProject={handleSelectProject}
      onNavigate={setView}
    />
  )


  const renderProjectWorkspaceView = () => (
    <ProjectStateProvider>
      <ProjectWorkspace
        project={selectedProject || undefined}
        initialProjectPath={selectedProjectPath}
        onProjectSelect={handleProjectSelect}
        onNewProject={handleNewProject}
      />
    </ProjectStateProvider>
  )

  const renderSettingsView = () => (
    <Settings onBack={() => setView("welcome")}/>
  )

  const renderUsageView = () => (
    <UsageDashboard onBack={() => setView("welcome")}/>
  )

  const renderMCPView = () => (
    <MCPManager onBack={() => setView("welcome")}/>
  )

  const renderEditorView = () => (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => setView("welcome")}
            className="mb-4 px-3 py-2 text-sm bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md transition-colors flex items-center"
          >
            <ArrowLeft className="mr-2 h-4 w-4"/>
            Back to Home
          </button>
          <h1 className="text-3xl font-bold">CLAUDE.md Editor</h1>
          <p className="text-muted-foreground">Edit your CLAUDE.md files</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div
            className="p-6 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => setView("claude-editor")}
          >
            <h3 className="text-lg font-semibold mb-2">Global CLAUDE.md</h3>
            <p className="text-sm text-muted-foreground">
              Edit your global Claude Code system prompt (~/.claude/CLAUDE.md)
            </p>
          </div>

          <div
            className="p-6 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => setView("welcome")}
          >
            <h3 className="text-lg font-semibold mb-2">Project CLAUDE.md Files</h3>
            <p className="text-sm text-muted-foreground">
              Edit project-specific CLAUDE.md files from your projects
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderClaudeEditorView = () => (
    <MarkdownEditor onBack={() => setView("editor")}/>
  )

  const renderClaudeFileEditorView = () => {
    if (!selectedClaudeMdFile) {
      return (
        <div className="min-h-screen bg-background p-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center py-12">
              <p className="text-lg text-muted-foreground">No CLAUDE.md file selected</p>
              <button
                onClick={() => setView("welcome")}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Go to Welcome
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <ClaudeFileEditor
        file={selectedClaudeMdFile}
        onBack={() => setView("welcome")}
      />
    )
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="odyssey-ui-theme">
      <div className="h-screen bg-background flex flex-col">
        {/* Topbar */}
        <Topbar
          onSettingsClick={() => setView("settings")}
          onCommandBarClick={handleOpenCommandOverlay}
          currentView={view}
          platform={platform}
        />

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          {renderCurrentView()}
        </div>

        {/* Global Command Overlay */}
        <GlobalCommandOverlay
          isOpen={isCommandOverlayOpen}
          onClose={handleCloseCommandOverlay}
          currentView={view}
          onNavigate={setView}
          onSelectProject={handleSelectProject}
          onOpenFolder={handleOpenFolder}
          onImportProjects={handleImportProjects}
        />

        <Toaster/>
      </div>
    </ThemeProvider>
  )
}

export default App