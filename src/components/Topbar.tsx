import React from 'react'
import {motion} from 'framer-motion'
import {Settings} from 'lucide-react'

interface TopbarProps {
  onSettingsClick: () => void
  platform?: string
  className?: string
}

export const Topbar: React.FC<TopbarProps> = ({
                                                onSettingsClick,
                                                platform,
                                                className
                                              }) => {
  // Check if we're on macOS to add padding for window controls
  const isMacOS = platform === 'darwin'

  return (
    <motion.div
      initial={{opacity: 0, y: -20}}
      animate={{opacity: 1, y: 0}}
      transition={{duration: 0.3}}
      className={`flex items-center justify-end h-7 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 ${
        isMacOS ? 'pl-20 pr-6' : 'px-6'
      } ${className || ''}`}
    >
      {/* Settings Button */}
      <button
        onClick={onSettingsClick}
        className="h-6 w-6 hover:bg-accent rounded-md transition-colors flex items-center justify-center"
        title="Settings"
      >
        <Settings className="h-4 w-4"/>
      </button>
    </motion.div>
  )
}