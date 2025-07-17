import { IpcMain, BrowserWindow } from 'electron';
import { readdir, readFile, writeFile, mkdir, stat, lstat, watch } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { registerHandler } from './base-handler.js';
import {
  ClaudeMdFile,
  FileTreeItem
} from './types.js';

/**
 * Read file content as UTF-8 string
 */
async function readFileContent(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf8');
  return content;
}

/**
 * Write content to file as UTF-8 string
 */
async function writeFileContent(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, 'utf8');
}

/**
 * Common ignored patterns for file tree
 */
const DEFAULT_IGNORE_PATTERNS = [
  '.git',
  '.DS_Store',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.vscode',
  '.idea',
  'coverage',
  '.nyc_output',
  '.cache',
  'tmp',
  'temp',
  '*.tmp',
  '*.log'
];

/**
 * Check if a file/directory should be ignored
 */
function shouldIgnore(name: string, ignorePatterns: string[] = DEFAULT_IGNORE_PATTERNS): boolean {
  return ignorePatterns.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(name);
    }
    return name === pattern;
  });
}

/**
 * Recursively build file tree structure
 */
async function buildFileTree(
  dirPath: string, 
  relativePath: string = '', 
  maxDepth: number = 10,
  currentDepth: number = 0
): Promise<FileTreeItem[]> {
  if (currentDepth >= maxDepth) {
    return [];
  }

  const items = [];
  
  try {
    const entries = await readdir(dirPath);
    
    for (const entry of entries) {
      // Skip ignored files and directories
      if (shouldIgnore(entry)) {
        continue;
      }
      
      try {
        const fullPath = join(dirPath, entry);
        const stats = await lstat(fullPath);
        const itemPath = relativePath ? join(relativePath, entry) : entry;
        
        const item: FileTreeItem = {
          path: itemPath,
          fullPath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          modified: stats.mtime.toISOString()
        };
        
        // If it's a directory, recursively get its children
        if (stats.isDirectory()) {
          const children = await buildFileTree(fullPath, itemPath, maxDepth, currentDepth + 1);
          if (children.length > 0) {
            item.children = children;
          }
        }
        
        items.push(item);
      } catch (err) {
        console.warn(`[FileSystem] Failed to stat ${entry}:`, err);
        // Skip this entry if we can't stat it
      }
    }
    
    // Sort items: directories first, then files, both alphabetically
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.path.localeCompare(b.path);
    });
    
  } catch (err) {
    console.warn(`[FileSystem] Failed to read directory ${dirPath}:`, err);
  }
  
  return items;
}

/**
 * Read directory contents with nested structure
 */
async function readDirectoryContents(dirPath: string): Promise<FileTreeItem[]> {
  console.log('[FileSystem] readDirectoryContents called with dirPath:', dirPath);
  
  // Validate input
  if (!dirPath || typeof dirPath !== 'string') {
    console.error('[FileSystem] Invalid dirPath provided:', dirPath);
    throw new Error('Invalid directory path provided');
  }
  
  // Check if path exists and is a directory
  console.log('[FileSystem] Checking if path exists and is directory:', dirPath);
  const stats = await stat(dirPath);
  if (!stats.isDirectory()) {
    console.error('[FileSystem] Path exists but is not a directory:', dirPath);
    throw new Error('Path is not a directory');
  }
  
  console.log('[FileSystem] Building file tree for:', dirPath);
  const items = await buildFileTree(dirPath);
  console.log('[FileSystem] File tree built   with', items.length, 'root items');
  
  return items;
}

/**
 * Get system prompt from ~/.claude/CLAUDE.md
 */
async function getSystemPrompt(): Promise<string> {
  const claudeMdPath = join(homedir(), '.claude', 'CLAUDE.md');

  try {
    const content = await readFile(claudeMdPath, 'utf8');
    return content;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // File doesn't exist, return empty content
      return '';
    }
    throw err;
  }
}

/**
 * Save system prompt to ~/.claude/CLAUDE.md
 */
async function saveSystemPrompt(content: string): Promise<void> {
  const claudeDir = join(homedir(), '.claude');
  const claudeMdPath = join(claudeDir, 'CLAUDE.md');

  // Ensure .claude directory exists
  await mkdir(claudeDir, { recursive: true });

  await writeFile(claudeMdPath, content, 'utf8');
}

