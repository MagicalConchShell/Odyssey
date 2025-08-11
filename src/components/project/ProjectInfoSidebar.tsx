import React from 'react'
import { motion } from 'framer-motion'
import { FolderOpen, Settings } from 'lucide-react'
import clsx from 'clsx'

// Import UI components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TooltipProvider } from '@/components/ui/tooltip'

// Types
import type { Project } from '@/store'

interface ProjectInfoSidebarProps {
  project?: Project
  projectPath: string
  className?: string
}

export const ProjectInfoSidebar: React.FC<ProjectInfoSidebarProps> = ({
  project,
  projectPath: _projectPath,
  className
}) => {
  const sidebarWidth = 320

  return (
    <TooltipProvider>
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: sidebarWidth, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0.0, 0.2, 1] }}
        className={clsx(
          "bg-background border-r border-border flex flex-col flex-shrink-0",
          className
        )}
        style={{
          minWidth: sidebarWidth,
          maxWidth: sidebarWidth
        }}
      >
        <div className="flex-1 overflow-auto p-4">
          {/* Project Information Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Project Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {project ? (
                <>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Name
                    </div>
                    <div className="text-sm">{project.name}</div>
                  </div>
                  
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Path
                    </div>
                    <div className="text-xs font-mono text-muted-foreground break-all">
                      {project.path}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Type
                    </div>
                    <div className="text-sm capitalize">{project.type.replace('-', ' ')}</div>
                  </div>
                  
                  {project.claude_project_id && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Claude Project ID
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {project.claude_project_id}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-sm text-muted-foreground py-4">
                  No project selected
                </div>
              )}
            </CardContent>
          </Card>

          {/* Future expansion area */}
          <div className="mt-4 text-center text-xs text-muted-foreground">
            <Settings className="h-4 w-4 mx-auto mb-2 opacity-50" />
            <p>Future project tools will appear here</p>
          </div>
        </div>
      </motion.div>
    </TooltipProvider>
  )
}