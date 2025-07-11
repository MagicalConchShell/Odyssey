import React from 'react'
import { motion } from 'framer-motion'
import { Info } from 'lucide-react'
import { ModeToggle } from './mode-toggle'

interface TopbarProps {
  onInfoClick: () => void
  platform?: string
  className?: string
}

export const Topbar: React.FC<TopbarProps> = ({
  onInfoClick,
  platform,
  className
}) => {
  // Check if we're on macOS to add padding for window controls
  const isMacOS = platform === 'darwin'

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-center justify-between py-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 ${
        isMacOS ? 'pl-20 pr-6' : 'px-6'
      } ${className || ''}`}
    >
      {/* App Title */}
      <div className="flex items-center">
        <h1 className="text-lg font-semibold gradient-text">Odyssey</h1>
      </div>

      {/* Utility Buttons */}
      <div className="flex items-center space-x-3">
        <ModeToggle />

        <button
          onClick={onInfoClick}
          className="h-8 w-8 hover:bg-accent rounded-md transition-colors flex items-center justify-center"
          title="About"
        >
          <Info className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  )
}