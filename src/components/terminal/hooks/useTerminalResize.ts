/**
 * Terminal Resize Hook
 * 
 * Handles terminal resizing functionality including ResizeObserver, 
 * window resize events, and fit operations.
 */

import { useEffect, useCallback, RefObject } from 'react'
import { useTerminalInstances, useTerminals } from '@/store'
import { terminalLogger } from '@/utils/logger'

export interface TerminalResizeActions {
  handleResize: () => void
}

export interface TerminalResizeHook extends TerminalResizeActions {}

export function useTerminalResize(
  terminalId: string,
  terminalRef: RefObject<HTMLDivElement>
): TerminalResizeHook {
  const { getTerminalInstance } = useTerminalInstances()
  const { resizeTerminal } = useTerminals()

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
      const { cols, rows } = instance.xterm
      terminalLogger.debug(`Resized terminal: ${cols}x${rows}`, { terminalId, container: rect })
      resizeTerminal(terminalId, cols, rows)
    } catch (error) {
      terminalLogger.error(`Resize error for terminal`, { terminalId, error })
    }
    // ESLint disable: resizeTerminal and getTerminalInstance are stable from memoized hooks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId, terminalRef])

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

  return {
    handleResize
  }
}