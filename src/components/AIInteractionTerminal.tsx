import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { motion } from 'framer-motion'
import { 
  Square, 
  Search,
  Maximize2, 
  Minimize2,
  AlertCircle,
  Terminal as TerminalIcon,
  Bot,
  Sparkles,
  RefreshCw
} from 'lucide-react'
import clsx from 'clsx'

// Import UI components
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// Types
import type { Project } from '@/lib/projectState'
import type { AIProvider, AIModel } from '../../electron/handlers/ai-interaction'

interface AIInteractionTerminalProps {
  sessionId: string | null
  project?: Project
  projectPath: string
  selectedAIModel: 'claude-code' | 'gemini' | null
  onTerminalReady?: () => void
  onTerminalExit?: () => void
  onAISessionStart?: (sessionId: string) => void
  onAISessionEnd?: (sessionId: string) => void
  className?: string
}

export const AIInteractionTerminal: React.FC<AIInteractionTerminalProps> = ({
  sessionId,
  project,
  projectPath,
  selectedAIModel,
  onTerminalReady,
  onTerminalExit,
  onAISessionStart,
  onAISessionEnd,
  className
}) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSearchVisible, setIsSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [aiSessionId, setAISessionId] = useState<string | null>(null)
  const [aiStatus, setAIStatus] = useState<'idle' | 'starting' | 'active' | 'error'>('idle')
  
  // Terminal theme - AI-focused styling
  const terminalTheme = {
    background: '#0a0a0f',
    foreground: '#e1e7ef',
    cursor: '#7c3aed',
    cursorAccent: '#1e1b4b',
    selection: '#4c1d95',
    black: '#1e1b4b',
    red: '#ef4444',
    green: '#10b981',
    yellow: '#f59e0b',
    blue: '#3b82f6',
    magenta: '#8b5cf6',
    cyan: '#06b6d4',
    white: '#f8fafc',
    brightBlack: '#475569',
    brightRed: '#f87171',
    brightGreen: '#34d399',
    brightYellow: '#fbbf24',
    brightBlue: '#60a5fa',
    brightMagenta: '#a78bfa',
    brightCyan: '#22d3ee',
    brightWhite: '#ffffff'
  }

  // Get AI model configuration
  const getAIModelConfig = (model: 'claude-code' | 'gemini') => {
    switch (model) {
      case 'claude-code':
        return {
          provider: 'anthropic' as AIProvider,
          model: 'claude-sonnet' as AIModel,
          command: 'claude',
          icon: <Bot className="h-4 w-4" />,
          color: 'bg-orange-500',
          name: 'Claude Code'
        }
      case 'gemini':
        return {
          provider: 'google' as AIProvider,
          model: 'gemini-pro' as AIModel,
          command: 'gemini', // This would be a custom command or script to launch Gemini
          icon: <Sparkles className="h-4 w-4" />,
          color: 'bg-blue-500',
          name: 'Gemini'
        }
      default:
        return null
    }
  }

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return

    try {
      // Create terminal instance with AI-focused configuration
      const terminal = new XTerminal({
        theme: terminalTheme,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 14,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'bar',
        allowTransparency: true,
        rows: 28,
        cols: 100,
        convertEol: true,
        scrollback: 2000,
        windowsMode: process.platform === 'win32'
      })

      // Create addons
      const fitAddon = new FitAddon()
      const searchAddon = new SearchAddon()

      // Load addons
      terminal.loadAddon(fitAddon)
      terminal.loadAddon(searchAddon)

      // Store references
      xtermRef.current = terminal
      fitAddonRef.current = fitAddon
      searchAddonRef.current = searchAddon

      // Open terminal
      terminal.open(terminalRef.current)
      
      // Fit terminal to container
      fitAddon.fit()

      // Show AI-themed welcome message
      const modelConfig = selectedAIModel ? getAIModelConfig(selectedAIModel) : null
      terminal.writeln('\x1b[1;35m╭─────────────────────────────────────────────╮\x1b[0m')
      terminal.writeln('\x1b[1;35m│          AI Interactive Terminal           │\x1b[0m')
      terminal.writeln('\x1b[1;35m╰─────────────────────────────────────────────╯\x1b[0m')
      terminal.writeln('')
      
      if (project) {
        terminal.writeln(`\x1b[1;32m📁 Project:\x1b[0m ${project.name}`)
        terminal.writeln(`\x1b[1;34m📂 Path:\x1b[0m ${projectPath}`)
      }
      
      if (modelConfig) {
        terminal.writeln(`\x1b[1;35m🤖 AI Model:\x1b[0m ${modelConfig.name}`)
        terminal.writeln('')
        terminal.writeln('\x1b[33m🚀 Initializing AI session...\x1b[0m')
      }

      setIsConnected(true)
      onTerminalReady?.()

    } catch (err) {
      console.error('Failed to initialize AI terminal:', err)
      setError('Failed to initialize AI terminal')
    }

    // Cleanup function
    return () => {
      if (xtermRef.current) {
        xtermRef.current.dispose()
        xtermRef.current = null
        fitAddonRef.current = null
        searchAddonRef.current = null
      }
    }
  }, [terminalRef.current, selectedAIModel, project, projectPath])

  // Create terminal session and start AI
  useEffect(() => {
    if (!isConnected || !xtermRef.current || sessionId || !selectedAIModel) return

    const createSessionAndStartAI = async () => {
      try {
        setAIStatus('starting')
        
        // Create terminal session
        const terminalResult = await window.electronAPI.terminal.create(projectPath)
        
        if (terminalResult.success && terminalResult.data) {
          const newSessionId = terminalResult.data.sessionId
          
          // Setup terminal data listeners
          const handleTerminalData = (data: string) => {
            if (xtermRef.current) {
              xtermRef.current.write(data)
            }
          }

          const handleTerminalExit = (code: number) => {
            if (xtermRef.current) {
              xtermRef.current.writeln('')
              xtermRef.current.writeln(`\x1b[33m⚡ Process exited with code ${code}\x1b[0m`)
            }
            setAIStatus('idle')
            onTerminalExit?.()
          }

          // Listen for terminal events
          window.electronAPI.on?.(`terminal-data-${newSessionId}`, handleTerminalData)
          window.electronAPI.on?.(`terminal-exit-${newSessionId}`, handleTerminalExit)

          // Handle terminal input
          if (xtermRef.current) {
            xtermRef.current.onData((data) => {
              window.electronAPI.terminal.write(newSessionId, data)
            })
          }

          // Auto-start AI model with improved sequencing
          const modelConfig = getAIModelConfig(selectedAIModel)
          if (modelConfig) {
            
            if (xtermRef.current) {
              xtermRef.current.writeln('\x1b[32m✅ Terminal session created successfully!\x1b[0m')
              xtermRef.current.writeln(`\x1b[36m🎯 Starting ${modelConfig.name} in project directory...\x1b[0m`)
              xtermRef.current.writeln('')
            }

            // Enhanced command execution sequence
            setTimeout(async () => {
              try {
                // Ensure we're in the project directory
                await window.electronAPI.terminal.write(newSessionId, `cd "${projectPath}"\r`)
                
                // Small delay for directory change
                setTimeout(async () => {
                  // Start the AI command
                  await window.electronAPI.terminal.write(newSessionId, `${modelConfig.command}\r`)
                  setAIStatus('active')
                  setAISessionId(newSessionId)
                  onAISessionStart?.(newSessionId)
                }, 500)
                
              } catch (error) {
                console.error('Failed to start AI command:', error)
                setAIStatus('error')
                if (xtermRef.current) {
                  xtermRef.current.writeln('\x1b[31m❌ Failed to start AI session\x1b[0m')
                }
              }
            }, 1000)
          }

        } else {
          throw new Error(terminalResult.error || 'Failed to create terminal session')
        }
      } catch (err) {
        console.error('Failed to create AI terminal session:', err)
        setError('Failed to create AI terminal session')
        setAIStatus('error')
        if (xtermRef.current) {
          xtermRef.current.writeln('\x1b[31m❌ Failed to create AI terminal session\x1b[0m')
        }
      }
    }

    createSessionAndStartAI()
  }, [isConnected, sessionId, projectPath, selectedAIModel])

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Search functionality
  const handleSearch = useCallback((query: string, direction: 'next' | 'previous' = 'next') => {
    if (!searchAddonRef.current || !query.trim()) return

    if (direction === 'next') {
      searchAddonRef.current.findNext(query)
    } else {
      searchAddonRef.current.findPrevious(query)
    }
  }, [])

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch(searchQuery)
    } else if (e.key === 'Escape') {
      setIsSearchVisible(false)
      setSearchQuery('')
    }
  }

  // Terminal controls
  const handleStop = async () => {
    if (aiSessionId) {
      try {
        await window.electronAPI.terminal.close(aiSessionId)
        setAIStatus('idle')
        setAISessionId(null)
        onAISessionEnd?.(aiSessionId)
        onTerminalExit?.()
      } catch (err) {
        console.error('Failed to stop AI terminal:', err)
      }
    }
  }

  const handleRestart = async () => {
    if (aiSessionId) {
      await handleStop()
      // Trigger recreation through useEffect
      setIsConnected(false)
      setTimeout(() => setIsConnected(true), 500)
    }
  }

  // Get status indicator
  const getStatusIndicator = () => {
    switch (aiStatus) {
      case 'starting':
        return (
          <div className="flex items-center gap-1">
            <RefreshCw className="w-2 h-2 text-yellow-400 animate-spin" />
            <span className="text-xs text-yellow-400">Starting AI...</span>
          </div>
        )
      case 'active':
        return (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs text-green-400">AI Active</span>
          </div>
        )
      case 'error':
        return (
          <div className="flex items-center gap-1">
            <AlertCircle className="w-2 h-2 text-red-400" />
            <span className="text-xs text-red-400">AI Error</span>
          </div>
        )
      default:
        return (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full" />
            <span className="text-xs text-gray-400">Terminal Ready</span>
          </div>
        )
    }
  }

  if (error) {
    return (
      <div className={clsx("flex-1 flex items-center justify-center", className)}>
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <div>
            <h3 className="text-lg font-semibold">AI Terminal Error</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button 
            onClick={() => window.location.reload()} 
            variant="outline"
          >
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className={clsx("flex flex-col h-full", className)} style={{ background: terminalTheme.background }}>
        {/* AI Terminal Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-black/90 border-b border-purple-500/20">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <TerminalIcon className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-medium text-gray-300">AI Terminal</span>
            </div>
            
            {selectedAIModel && (
              <div className="flex items-center gap-2">
                {(() => {
                  const config = getAIModelConfig(selectedAIModel)
                  return config ? (
                    <>
                      <div className={clsx("w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs", config.color)}>
                        {config.icon}
                      </div>
                      <Badge variant="outline" className="text-xs border-purple-500/30">
                        {config.name}
                      </Badge>
                    </>
                  ) : null
                })()}
              </div>
            )}
            
            {getStatusIndicator()}
          </div>

          <div className="flex items-center gap-1">
            {/* Search Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSearchVisible(!isSearchVisible)}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Search in terminal</p>
              </TooltipContent>
            </Tooltip>

            {/* Restart AI Session */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRestart}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-blue-400"
                  disabled={aiStatus === 'starting'}
                >
                  <RefreshCw className={clsx("h-4 w-4", aiStatus === 'starting' && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Restart AI session</p>
              </TooltipContent>
            </Tooltip>

            {/* Fullscreen Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}</p>
              </TooltipContent>
            </Tooltip>

            {/* Stop Terminal */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleStop}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-400"
                >
                  <Square className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Stop AI session</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Search Bar */}
        {isSearchVisible && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-2 bg-black/90 border-b border-purple-500/20"
          >
            <div className="flex items-center gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search in AI terminal..."
                className="h-8 text-sm bg-gray-900 border-purple-500/30 text-white"
                autoFocus
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSearch(searchQuery)}
                className="h-8 px-3 text-gray-400"
              >
                Find
              </Button>
            </div>
          </motion.div>
        )}

        {/* Terminal Container */}
        <div className={clsx(
          "flex-1 relative",
          isFullscreen && "fixed inset-0 z-50"
        )} style={{ background: terminalTheme.background }}>
          <div
            ref={terminalRef}
            className="absolute inset-0"
          />
        </div>
      </div>
    </TooltipProvider>
  )
}