import { 
  Code2, Globe, Palette, Database, Image, FileText, Settings, Package, GitBranch, 
  FileVideo, FileArchive, FileSpreadsheet, FileCog, FileCode, 
  File, LucideIcon 
} from 'lucide-react'

/**
 * Get file extension from filename
 */
export const getFileExtension = (filename: string): string => {
  const extension = filename.split('.').pop()?.toLowerCase()
  return extension || 'text'
}

/**
 * Get programming language from file extension for syntax highlighting
 */
export const getLanguageFromExtension = (extension: string): string => {
  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'py': 'python',
    'rs': 'rust',
    'go': 'go',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'h': 'c',
    'css': 'css',
    'scss': 'scss',
    'html': 'html',
    'xml': 'xml',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'markdown': 'markdown',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'fish': 'bash',
    'sql': 'sql',
    'dockerfile': 'dockerfile',
    'toml': 'toml',
    'ini': 'ini',
    'conf': 'ini',
    'gitignore': 'gitignore',
    'gitattributes': 'gitattributes',
    'makefile': 'makefile',
    'make': 'makefile',
  }
  
  return languageMap[extension] || 'text'
}

/**
 * Get appropriate icon for file type based on extension
 */
export const getFileIcon = (filename: string): { icon: LucideIcon; color: string } => {
  const extension = getFileExtension(filename)
  const lowerFilename = filename.toLowerCase()
  
  // Special filename patterns
  if (lowerFilename.includes('package.json') || lowerFilename.includes('package-lock.json')) {
    return { icon: Package, color: 'text-green-600' }
  }
  if (lowerFilename.includes('dockerfile')) {
    return { icon: Package, color: 'text-blue-600' }
  }
  if (lowerFilename.includes('readme')) {
    return { icon: FileText, color: 'text-blue-500' }
  }
  if (lowerFilename.startsWith('.git')) {
    return { icon: GitBranch, color: 'text-orange-500' }
  }
  if (lowerFilename.startsWith('.env')) {
    return { icon: Settings, color: 'text-yellow-600' }
  }
  if (lowerFilename.includes('config') || lowerFilename.includes('.conf')) {
    return { icon: Settings, color: 'text-gray-600' }
  }
  
  // Extension-based mapping
  const iconMap: Record<string, { icon: LucideIcon; color: string }> = {
    // Code files
    'ts': { icon: Code2, color: 'text-blue-600' },
    'tsx': { icon: Code2, color: 'text-blue-600' },
    'js': { icon: Code2, color: 'text-yellow-600' },
    'jsx': { icon: Code2, color: 'text-yellow-600' },
    'py': { icon: Code2, color: 'text-blue-500' },
    'rs': { icon: Code2, color: 'text-orange-600' },
    'go': { icon: Code2, color: 'text-cyan-600' },
    'java': { icon: Code2, color: 'text-red-600' },
    'cpp': { icon: Code2, color: 'text-blue-700' },
    'c': { icon: Code2, color: 'text-blue-700' },
    'h': { icon: Code2, color: 'text-blue-700' },
    'swift': { icon: Code2, color: 'text-orange-500' },
    'kt': { icon: Code2, color: 'text-purple-600' },
    'php': { icon: Code2, color: 'text-purple-700' },
    'rb': { icon: Code2, color: 'text-red-500' },
    'cs': { icon: Code2, color: 'text-green-600' },
    'scala': { icon: Code2, color: 'text-red-600' },
    
    // Markup and template files
    'html': { icon: Globe, color: 'text-orange-600' },
    'htm': { icon: Globe, color: 'text-orange-600' },
    'xml': { icon: Globe, color: 'text-green-600' },
    'vue': { icon: Globe, color: 'text-green-500' },
    'svelte': { icon: Globe, color: 'text-orange-500' },
    'ejs': { icon: Globe, color: 'text-yellow-600' },
    'handlebars': { icon: Globe, color: 'text-orange-600' },
    'hbs': { icon: Globe, color: 'text-orange-600' },
    
    // Style files
    'css': { icon: Palette, color: 'text-blue-500' },
    'scss': { icon: Palette, color: 'text-pink-500' },
    'sass': { icon: Palette, color: 'text-pink-500' },
    'less': { icon: Palette, color: 'text-blue-600' },
    'styl': { icon: Palette, color: 'text-green-600' },
    'stylus': { icon: Palette, color: 'text-green-600' },
    
    // Data files
    'json': { icon: Database, color: 'text-yellow-600' },
    'yaml': { icon: Database, color: 'text-red-500' },
    'yml': { icon: Database, color: 'text-red-500' },
    'toml': { icon: Database, color: 'text-gray-600' },
    'ini': { icon: Database, color: 'text-gray-600' },
    'csv': { icon: FileSpreadsheet, color: 'text-green-600' },
    'tsv': { icon: FileSpreadsheet, color: 'text-green-600' },
    'sql': { icon: Database, color: 'text-blue-600' },
    
    // Image files
    'png': { icon: Image, color: 'text-purple-500' },
    'jpg': { icon: Image, color: 'text-purple-500' },
    'jpeg': { icon: Image, color: 'text-purple-500' },
    'gif': { icon: Image, color: 'text-purple-500' },
    'svg': { icon: Image, color: 'text-green-500' },
    'webp': { icon: Image, color: 'text-purple-500' },
    'ico': { icon: Image, color: 'text-purple-500' },
    'bmp': { icon: Image, color: 'text-purple-500' },
    'tiff': { icon: Image, color: 'text-purple-500' },
    'tif': { icon: Image, color: 'text-purple-500' },
    
    // Video files
    'mp4': { icon: FileVideo, color: 'text-red-500' },
    'avi': { icon: FileVideo, color: 'text-red-500' },
    'mov': { icon: FileVideo, color: 'text-red-500' },
    'wmv': { icon: FileVideo, color: 'text-red-500' },
    'flv': { icon: FileVideo, color: 'text-red-500' },
    'webm': { icon: FileVideo, color: 'text-red-500' },
    'mkv': { icon: FileVideo, color: 'text-red-500' },
    
    // Archive files
    'zip': { icon: FileArchive, color: 'text-gray-600' },
    'rar': { icon: FileArchive, color: 'text-gray-600' },
    'tar': { icon: FileArchive, color: 'text-gray-600' },
    'gz': { icon: FileArchive, color: 'text-gray-600' },
    '7z': { icon: FileArchive, color: 'text-gray-600' },
    'bz2': { icon: FileArchive, color: 'text-gray-600' },
    'xz': { icon: FileArchive, color: 'text-gray-600' },
    
    // Document files
    'md': { icon: FileText, color: 'text-blue-500' },
    'markdown': { icon: FileText, color: 'text-blue-500' },
    'txt': { icon: FileText, color: 'text-gray-600' },
    'rtf': { icon: FileText, color: 'text-gray-600' },
    'doc': { icon: FileText, color: 'text-blue-600' },
    'docx': { icon: FileText, color: 'text-blue-600' },
    'pdf': { icon: FileText, color: 'text-red-600' },
    
    // Shell scripts
    'sh': { icon: FileCode, color: 'text-green-600' },
    'bash': { icon: FileCode, color: 'text-green-600' },
    'zsh': { icon: FileCode, color: 'text-green-600' },
    'fish': { icon: FileCode, color: 'text-green-600' },
    'ps1': { icon: FileCode, color: 'text-blue-600' },
    'bat': { icon: FileCode, color: 'text-gray-600' },
    'cmd': { icon: FileCode, color: 'text-gray-600' },
    
    // Build and config files
    'makefile': { icon: FileCog, color: 'text-gray-600' },
    'cmake': { icon: FileCog, color: 'text-gray-600' },
    'gradle': { icon: FileCog, color: 'text-green-600' },
    'maven': { icon: FileCog, color: 'text-red-600' },
    'gulpfile': { icon: FileCog, color: 'text-red-600' },
    'webpack': { icon: FileCog, color: 'text-blue-600' },
    'rollup': { icon: FileCog, color: 'text-red-600' },
    'vite': { icon: FileCog, color: 'text-purple-600' },
    'parcel': { icon: FileCog, color: 'text-orange-600' },
    'next': { icon: FileCog, color: 'text-gray-800' },
    'nuxt': { icon: FileCog, color: 'text-green-500' },
    'astro': { icon: FileCog, color: 'text-purple-500' },
    
    // Lock files
    'lock': { icon: Settings, color: 'text-gray-500' },
    
    // Git files
    'gitignore': { icon: GitBranch, color: 'text-orange-500' },
    'gitattributes': { icon: GitBranch, color: 'text-orange-500' },
    'gitmodules': { icon: GitBranch, color: 'text-orange-500' },
  }
  
  return iconMap[extension] || { icon: File, color: 'text-muted-foreground' }
}

