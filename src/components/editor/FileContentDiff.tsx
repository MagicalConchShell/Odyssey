import React, { useState, useEffect } from 'react'
import { X, RotateCcw, Copy, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getFileExtension, getLanguageFromExtension } from '../project/lib/file-utils'
import { FileDiff, DiffType } from '../../../electron/types/checkpoint'
import SyntaxHighlighterLazy from './SyntaxHighlighterLazy'

interface FileContentDiffProps {
  projectPath: string
  fromRef: string
  toRef: string
  fileDiff: FileDiff
  isOpen: boolean
  onClose: () => void
}

interface DiffContent {
  oldContent: string | null
  newContent: string | null
  diffType: DiffType
}


const DiffTypeIndicator: React.FC<{ diffType: DiffType }> = ({ diffType }) => {
  const config = {
    added: { color: 'bg-green-100 text-green-800 border-green-200', label: 'Added' },
    deleted: { color: 'bg-red-100 text-red-800 border-red-200', label: 'Deleted' },
    modified: { color: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Modified' },
    renamed: { color: 'bg-orange-100 text-orange-800 border-orange-200', label: 'Renamed' }
  }
  
  const { color, label } = config[diffType]
  
  return (
    <Badge className={cn('border', color)}>
      {label}
    </Badge>
  )
}

const UnifiedDiffView: React.FC<{ 
  oldContent: string | null
  newContent: string | null
  language: string
  diffType: DiffType
}> = ({ oldContent, newContent, diffType }) => {
  const generateUnifiedDiff = () => {
    if (diffType === 'added') {
      return newContent?.split('\n').map((line) => `+${line}`).join('\n') || ''
    }
    
    if (diffType === 'deleted') {
      return oldContent?.split('\n').map((line) => `-${line}`).join('\n') || ''
    }
    
    if (diffType === 'modified' && oldContent && newContent) {
      const oldLines = oldContent.split('\n')
      const newLines = newContent.split('\n')
      const unifiedLines: string[] = []
      
      // Simple line-by-line comparison
      const maxLines = Math.max(oldLines.length, newLines.length)
      for (let i = 0; i < maxLines; i++) {
        const oldLine = oldLines[i]
        const newLine = newLines[i]
        
        if (oldLine === undefined) {
          unifiedLines.push(`+${newLine}`)
        } else if (newLine === undefined) {
          unifiedLines.push(`-${oldLine}`)
        } else if (oldLine !== newLine) {
          unifiedLines.push(`-${oldLine}`)
          unifiedLines.push(`+${newLine}`)
        } else {
          unifiedLines.push(` ${oldLine}`)
        }
      }
      
      return unifiedLines.join('\n')
    }
    
    return ''
  }
  
  const unifiedDiff = generateUnifiedDiff()
  
  return (
    <div className="h-full overflow-auto">
      <SyntaxHighlighterLazy
        language="diff"
        showLineNumbers={true}
        className="text-sm"
      >
        {unifiedDiff}
      </SyntaxHighlighterLazy>
    </div>
  )
}

const SideBySideDiffView: React.FC<{ 
  oldContent: string | null
  newContent: string | null
  language: string
  diffType: DiffType
}> = ({ oldContent, newContent, language }) => {
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-red-50 border-b px-3 py-2 text-sm font-medium text-red-800">
          Before
        </div>
        <div className="h-full overflow-auto">
          {oldContent ? (
            <SyntaxHighlighterLazy
              language={language}
              showLineNumbers={true}
              className="text-sm"
            >
              {oldContent}
            </SyntaxHighlighterLazy>
          ) : (
            <div className="p-4 text-sm text-muted-foreground text-center">
              File did not exist
            </div>
          )}
        </div>
      </div>
      
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-green-50 border-b px-3 py-2 text-sm font-medium text-green-800">
          After
        </div>
        <div className="h-full overflow-auto">
          {newContent ? (
            <SyntaxHighlighterLazy
              language={language}
              showLineNumbers={true}
              className="text-sm"
            >
              {newContent}
            </SyntaxHighlighterLazy>
          ) : (
            <div className="p-4 text-sm text-muted-foreground text-center">
              File was deleted
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const FileContentDiff: React.FC<FileContentDiffProps> = ({
  projectPath,
  fromRef,
  toRef,
  fileDiff,
  isOpen,
  onClose
}) => {
  const [diffContent, setDiffContent] = useState<DiffContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'unified' | 'side-by-side'>('side-by-side')
  
  const fileName = fileDiff.path ? fileDiff.path.split('/').pop() || fileDiff.path : 'Unknown'
  const fileExtension = getFileExtension(fileName)
  const language = getLanguageFromExtension(fileExtension)
  
  const loadDiffContent = async () => {
    if (!isOpen || !fileDiff) return
    
    setLoading(true)
    setError(null)
    
    try {
      const result = await window.electronAPI.checkpoint.getFileContentDiff(
        projectPath,
        fromRef,
        toRef,
        fileDiff.path
      )
      
      if (result.success && result.data) {
        setDiffContent(result.data)
      } else {
        setError(result.error || 'Failed to load file diff')
      }
    } catch (err: any) {
      setError(err.message || 'Unknown error occurred')
    } finally {
      setLoading(false)
    }
  }
  
  useEffect(() => {
    if (isOpen) {
      loadDiffContent()
    }
  }, [isOpen, fileDiff, fromRef, toRef])
  
  const handleCopyContent = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
    } catch (err) {
      console.error('Failed to copy content:', err)
    }
  }
  
  const handleDownload = (content: string, prefix: string) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${prefix}_${fileName}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>File Diff: {fileName}</span>
            <DiffTypeIndicator diffType={fileDiff.type} />
          </DialogTitle>
          <DialogDescription>
            Compare file changes between different versions of your project.
          </DialogDescription>
          
          {/* File path and actions */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {fileDiff.path}
              {fileDiff.type === 'renamed' && fileDiff.oldPath && (
                <span> (renamed from {fileDiff.oldPath})</span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'unified' | 'side-by-side')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="side-by-side">Side by Side</TabsTrigger>
                  <TabsTrigger value="unified">Unified</TabsTrigger>
                </TabsList>
              </Tabs>
              
              <Button variant="outline" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-sm text-muted-foreground">Loading file diff...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-red-600 mb-4">Error loading file diff</div>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button onClick={loadDiffContent} variant="outline" size="sm" className="mt-4">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          ) : diffContent ? (
            <Tabs value={viewMode} className="h-full flex flex-col">
              <TabsContent value="side-by-side" className="flex-1 mt-0">
                <SideBySideDiffView
                  oldContent={diffContent.oldContent}
                  newContent={diffContent.newContent}
                  language={language}
                  diffType={diffContent.diffType}
                />
              </TabsContent>
              <TabsContent value="unified" className="flex-1 mt-0">
                <UnifiedDiffView
                  oldContent={diffContent.oldContent}
                  newContent={diffContent.newContent}
                  language={language}
                  diffType={diffContent.diffType}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-muted-foreground mb-4">No diff content available</div>
              </div>
            </div>
          )}
        </div>
        
        {/* Action buttons */}
        {diffContent && (
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="flex items-center gap-2">
              {diffContent.oldContent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyContent(diffContent.oldContent!)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Before
                </Button>
              )}
              
              {diffContent.newContent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyContent(diffContent.newContent!)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy After
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {diffContent.oldContent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(diffContent.oldContent!, 'before')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Before
                </Button>
              )}
              
              {diffContent.newContent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(diffContent.newContent!, 'after')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download After
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default FileContentDiff