import React, { useState, useRef, forwardRef, useImperativeHandle, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Send, 
  Loader2, 
  X, 
  ChevronUp,
  Sparkles,
  Zap,
  Maximize2,
  Brain
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// Thinking mode type definition
type ThinkingMode = "auto" | "think" | "think_hard" | "think_harder" | "ultrathink"

// Thinking mode configuration
type ThinkingModeConfig = {
  id: ThinkingMode
  name: string
  description: string
  level: number // 0-4 for visual indicator
  phrase?: string // The phrase to append
}

const THINKING_MODES: ThinkingModeConfig[] = [
  {
    id: "auto",
    name: "Auto",
    description: "Let Claude decide",
    level: 0
  },
  {
    id: "think",
    name: "Think",
    description: "Basic reasoning",
    level: 1,
    phrase: "think"
  },
  {
    id: "think_hard",
    name: "Think Hard",
    description: "Deeper analysis",
    level: 2,
    phrase: "think hard"
  },
  {
    id: "think_harder",
    name: "Think Harder",
    description: "Extensive reasoning",
    level: 3,
    phrase: "think harder"
  },
  {
    id: "ultrathink",
    name: "Ultrathink",
    description: "Maximum computation",
    level: 4,
    phrase: "ultrathink"
  }
]

// ThinkingModeIndicator component - Shows visual indicator bars for thinking level
const ThinkingModeIndicator: React.FC<{ level: number }> = ({ level }) => {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn(
            "w-1 h-3 rounded-full transition-colors",
            i <= level ? "bg-blue-500" : "bg-muted"
          )}
        />
      ))}
    </div>
  )
}

// Model configurations matching Rust version
const MODELS = [
  {
    id: 'claude-sonnet' as const,
    name: 'Claude 3.5 Sonnet',
    description: 'Fast and intelligent',
    icon: <Zap className="h-4 w-4" />
  },
  {
    id: 'claude-opus' as const,
    name: 'Claude 3 Opus', 
    description: 'Most capable',
    icon: <Sparkles className="h-4 w-4" />
  }
]

export interface FloatingPromptInputRef {
  addImage: (imagePath: string) => void
  focus: () => void
}

interface FloatingPromptInputProps {
  onSend: (prompt: string, model: 'claude-sonnet' | 'claude-opus') => void
  onCancel?: () => void
  isLoading?: boolean
  disabled?: boolean
  projectPath?: string
  placeholder?: string
  sidebarWidth?: number // Sidebar width, used to adjust left margin to avoid overlap
  className?: string
}

