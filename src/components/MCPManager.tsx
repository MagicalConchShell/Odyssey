import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Network, Plus, Download, AlertCircle, Loader2 } from 'lucide-react'
import { McpServer } from '../types/electron'
import { MCPServerList } from './MCPServerList'
import { MCPAddServer } from './MCPAddServer'
import { MCPImportExport } from './MCPImportExport'

interface MCPManagerProps {
  onBack: () => void
  className?: string
}

interface Toast {
  message: string
  type: 'success' | 'error'
}

export const MCPManager: React.FC<MCPManagerProps> = ({
  onBack,
  className,
}) => {
  const [activeTab, setActiveTab] = useState('servers')
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    loadServers()
  }, [])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const loadServers = async () => {
    try {
      setLoading(true)
      setError(null)
      // Use Claude CLI info from App-level cache (no need to check again)
      // The App component already validates Claude CLI availability
      const result = await window.electronAPI.mcp.list()
      
      if (result.success) {
        setServers(result.servers || [])
      } else {
        throw new Error(result.error || 'Failed to load MCP servers')
      }
    } catch (err) {
      console.error('MCPManager: Failed to load MCP servers:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to load MCP servers'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleServerAdded = () => {
    loadServers()
    setToast({ message: 'MCP server added successfully!', type: 'success' })
    setActiveTab('servers')
  }

  const handleServerRemoved = (name: string) => {
    setServers(prev => prev.filter(s => s.name !== name))
    setToast({ message: `Server "${name}" removed successfully!`, type: 'success' })
  }

  const handleImportCompleted = (imported: number, failed: number) => {
    loadServers()
    if (failed === 0) {
      setToast({ 
        message: `Successfully imported ${imported} server${imported > 1 ? 's' : ''}!`, 
        type: 'success' 
      })
    } else {
      setToast({ 
        message: `Imported ${imported} server${imported > 1 ? 's' : ''}, ${failed} failed`, 
        type: 'error' 
      })
    }
  }

  const handleError = (message: string) => {
    setToast({ message, type: 'error' })
  }

  return (
    <div className={`flex flex-col h-full bg-background text-foreground ${className || ''}`}>
      <div className="max-w-5xl mx-auto w-full flex flex-col h-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="h-8 w-8 p-2 hover:bg-accent rounded-md transition-colors flex items-center justify-center"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Network className="h-5 w-5 text-blue-500" />
                MCP Servers
              </h2>
              <p className="text-xs text-muted-foreground">
                Manage Model Context Protocol servers
              </p>
            </div>
          </div>
        </motion.div>

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-4 mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive flex items-center gap-2 text-sm text-destructive"
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
                toast.type === 'success' ? 'bg-accent/10 border border-accent text-accent-foreground' : 'bg-destructive/10 border border-destructive text-destructive'
              }`}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-6">
              <div className="grid w-full max-w-md grid-cols-3 bg-muted p-1 rounded-lg">
                {[
                  { id: 'servers', label: 'Servers', icon: Network, color: 'text-blue-500' },
                  { id: 'add', label: 'Add Server', icon: Plus, color: 'text-green-500' },
                  { id: 'import', label: 'Import/Export', icon: Download, color: 'text-purple-500' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === tab.id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <tab.icon className={`h-4 w-4 ${tab.color}`} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Servers Tab */}
              {activeTab === 'servers' && (
                <div className="bg-card border border-border rounded-lg shimmer-hover">
                  <MCPServerList
                    servers={servers}
                    loading={false}
                    onServerRemoved={handleServerRemoved}
                    onRefresh={loadServers}
                  />
                </div>
              )}

              {/* Add Server Tab */}
              {activeTab === 'add' && (
                <div className="bg-card border border-border rounded-lg shimmer-hover">
                  <MCPAddServer
                    onServerAdded={handleServerAdded}
                    onError={handleError}
                  />
                </div>
              )}

              {/* Import/Export Tab */}
              {activeTab === 'import' && (
                <div className="bg-card border border-border rounded-lg overflow-hidden shimmer-hover">
                  <MCPImportExport
                    onImportCompleted={handleImportCompleted}
                    onError={handleError}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}