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
import {useSimpleTerminalStore} from './hooks/useSimpleTerminalStore'
import {terminalEventManager} from './lib/TerminalEventManager'
import {TerminalSearch} from './TerminalSearch'
import {terminalLogger} from '@/utils/logger'

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
      terminalLogger.verbose('Using existing XTerm instance', {terminalId})
      return instance
    }

    // Create new instance
    terminalLogger.debug('Creating new XTerm instance', {terminalId})

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
      terminalLogger.debug('WebGL addon loaded', {terminalId})
    } catch (error) {
      terminalLogger.warn('WebGL addon failed to load, falling back to canvas', {terminalId, error})
    }

    // Handle user input - write to backend
    const inputDisposable = terminal.onData((data) => {
      writeToTerminal(terminalId, data)
    })

    // Handle terminal resize
    const resizeDisposable = terminal.onResize(({cols, rows}) => {
      resizeTerminal(terminalId, cols, rows)
    })

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

  // Setup backend event listeners - simplified with unified ID system
  const setupBackendListeners = useCallback(() => {
    // With unified ID system, terminalId === backendSessionId
    const backendSessionId = terminalId

    terminalLogger.debug('Setting up listeners for terminal', {terminalId})

    // Subscribe to events using the event manager
    const subscription = terminalEventManager.subscribe(
      terminalId,
      backendSessionId,
      {
        onData: (data: string) => {
          const instance = getTerminalInstance(terminalId)
          if (instance?.xterm) {
            instance.xterm.write(data)
          }
        },
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
  }, [terminalId, removeTerminal, getTerminalInstance, writeToTerminal])

  // Handle resize with debouncing
  const handleResize = useCallback(() => {
    const instance = getTerminalInstance(terminalId)

    if (!instance?.fitAddon || !instance?.xterm) {
      console.warn(`[Terminal] Cannot resize terminal ${terminalId} - missing addon or xterm instance`)
      return
    }

    if (!terminalRef.current) {
      console.warn(`[Terminal] Cannot resize terminal ${terminalId} - no DOM element`)
      return
    }

    try {
      // Check if the container has actual dimensions
      const rect = terminalRef.current.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        console.warn(`[Terminal] Cannot resize terminal ${terminalId} - container has zero dimensions`, rect)
        return
      }

      instance.fitAddon.fit()
      const {cols, rows} = instance.xterm
      console.log(`[Terminal] Resized terminal ${terminalId}: ${cols}x${rows}, container: ${rect.width}x${rect.height}`)
      resizeTerminal(terminalId, cols, rows)
    } catch (error) {
      console.error(`[Terminal] Resize error for terminal ${terminalId}:`, error)
    }
  }, [terminalId, resizeTerminal, getTerminalInstance])

  // Initialize terminal and setup listeners
  useEffect(() => {
    const instance = getOrCreateXTermInstance()

    // Attach terminal to DOM if not already attached
    if (!instance.isAttached && terminalRef.current) {
      terminalLogger.debug('Attaching terminal to DOM', {terminalId})
      instance.xterm.open(terminalRef.current)
      instance.isAttached = true

      // Fit terminal to container once after attachment
      setTimeout(() => {
        try {
          if (instance.fitAddon && instance.xterm && terminalRef.current) {
            instance.fitAddon.fit()
            const {cols, rows} = instance.xterm
            terminalLogger.debug('Initial fit for terminal', {terminalId, cols, rows})
            resizeTerminal(terminalId, cols, rows)
          }
        } catch (error) {
          terminalLogger.error('Error during initial fit', {terminalId, error})
        }
      }, 100)
    }

    const cleanupListeners = setupBackendListeners()

    return () => {
      cleanupListeners?.()
    }
  }, [getOrCreateXTermInstance, setupBackendListeners, terminalId, resizeTerminal])

  // Note: Removed session mapping dependency with unified ID system

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

  // Handle window resize and container changes with ResizeObserver
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout
    let resizeObserver: ResizeObserver | null = null

    const debouncedResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(handleResize, 100)
    }

    // Handle window resize
    window.addEventListener('resize', debouncedResize)

    // Handle container size changes with ResizeObserver
    if (terminalRef.current && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        debouncedResize()
      })
      resizeObserver.observe(terminalRef.current)
    }

    return () => {
      window.removeEventListener('resize', debouncedResize)
      clearTimeout(resizeTimeout)
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
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
  }, [isSearchVisible, handleSearchClose, terminalId, getTerminalInstance, terminalSessionMap, writeToTerminal, handleResize])


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