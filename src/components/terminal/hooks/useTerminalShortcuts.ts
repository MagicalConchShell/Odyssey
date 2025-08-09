/**
 * Terminal Shortcuts Hook
 * 
 * Handles keyboard shortcuts for terminal operations including search shortcuts.
 */

import { useEffect, RefObject } from 'react'

export interface TerminalShortcutsOptions {
  onSearchToggle: () => void
  onSearchClose: () => void
  isSearchVisible: boolean
  onCopy?: () => void
  onPaste?: (text: string) => void
}

export function useTerminalShortcuts(
  terminalRef: RefObject<HTMLDivElement>,
  options: TerminalShortcutsOptions
): void {
  const { onSearchToggle, onSearchClose, isSearchVisible, onCopy, onPaste } = options

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
        onSearchToggle()
      }

      // Ctrl+Shift+C or Cmd+C to copy selection
      if ((e.ctrlKey && e.shiftKey && e.key === 'C') || (e.metaKey && e.key === 'c')) {
        e.preventDefault()
        if (onCopy) {
          onCopy()
        }
      }

      // Ctrl+Shift+V or Cmd+V to paste
      if ((e.ctrlKey && e.shiftKey && e.key === 'V') || (e.metaKey && e.key === 'v')) {
        e.preventDefault()
        if (onPaste && navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText()
            .then((text) => {
              if (text) {
                onPaste(text)
              }
            })
            .catch((error) => {
              console.warn('Failed to read from clipboard:', error)
            })
        }
      }

      if (e.key === 'Escape' && isSearchVisible) {
        e.preventDefault()
        onSearchClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [terminalRef, onSearchToggle, onSearchClose, isSearchVisible, onCopy, onPaste])
}