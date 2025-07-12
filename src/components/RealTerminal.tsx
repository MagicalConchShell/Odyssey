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
  Terminal as TerminalIcon
} from 'lucide-react'
import clsx from 'clsx'

// Import UI components
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// Types
import type { Project } from '@/lib/projectState'

interface RealTerminalProps {
  sessionId: string | null
  project?: Project
  projectPath: string
  selectedAIModel: 'claude-code' | 'gemini' | null
  onTerminalReady?: () => void
  onTerminalExit?: () => void
  className?: string
}

export const RealTerminal: React.FC<RealTerminalProps> = ({
  sessionId,
  project,
  projectPath,
  selectedAIModel,
  onTerminalReady,
  onTerminalExit,
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
  
  // Terminal theme
  const terminalTheme = {
    background: '#0f0f23',
    foreground: '#f8f8f2',
    cursor: '#f8f8f0',
    cursorAccent: '#272822',
    selection: '#49483e',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
    brightBlack: '#75715e',
    brightRed: '#f92672',
    brightGreen: '#a6e22e',
    brightYellow: '#f4bf75',
    brightBlue: '#66d9ef',
    brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4',
    brightWhite: '#f9f8f5'
  }

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return

    try {
      // Create terminal instance
      const terminal = new XTerminal({
        theme: terminalTheme,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 14,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'bar',
        allowTransparency: true,
        rows: 24,
        cols: 80,
        convertEol: true,
        scrollback: 1000
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

      // Show welcome message
      terminal.writeln('\x1b[1;36m╭─────────────────────────────────────────╮\x1b[0m')
      terminal.writeln('\x1b[1;36m│             Odyssey Terminal            │\x1b[0m')
      terminal.writeln('\x1b[1;36m╰─────────────────────────────────────────╯\x1b[0m')
      terminal.writeln('')
      
      if (project) {
        terminal.writeln(`\x1b[1;32mProject:\x1b[0m ${project.name}`)
        terminal.writeln(`\x1b[1;32mPath:\x1b[0m ${projectPath}`)
      }
      
      if (selectedAIModel) {
        terminal.writeln(`\x1b[1;35mAI Model:\x1b[0m ${selectedAIModel}`)
      }
      
      terminal.writeln('')
      terminal.writeln('\x1b[33mConnecting to terminal session...\x1b[0m')

      setIsConnected(true)
      onTerminalReady?.()

    } catch (err) {
      console.error('Failed to initialize terminal:', err)
      setError('Failed to initialize terminal')
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
  }, [terminalRef.current])

  // Create terminal session
  useEffect(() => {
    if (!isConnected || !xtermRef.current || sessionId) return

    const createSession = async () => {
      try {
        const result = await window.electronAPI.terminal.create(projectPath)
        
        if (result.success && result.data) {
          const newSessionId = result.data.sessionId
          
          // Setup terminal data listeners
          const handleTerminalData = (data: string) => {
            if (xtermRef.current) {
              xtermRef.current.write(data)
            }
          }

          const handleTerminalExit = (code: number) => {
            if (xtermRef.current) {
              xtermRef.current.writeln('')
              xtermRef.current.writeln(`\x1b[33mProcess exited with code ${code}\x1b[0m`)
            }
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

          // Auto-start AI model if selected
          if (selectedAIModel === 'claude-code') {
            // Give a moment for the shell to initialize
            setTimeout(() => {
              window.electronAPI.terminal.write(newSessionId, 'claude\r')
            }, 1000)
          }

          if (xtermRef.current) {
            xtermRef.current.writeln('\x1b[32mTerminal session created successfully!\x1b[0m')
            xtermRef.current.writeln('')
          }

        } else {
          throw new Error(result.error || 'Failed to create terminal session')
        }
      } catch (err) {
        console.error('Failed to create terminal session:', err)
        setError('Failed to create terminal session')
        if (xtermRef.current) {
          xtermRef.current.writeln('\x1b[31mFailed to create terminal session\x1b[0m')
        }
      }
    }

    createSession()
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
    if (sessionId) {
      try {
        await window.electronAPI.terminal.close(sessionId)
        onTerminalExit?.()
      } catch (err) {
        console.error('Failed to stop terminal:', err)
      }
    }
  }

  if (error) {
    return (
      <div className={clsx("flex-1 flex items-center justify-center", className)}>
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <div>
            <h3 className="text-lg font-semibold">Terminal Error</h3>
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
      <div className={clsx("flex flex-col h-full bg-black", className)}>
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-black/90 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <TerminalIcon className="h-4 w-4 text-green-400" />
            <span className="text-sm font-medium text-gray-300">Terminal</span>
            {selectedAIModel && (
              <Badge variant="outline" className="text-xs">
                {selectedAIModel}
              </Badge>
            )}
            {isConnected && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-xs text-green-400">Connected</span>
              </div>
            )}
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
                <p>Stop terminal session</p>
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
            className="px-4 py-2 bg-black/90 border-b border-gray-800"
          >
            <div className="flex items-center gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search in terminal..."
                className="h-8 text-sm bg-gray-900 border-gray-700 text-white"
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
          isFullscreen && "fixed inset-0 z-50 bg-black"
        )}>
          <div
            ref={terminalRef}
            className="absolute inset-0"
            style={{ background: terminalTheme.background }}
          />
        </div>
      </div>
    </TooltipProvider>
  )
}