import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save, 
  AlertCircle,
  Settings2,
  Terminal,
  Loader2
} from 'lucide-react'
import { ClaudeSettings } from '@/types/electron'

interface SettingsProps {
  onBack: () => void
  className?: string
}


interface EnvironmentVariable {
  id: string
  key: string
  value: string
}

interface Toast {
  message: string
  type: 'success' | 'error'
}

export const Settings: React.FC<SettingsProps> = ({
  onBack,
  className
}) => {
  const [activeTab, setActiveTab] = useState('general')
  const [settings, setSettings] = useState<ClaudeSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)


  // Environment variables state
  const [envVars, setEnvVars] = useState<EnvironmentVariable[]>([])

  // Claude binary path state
  const [currentBinaryPath, setCurrentBinaryPath] = useState<string | null>(null)
  const [customBinaryPath, setCustomBinaryPath] = useState('')
  const [binaryPathChanged, setBinaryPathChanged] = useState(false)

  useEffect(() => {
    loadSettings()
    loadClaudeBinaryPath()
  }, [])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const loadClaudeBinaryPath = async () => {
    try {
      const result = await window.electronAPI.claudeCli.getBinaryPath()
      if (result.success && result.path) {
        setCurrentBinaryPath(result.path)
        setCustomBinaryPath(result.path)
      }
    } catch (err) {
      console.error('Failed to load Claude binary path:', err)
    }
  }

  const loadSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await window.electronAPI.settings.getClaudeSettings()
      
      if (result.success && result.settings) {
        const loadedSettings = result.settings
        setSettings(loadedSettings)


        // Parse environment variables
        if (loadedSettings.env && typeof loadedSettings.env === 'object') {
          setEnvVars(
            Object.entries(loadedSettings.env).map(([key, value], index) => ({
              id: `env-${index}`,
              key,
              value: value as string,
            }))
          )
        }
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
      setError('Failed to load settings. Please ensure ~/.claude directory exists.')
      setSettings({})
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    try {
      setSaving(true)
      setError(null)
      setToast(null)

      // Build the settings object
      const updatedSettings: ClaudeSettings = {
        ...settings,
        env: envVars.reduce((acc, { key, value }) => {
          if (key.trim() && value.trim()) {
            acc[key] = value
          }
          return acc
        }, {} as Record<string, string>),
      }

      const result = await window.electronAPI.settings.saveClaudeSettings(updatedSettings)
      if (!result.success) {
        throw new Error(result.error || 'Failed to save settings')
      }
      
      setSettings(updatedSettings)

      // Save Claude binary path if changed
      if (binaryPathChanged && customBinaryPath.trim()) {
        const pathResult = await window.electronAPI.claudeCli.setBinaryPath(customBinaryPath.trim())
        if (pathResult.success) {
          setCurrentBinaryPath(customBinaryPath.trim())
          setBinaryPathChanged(false)
        } else {
          console.error('Failed to update binary path:', pathResult.error)
        }
      }

      setToast({ message: 'Settings saved successfully!', type: 'success' })
    } catch (err) {
      console.error('Failed to save settings:', err)
      setError('Failed to save settings.')
      setToast({ message: 'Failed to save settings', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
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

  const handleBinaryPathChange = (newPath: string) => {
    setCustomBinaryPath(newPath)
    setBinaryPathChanged(newPath !== currentBinaryPath)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full bg-background ${className}`}>
      <div className="max-w-4xl mx-auto w-full flex flex-col h-full">
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
              <h2 className="text-lg font-semibold">Settings</h2>
              <p className="text-xs text-muted-foreground">
                Configure Claude Code preferences
              </p>
            </div>
          </div>
          
          <button
            onClick={saveSettings}
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
                Save Settings
              </>
            )}
          </button>
        </motion.div>
        
        {/* Error message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-4 mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toast notification */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
                toast.type === 'success' ? 'bg-accent/10 border border-accent/20 text-accent-foreground' : 'bg-destructive/10 border border-destructive/20 text-destructive'
              }`}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-6">
            <div className="flex border-b border-border">
              {[
                { id: 'general', label: 'General', icon: Settings2 },
                { id: 'environment', label: 'Environment', icon: Terminal },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* General Settings */}
          {activeTab === 'general' && (
            <div className="bg-card border border-border rounded-lg p-6 space-y-6">
              <h3 className="text-base font-semibold mb-4">General Settings</h3>
              
              <div className="space-y-4">
                {/* Include Co-authored By */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 flex-1">
                    <label className="text-sm font-medium">Include "Co-authored by Claude"</label>
                    <p className="text-xs text-muted-foreground">
                      Add Claude attribution to git commits and pull requests
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings?.includeCoAuthoredBy !== false}
                    onChange={(e) => updateSetting('includeCoAuthoredBy', e.target.checked)}
                    className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
                  />
                </div>
                
                {/* Verbose Output */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 flex-1">
                    <label className="text-sm font-medium">Verbose Output</label>
                    <p className="text-xs text-muted-foreground">
                      Show full bash and command outputs
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings?.verbose === true}
                    onChange={(e) => updateSetting('verbose', e.target.checked)}
                    className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
                  />
                </div>
                
                {/* Cleanup Period */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Chat Transcript Retention (days)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="30"
                    value={settings?.cleanupPeriodDays || ''}
                    onChange={(e) => {
                      const value = e.target.value ? parseInt(e.target.value) : undefined
                      updateSetting('cleanupPeriodDays', value)
                    }}
                    className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    How long to retain chat transcripts locally (default: 30 days)
                  </p>
                </div>
                
                {/* Claude Binary Path */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Claude Code Binary Path</label>
                  <input
                    type="text"
                    placeholder="/usr/local/bin/claude"
                    value={customBinaryPath}
                    onChange={(e) => handleBinaryPathChange(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    Path to the Claude Code binary (current: {currentBinaryPath || 'auto-detected'})
                  </p>
                  {binaryPathChanged && (
                    <p className="text-xs text-yellow-600">
                      ⚠️ Claude binary path has been changed. Remember to save your settings.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          
          {/* Environment Variables */}
          {activeTab === 'environment' && (
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">Environment Variables</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Environment variables applied to every Claude Code session
                    </p>
                  </div>
                  <button
                    onClick={addEnvVar}
                    className="flex items-center gap-2 px-3 py-1 text-sm border border-border rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Add Variable
                  </button>
                </div>
                
                <div className="space-y-3">
                  {envVars.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      No environment variables configured.
                    </p>
                  ) : (
                    envVars.map((envVar) => (
                      <motion.div
                        key={envVar.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2"
                      >
                        <input
                          placeholder="KEY"
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
                
                <div className="pt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <strong>Common variables:</strong>
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                    <li>• <code className="px-1 py-0.5 rounded bg-primary/10 text-primary">CLAUDE_CODE_ENABLE_TELEMETRY</code> - Enable/disable telemetry (0 or 1)</li>
                    <li>• <code className="px-1 py-0.5 rounded bg-primary/10 text-primary">ANTHROPIC_MODEL</code> - Custom model name</li>
                    <li>• <code className="px-1 py-0.5 rounded bg-primary/10 text-primary">DISABLE_COST_WARNINGS</code> - Disable cost warnings (1)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}