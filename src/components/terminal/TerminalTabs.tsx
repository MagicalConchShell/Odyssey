import React, {useState} from 'react'
import {
  Plus,
  ChevronDown,
  Terminal as TerminalIcon
} from 'lucide-react'
import clsx from 'clsx'

// Import UI components
import {Button} from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'

// Import types and hooks - using simplified Zustand store
import {useTerminals, type Terminal} from '@/store'
import {useTheme} from '@/components/theme-provider'

// Import individual tab component
import {TerminalTabComponent} from './TerminalTab'

interface TerminalTabsProps {
  projectPath: string
  onNewTab?: (type: 'claude-code' | 'gemini' | 'terminal') => void
  className?: string
}

export const TerminalTabs: React.FC<TerminalTabsProps> = ({
                                                            projectPath,
                                                            className
                                                          }) => {
  const {theme} = useTheme()
  const {
    terminals,
    activeTerminalId,
    createTerminal,
    setActiveTerminal,
    removeTerminal,
    setTerminalTitle
  } = useTerminals()

  const [showNewTabMenu, setShowNewTabMenu] = useState(false)

  // Debug: Log terminal state
  console.log('TerminalTabs render:', {
    terminals,
    activeTerminalId,
    projectPath
  })

  // Handle creating new tab
  const handleCreateTab = async (type: 'claude-code' | 'gemini' | 'terminal') => {
    console.log('Creating new tab:', type)

    try {
      // Create terminal using Zustand store
      await createTerminal({
        type,
        cwd: projectPath,
        makeActive: true
      })

      setShowNewTabMenu(false)
    } catch (error) {
      console.error('Failed to create terminal tab:', error)
    }
  }

  // Handle tab selection
  const handleTabClick = (terminalId: string) => {
    setActiveTerminal(terminalId)
  }

  // Handle tab close
  const handleTabClose = (terminalId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    removeTerminal(terminalId)
  }

  // Handle tab rename
  const handleTabRename = (terminalId: string, newTitle: string) => {
    setTerminalTitle(terminalId, newTitle)
  }

  // Get icon for tab type
  const getTabIcon = (type: 'claude-code' | 'gemini' | 'terminal') => {
    switch (type) {
      case 'claude-code':
        return <img src="./claude.png" alt="Claude" className="h-3 w-3 object-contain"/>
      case 'gemini':
        return <img src="./gemini.png" alt="Gemini" className="h-3 w-3 object-contain"/>
      case 'terminal':
        return <TerminalIcon className="h-3 w-3"/>
    }
  }

  return (
    <TooltipProvider>
      <div
        className={clsx(
          "flex items-center border-b h-10",
          className
        )}
        style={{
          backgroundColor: theme === 'dark' ? '#1a1a1a' : '#f8f9fa',
          borderBottomColor: theme === 'dark' ? '#333' : '#e5e7eb'
        }}
      >
        {/* Tab list */}
        <div className="flex-1 flex items-center overflow-x-auto scrollbar-thin">
          {terminals.map((terminal: Terminal) => (
            <TerminalTabComponent
              key={terminal.id}
              tab={terminal}
              isActive={terminal.id === activeTerminalId}
              onSelect={() => handleTabClick(terminal.id)}
              onClose={(e) => handleTabClose(terminal.id, e)}
              onRename={(id, newTitle) => handleTabRename(id, newTitle)}
              icon={getTabIcon(terminal.type || 'terminal')}
            />
          ))}
        </div>

        {/* New tab button */}
        <div className="flex items-center px-2">
          <DropdownMenu open={showNewTabMenu} onOpenChange={setShowNewTabMenu}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-gray-200 dark:hover:bg-gray-700"
                title="New Terminal Tab"
              >
                <Plus className="h-4 w-4"/>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-32 z-50"
            >
              <DropdownMenuItem
                onClick={() => handleCreateTab('claude-code')}
                className="flex items-center justify-center p-3"
              >
                <img
                  src="./claude.png"
                  alt="Claude"
                  className="h-6 w-6 object-contain"
                />
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleCreateTab('gemini')}
                className="flex items-center justify-center p-3"
              >
                <img
                  src="./gemini.png"
                  alt="Gemini"
                  className="h-6 w-6 object-contain"
                />
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleCreateTab('terminal')}
                className="flex items-center justify-center p-3"
              >
                <TerminalIcon className="h-6 w-6"/>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Tab overflow menu (future enhancement) */}
          {terminals.length > 8 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <ChevronDown className="h-4 w-4"/>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>More tabs</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}