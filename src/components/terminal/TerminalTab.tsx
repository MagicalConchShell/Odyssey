import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import clsx from 'clsx'

// Import UI components
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// Import types - using new simplified types
import { TerminalTab } from '@/types/terminal'
import { useTheme } from '@/components/theme-provider'

interface TerminalTabProps {
  tab: TerminalTab
  isActive: boolean
  onSelect: (id: string) => void
  onClose: (event: React.MouseEvent) => void
  onRename: (id: string, newTitle: string) => void
  icon: React.ReactNode
  className?: string
}

export const TerminalTabComponent: React.FC<TerminalTabProps> = ({
  tab,
  isActive,
  onSelect,
  onClose,
  onRename,
  icon,
  className
}) => {
  const { theme } = useTheme()
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(tab.title)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Handle edit start
  const handleEditStart = () => {
    setEditTitle(tab.title)
    setIsEditing(true)
  }

  // Handle edit confirm
  const handleEditConfirm = () => {
    if (editTitle.trim() && editTitle !== tab.title) {
      onRename(tab.id, editTitle.trim())
    }
    setIsEditing(false)
  }

  // Handle edit cancel
  const handleEditCancel = () => {
    setEditTitle(tab.title)
    setIsEditing(false)
  }

  // Handle key press in edit mode
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditConfirm()
    } else if (e.key === 'Escape') {
      handleEditCancel()
    }
  }

  // Handle double click to rename
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    handleEditStart()
  }

  // Handle tab click
  const handleTabClick = () => {
    onSelect(tab.id)
  }

  return (
    <TooltipProvider>
      <motion.div
        className={clsx(
          "flex items-center group relative min-w-[120px] max-w-[200px] h-full border-r cursor-pointer",
          isActive 
            ? "bg-background border-b-2 border-b-primary" 
            : "hover:bg-muted/50",
          className
        )}
        style={{
          backgroundColor: isActive 
            ? (theme === 'dark' ? '#0f0f23' : '#ffffff')
            : undefined,
          borderRightColor: theme === 'dark' ? '#333' : '#e5e7eb',
          borderBottomColor: isActive ? undefined : 'transparent'
        }}
        onClick={handleTabClick}
        layout
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: 'auto', opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Tab content */}
        <div className="flex items-center gap-2 px-3 py-2 min-w-0 flex-1">
          {/* Icon */}
          <div className="flex-shrink-0 opacity-70">
            {icon}
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                ref={inputRef}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleEditConfirm}
                onKeyDown={handleKeyPress}
                className="h-6 px-1 text-xs border-0 bg-transparent focus:bg-background"
                size={editTitle.length || 10}
              />
            ) : (
              <span 
                className="text-xs font-medium truncate block"
                onDoubleClick={handleDoubleClick}
                title={tab.title}
              >
                {tab.title}
              </span>
            )}
          </div>

          {/* Close button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-opacity"
                onClick={onClose}
              >
                <X className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Close tab</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Active tab indicator */}
        {isActive && (
          <motion.div
            className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
            layoutId="activeTabIndicator"
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        )}
      </motion.div>
    </TooltipProvider>
  )
}