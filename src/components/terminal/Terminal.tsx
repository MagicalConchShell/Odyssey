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
import {SerializeAddon} from '@xterm/addon-serialize'
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
  initialContent?: string // Serialized terminal state for restoration
}

export const Terminal: React.FC<TerminalProps> = ({terminalId, className = '', initialContent}) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const {theme} = useTheme()
  const writeToTerminal = useAppStore((state) => state.writeToTerminal)
  const resizeTerminal = useAppStore((state) => state.resizeTerminal)
  const getTerminalInstance = useAppStore((state) => state.getTerminalInstance)
  const setTerminalInstance = useAppStore((state) => state.setTerminalInstance)
  const setTerminalSerializeMethod = useAppStore((state) => state.setTerminalSerializeMethod)

  // Use specialized hooks
  const search = useTerminalSearch(terminalId)
  useTerminalResize(terminalId, terminalRef)

  // Copy and paste handlers
  const handleCopy = useCallback(() => {
    const instance = getTerminalInstance(terminalId)
    if (instance?.xterm) {
      const selection = instance.xterm.getSelection()
      if (selection && selection.trim()) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(selection).catch((error) => {
            terminalLogger.warn('Failed to copy selection to clipboard', {terminalId, error})
          })
        }
      }
    }
  }, [terminalId, getTerminalInstance])

  const handlePaste = useCallback((text: string) => {
    writeToTerminal(terminalId, text)
  }, [terminalId, writeToTerminal])

  // Use terminal shortcuts hook
  useTerminalShortcuts(terminalRef, {
    onSearchToggle: () => search.setIsSearchVisible(true),
    onSearchClose: search.handleSearchClose,
    isSearchVisible: search.isSearchVisible,
    onCopy: handleCopy,
    onPaste: handlePaste
  })

  // Terminal themes
  const terminalTheme = {
    dark: {
      background: '#0f0f23',
      foreground: '#f8f8f2',
      cursor: '#f8f8f0',
      cursorAccent: '#272822',
      selectionBackground: '#4A90E2',
      selectionForeground: '#ffffff',
      selectionInactiveBackground: '#3A3A3A',
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
      selectionBackground: '#0066CC',
      selectionForeground: '#ffffff',
      selectionInactiveBackground: '#CCCCCC',
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
      terminalLogger.debug('Checking existing XTerm instance', {
        terminalId,
        hasDisposables: !!instance.disposables,
        disposablesCount: instance.disposables?.length || 0,
        isAttached: instance.isAttached
      })

      // Check if this instance already has event handlers
      const hasExistingHandlers = instance.disposables && instance.disposables.length > 0
      if (hasExistingHandlers) {
        terminalLogger.debug('Reusing existing XTerm instance with handlers', {terminalId})
        return instance
      } else {
        terminalLogger.debug('Existing XTerm instance needs event handlers', {terminalId})
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
    let fitAddon, searchAddon, serializeAddon, webglAddon

    if (instance && !needsEventHandlers) {
      // This shouldn't happen based on our logic above, but just in case
      return instance
    } else if (instance) {
      // Reuse existing addons
      fitAddon = instance.fitAddon
      searchAddon = instance.searchAddon
      serializeAddon = instance.serializeAddon
      webglAddon = instance.webglAddon
    } else {
      // Create new addons
      fitAddon = new FitAddon()
      searchAddon = new SearchAddon()
      serializeAddon = new SerializeAddon()
      webglAddon = new WebglAddon()

      // Load addons
      terminal.loadAddon(fitAddon)
      terminal.loadAddon(searchAddon)
      terminal.loadAddon(serializeAddon)
      try {
        terminal.loadAddon(webglAddon)
        terminalLogger.debug('WebGL addon loaded', {terminalId})
      } catch (error) {
        terminalLogger.warn('WebGL addon failed to load, falling back to canvas', {terminalId, error})
      }
    }

    // Only create event handlers if needed (to prevent duplicates)
    let inputDisposable, resizeDisposable, selectionDisposable

    if (needsEventHandlers) {
      // Handle user input - write to backend
      inputDisposable = terminal.onData((data) => {
        writeToTerminal(terminalId, data)
      })

      // Handle terminal resize
      resizeDisposable = terminal.onResize(({cols, rows}) => {
        resizeTerminal(terminalId, cols, rows)
      })

      // Handle selection change - auto copy to clipboard
      selectionDisposable = terminal.onSelectionChange(() => {
        const selection = terminal.getSelection()
        if (selection && selection.trim()) {
          // Use modern clipboard API if available
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(selection).catch((error) => {
              terminalLogger.warn('Failed to copy selection to clipboard', {terminalId, error})
            })
          }
        }
      })
    }

    // Create or update instance object
    if (instance) {
      // Update existing instance with new event handlers
      instance.disposables = [inputDisposable, resizeDisposable, selectionDisposable].filter(Boolean)
    } else {
      // Create new instance object
      instance = {
        xterm: terminal,
        fitAddon,
        searchAddon,
        serializeAddon,
        webglAddon,
        disposables: [inputDisposable, resizeDisposable, selectionDisposable],
        isAttached: false
      }
    }

    // Store instance in Zustand
    setTerminalInstance(terminalId, instance)

    // Register serialize method for workspace saving
    if (instance.serializeAddon) {
      const serializeMethod = () => {
        try {
          const serializedData = instance.serializeAddon?.serialize() || ''
          terminalLogger.debug('🔄 Terminal serialized successfully', {
            terminalId,
            dataLength: serializedData.length,
            hasData: !!serializedData
          })
          return serializedData
        } catch (error) {
          terminalLogger.error('Failed to serialize terminal', {terminalId, error})
          return ''
        }
      }
      setTerminalSerializeMethod(terminalId, serializeMethod)
      terminalLogger.info('✅ Serialize method registered for terminal', {terminalId})
    } else {
      terminalLogger.warn('❌ SerializeAddon not available for terminal', {terminalId})
    }

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

      // Restore serialized content if provided - do this immediately after attachment
      if (initialContent && instance.serializeAddon) {
        try {
          terminalLogger.info('Restoring terminal state from serialized content', {
            terminalId,
            contentLength: initialContent.length
          })
          
          // Clear terminal before restoring content for a clean state
          instance.xterm.clear()
          
          // Write the restored content immediately
          instance.xterm.write(initialContent)
          
          // Clear the restored content from window storage after use
          const terminalStates = (window as any)._odysseyTerminalStatesForRestore || {}
          if (terminalStates[terminalId]) {
            delete terminalStates[terminalId]
            terminalLogger.debug('Cleared used terminal state from storage', {terminalId})
          }
          
          terminalLogger.info('✅ Terminal content restoration completed', {terminalId})
        } catch (error) {
          terminalLogger.error('Failed to restore terminal content', {terminalId, error})
        }
      }

      // Event subscriptions are managed by terminalSlice - no need to handle here
      // Terminal component focuses only on XTerm rendering and user interactions

      // Fit terminal to container immediately after attachment
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
    }

    // ESLint disable: getOrCreateXTermInstance and resizeTerminal are stable from memoized hooks
  }, [terminalId, initialContent])

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