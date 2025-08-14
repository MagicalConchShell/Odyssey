import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save, 
  AlertCircle,
  Terminal,
  Loader2
} from 'lucide-react'
import { toast } from 'sonner'

interface SettingsProps {
  onBack: () => void
  className?: string
}

interface EnvironmentVariable {
  id: string
  key: string
  value: string
}

export const Settings: React.FC<SettingsProps> = ({
  onBack,
  className
}) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Environment variables state
  const [envVars, setEnvVars] = useState<EnvironmentVariable[]>([])

  useEffect(() => {
    loadEnvironmentVariables()
  }, [])

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
              <h2 className="text-lg font-semibold">Environment Variables</h2>
              <p className="text-xs text-muted-foreground">
                Configure environment variables for your sessions
              </p>
            </div>
          </div>
          
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
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    Environment Variables
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Environment variables applied to every session
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
        </div>
      </div>
    </div>
  )
}