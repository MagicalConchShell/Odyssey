import React, { useState } from 'react'
import { Download, Upload, FileText, Loader2, Info, Network, Settings2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface MCPImportExportProps {
  onImportCompleted: (imported: number, failed: number) => void
  onError: (message: string) => void
}

export const MCPImportExport: React.FC<MCPImportExportProps> = ({
  onImportCompleted,
  onError,
}) => {
  const [importingDesktop, setImportingDesktop] = useState(false)
  const [importingJson, setImportingJson] = useState(false)
  const [importScope, setImportScope] = useState('local')
  
  // Server name dialog state
  const [serverNameDialogOpen, setServerNameDialogOpen] = useState(false)
  const [serverName, setServerName] = useState('')
  const [pendingServerConfig, setPendingServerConfig] = useState<string | null>(null)

  const handleImportFromDesktop = async () => {
    try {
      setImportingDesktop(true)
      // Always use "user" scope for Claude Desktop imports (was previously "global")
      const result = await window.electronAPI.mcp.addFromClaudeDesktop('user')
      
      // Show detailed results if available
      if (result.servers && result.servers.length > 0) {
        const successfulServers = result.servers.filter((s: any) => s.success)
        const failedServers = result.servers.filter((s: any) => !s.success)
        
        if (successfulServers.length > 0) {
          const successMessage = `Successfully imported: ${successfulServers.map((s: any) => s.name).join(', ')}`
          onImportCompleted(result.imported_count, result.failed_count)
          // Show success details
          if (failedServers.length === 0) {
            onError(successMessage)
          }
        }
        
        if (failedServers.length > 0) {
          const failureDetails = failedServers
            .map((s: any) => `${s.name}: ${s.error || 'Unknown error'}`)
            .join('\n')
          onError(`Failed to import some servers:\n${failureDetails}`)
        }
      } else {
        onImportCompleted(result.imported_count, result.failed_count)
      }
    } catch (error: any) {
      console.error('Failed to import from Claude Desktop:', error)
      onError(error.toString() || 'Failed to import from Claude Desktop')
    } finally {
      setImportingDesktop(false)
    }
  }

  const handleJsonFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setImportingJson(true)
      const content = await file.text()
      
      // Parse the JSON to validate it
      let jsonData
      try {
        jsonData = JSON.parse(content)
      } catch (e) {
        onError('Invalid JSON file. Please check the format.')
        return
      }

      // Check if it's a single server or multiple servers
      if (jsonData.mcpServers) {
        // Multiple servers format
        let imported = 0
        let failed = 0

        for (const [name, config] of Object.entries(jsonData.mcpServers)) {
          try {
            const serverConfig = {
              type: 'stdio',
              command: (config as any).command,
              args: (config as any).args || [],
              env: (config as any).env || {}
            }
            
            const result = await window.electronAPI.mcp.addJson(name, JSON.stringify(serverConfig), importScope)
            if (result.success) {
              imported++
            } else {
              failed++
            }
          } catch (e) {
            failed++
          }
        }
        
        onImportCompleted(imported, failed)
      } else if (jsonData.type && jsonData.command) {
        // Single server format
        setPendingServerConfig(content)
        setServerNameDialogOpen(true)
        return
      } else {
        onError('Unrecognized JSON format. Expected MCP server configuration.')
      }
    } catch (error) {
      console.error('Failed to import JSON:', error)
      onError('Failed to import JSON file')
    } finally {
      setImportingJson(false)
      // Reset the input
      event.target.value = ''
    }
  }

  const handleExport = () => {
    // TODO: Implement export functionality
    onError('Export functionality coming soon!')
  }

  const handleStartMCPServer = async () => {
    try {
      const result = await window.electronAPI.mcp.serve()
      if (result.success) {
        onError('Claude Code MCP server started. You can now connect to it from other applications.')
      } else {
        onError(result.message || 'Failed to start Claude Code as MCP server')
      }
    } catch (error) {
      console.error('Failed to start MCP server:', error)
      onError('Failed to start Claude Code as MCP server')
    }
  }

  const handleServerNameSubmit = async () => {
    if (serverName.trim() && pendingServerConfig) {
      try {
        const result = await window.electronAPI.mcp.addJson(serverName.trim(), pendingServerConfig, importScope)
        if (result.success) {
          onImportCompleted(1, 0)
        } else {
          onError(result.message)
        }
      } catch (error) {
        onError('Failed to import server')
      } finally {
        setServerNameDialogOpen(false)
        setServerName('')
        setPendingServerConfig(null)
      }
    }
  }

  const handleServerNameCancel = () => {
    setServerNameDialogOpen(false)
    setServerName('')
    setPendingServerConfig(null)
    setImportingJson(false)
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-base font-semibold">Import & Export</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Import MCP servers from other sources or export your configuration
        </p>
      </div>

      <div className="space-y-4">
        {/* Import Scope Selection */}
        <div className="bg-accent border rounded-lg p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <label className="text-sm font-medium">Import Scope</label>
            </div>
            <select
              value={importScope}
              onChange={(e) => setImportScope(e.target.value)}
              className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="local">Local (this project only)</option>
              <option value="project">Project (shared via .mcp.json)</option>
              <option value="user">User (all projects)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Choose where to save imported servers from JSON files
            </p>
          </div>
        </div>

        {/* Import from Claude Desktop */}
        <div className="bg-card border rounded-lg p-4 hover:bg-accent transition-colors">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-primary/10 rounded-lg">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium">Import from Claude Desktop</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Automatically imports all MCP servers from Claude Desktop. Installs to user scope (available across all projects).
                </p>
              </div>
            </div>
            <button
              onClick={handleImportFromDesktop}
              disabled={importingDesktop}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {importingDesktop ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Import from Claude Desktop
                </>
              )}
            </button>
          </div>
        </div>

        {/* Import from JSON */}
        <div className="bg-card border rounded-lg p-4 hover:bg-accent transition-colors">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-secondary/10 rounded-lg">
                <FileText className="h-5 w-5 text-secondary" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium">Import from JSON</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Import server configuration from a JSON file
                </p>
              </div>
            </div>
            <div>
              <input
                type="file"
                accept=".json"
                onChange={handleJsonFileSelect}
                disabled={importingJson}
                className="hidden"
                id="json-file-input"
              />
              <button
                onClick={() => document.getElementById('json-file-input')?.click()}
                disabled={importingJson}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-input text-foreground rounded-md hover:bg-accent transition-colors disabled:opacity-50"
              >
                {importingJson ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Choose JSON File
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Export (Coming Soon) */}
        <div className="bg-card border rounded-lg p-4 opacity-60">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-muted rounded-lg">
                <Upload className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium">Export Configuration</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Export your MCP server configuration
                </p>
              </div>
            </div>
            <button
              onClick={handleExport}
              disabled={true}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-muted text-muted-foreground rounded-md cursor-not-allowed"
            >
              <Upload className="h-4 w-4" />
              Export (Coming Soon)
            </button>
          </div>
        </div>

        {/* Serve as MCP */}
        <div className="bg-card border border-accent/20 rounded-lg p-4 hover:bg-accent/10 transition-colors">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-accent/10 rounded-lg">
                <Network className="h-5 w-5 text-accent" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium">Use Claude Code as MCP Server</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Start Claude Code as an MCP server that other applications can connect to
                </p>
              </div>
            </div>
            <button
              onClick={handleStartMCPServer}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-accent text-accent rounded-md hover:bg-accent/10 hover:border-accent/60 transition-colors"
            >
              <Network className="h-4 w-4" />
              Start MCP Server
            </button>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-accent border rounded-lg p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Info className="h-4 w-4 text-primary" />
            <span>JSON Format Examples</span>
          </div>
          <div className="space-y-3 text-xs">
            <div>
              <p className="font-medium text-muted-foreground mb-1">Single server:</p>
              <pre className="bg-background p-3 rounded-lg overflow-x-auto text-xs">
{`{
  "type": "stdio",
  "command": "/path/to/server",
  "args": ["--arg1", "value"],
  "env": { "KEY": "value" }
}`}
              </pre>
            </div>
            <div>
              <p className="font-medium text-muted-foreground mb-1">Multiple servers (.mcp.json format):</p>
              <pre className="bg-background p-3 rounded-lg overflow-x-auto text-xs">
{`{
  "mcpServers": {
    "server1": {
      "command": "/path/to/server1",
      "args": [],
      "env": {}
    },
    "server2": {
      "command": "/path/to/server2",
      "args": ["--port", "8080"],
      "env": { "API_KEY": "..." }
    }
  }
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>
      
      {/* Server Name Dialog */}
      <Dialog open={serverNameDialogOpen} onOpenChange={setServerNameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Enter Server Name</DialogTitle>
            <DialogDescription>
              Enter a unique name for this MCP server to identify it in your configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="server-name" className="text-right">
                Name
              </Label>
              <Input
                id="server-name"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                className="col-span-3"
                placeholder="Enter server name..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && serverName.trim()) {
                    handleServerNameSubmit()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={handleServerNameCancel}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleServerNameSubmit}
              disabled={!serverName.trim()}
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}