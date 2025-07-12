import React from 'react'
import { motion } from 'framer-motion'
import { 
  Terminal, 
  Sparkles, 
  Zap,
  Bot,
  ArrowRight,
  FolderOpen
} from 'lucide-react'
import clsx from 'clsx'

// Import UI components
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// Types
import type { Project } from '@/lib/projectState'

interface TerminalWelcomeProps {
  project?: Project
  projectPath: string
  onModelSelect: (model: 'claude-code' | 'gemini') => void
  className?: string
}

export const TerminalWelcome: React.FC<TerminalWelcomeProps> = ({
  project,
  projectPath,
  onModelSelect,
  className
}) => {
  const aiModels = [
    {
      id: 'claude-code' as const,
      name: 'Claude Code',
      description: 'AI-powered development assistant with deep coding capabilities',
      icon: <Bot className="h-8 w-8" />,
      color: 'bg-orange-500',
      features: ['Code Generation', 'Debugging', 'Refactoring', 'Code Review'],
      status: 'available'
    },
    {
      id: 'gemini' as const,
      name: 'Gemini',
      description: 'Google\'s multimodal AI for versatile development tasks',
      icon: <Sparkles className="h-8 w-8" />,
      color: 'bg-blue-500',
      features: ['Multimodal Input', 'Code Analysis', 'Documentation', 'Planning'],
      status: 'coming-soon'
    }
  ]

  return (
    <div className={clsx("flex-1 flex items-center justify-center p-8", className)}>
      <div className="w-full max-w-4xl mx-auto">
        {/* Welcome Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          {/* Terminal Icon */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex justify-center mb-6"
          >
            <div className="relative">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
                <Terminal className="h-8 w-8 text-primary" />
              </div>
              <motion.div
                animate={{ 
                  scale: [1, 1.1, 1],
                  opacity: [0.5, 0.8, 0.5]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute -inset-2 bg-primary/20 rounded-3xl -z-10"
              />
            </div>
          </motion.div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="space-y-2 mb-6"
          >
            <h1 className="text-3xl font-bold text-foreground">Ready to Code</h1>
            <p className="text-lg text-muted-foreground">
              Choose your AI assistant to start developing
            </p>
          </motion.div>

          {/* Project Info */}
          {project && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-8"
            >
              <FolderOpen className="h-4 w-4" />
              <span className="font-medium">{project.name}</span>
              <span>•</span>
              <span className="font-mono text-xs">
                {projectPath.length > 50 ? '...' + projectPath.slice(-47) : projectPath}
              </span>
            </motion.div>
          )}
        </motion.div>

        {/* AI Model Selection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {aiModels.map((model, index) => (
            <motion.div
              key={model.id}
              initial={{ opacity: 0, x: index === 0 ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.9 + index * 0.1 }}
            >
              <Card className={clsx(
                "relative overflow-hidden transition-all duration-300 hover:shadow-lg border-2",
                model.status === 'available' 
                  ? "hover:border-primary/50 cursor-pointer" 
                  : "opacity-60 cursor-not-allowed"
              )}>
                {/* Status Badge */}
                {model.status === 'coming-soon' && (
                  <Badge 
                    variant="secondary" 
                    className="absolute top-3 right-3 text-xs"
                  >
                    Coming Soon
                  </Badge>
                )}

                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={clsx(
                      "w-12 h-12 rounded-xl flex items-center justify-center text-white",
                      model.color
                    )}>
                      {model.icon}
                    </div>
                    <div>
                      <CardTitle className="text-xl">{model.name}</CardTitle>
                      <CardDescription className="text-sm">
                        {model.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Features */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Key Features</h4>
                    <div className="flex flex-wrap gap-1">
                      {model.features.map((feature) => (
                        <Badge 
                          key={feature} 
                          variant="outline" 
                          className="text-xs"
                        >
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Action Button */}
                  <Button
                    onClick={() => model.status === 'available' && onModelSelect(model.id)}
                    disabled={model.status !== 'available'}
                    className="w-full"
                    size="lg"
                  >
                    {model.status === 'available' ? (
                      <>
                        <Terminal className="h-4 w-4 mr-2" />
                        Start {model.name} Session
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Available Soon
                      </>
                    )}
                  </Button>
                </CardContent>

                {/* Hover Effect */}
                {model.status === 'available' && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 pointer-events-none"
                    whileHover={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  />
                )}
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Help Text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="text-center mt-8"
        >
          <p className="text-sm text-muted-foreground">
            Your AI assistant will run in a full terminal environment in your project directory
          </p>
        </motion.div>
      </div>
    </div>
  )
}