export const FloatingPromptInput = forwardRef<FloatingPromptInputRef, FloatingPromptInputProps>(({
  onSend,
  onCancel,
  isLoading = false,
  disabled = false,
  placeholder = "Ask Claude anything...",
  sidebarWidth = 0,
  className
}, ref) => {
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState<'claude-sonnet' | 'claude-opus'>('claude-sonnet')
  const [selectedThinkingMode, setSelectedThinkingMode] = useState<ThinkingMode>('auto')
  const [isExpanded, setIsExpanded] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [thinkingModePickerOpen, setThinkingModePickerOpen] = useState(false)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const expandedTextareaRef = useRef<HTMLTextAreaElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  
  const selectedModelData = MODELS.find(m => m.id === selectedModel) || MODELS[0]
  
  useImperativeHandle(ref, () => ({
    addImage: (imagePath: string) => {
      // For now, just add to prompt text  
      setPrompt(prev => prev + ` @${imagePath} `)
    },
    focus: () => {
      const target = isExpanded ? expandedTextareaRef.current : textareaRef.current
      target?.focus()
    }
  }))

  // Keyboard event handling - ESC key closes expanded state
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isExpanded && event.key === 'Escape') {
        event.preventDefault()
        setIsExpanded(false)
      }
    }

    if (isExpanded) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isExpanded])

  // Focus management - focus when expanded, restore focus when collapsed
  useEffect(() => {
    if (isExpanded) {
      // When expanded: save current focus and focus on text area
      previousFocusRef.current = document.activeElement as HTMLElement
      setTimeout(() => {
        expandedTextareaRef.current?.focus()
      }, 100)
    } else {
      // When collapsed: restore previous focus
      if (previousFocusRef.current) {
        previousFocusRef.current.focus()
        previousFocusRef.current = null
      }
    }
  }, [isExpanded])

  // Focus trap - limit tab navigation within modal when expanded
  useEffect(() => {
    const handleTabKey = (event: KeyboardEvent) => {
      if (!isExpanded || event.key !== 'Tab') return

      const modal = modalRef.current
      if (!modal) return

      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0] as HTMLElement
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

      if (event.shiftKey) {
        // Shift + Tab - if focus is on first element, jump to last
        if (document.activeElement === firstElement) {
          event.preventDefault()
          lastElement?.focus()
        }
      } else {
        // Tab - if focus is on last element, jump to first
        if (document.activeElement === lastElement) {
          event.preventDefault()
          firstElement?.focus()
        }
      }
    }

    if (isExpanded) {
      document.addEventListener('keydown', handleTabKey)
      return () => document.removeEventListener('keydown', handleTabKey)
    }
  }, [isExpanded])

  const handleSend = () => {
    if (prompt.trim() && !isLoading && !disabled) {
      let finalPrompt = prompt.trim()
      
      // Append thinking phrase if not auto mode
      const thinkingMode = THINKING_MODES.find(m => m.id === selectedThinkingMode)
      if (thinkingMode && thinkingMode.phrase) {
        finalPrompt = `${finalPrompt}.\n\n${thinkingMode.phrase}.`
      }
      
      onSend(finalPrompt, selectedModel)
      setPrompt('')
      setIsExpanded(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    
    if (e.key === 'Escape' && isLoading && onCancel) {
      onCancel()
    }
  }

  if (isExpanded) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <motion.div
          ref={modalRef}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-4xl bg-card border border-border rounded-xl shadow-xl"
          role="dialog"
          aria-label="Compose prompt"
          aria-modal="true"
        >
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="text-lg font-semibold">Compose Prompt</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(false)}
              aria-label="Close prompt composer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-4">
            <Textarea
              ref={expandedTextareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Type your prompt here..."
              className="min-h-[200px] resize-none"
              disabled={isLoading || disabled}
            />

            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Model:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setModelPickerOpen(!modelPickerOpen)}
                    className="gap-2"
                  >
                    {selectedModelData.icon}
                    {selectedModelData.name}
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Thinking:</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setThinkingModePickerOpen(!thinkingModePickerOpen)}
                          className="gap-2"
                        >
                          <Brain className="h-4 w-4" />
                          <ThinkingModeIndicator 
                            level={THINKING_MODES.find(m => m.id === selectedThinkingMode)?.level || 0} 
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{THINKING_MODES.find(m => m.id === selectedThinkingMode)?.name || "Auto"}</p>
                        <p className="text-xs text-muted-foreground">{THINKING_MODES.find(m => m.id === selectedThinkingMode)?.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline" 
                  onClick={() => setIsExpanded(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={!prompt.trim() || isLoading || disabled}
                  className="gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Model Picker Dropdown for Expanded Mode */}
            <AnimatePresence>
              {modelPickerOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-border bg-muted/30 mt-4"
                >
                  <div className="p-2">
                    {MODELS.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setSelectedModel(model.id)
                          setModelPickerOpen(false)
                        }}
                        className={cn(
                          "w-full flex items-start gap-3 p-3 rounded-md transition-colors text-left",
                          "hover:bg-accent",
                          selectedModel === model.id && "bg-accent"
                        )}
                      >
                        <div className="mt-0.5">{model.icon}</div>
                        <div className="flex-1 space-y-1">
                          <div className="font-medium text-sm">{model.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {model.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Thinking Mode Picker Dropdown for Expanded Mode */}
            <AnimatePresence>
              {thinkingModePickerOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-border bg-muted/30 mt-4"
                >
                  <div className="p-2">
                    {THINKING_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => {
                          setSelectedThinkingMode(mode.id)
                          setThinkingModePickerOpen(false)
                        }}
                        className={cn(
                          "w-full flex items-start gap-3 p-3 rounded-md transition-colors text-left",
                          "hover:bg-accent",
                          selectedThinkingMode === mode.id && "bg-accent"
                        )}
                      >
                        <Brain className="h-4 w-4 mt-0.5" />
                        <div className="flex-1 space-y-1">
                          <div className="font-medium text-sm">
                            {mode.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {mode.description}
                          </div>
                        </div>
                        <ThinkingModeIndicator level={mode.level} />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div 
      className={cn("fixed bottom-0 right-0 z-30", className)}
      style={{ left: `${sidebarWidth}px` }}
    >
      <div className="w-full max-w-4xl mx-auto px-4 pb-4">
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-card border border-border rounded-xl shadow-lg overflow-hidden"
        >
          <div className="p-4">
            <div className="flex items-end gap-3">
              {/* Model Picker */}
              <Button
                variant="outline"
                size="default"
                disabled={isLoading || disabled}
                className="gap-2 min-w-[180px] justify-start"
                onClick={() => setModelPickerOpen(!modelPickerOpen)}
              >
                {selectedModelData.icon}
                <span className="flex-1 text-left">{selectedModelData.name}</span>
                <ChevronUp className="h-4 w-4 opacity-50" />
              </Button>

              {/* Thinking Mode Picker */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="default"
                      disabled={isLoading || disabled}
                      className="gap-2"
                      onClick={() => setThinkingModePickerOpen(!thinkingModePickerOpen)}
                    >
                      <Brain className="h-4 w-4" />
                      <ThinkingModeIndicator 
                        level={THINKING_MODES.find(m => m.id === selectedThinkingMode)?.level || 0} 
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{THINKING_MODES.find(m => m.id === selectedThinkingMode)?.name || "Auto"}</p>
                    <p className="text-xs text-muted-foreground">{THINKING_MODES.find(m => m.id === selectedThinkingMode)?.description}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Input Area */}
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  disabled={isLoading || disabled}
                  className="min-h-[44px] max-h-[120px] resize-none pr-10"
                  rows={1}
                />

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsExpanded(true)}
                  disabled={isLoading || disabled}
                  className="absolute right-1 bottom-1 h-8 w-8"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Send Button */}
              <Button
                onClick={handleSend}
                disabled={!prompt.trim() || isLoading || disabled}
                size="default"
                className="gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Model Picker Dropdown */}
          <AnimatePresence>
            {modelPickerOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-border bg-muted/30"
              >
                <div className="p-2">
                  {MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setSelectedModel(model.id)
                        setModelPickerOpen(false)
                      }}
                      className={cn(
                        "w-full flex items-start gap-3 p-3 rounded-md transition-colors text-left",
                        "hover:bg-accent",
                        selectedModel === model.id && "bg-accent"
                      )}
                    >
                      <div className="mt-0.5">{model.icon}</div>
                      <div className="flex-1 space-y-1">
                        <div className="font-medium text-sm">{model.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {model.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Thinking Mode Picker Dropdown */}
          <AnimatePresence>
            {thinkingModePickerOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-border bg-muted/30"
              >
                <div className="p-2">
                  {THINKING_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setSelectedThinkingMode(mode.id)
                        setThinkingModePickerOpen(false)
                      }}
                      className={cn(
                        "w-full flex items-start gap-3 p-3 rounded-md transition-colors text-left",
                        "hover:bg-accent",
                        selectedThinkingMode === mode.id && "bg-accent"
                      )}
                    >
                      <Brain className="h-4 w-4 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <div className="font-medium text-sm">
                          {mode.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {mode.description}
                        </div>
                      </div>
                      <ThinkingModeIndicator level={mode.level} />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
})

FloatingPromptInput.displayName = 'FloatingPromptInput'