/**
 * Get file type category for grouping or filtering
 */
export const getFileCategory = (filename: string): string => {
  const extension = getFileExtension(filename)
  const lowerFilename = filename.toLowerCase()
  
  // Special files
  if (lowerFilename.includes('package.json') || lowerFilename.includes('dockerfile')) {
    return 'build'
  }
  if (lowerFilename.startsWith('.git') || extension === 'gitignore') {
    return 'git'
  }
  if (lowerFilename.startsWith('.env') || lowerFilename.includes('config')) {
    return 'config'
  }
  
  // Extension-based categories
  const categoryMap: Record<string, string> = {
    // Code
    'ts': 'code', 'tsx': 'code', 'js': 'code', 'jsx': 'code', 'py': 'code', 'rs': 'code',
    'go': 'code', 'java': 'code', 'cpp': 'code', 'c': 'code', 'h': 'code', 'swift': 'code',
    'kt': 'code', 'php': 'code', 'rb': 'code', 'cs': 'code', 'scala': 'code',
    
    // Markup
    'html': 'markup', 'htm': 'markup', 'xml': 'markup', 'vue': 'markup', 'svelte': 'markup',
    'ejs': 'markup', 'handlebars': 'markup', 'hbs': 'markup',
    
    // Style
    'css': 'style', 'scss': 'style', 'sass': 'style', 'less': 'style', 'styl': 'style',
    
    // Data
    'json': 'data', 'yaml': 'data', 'yml': 'data', 'toml': 'data', 'ini': 'data',
    'csv': 'data', 'tsv': 'data', 'sql': 'data',
    
    // Media
    'png': 'image', 'jpg': 'image', 'jpeg': 'image', 'gif': 'image', 'svg': 'image',
    'webp': 'image', 'ico': 'image', 'bmp': 'image', 'tiff': 'image', 'tif': 'image',
    'mp4': 'video', 'avi': 'video', 'mov': 'video', 'wmv': 'video', 'flv': 'video',
    'webm': 'video', 'mkv': 'video',
    
    // Archive
    'zip': 'archive', 'rar': 'archive', 'tar': 'archive', 'gz': 'archive', '7z': 'archive',
    'bz2': 'archive', 'xz': 'archive',
    
    // Document
    'md': 'document', 'markdown': 'document', 'txt': 'document', 'rtf': 'document',
    'doc': 'document', 'docx': 'document', 'pdf': 'document',
    
    // Script
    'sh': 'script', 'bash': 'script', 'zsh': 'script', 'fish': 'script',
    'ps1': 'script', 'bat': 'script', 'cmd': 'script',
  }
  
  return categoryMap[extension] || 'other'
}