/**
 * Find all CLAUDE.md files in a project directory
 */
async function findClaudeMdFiles(projectPath: string): Promise<ClaudeMdFile[]> {
  const claudeMdFiles: ClaudeMdFile[] = [];

  async function findClaudeMdRecursive(dir: string, relativePath: string = '') {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const currentRelativePath = relativePath ? join(relativePath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          // Skip common directories that shouldn't contain CLAUDE.md
          if (!['node_modules', '.git', '.next', 'dist', 'build', '.vscode'].includes(entry.name)) {
            await findClaudeMdRecursive(fullPath, currentRelativePath);
          }
        } else if (entry.name === 'CLAUDE.md') {
          const stats = await stat(fullPath);
          claudeMdFiles.push({
            relative_path: currentRelativePath,
            absolute_path: fullPath,
            size: stats.size,
            modified: Math.floor(stats.mtime.getTime() / 1000)
          });
        }
      }
    } catch (error) {
      // Skip directories we can't read
      console.warn(`Cannot read directory ${dir}:`, error);
    }
  }

  await findClaudeMdRecursive(projectPath);
  return claudeMdFiles;
}

/**
 * Read content of a specific CLAUDE.md file
 */
async function readClaudeMdFile(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf8');
  return content;
}

/**
 * Save content to a specific CLAUDE.md file
 */
async function saveClaudeMdFile(filePath: string, content: string): Promise<void> {
  // Ensure parent directory exists
  const parentDir = dirname(filePath);
  await mkdir(parentDir, { recursive: true });

  await writeFile(filePath, content, 'utf8');
}

/**
 * Validate that a path exists and is a directory
 */
export async function validateWorkingDirectory(projectPath: string): Promise<boolean> {
  try {
    const statResult = await stat(projectPath);
    return statResult.isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * Resolve project path from Claude's encoded paths
 */
export async function resolveProjectPath(claudeProjectPath: string): Promise<string> {
  // If the path doesn't look like a Claude encoded path, return as-is
  if (!claudeProjectPath.includes('/.claude/projects/') || claudeProjectPath.startsWith('/') && !claudeProjectPath.includes('-')) {
    return claudeProjectPath;
  }

  // Try to get the real path from session files first
  const realPath = await getProjectPathFromSessions(claudeProjectPath);
  if (realPath) {
    return realPath;
  }

  // Fall back to decoding from the directory name
  const dirName = claudeProjectPath.split('/').pop() || '';
  return decodeProjectPath(dirName);
}

/**
 * Extract real project path from session files
 */
async function getProjectPathFromSessions(projectDir: string): Promise<string | null> {
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const sessionPath = join(projectDir, entry.name);
        const content = await readFile(sessionPath, 'utf8');
        const firstLine = content.split('\n')[0];

        if (firstLine.trim()) {
          try {
            const json = JSON.parse(firstLine);
            if (json.cwd && typeof json.cwd === 'string') {
              return json.cwd;
            }
          } catch (e) {
            // Continue to next file if this one can't be parsed
            continue;
          }
        }
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Decode project path from Claude's encoded directory name
 */
function decodeProjectPath(encoded: string): string {
  // This is a fallback - the encoding isn't reversible when paths contain hyphens
  return encoded.replace(/-/g, '/');
}

/**
 * File system watcher management
 */
class FileSystemWatcher {
  private static instance: FileSystemWatcher;
  private watchers: Map<string, AbortController> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private mainWindow: BrowserWindow | null = null;

  static getInstance(): FileSystemWatcher {
    if (!FileSystemWatcher.instance) {
      FileSystemWatcher.instance = new FileSystemWatcher();
    }
    return FileSystemWatcher.instance;
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  async startWatching(projectPath: string): Promise<void> {
    console.log('[FileSystemWatcher] Starting to watch:', projectPath);
    
    // Stop existing watcher if any
    this.stopWatching(projectPath);

    try {
      const abortController = new AbortController();
      this.watchers.set(projectPath, abortController);

      const watcher = watch(projectPath, { 
        recursive: true, 
        signal: abortController.signal 
      });

      for await (const event of watcher) {
        if (event.filename) {
          // Skip ignored files
          if (shouldIgnore(event.filename)) {
            continue;
          }
          
          this.handleFileChange(projectPath, event);
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('[FileSystemWatcher] Error watching directory:', error);
      }
    }
  }

  private handleFileChange(projectPath: string, event: any): void {
    const key = `${projectPath}:${event.filename}`;
    
    // Clear existing timer for this file
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key)!);
    }
    
    // Set new debounced timer
    const timer = setTimeout(() => {
      console.log('[FileSystemWatcher] File changed:', event.filename, 'in', projectPath);
      this.notifyFileChange(projectPath);
      this.debounceTimers.delete(key);
    }, 300); // 300ms debounce
    
    this.debounceTimers.set(key, timer);
  }

  private notifyFileChange(projectPath: string): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('file-system-changed', { projectPath });
    }
  }

  stopWatching(projectPath: string): void {
    console.log('[FileSystemWatcher] Stopping watch for:', projectPath);
    
    const controller = this.watchers.get(projectPath);
    if (controller) {
      controller.abort();
      this.watchers.delete(projectPath);
    }

    // Clear any pending timers for this path
    for (const [key, timer] of this.debounceTimers.entries()) {
      if (key.startsWith(projectPath + ':')) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
      }
    }
  }

  stopAllWatchers(): void {
    console.log('[FileSystemWatcher] Stopping all watchers');
    
    for (const [projectPath] of this.watchers) {
      this.stopWatching(projectPath);
    }
  }
}

