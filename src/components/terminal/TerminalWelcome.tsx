import React from 'react'
import { motion } from 'framer-motion'
import { Terminal } from 'lucide-react'
import clsx from 'clsx'

// Types
import type { Project } from '@/store'

interface TerminalWelcomeProps {
  project?: Project
  projectPath: string
  onModelSelect: (model: 'claude-code' | 'gemini' | 'terminal') => void
  className?: string
}

export const TerminalWelcome: React.FC<TerminalWelcomeProps> = ({
  onModelSelect,
  className
}) => {
  const options = [
    {
      id: 'claude-code' as const,
      name: 'Claude',
      image: './claude.png'
    },
    {
      id: 'gemini' as const,
      name: 'Gemini',
      image: './gemini.png'
    },
    {
      id: 'terminal' as const,
      name: 'New Terminal',
      image: null
    }
  ]

  return (
    <div className={clsx("flex-1 flex items-center justify-center min-h-0 p-8", className)}>
      <div className="w-full max-w-2xl mx-auto flex flex-col justify-center min-h-0">
        {/* Welcome Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 className="text-2xl font-bold text-foreground mb-2">Choose your terminal</h1>
        </motion.div>

        {/* Options Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-8 justify-items-center"
        >
          {options.map((option, index) => (
            <motion.div
              key={option.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
              className="flex flex-col items-center cursor-pointer group hover:bg-muted/50 rounded-lg p-6 transition-all duration-200 w-full max-w-[200px]"
              onClick={() => onModelSelect(option.id)}
            >
              <div className="w-20 h-20 mb-4 transition-transform duration-200 group-hover:scale-110">
                {option.image ? (
                  <img 
                    src={option.image} 
                    alt={option.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full bg-muted rounded-lg flex items-center justify-center">
                    <Terminal className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
              </div>
              <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                {option.name}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}