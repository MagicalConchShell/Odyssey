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
}

export function useTerminalShortcuts(
  terminalRef: RefObject<HTMLDivElement>,
  options: TerminalShortcutsOptions
): void {
  const { onSearchToggle, onSearchClose, isSearchVisible } = options

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

      if (e.key === 'Escape' && isSearchVisible) {
        e.preventDefault()
        onSearchClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [terminalRef, onSearchToggle, onSearchClose, isSearchVisible])
}