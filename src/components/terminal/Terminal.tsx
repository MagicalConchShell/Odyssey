/**
 * Terminal Component - Pure XTerm + WebGL Rendering
 *
 * This implements the SOTA architecture from terminal_architecture_v1.md
 * Pure component that only handles XTerm rendering - no session management
 * Refactored to use specialized hooks for cleaner separation of concerns
 */

import React, {useEffect, useRef, useCallback} from 'react'
import {Terminal as XTerminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import {SearchAddon} from '@xterm/addon-search'
import {WebglAddon} from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import {useTheme} from '@/components/theme-provider'
import {useAppStore} from '@/store'
import {useTerminalSearch} from './hooks/useTerminalSearch'
import {useTerminalResize} from './hooks/useTerminalResize'
import {useTerminalShortcuts} from './hooks/useTerminalShortcuts'
import {TerminalSearch} from './TerminalSearch'
import {terminalLogger} from '@/utils/logger'

interface TerminalProps {
  terminalId: string
  className?: string
}

export const Terminal: React.FC<TerminalProps> = ({terminalId, className = ''}) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const {theme} = useTheme()
  const writeToTerminal = useAppStore((state) => state.writeToTerminal)
  const resizeTerminal = useAppStore((state) => state.resizeTerminal)
  const getTerminalInstance = useAppStore((state) => state.getTerminalInstance)
  const setTerminalInstance = useAppStore((state) => state.setTerminalInstance)

  // Use specialized hooks
  const search = useTerminalSearch(terminalId)
  useTerminalResize(terminalId, terminalRef)

  // Use terminal shortcuts hook
  useTerminalShortcuts(terminalRef, {
    onSearchToggle: () => search.setIsSearchVisible(true),
    onSearchClose: search.handleSearchClose,
    isSearchVisible: search.isSearchVisible
  })

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

      // Check if this instance already has event handlers
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
    let inputDisposable, resizeDisposable, oscDisposable

    if (needsEventHandlers) {
      // Handle user input - write to backend
      inputDisposable = terminal.onData((data) => {
        writeToTerminal(terminalId, data)
      })

      // Handle terminal resize
      resizeDisposable = terminal.onResize(({cols, rows}) => {
        resizeTerminal(terminalId, cols, rows)
      })

      // Handle OSC sequences for shell integration (CWD tracking)
      oscDisposable = terminal.parser.registerOscHandler(633, (data: string) => {
        try {
          // Parse our custom OSC 633 sequence for CWD updates
          // Format: P;Cwd=file://hostname/path
          if (data.startsWith('P;Cwd=file://')) {
            const cwdMatch = data.match(/P;Cwd=file:\/\/[^\/]*(.+)/)
            if (cwdMatch && cwdMatch[1]) {
              const newCwd = cwdMatch[1]
              
              // Send CWD update to backend via IPC
              if (window.electronAPI && window.electronAPI.terminal.cwdChanged) {
                window.electronAPI.terminal.cwdChanged(terminalId, newCwd)
                  .catch((error: any) => {
                    console.error('Failed to send CWD update:', error)
                  })
              }
              
              terminalLogger.debug('CWD updated via OSC sequence', { terminalId, newCwd })
            }
          }
          
          // Return true to prevent the sequence from being displayed
          return true
        } catch (error) {
          console.error('Error parsing OSC sequence:', error)
          return false
        }
      })
    }

    // Create or update instance object
    if (instance) {
      // Update existing instance with new event handlers
      instance.disposables = [inputDisposable, resizeDisposable, oscDisposable].filter(Boolean)
    } else {
      // Create new instance object
      instance = {
        xterm: terminal,
        fitAddon,
        searchAddon,
        webglAddon,
        disposables: [inputDisposable, resizeDisposable, oscDisposable],
        isAttached: false
      }
    }

    // Store instance in Zustand
    setTerminalInstance(terminalId, instance)

    return instance
  }, [terminalId, theme, writeToTerminal, resizeTerminal, getTerminalInstance, setTerminalInstance])

  // Initialize terminal
  useEffect(() => {
    const instance = getOrCreateXTermInstance()

    // Attach terminal to DOM if not already attached
    if (!instance.isAttached && terminalRef.current) {
      terminalLogger.debug('Attaching terminal to DOM', {terminalId})
      instance.xterm.open(terminalRef.current)
      instance.isAttached = true

      // Register WebContents for backend communication (critical for terminal recovery)
      if (window.electronAPI?.terminal?.registerWebContents) {
        window.electronAPI.terminal.registerWebContents(terminalId)
          .then(() => {
            terminalLogger.debug('WebContents registered successfully', {terminalId})
          })
          .catch((error) => {
            terminalLogger.error('Failed to register WebContents', {terminalId, error})
          })
      } else {
        terminalLogger.warn('registerWebContents API not available', {terminalId})
      }

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

    // ESLint disable: getOrCreateXTermInstance and resizeTerminal are stable from memoized hooks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId])

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
    // ESLint disable: getTerminalInstance is stable from memoized hook
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, terminalId])

  // Cleanup on unmount - only dispose if terminal is being removed
  useEffect(() => {
    return () => {
      // Note: We don't dispose XTerm instances here because they should persist
      // across tab switches. Only dispose when the terminal is actually removed
      // from the store (handled in removeTerminal action)
      terminalLogger.debug(`Component unmounting`, {terminalId})
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
        isVisible={search.isSearchVisible}
        onClose={search.handleSearchClose}
        onSearch={search.handleSearch}
        onNext={search.handleSearchNext}
        onPrevious={search.handleSearchPrevious}
        onClear={search.handleSearchClear}
      />
    </div>
  )
}