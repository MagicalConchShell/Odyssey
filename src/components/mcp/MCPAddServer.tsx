import React, { useState } from 'react'
import { Plus, Terminal, Globe, Trash2, Info, Loader2 } from 'lucide-react'

interface MCPAddServerProps {
  onServerAdded: () => void
  onError: (message: string) => void
}

interface EnvironmentVariable {
  id: string
  key: string
  value: string
}

export const MCPAddServer: React.FC<MCPAddServerProps> = ({
  onServerAdded,
  onError,
}) => {
  const [transport, setTransport] = useState<'stdio' | 'sse'>('stdio')
  const [saving, setSaving] = useState(false)
  
  // Stdio server state
  const [stdioName, setStdioName] = useState('')
  const [stdioCommand, setStdioCommand] = useState('')
  const [stdioArgs, setStdioArgs] = useState('')
  const [stdioScope, setStdioScope] = useState('local')
  const [stdioEnvVars, setStdioEnvVars] = useState<EnvironmentVariable[]>([])
  
  // SSE server state
  const [sseName, setSseName] = useState('')
  const [sseUrl, setSseUrl] = useState('')
  const [sseScope, setSseScope] = useState('local')
  const [sseEnvVars, setSseEnvVars] = useState<EnvironmentVariable[]>([])

  const addEnvVar = (type: 'stdio' | 'sse') => {
    const newVar: EnvironmentVariable = {
      id: `env-${Date.now()}`,
      key: '',
      value: '',
    }
    
    if (type === 'stdio') {
      setStdioEnvVars(prev => [...prev, newVar])
    } else {
      setSseEnvVars(prev => [...prev, newVar])
    }
  }

  const updateEnvVar = (type: 'stdio' | 'sse', id: string, field: 'key' | 'value', value: string) => {
    if (type === 'stdio') {
      setStdioEnvVars(prev => prev.map(v => 
        v.id === id ? { ...v, [field]: value } : v
      ))
    } else {
      setSseEnvVars(prev => prev.map(v => 
        v.id === id ? { ...v, [field]: value } : v
      ))
    }
  }

  const removeEnvVar = (type: 'stdio' | 'sse', id: string) => {
    if (type === 'stdio') {
      setStdioEnvVars(prev => prev.filter(v => v.id !== id))
    } else {
      setSseEnvVars(prev => prev.filter(v => v.id !== id))
    }
  }

  const handleAddStdioServer = async () => {
    if (!stdioName.trim()) {
      onError('Server name is required')
      return
    }
    
    if (!stdioCommand.trim()) {
      onError('Command is required')
      return
    }
    
    try {
      setSaving(true)
      
      // Parse arguments
      const args = stdioArgs.trim() ? stdioArgs.split(/\s+/) : []
      
      // Convert env vars to object
      const env = stdioEnvVars.reduce((acc, { key, value }) => {
        if (key.trim() && value.trim()) {
          acc[key] = value
        }
        return acc
      }, {} as Record<string, string>)
      
      const result = await window.electronAPI.mcp.add(
        stdioName,
        'stdio',
        stdioCommand,
        args,
        env,
        undefined,
        stdioScope
      )
      
      if (result.success) {
        // Reset form
        setStdioName('')
        setStdioCommand('')
        setStdioArgs('')
        setStdioEnvVars([])
        setStdioScope('local')
        onServerAdded()
      } else {
        onError(result.message)
      }
    } catch (error) {
      onError('Failed to add server')
      console.error('Failed to add stdio server:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleAddSseServer = async () => {
    if (!sseName.trim()) {
      onError('Server name is required')
      return
    }
    
    if (!sseUrl.trim()) {
      onError('URL is required')
      return
    }
    
    try {
      setSaving(true)
      
      // Convert env vars to object
      const env = sseEnvVars.reduce((acc, { key, value }) => {
        if (key.trim() && value.trim()) {
          acc[key] = value
        }
        return acc
      }, {} as Record<string, string>)
      
      const result = await window.electronAPI.mcp.add(
        sseName,
        'sse',
        undefined,
        [],
        env,
        sseUrl,
        sseScope
      )
      
      if (result.success) {
        // Reset form
        setSseName('')
        setSseUrl('')
        setSseEnvVars([])
        setSseScope('local')
        onServerAdded()
      } else {
        onError(result.message)
      }
    } catch (error) {
      onError('Failed to add server')
      console.error('Failed to add SSE server:', error)
    } finally {
      setSaving(false)
    }
  }

  const renderEnvVars = (type: 'stdio' | 'sse', envVars: EnvironmentVariable[]) => {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Environment Variables</label>
          <button
            onClick={() => addEnvVar(type)}
            className="flex items-center gap-2 px-3 py-1 text-sm border border-border rounded-md hover:bg-accent transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add Variable
          </button>
        </div>
        
        {envVars.length > 0 && (
          <div className="space-y-2">
            {envVars.map((envVar) => (
              <div key={envVar.id} className="flex items-center gap-2">
                <input
                  placeholder="KEY"
                  value={envVar.key}
                  onChange={(e) => updateEnvVar(type, envVar.id, 'key', e.target.value)}
                  className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-foreground font-mono text-sm"
                />
                <span className="text-muted-foreground">=</span>
                <input
                  placeholder="value"
                  value={envVar.value}
                  onChange={(e) => updateEnvVar(type, envVar.id, 'value', e.target.value)}
                  className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-foreground font-mono text-sm"
                />
                <button
                  onClick={() => removeEnvVar(type, envVar.id)}
                  className="p-2 hover:bg-accent rounded-md transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-base font-semibold">Add MCP Server</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Configure a new Model Context Protocol server
        </p>
      </div>

      <div className="space-y-6">
        <div className="grid w-full max-w-sm grid-cols-2 bg-muted p-1 rounded-lg">
          <button
            onClick={() => setTransport('stdio')}
            className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              transport === 'stdio'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Terminal className="h-4 w-4 text-amber-500" />
            Stdio
          </button>
          <button
            onClick={() => setTransport('sse')}
            className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              transport === 'sse'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Globe className="h-4 w-4 text-emerald-500" />
            SSE
          </button>
        </div>

        {/* Stdio Server */}
        {transport === 'stdio' && (
          <div className="bg-card border rounded-lg p-6 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Server Name</label>
                <input
                  placeholder="my-server"
                  value={stdioName}
                  onChange={(e) => setStdioName(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  A unique name to identify this server
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Command</label>
                <input
                  placeholder="/path/to/server"
                  value={stdioCommand}
                  onChange={(e) => setStdioCommand(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  The command to execute the server
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Arguments (optional)</label>
                <input
                  placeholder="arg1 arg2 arg3"
                  value={stdioArgs}
                  onChange={(e) => setStdioArgs(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Space-separated command arguments
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Scope</label>
                <select
                  value={stdioScope}
                  onChange={(e) => setStdioScope(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                >
                  <option value="local">Local (this project only)</option>
                  <option value="project">Project (shared via .mcp.json)</option>
                  <option value="user">User (all projects)</option>
                </select>
              </div>

              {renderEnvVars('stdio', stdioEnvVars)}
            </div>

            <div className="pt-2">
              <button
                onClick={handleAddStdioServer}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding Server...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add Stdio Server
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* SSE Server */}
        {transport === 'sse' && (
          <div className="bg-card border rounded-lg p-6 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Server Name</label>
                <input
                  placeholder="sse-server"
                  value={sseName}
                  onChange={(e) => setSseName(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  A unique name to identify this server
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">URL</label>
                <input
                  placeholder="https://example.com/sse-endpoint"
                  value={sseUrl}
                  onChange={(e) => setSseUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  The SSE endpoint URL
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Scope</label>
                <select
                  value={sseScope}
                  onChange={(e) => setSseScope(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                >
                  <option value="local">Local (this project only)</option>
                  <option value="project">Project (shared via .mcp.json)</option>
                  <option value="user">User (all projects)</option>
                </select>
              </div>

              {renderEnvVars('sse', sseEnvVars)}
            </div>

            <div className="pt-2">
              <button
                onClick={handleAddSseServer}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding Server...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add SSE Server
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Example */}
      <div className="bg-muted/30 border border-border rounded-lg p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Info className="h-4 w-4 text-primary" />
            <span>Example Commands</span>
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="font-mono bg-background p-2 rounded">
              <p>• Postgres: /path/to/postgres-mcp-server --connection-string "postgresql://..."</p>
              <p>• Weather API: /usr/local/bin/weather-cli --api-key ABC123</p>
              <p>• SSE Server: https://api.example.com/mcp/stream</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}