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
  project?: Project
  projectPath: string
  selectedAIModel: 'claude-code' | 'gemini' | null
  onTerminalReady?: () => void
  onTerminalExit?: () => void
  className?: string
}

export const RealTerminal: React.FC<RealTerminalProps> = ({
  project: _project,
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
  
  const [internalSessionId, setInternalSessionId] = useState<string | null>(null)
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

  // Initialize terminal UI
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return

    try {
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

      const fitAddon = new FitAddon()
      const searchAddon = new SearchAddon()

      terminal.loadAddon(fitAddon)
      terminal.loadAddon(searchAddon)

      xtermRef.current = terminal
      fitAddonRef.current = fitAddon
      searchAddonRef.current = searchAddon

      terminal.open(terminalRef.current)
      fitAddon.fit()
      
      terminal.writeln('Welcome to Odyssey Terminal')
      terminal.write('$ ')

      setIsConnected(true)
      onTerminalReady?.()
    } catch (err) {
      console.error('Failed to initialize terminal:', err)
      setError('Failed to initialize terminal')
    }

    return () => {
      if (xtermRef.current) {
        xtermRef.current.dispose()
        xtermRef.current = null
        fitAddonRef.current = null
        searchAddonRef.current = null
      }
    }
  }, [onTerminalReady])

  // Create backend terminal session
  useEffect(() => {
    if (!isConnected || internalSessionId) return

    const createSession = async () => {
      try {
        const result = await window.electronAPI.terminal.create(projectPath)
        if (result.success && result.data) {
          setInternalSessionId(result.data.sessionId)
        } else {
          throw new Error(result.error || 'Failed to create terminal session')
        }
      } catch (err) {
        console.error('Failed to create terminal session:', err)
        setError('Failed to create terminal session')
      }
    }

    createSession()
  }, [isConnected, internalSessionId, projectPath])

  // Wire up terminal I/O
  useEffect(() => {
    if (!internalSessionId || !xtermRef.current) return

    const terminal = xtermRef.current

    // Frontend -> Backend (User Input)
    const onDataDisposable = terminal.onData((data) => {
      window.electronAPI.terminal.write(internalSessionId, data)
    })

    // Backend -> Frontend (Shell Output)
    const handleTerminalData = (_event: any, data: string) => {
      terminal.write(data)
    }

    const handleTerminalExit = (_event: any, code: number) => {
      terminal.writeln(`
Process exited with code ${code}`)
      onTerminalExit?.()
    }

    const dataChannel = `terminal-data-${internalSessionId}`
    const exitChannel = `terminal-exit-${internalSessionId}`

    window.electronAPI.on?.(dataChannel, handleTerminalData)
    window.electronAPI.on?.(exitChannel, handleTerminalExit)

    // Send initial command or enter key
    if (selectedAIModel) {
      const aiCommands = {
        'claude-code': 'claude',
        'gemini': 'gemini'
      }
      const command = aiCommands[selectedAIModel]
      if (command) {
        setTimeout(async () => {
          try {
            terminal.writeln('Starting AI session...')
            await window.electronAPI.terminal.write(internalSessionId, `cd "${projectPath}"
`)
            await new Promise(resolve => setTimeout(resolve, 200))
            await window.electronAPI.terminal.write(internalSessionId, `${command}
`)
          } catch (error) {
            console.error(`Failed to start ${selectedAIModel}:`, error)
            terminal.writeln(`
Error starting ${selectedAIModel}`)
            terminal.write('$ ')
          }
        }, 500)
      }
    } else {
      // Send an initial carriage return to get the shell prompt
      window.electronAPI.terminal.write(internalSessionId, '')
    }

    // Cleanup
    return () => {
      onDataDisposable.dispose()
      window.electronAPI.removeListener?.(dataChannel, handleTerminalData)
      window.electronAPI.removeListener?.(exitChannel, handleTerminalExit)
    }
  }, [internalSessionId, projectPath, selectedAIModel, onTerminalExit])

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit()
        const { cols, rows } = xtermRef.current
        if (internalSessionId) {
          window.electronAPI.terminal.resize(internalSessionId, cols, rows)
        }
      }
    }

    window.addEventListener('resize', handleResize)
    // Also resize on initial load
    setTimeout(handleResize, 100)
    return () => window.removeEventListener('resize', handleResize)
  }, [internalSessionId])

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
    if (internalSessionId) {
      try {
        await window.electronAPI.terminal.close(internalSessionId)
        onTerminalExit?.()
      } catch (err) {
        console.error('Failed to stop terminal:', err)
      }
    }
  }

  if (error) {
    return (
      <div className={clsx("flex-1 flex items-center justify-center p-8", className)}>
        <div className="text-center space-y-6 max-w-md">
          <div className="space-y-2">
            <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
            <h3 className="text-xl font-semibold">Terminal Error</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button 
                onClick={() => {
                  setError(null)
                  window.location.reload()
                }} 
                variant="default"
                className="flex-1"
              >
                Restart Terminal
              </Button>
              <Button 
                onClick={() => {
                  setError(null)
                  onTerminalExit?.()
                }} 
                variant="outline"
                className="flex-1"
              >
                Go Back
              </Button>
            </div>
          </div>
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
            {internalSessionId && isConnected && (
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
                  disabled={!internalSessionId}
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
