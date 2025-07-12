import { IpcMain } from 'electron';
import { readdir, readFile, writeFile, mkdir, stat, lstat } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { registerHandler } from './base-handler.js';
import {
  FileResponse,
  ClaudeMdFile
} from './types.js';

/**
 * Read file content as UTF-8 string
 */
async function readFileContent(filePath: string): Promise<FileResponse> {
  try {
    const content = await readFile(filePath, 'utf8');
    return { success: true, content };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Write content to file as UTF-8 string
 */
async function writeFileContent(filePath: string, content: string): Promise<FileResponse> {
  try {
    await writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Read directory contents
 */
async function readDirectoryContents(dirPath: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const entries = await readdir(dirPath);
    const items = [];

    for (const entry of entries) {
      try {
        const fullPath = join(dirPath, entry);
        const stats = await lstat(fullPath);
        
        items.push({
          path: entry,
          fullPath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          modified: stats.mtime.toISOString()
        });
      } catch (err) {
        console.warn(`Failed to stat ${entry}:`, err);
        // Skip this entry if we can't stat it
      }
    }

    return { success: true, data: items };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get system prompt from ~/.claude/CLAUDE.md
 */
async function getSystemPrompt(): Promise<FileResponse> {
  try {
    const claudeMdPath = join(homedir(), '.claude', 'CLAUDE.md');

    try {
      const content = await readFile(claudeMdPath, 'utf8');
      return { success: true, content };
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File doesn't exist, return empty content
        return { success: true, content: '' };
      }
      throw err;
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Save system prompt to ~/.claude/CLAUDE.md
 */
async function saveSystemPrompt(content: string): Promise<FileResponse> {
  try {
    const claudeDir = join(homedir(), '.claude');
    const claudeMdPath = join(claudeDir, 'CLAUDE.md');

    // Ensure .claude directory exists
    try {
      await mkdir(claudeDir, { recursive: true });
    } catch (err) {
      // Directory might already exist, ignore error
    }

    await writeFile(claudeMdPath, content, 'utf8');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
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
async function readClaudeMdFile(filePath: string): Promise<FileResponse> {
  try {
    const content = await readFile(filePath, 'utf8');
    return { success: true, content };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Save content to a specific CLAUDE.md file
 */
async function saveClaudeMdFile(filePath: string, content: string): Promise<FileResponse> {
  try {
    // Ensure parent directory exists
    const parentDir = dirname(filePath);
    try {
      await mkdir(parentDir, { recursive: true });
    } catch (err) {
      // Directory might already exist, ignore error
    }

    await writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
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

  
}