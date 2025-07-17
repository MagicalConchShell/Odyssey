/**
 * Terminal Search Hook
 * 
 * Handles search functionality for a terminal including search state,
 * search operations, and keyboard shortcuts.
 */

import { useState, useCallback } from 'react'
import { useTerminalStore } from './useTerminalStore'
import { terminalLogger } from '@/utils/logger'

export interface SearchOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
}

export interface TerminalSearchState {
  isSearchVisible: boolean
  searchQuery: string
}

export interface TerminalSearchActions {
  setIsSearchVisible: (visible: boolean) => void
  setSearchQuery: (query: string) => void
  handleSearch: (query: string, options?: SearchOptions) => boolean
  handleSearchNext: () => boolean
  handleSearchPrevious: () => boolean
  handleSearchClear: () => void
  handleSearchClose: () => void
}

export interface TerminalSearchHook extends TerminalSearchState, TerminalSearchActions {}

export function useTerminalSearch(terminalId: string): TerminalSearchHook {
  const { getTerminalInstance } = useTerminalStore()
  
  // Search state
  const [isSearchVisible, setIsSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Search functions
  const handleSearch = useCallback((query: string, options: SearchOptions = {}) => {
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

  return {
    // State
    isSearchVisible,
    searchQuery,
    
    // Actions
    setIsSearchVisible,
    setSearchQuery,
    handleSearch,
    handleSearchNext,
    handleSearchPrevious,
    handleSearchClear,
    handleSearchClose
  }
}