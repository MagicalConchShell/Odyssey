import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowLeft, 
  FileText, 
  Clock, 
  MessageSquare, 
  Plus,
  Loader2,
  AlertCircle,
  Calendar
} from 'lucide-react'
import { Session } from '../types/electron'
import { Session as ClaudeSession } from './ClaudeCodeSession'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Pagination } from './ui/pagination'
import { formatTimestamp } from '../lib/date-utils'

interface SessionListProps {
  projectId: string
  projectPath: string
  onBack: () => void
  onSessionSelect: (session: ClaudeSession) => void
  onNewSession: () => void
  className?: string
}

const ITEMS_PER_PAGE = 5

export const SessionList: React.FC<SessionListProps> = ({
  projectId,
  projectPath,
  onBack,
  onSessionSelect,
  onNewSession,
  className = '',
}) => {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    loadSessions()
  }, [projectId])

  // Reset to first page when sessions change
  useEffect(() => {
    setCurrentPage(1)
  }, [sessions.length])

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const sessionList = await window.electronAPI.projectManagement.getProjectSessions(projectId)
      
      // Sort sessions by creation time (most recent first)
      const sortedSessions = sessionList.sort((a: any, b: any) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
        return bTime - aTime
      })
      
      setSessions(sortedSessions)
    } catch (err) {
      console.error('Failed to load sessions:', err)
      setError(err instanceof Error ? err.message : 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const totalPages = useMemo(() => Math.ceil(sessions.length / ITEMS_PER_PAGE), [sessions.length])
  const startIndex = useMemo(() => (currentPage - 1) * ITEMS_PER_PAGE, [currentPage])
  const endIndex = useMemo(() => startIndex + ITEMS_PER_PAGE, [startIndex])
  const currentSessions = useMemo(() => sessions.slice(startIndex, endIndex), [sessions, startIndex, endIndex])

  const handleSessionClick = useCallback((session: Session) => {
    
    // Convert electron Session to ClaudeSession format
    const claudeSession: ClaudeSession = {
      id: session.id,
      project_id: projectId,
      project_path: projectPath,
      created_at: session.created_at ? new Date(session.created_at).getTime() / 1000 : Date.now() / 1000,
      name: session.name
    }
    
    onSessionSelect(claudeSession)
  }, [projectId, projectPath, onSessionSelect])

  const getProjectDisplayName = useMemo(() => {
    return projectPath.split('/').pop() || 'Unknown Project'
  }, [projectPath])

  const getSessionDisplayInfo = useCallback((session: Session) => {
    // Use session name if available, otherwise use session ID
    const displayName = session.name || session.id
    const displayTime = session.created_at ? formatTimestamp(new Date(session.created_at).getTime()) : 'Unknown'
    
    return { displayName, displayTime }
  }, [])

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${className}`}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="border-b border-border bg-background"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                {getProjectDisplayName}
              </h1>
              <p className="text-xs text-muted-foreground">
                {sessions.length} session{sessions.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* New Session Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Button
              onClick={onNewSession}
              className="w-full flex items-center justify-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>New Claude Code Session</span>
            </Button>
          </motion.div>

          {/* Loading State */}
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center py-12"
            >
              <div className="text-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading sessions...</p>
              </div>
            </motion.div>
          )}

          {/* Error State */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center space-x-2 p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </motion.div>
          )}

          {/* Session Cards */}
          {!loading && !error && (
            <AnimatePresence mode="wait">
              <motion.div
                key={`page-${currentPage}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {currentSessions.length > 0 ? (
                  currentSessions.map((session, index) => {
                    const { displayName, displayTime } = getSessionDisplayInfo(session)
                    
                    return (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.3,
                          delay: index * 0.05,
                          ease: [0.4, 0, 0.2, 1],
                        }}
                      >
                        <Card
                          className="transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                          onClick={() => handleSessionClick(session)}
                        >
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <div className="flex items-start space-x-3 flex-1 min-w-0">
                                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                  <div className="space-y-2 flex-1 min-w-0">
                                    <div>
                                      <p className="font-mono text-sm text-muted-foreground mb-1">
                                        {session.id}
                                      </p>
                                      <p className="text-sm font-medium text-foreground">
                                        {displayName}
                                      </p>
                                    </div>
                                    
                                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                      <div className="flex items-center space-x-1">
                                        <Clock className="h-3 w-3" />
                                        <span>{displayTime}</span>
                                      </div>
                                      <div className="flex items-center space-x-1">
                                        <Calendar className="h-3 w-3" />
                                        <span>Session</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )
                  })
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-12"
                  >
                    <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-sm font-medium text-foreground mb-2">No sessions found</h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      Get started by creating a new Claude Code session for this project
                    </p>
                    <Button
                      onClick={onNewSession}
                      className="inline-flex items-center space-x-2"
                    >
                      <Plus className="h-4 w-4" />
                      <span>New Session</span>
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          )}

          {/* Pagination */}
          {!loading && !error && totalPages > 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-6"
            >
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}