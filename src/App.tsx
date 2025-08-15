import {useState, useEffect, useCallback} from 'react'

// Import components
import {ProjectWorkspace} from '@/components/project'
import {Project} from '@/components/project'
import {Settings} from '@/components/Settings'
import {WelcomeScreen} from '@/components/WelcomeScreen'
import {Topbar} from '@/components/layout'
import {ThemeProvider} from '@/components/theme-provider'
import {GlobalCommandOverlay} from '@/components/command'
import {Toaster} from '@/components/ui/sonner'
import {useAppStore} from '@/store'

type View =
  "welcome"
  | "settings"
  | "project-workspace"

function App() {
  const [view, setView] = useState<View>("welcome")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [platform, setPlatform] = useState<string>('unknown')

  // Global command overlay state
  const [isCommandOverlayOpen, setIsCommandOverlayOpen] = useState(false)

  // Use store for project state
  const setProject = useAppStore((state) => state.setProject)
  const setProjectPath = useAppStore((state) => state.setProjectPath)


  // The persist middleware now handles automatic state initialization

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
  const handleSelectProject = useCallback(async (project: Project) => {
    try {
      await setProject(project)
      setView("project-workspace")
    } catch (error) {
      console.error('Failed to set project:', error)
      // Fallback to setting just the path if project setting fails
      setProjectPath(project.path)
      setView("project-workspace")
    }
  }, [setProject, setProjectPath])

  const handleProjectSelect = useCallback((project: Project) => {
    setProject(project)
    setView("project-workspace")
  }, [setProject])

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
      const response = await window.electronAPI.project.openFolder()
      if (response.success && response.data) {
        await handleSelectProject(response.data)
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


  const renderProjectWorkspaceView = () => {
    console.log('[App] renderProjectWorkspaceView called')
    return (
      <ProjectWorkspace
        onProjectSelect={handleProjectSelect}
        onNewProject={handleNewProject}
      />
    )
  }

  const renderSettingsView = () => (
    <Settings onBack={() => setView("welcome")}/>
  )





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