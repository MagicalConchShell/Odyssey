/**
 * Terminal Search Component
 * 
 * Provides search functionality for terminal content using xterm-addon-search
 * Features: search input, navigation controls, keyboard shortcuts
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react'
import clsx from 'clsx'

// Import UI components
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTheme } from '@/components/theme-provider'

interface TerminalSearchProps {
  isVisible: boolean
  onClose: () => void
  onSearch: (query: string, options: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }) => void
  onNext: () => void
  onPrevious: () => void
  onClear: () => void
  className?: string
}

export const TerminalSearch: React.FC<TerminalSearchProps> = ({
  isVisible,
  onClose,
  onSearch,
  onNext,
  onPrevious,
  onClear,
  className
}) => {
  const { theme } = useTheme()
  const [searchQuery, setSearchQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regex, setRegex] = useState(false)
  const [resultCount] = useState({ current: 0, total: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when search becomes visible
  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isVisible])

  // Handle search input changes
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (value.trim()) {
      onSearch(value, { caseSensitive, wholeWord, regex })
    } else {
      onClear()
    }
  }, [onSearch, onClear, caseSensitive, wholeWord, regex])

  // Handle search options changes
  const handleOptionsChange = useCallback(() => {
    if (searchQuery.trim()) {
      onSearch(searchQuery, { caseSensitive, wholeWord, regex })
    }
  }, [searchQuery, onSearch, caseSensitive, wholeWord, regex])

  // Update search when options change
  useEffect(() => {
    handleOptionsChange()
  }, [handleOptionsChange])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        onPrevious()
      } else {
        onNext()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [onNext, onPrevious, onClose])

  // Handle close
  const handleClose = useCallback(() => {
    setSearchQuery('')
    onClear()
    onClose()
  }, [onClear, onClose])

  if (!isVisible) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.2 }}
        className={clsx(
          "absolute top-2 right-2 z-50 bg-background border rounded-md shadow-lg p-2 min-w-[320px]",
          className
        )}
        style={{
          backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
          borderColor: theme === 'dark' ? '#404040' : '#e5e7eb',
          boxShadow: theme === 'dark' 
            ? '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1)'
            : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
        }}
      >
        {/* Search input row */}
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search terminal..."
              className="pl-9 pr-4 h-8 text-sm"
              spellCheck={false}
            />
          </div>
          
          {/* Navigation controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onPrevious}
              disabled={!searchQuery.trim()}
              className="h-8 w-8 p-0"
              title="Previous (Shift+Enter)"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onNext}
              disabled={!searchQuery.trim()}
              className="h-8 w-8 p-0"
              title="Next (Enter)"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={!searchQuery.trim()}
              className="h-8 w-8 p-0"
              title="Clear search"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Close button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="h-8 w-8 p-0"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Options row */}
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="h-3 w-3"
            />
            <span>Case sensitive</span>
          </label>
          
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={wholeWord}
              onChange={(e) => setWholeWord(e.target.checked)}
              className="h-3 w-3"
            />
            <span>Whole word</span>
          </label>
          
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={regex}
              onChange={(e) => setRegex(e.target.checked)}
              className="h-3 w-3"
            />
            <span>Regex</span>
          </label>
          
          {/* Result count */}
          {searchQuery.trim() && (
            <div className="ml-auto text-muted-foreground">
              {resultCount.total > 0 ? `${resultCount.current}/${resultCount.total}` : 'No matches'}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default TerminalSearch