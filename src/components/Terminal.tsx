/**
 * Terminal Component - Pure XTerm + WebGL Rendering
 *
 * This implements the SOTA architecture from terminal_architecture_v1.md
 * Pure component that only handles XTerm rendering - no session management
 */

import React, {useEffect, useRef, useCallback, useState} from 'react'
import {Terminal as XTerminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import {SearchAddon} from '@xterm/addon-search'
import {WebglAddon} from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import {useTheme} from '@/components/theme-provider'
import {useSimpleTerminalStore} from '@/hooks/useSimpleTerminalStore'
import {terminalEventManager} from '@/lib/TerminalEventManager'
import {TerminalSearch} from './TerminalSearch'
import {terminalPerformanceMonitor, withPerformanceTracking} from '@/lib/TerminalPerformanceMonitor'

interface TerminalProps {
  terminalId: string
  className?: string
}

export const Terminal: React.FC<TerminalProps> = ({terminalId, className = ''}) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const {theme} = useTheme()
  const {
    writeToTerminal,
    resizeTerminal,
    removeTerminal,
    terminalSessionMap,
    getTerminalInstance,
    setTerminalInstance
  } = useSimpleTerminalStore()

  // Search state
  const [isSearchVisible, setIsSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Terminal themes
  const terminalTheme = {
    dark: {
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
    },
    light: {
      background: '#fafafa',
      foreground: '#24292f',
      cursor: '#24292f',
      cursorAccent: '#ffffff',
      selection: '#b3d4fc',
      black: '#24292f',
      red: '#cf222e',
      green: '#116329',
      yellow: '#4d2d00',
      blue: '#0969da',
      magenta: '#8250df',
      cyan: '#1b7c83',
      white: '#6e7781',
      brightBlack: '#656d76',
      brightRed: '#a40e26',
      brightGreen: '#0d5016',
      brightYellow: '#633c01',
      brightBlue: '#0550ae',
      brightMagenta: '#6639ba',
      brightCyan: '#1b7c83',
      brightWhite: '#24292f'
    }
  }

  // Get or create XTerm instance
  const getOrCreateXTermInstance = useCallback(() => {
    // Check if instance already exists
    let instance = getTerminalInstance(terminalId)

    if (instance) {
      console.log(`[Terminal] Using existing XTerm instance for terminal ${terminalId}`)
      return instance
    }

    // Create new instance
    console.log(`[Terminal] Creating new XTerm instance for terminal ${terminalId}`)

    // Create terminal with theme
    const terminal = new XTerminal({
      theme: terminalTheme[theme],
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: true,
      convertEol: true,
      scrollback: 1000
    })

    // Create addons
    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    const webglAddon = new WebglAddon()

    // Load addons
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(searchAddon)
    try {
      terminal.loadAddon(webglAddon)
      console.log(`[Terminal] WebGL addon loaded for terminal ${terminalId}`)
    } catch (error) {
      console.warn(`[Terminal] WebGL addon failed to load for terminal ${terminalId}, falling back to canvas:`, error)
    }

    // Handle user input - write to backend with performance tracking
    const inputDisposable = terminal.onData(withPerformanceTracking(
      terminalId,
      'input',
      (data) => {
        writeToTerminal(terminalId, data)
      }
    ))

    // Handle terminal resize with performance tracking
    const resizeDisposable = terminal.onResize(withPerformanceTracking(
      terminalId,
      'resize',
      ({cols, rows}) => {
        resizeTerminal(terminalId, cols, rows)
      }
    ))

    // Create instance object
    instance = {
      xterm: terminal,
      fitAddon,
      searchAddon,
      webglAddon,
      disposables: [inputDisposable, resizeDisposable],
      isAttached: false
    }

    // Store instance in Zustand
    setTerminalInstance(terminalId, instance)

    return instance
  }, [terminalId, theme, writeToTerminal, resizeTerminal, getTerminalInstance, setTerminalInstance])

  // Setup backend event listeners using TerminalEventManager
  const setupBackendListeners = useCallback(() => {
    // Get backend session ID from the session map
    const backendSessionId = terminalSessionMap.get(terminalId)

    if (!backendSessionId) {
      console.warn(`[Terminal] No backend session ID found for terminal ${terminalId}`)
      return () => {
      } // Return empty cleanup function
    }

    console.log(`[Terminal] Setting up listeners for terminal ${terminalId} -> backend session ${backendSessionId}`)

    // Subscribe to events using the event manager
    const subscription = terminalEventManager.subscribe(
      terminalId,
      backendSessionId,
      {
        onData: withPerformanceTracking(
          terminalId,
          'output',
          (data: string) => {
            const instance = getTerminalInstance(terminalId)
            if (instance?.xterm) {
              instance.xterm.write(data)
            }
          }
        ),
        onExit: (exitCode: number) => {
          const instance = getTerminalInstance(terminalId)
          if (instance?.xterm) {
            instance.xterm.writeln(`\r\n\x1b[90mProcess exited with code ${exitCode}\x1b[0m`)
          }
          // Remove terminal from store
          removeTerminal(terminalId)
        },
        onError: (error: Error) => {
          console.error(`[Terminal] Event error for terminal ${terminalId}:`, error)
          const instance = getTerminalInstance(terminalId)
          if (instance?.xterm) {
            instance.xterm.writeln(`\r\n\x1b[31mTerminal error: ${error.message}\x1b[0m`)
          }
        }
      }
    )

    // Return cleanup function
    return () => {
      subscription.unsubscribe()
    }
  }, [terminalId, terminalSessionMap, removeTerminal, getTerminalInstance])

  // Handle resize with debouncing
  const handleResize = useCallback(() => {
    const instance = getTerminalInstance(terminalId)
    if (instance?.fitAddon && instance?.xterm) {
      try {
        instance.fitAddon.fit()
        const {cols, rows} = instance.xterm
        resizeTerminal(terminalId, cols, rows)
      } catch (error) {
        console.error(`[Terminal] Resize error for terminal ${terminalId}:`, error)
      }
    }
  }, [terminalId, resizeTerminal, getTerminalInstance])

  // Initialize terminal and setup listeners
  useEffect(() => {
    const instance = getOrCreateXTermInstance()

    // Attach terminal to DOM if not already attached
    if (!instance.isAttached && terminalRef.current) {
      console.log(`[Terminal] Attaching terminal ${terminalId} to DOM`)
      instance.xterm.open(terminalRef.current)
      instance.isAttached = true

      // Fit terminal to container
      setTimeout(() => {
        instance.fitAddon.fit()
        const {cols, rows} = instance.xterm
        resizeTerminal(terminalId, cols, rows)
      }, 10)
    }

    const cleanupListeners = setupBackendListeners()

    return () => {
      cleanupListeners?.()
    }
  }, [getOrCreateXTermInstance, setupBackendListeners, terminalId, resizeTerminal])

  // Handle theme changes
  useEffect(() => {
    const instance = getTerminalInstance(terminalId)
    if (instance?.xterm) {
      instance.xterm.options.theme = terminalTheme[theme]
      // Refresh terminal to apply theme
      setTimeout(() => {
        if (instance.fitAddon) {
          instance.fitAddon.fit()
        }
      }, 10)
    }
  }, [theme, terminalId, getTerminalInstance])

  // Handle window resize
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout

    const debouncedResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(handleResize, 100)
    }

    window.addEventListener('resize', debouncedResize)

    return () => {
      window.removeEventListener('resize', debouncedResize)
      clearTimeout(resizeTimeout)
    }
  }, [handleResize])

  // Search functions
  const handleSearch = useCallback((query: string, options: {
    caseSensitive?: boolean;
    wholeWord?: boolean;
    regex?: boolean
  }) => {
    const instance = getTerminalInstance(terminalId)
    if (instance?.searchAddon && query.trim()) {
      const searchOptions = {
        caseSensitive: options.caseSensitive || false,
        wholeWord: options.wholeWord || false,
        regex: options.regex || false
      }

      try {
        const found = instance.searchAddon.findNext(query, searchOptions)
        setSearchQuery(query)
        console.log(`[Terminal] Search "${query}" found:`, found)
        return found
      } catch (error) {
        console.error(`[Terminal] Search error:`, error)
        return false
      }
    }
    return false
  }, [terminalId, getTerminalInstance])

  const handleSearchNext = useCallback(() => {
    const instance = getTerminalInstance(terminalId)
    if (instance?.searchAddon && searchQuery.trim()) {
      try {
        const found = instance.searchAddon.findNext(searchQuery)
        console.log(`[Terminal] Search next found:`, found)
        return found
      } catch (error) {
        console.error(`[Terminal] Search next error:`, error)
        return false
      }
    }
    return false
  }, [terminalId, getTerminalInstance, searchQuery])

  const handleSearchPrevious = useCallback(() => {
    const instance = getTerminalInstance(terminalId)
    if (instance?.searchAddon && searchQuery.trim()) {
      try {
        const found = instance.searchAddon.findPrevious(searchQuery)
        console.log(`[Terminal] Search previous found:`, found)
        return found
      } catch (error) {
        console.error(`[Terminal] Search previous error:`, error)
        return false
      }
    }
    return false
  }, [terminalId, getTerminalInstance, searchQuery])

  const handleSearchClear = useCallback(() => {
    const instance = getTerminalInstance(terminalId)
    if (instance?.searchAddon) {
      try {
        instance.searchAddon.clearDecorations()
        setSearchQuery('')
        console.log(`[Terminal] Search cleared`)
      } catch (error) {
        console.error(`[Terminal] Search clear error:`, error)
      }
    }
  }, [terminalId, getTerminalInstance])

  const handleSearchClose = useCallback(() => {
    handleSearchClear()
    setIsSearchVisible(false)
  }, [handleSearchClear])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts if this terminal is visible/active
      if (terminalRef.current?.parentElement?.parentElement?.classList.contains('hidden')) {
        return
      }

      // Ctrl+F or Cmd+F to open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setIsSearchVisible(true)
      }

      if (e.key === 'Escape' && isSearchVisible) {
        e.preventDefault()
        handleSearchClose()
      }

    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSearchVisible, handleSearchClose,])

  // Performance monitoring
  useEffect(() => {
    // Start performance monitoring for this terminal
    terminalPerformanceMonitor.recordMetrics(terminalId, {
      terminalId,
      timestamp: Date.now()
    })

    // Periodic performance recording
    const interval = setInterval(() => {
      terminalPerformanceMonitor.recordMetrics(terminalId, {
        terminalId,
        timestamp: Date.now()
      })
    }, 5000) // Every 5 seconds

    return () => {
      clearInterval(interval)
    }
  }, [terminalId])

  // Cleanup on unmount - only dispose if terminal is being removed
  useEffect(() => {
    return () => {
      // Note: We don't dispose XTerm instances here because they should persist
      // across tab switches. Only dispose when the terminal is actually removed
      // from the store (handled in removeTerminal action)
      console.log(`[Terminal] Component unmounting for terminal ${terminalId}`)
    }
  }, [terminalId])

  return (
    <div className={`terminal-container relative ${className}`}>
      <div
        ref={terminalRef}
        className="terminal-element"
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: terminalTheme[theme].background
        }}
      />

      {/* Search UI */}
      <TerminalSearch
        isVisible={isSearchVisible}
        onClose={handleSearchClose}
        onSearch={handleSearch}
        onNext={handleSearchNext}
        onPrevious={handleSearchPrevious}
        onClear={handleSearchClear}
      />
    </div>
  )
}

export default Terminal