/**
 * Start watching a directory for file changes
 */
async function startFileSystemWatcher(projectPath: string): Promise<void> {
  const watcher = FileSystemWatcher.getInstance();
  await watcher.startWatching(projectPath);
}

/**
 * Stop watching a directory for file changes
 */
async function stopFileSystemWatcher(projectPath: string): Promise<void> {
  const watcher = FileSystemWatcher.getInstance();
  watcher.stopWatching(projectPath);
}

/**
 * Set the main window for file system notifications
 */
function setMainWindow(window: BrowserWindow): void {
  const watcher = FileSystemWatcher.getInstance();
  watcher.setMainWindow(window);
}

/**
 * Register all file system related IPC handlers
 */
export function setupFileSystemHandlers(ipcMain: IpcMain): void {
  // Basic file operations
  registerHandler(
    ipcMain,
    'read-file',
    readFileContent,
    { requiresValidation: true, timeout: 10000 }
  );

  registerHandler(
    ipcMain,
    'write-file',
    writeFileContent,
    { requiresValidation: true, timeout: 10000 }
  );

  registerHandler(
    ipcMain,
    'read-directory',
    readDirectoryContents,
    { requiresValidation: true, timeout: 10000 }
  );

  // System prompt management
  registerHandler(
    ipcMain,
    'get-system-prompt',
    getSystemPrompt,
    { requiresValidation: false, timeout: 5000 }
  );

  registerHandler(
    ipcMain,
    'save-system-prompt',
    saveSystemPrompt,
    { requiresValidation: true, timeout: 5000 }
  );

  // Project CLAUDE.md file operations
  registerHandler(
    ipcMain,
    'find-claude-md-files',
    findClaudeMdFiles,
    { requiresValidation: true, timeout: 15000 }
  );

  registerHandler(
    ipcMain,
    'read-claude-md-file',
    readClaudeMdFile,
    { requiresValidation: true, timeout: 10000 }
  );

  registerHandler(
    ipcMain,
    'save-claude-md-file',
    saveClaudeMdFile,
    { requiresValidation: true, timeout: 10000 }
  );

  // File system watcher operations
  registerHandler(
    ipcMain,
    'start-file-system-watcher',
    startFileSystemWatcher,
    { requiresValidation: true, timeout: 5000 }
  );

  registerHandler(
    ipcMain,
    'stop-file-system-watcher',
    stopFileSystemWatcher,
    { requiresValidation: true, timeout: 5000 }
  );
}

/**
 * Export the setMainWindow function for use in main.ts
 */
export { setMainWindow };