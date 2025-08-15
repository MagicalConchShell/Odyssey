import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save, 
  AlertCircle,
  Terminal,
  Loader2,
  Sun,
  Moon
} from 'lucide-react'
import { toast } from 'sonner'
import { useTheme } from './theme-provider'

interface SettingsProps {
  onBack: () => void
  className?: string
}

interface EnvironmentVariable {
  id: string
  key: string
  value: string
}

type SettingsSection = 'appearance' | 'environment' | 'about'

interface SettingsSectionItem {
  id: SettingsSection
  label: string
}

const settingsSections: SettingsSectionItem[] = [
  {
    id: 'appearance',
    label: 'Appearance'
  },
  {
    id: 'environment', 
    label: 'Environment'
  },
  {
    id: 'about',
    label: 'About'
  }
]

export const Settings: React.FC<SettingsProps> = ({
  onBack,
  className
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Environment variables state
  const [envVars, setEnvVars] = useState<EnvironmentVariable[]>([])

  // Theme hook
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    if (activeSection === 'environment') {
      loadEnvironmentVariables()
    }
  }, [activeSection])

  const loadEnvironmentVariables = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await window.electronAPI.settings.getEnvironmentVariables()
      
      if (result.success && result.data) {
        const envData = result.data
        setEnvVars(
          Object.entries(envData).map(([key, value], index) => ({
            id: `env-${index}`,
            key,
            value: value as string,
          }))
        )
      }
    } catch (err) {
      console.error('Failed to load environment variables:', err)
      setError('Failed to load environment variables. Please ensure ~/.claude directory exists.')
    } finally {
      setLoading(false)
    }
  }

  const saveEnvironmentVariables = async () => {
    try {
      setSaving(true)
      setError(null)

      // Build the environment variables object
      const envData = envVars.reduce((acc, { key, value }) => {
        if (key.trim() && value.trim()) {
          acc[key] = value
        }
        return acc
      }, {} as Record<string, string>)

      const result = await window.electronAPI.settings.saveEnvironmentVariables(envData)
      if (!result.success) {
        throw new Error(result.error || 'Failed to save environment variables')
      }

      toast.success('Environment variables saved successfully!')
    } catch (err) {
      console.error('Failed to save environment variables:', err)
      setError('Failed to save environment variables.')
      toast.error('Failed to save environment variables')
    } finally {
      setSaving(false)
    }
  }

  const addEnvVar = () => {
    const newVar: EnvironmentVariable = {
      id: `env-${Date.now()}`,
      key: '',
      value: '',
    }
    setEnvVars(prev => [...prev, newVar])
  }

  const updateEnvVar = (id: string, field: 'key' | 'value', value: string) => {
    setEnvVars(prev => prev.map(envVar => 
      envVar.id === id ? { ...envVar, [field]: value } : envVar
    ))
  }

  const removeEnvVar = (id: string) => {
    setEnvVars(prev => prev.filter(envVar => envVar.id !== id))
  }

  const renderAppearanceSection = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Theme</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Choose your preferred theme for the application
        </p>
        
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setTheme('light')}
            className={`flex items-center gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors ${
              theme === 'light' ? 'border-primary bg-primary/10' : 'border-border'
            }`}
          >
            <Sun className="h-5 w-5" />
            <div className="text-left">
              <div className="font-medium">Light</div>
              <div className="text-xs text-muted-foreground">Light theme</div>
            </div>
          </button>
          
          <button
            onClick={() => setTheme('dark')}
            className={`flex items-center gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors ${
              theme === 'dark' ? 'border-primary bg-primary/10' : 'border-border'
            }`}
          >
            <Moon className="h-5 w-5" />
            <div className="text-left">
              <div className="font-medium">Dark</div>
              <div className="text-xs text-muted-foreground">Dark theme</div>
            </div>
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-2">Terminal Appearance</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Customize the look and feel of your terminal
        </p>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-border rounded-lg">
            <div>
              <div className="font-medium">WebGL Acceleration</div>
              <div className="text-sm text-muted-foreground">Use GPU acceleration for better performance</div>
            </div>
            <div className="text-sm text-primary">Enabled</div>
          </div>
          
          <div className="flex items-center justify-between p-4 border border-border rounded-lg">
            <div>
              <div className="font-medium">Font Family</div>
              <div className="text-sm text-muted-foreground">Terminal font family</div>
            </div>
            <div className="text-sm text-muted-foreground">SF Mono, Monaco, monospace</div>
          </div>
        </div>
      </div>
    </div>
  )

  const renderEnvironmentSection = () => (
    <div className="space-y-6">
      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Environment Variables
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Environment variables applied to every terminal session
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addEnvVar}
            className="flex items-center gap-2 px-3 py-1 text-sm border border-border rounded-md hover:bg-muted/50 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add Variable
          </button>
          <button
            onClick={saveEnvironmentVariables}
            disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
      
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : envVars.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
            No environment variables configured. Click "Add Variable" to get started.
          </p>
        ) : (
          envVars.map((envVar) => (
            <motion.div
              key={envVar.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 p-3 border border-border rounded-lg"
            >
              <input
                placeholder="VARIABLE_NAME"
                value={envVar.key}
                onChange={(e) => updateEnvVar(envVar.id, 'key', e.target.value)}
                className="flex-1 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground font-mono text-sm"
              />
              <span className="text-muted-foreground">=</span>
              <input
                placeholder="value"
                value={envVar.value}
                onChange={(e) => updateEnvVar(envVar.id, 'value', e.target.value)}
                className="flex-1 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground font-mono text-sm"
              />
              <button
                onClick={() => removeEnvVar(envVar.id)}
                className="p-2 hover:bg-muted/50 rounded-md transition-colors hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </motion.div>
          ))
        )}
      </div>
    </div>
  )

  const renderAboutSection = () => (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
      <div className="text-center">
        <img 
          src="./Odyssey.png"
          alt="Odyssey Logo" 
          className="w-24 h-24 mx-auto mb-6"
        />
        <h3 className="text-3xl font-bold mb-2">Odyssey</h3>
        <div className="text-lg text-muted-foreground">Version 0.1.0</div>
      </div>
    </div>
  )

  const renderCurrentSection = () => {
    switch (activeSection) {
      case 'appearance':
        return renderAppearanceSection()
      case 'environment':
        return renderEnvironmentSection()
      case 'about':
        return renderAboutSection()
      default:
        return renderAppearanceSection()
    }
  }

  return (
    <div className={`flex flex-col h-full bg-background ${className}`}>
      <div className="max-w-7xl mx-auto w-full flex flex-col h-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between p-4 border-b border-border"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 hover:bg-muted/50 rounded-md transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-semibold">Settings</h1>
              <p className="text-sm text-muted-foreground">
                Manage your preferences and configuration
              </p>
            </div>
          </div>
        </motion.div>
        
        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="w-64 border-r border-border p-4"
          >
            <nav className="space-y-1">
              {settingsSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full px-3 py-2 text-left rounded-md transition-colors font-medium ${
                    activeSection === section.id
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'hover:bg-muted/50 text-foreground'
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          </motion.div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="p-6"
              >
                {renderCurrentSection()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}