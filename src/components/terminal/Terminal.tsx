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
import {useTerminalStore} from './hooks/useTerminalStore'
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
    getTerminalInstance,
    setTerminalInstance
  } = useTerminalStore()

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

    let terminal: XTerminal
    let needsEventHandlers = true
    
    if (instance) {
      terminalLogger.verbose('Using existing XTerm instance', {terminalId})
      
      // ⚠️ IMPORTANT: Check if this instance already has event handlers
      // If it does, we should NOT create new ones to avoid duplicates
      const hasExistingHandlers = instance.disposables && instance.disposables.length > 0
      if (hasExistingHandlers) {
        return instance
      } else {
        terminal = instance.xterm
        needsEventHandlers = true
      }
    } else {
      // Create new instance
      terminalLogger.debug('Creating new XTerm instance', {terminalId})

      // Create terminal with theme
      terminal = new XTerminal({
        theme: terminalTheme[theme],
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 14,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'bar',
        allowTransparency: true,
        convertEol: true,
        scrollback: 1000,
      })
    }

    // Get existing addons or create new ones
    let fitAddon, searchAddon, webglAddon
    
    if (instance && !needsEventHandlers) {
      // This shouldn't happen based on our logic above, but just in case
      return instance
    } else if (instance) {
      // Reuse existing addons
      fitAddon = instance.fitAddon
      searchAddon = instance.searchAddon
      webglAddon = instance.webglAddon
    } else {
      // Create new addons
      fitAddon = new FitAddon()
      searchAddon = new SearchAddon()
      webglAddon = new WebglAddon()

      // Load addons
      terminal.loadAddon(fitAddon)
      terminal.loadAddon(searchAddon)
      try {
        terminal.loadAddon(webglAddon)
        terminalLogger.debug('WebGL addon loaded', {terminalId})
      } catch (error) {
        terminalLogger.warn('WebGL addon failed to load, falling back to canvas', {terminalId, error})
      }
    }

    // Only create event handlers if needed (to prevent duplicates)
    let inputDisposable, resizeDisposable
    
    if (needsEventHandlers) {
      // Handle user input - write to backend
      inputDisposable = terminal.onData((data) => {
        writeToTerminal(terminalId, data)
      })

      // Handle terminal resize
      resizeDisposable = terminal.onResize(({cols, rows}) => {
        resizeTerminal(terminalId, cols, rows)
      })
    }

    // Create or update instance object
    if (instance) {
      // Update existing instance with new event handlers
      instance.disposables = [inputDisposable, resizeDisposable].filter(Boolean)
    } else {
      // Create new instance object
      instance = {
        xterm: terminal,
        fitAddon,
        searchAddon,
        webglAddon,
        disposables: [inputDisposable, resizeDisposable],
        isAttached: false
      }
    }

    // Store instance in Zustand
    setTerminalInstance(terminalId, instance)

    return instance
  }, [terminalId, theme, writeToTerminal, resizeTerminal, getTerminalInstance, setTerminalInstance])

  // Setup backend event listeners - integrated with store
  const setupBackendListeners = useCallback(() => {
    // With unified ID system, terminalId === backendSessionId
    const backendSessionId = terminalId

    terminalLogger.debug('Setting up listeners for terminal', {terminalId})

    // Subscribe to events using the store's event management
    const { subscribeToTerminalEvents } = useTerminalStore.getState()
    subscribeToTerminalEvents(terminalId, backendSessionId)

    // Return cleanup function
    return () => {
      const { unsubscribeFromTerminalEvents } = useTerminalStore.getState()
      unsubscribeFromTerminalEvents(terminalId)
    }
  }, [terminalId])

  // Handle resize with debouncing
  const handleResize = useCallback(() => {
    const instance = getTerminalInstance(terminalId)

    if (!instance?.fitAddon || !instance?.xterm) {
      terminalLogger.warn(`Cannot resize terminal - missing addon or xterm instance`, { terminalId })
      return
    }

    if (!terminalRef.current) {
      terminalLogger.warn(`Cannot resize terminal - no DOM element`, { terminalId })
      return
    }

    try {
      // Check if the container has actual dimensions
      const rect = terminalRef.current.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        terminalLogger.warn(`Cannot resize terminal - container has zero dimensions`, { terminalId, rect })
        return
      }

      instance.fitAddon.fit()
      const {cols, rows} = instance.xterm
      terminalLogger.debug(`Resized terminal: ${cols}x${rows}`, { terminalId, container: rect })
      resizeTerminal(terminalId, cols, rows)
    } catch (error) {
      terminalLogger.error(`Resize error for terminal`, { terminalId, error })
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
  }, [terminalId, getOrCreateXTermInstance, setupBackendListeners, resizeTerminal])

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
        terminalLogger.debug(`Search "${query}" found: ${found}`, { terminalId })
        return found
      } catch (error) {
        terminalLogger.error(`Search error`, { terminalId, error })
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
        terminalLogger.debug(`Search next found: ${found}`, { terminalId })
        return found
      } catch (error) {
        terminalLogger.error(`Search next error`, { terminalId, error })
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
        terminalLogger.debug(`Search previous found: ${found}`, { terminalId })
        return found
      } catch (error) {
        terminalLogger.error(`Search previous error`, { terminalId, error })
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
        terminalLogger.debug(`Search cleared`, { terminalId })
      } catch (error) {
        terminalLogger.error(`Search clear error`, { terminalId, error })
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
  }, [isSearchVisible, handleSearchClose])


  // Cleanup on unmount - only dispose if terminal is being removed
  useEffect(() => {
    return () => {
      // Note: We don't dispose XTerm instances here because they should persist
      // across tab switches. Only dispose when the terminal is actually removed
      // from the store (handled in removeTerminal action)
      terminalLogger.debug(`Component unmounting`, { terminalId })
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
