import { IpcMain, dialog } from 'electron';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { registerHandler } from './base-handler.js';
import { dbManager } from '../database.js';
import {
  Project,
  Session,
  ProjectStats,
  ProjectCreateRequest,
  ProjectUpdateRequest,
  ClaudeProjectImportCandidate
} from './types.js';

// Generate unique project ID
function generateProjectId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// Extract project name from path
function extractProjectName(path: string): string {
  return path.split('/').pop() || 'Unnamed Project';
}

// Validate and sanitize timestamp for SQLite
function validateTimestamp(timestamp: any): number {
  // Handle null/undefined
  if (timestamp == null) {
    return Date.now();
  }
  
  // Handle Date objects
  if (timestamp instanceof Date) {
    const time = timestamp.getTime();
    return isNaN(time) ? Date.now() : Math.floor(time);
  }
  
  // Handle numbers
  if (typeof timestamp === 'number') {
    // Check for NaN, Infinity, or invalid numbers
    if (!isFinite(timestamp)) {
      return Date.now();
    }
    return Math.floor(timestamp);
  }
  
  // Handle string timestamps
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    return isNaN(parsed) ? Date.now() : Math.floor(parsed);
  }
  
  // Fallback for any other type
  return Date.now();
}

// ===================
// Claude Project Import Logic (Preserved)
// ===================

/**
 * Extracts the real project path from Claude session JSONL files.
 * Claude stores the actual working directory (cwd) in the first line of session files,
 * which allows us to reverse-engineer the original project path from encoded directory names.
 */
async function getProjectPathFromSessions(projectDir: string): Promise<string | null> {
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const sessionPath = join(projectDir, entry.name);
        const fs = await import('fs/promises');
        const content = await fs.readFile(sessionPath, 'utf8');
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
 * Resolves the real project path from Claude's encoded project path.
 * First attempts to extract the real path from session files, then falls back to decoding.
 */
async function resolveProjectPath(claudeProjectPath: string): Promise<string> {
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
 * Fallback function to decode project path from Claude's encoded directory name.
 * Note: This is not reliable for paths containing hyphens, as the encoding isn't reversible.
 */
function decodeProjectPath(encoded: string): string {
  // This is a fallback - the encoding isn't reversible when paths contain hyphens
  return encoded.replace(/-/g, '/');
}

/**
 * Validates that a given path exists and is a directory.
 */
async function validateWorkingDirectory(projectPath: string): Promise<boolean> {
  try {
    const statResult = await stat(projectPath);
    return statResult.isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * Get project statistics (file count, total size, last modified)
 */
async function getProjectStats(projectPath: string): Promise<ProjectStats> {
  // Validate project path
  const realProjectPath = await resolveProjectPath(projectPath);
  if (!realProjectPath || !(await validateWorkingDirectory(realProjectPath))) {
    throw new Error('Invalid project path');
  }

  // Count files and calculate total size
  let fileCount = 0;
  let totalSize = 0;
  let lastModified = new Date(0);

  const scanDirectory = async (dirPath: string) => {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        // Skip common ignore patterns
        if (entry.name.startsWith('.') ||
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === 'build') {
          continue;
        }

        if (entry.isFile()) {
          try {
            const stats = await stat(fullPath);
            fileCount++;
            totalSize += stats.size;
            if (stats.mtime > lastModified) {
              lastModified = stats.mtime;
            }
          } catch (error) {
            // Skip files we can't access
          }
        } else if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't access
    }
  };

  await scanDirectory(realProjectPath);

  return {
    fileCount,
    totalSize,
    lastModified: lastModified.toISOString()
  };
}

/**
 * Scan Claude projects directory for import candidates
 */
async function scanClaudeProjectsForImport(): Promise<ClaudeProjectImportCandidate[]> {
  try {
    const claudeProjectsPath = join(homedir(), '.claude', 'projects');
    const entries = await readdir(claudeProjectsPath, { withFileTypes: true });

    const candidates = await Promise.all(
      entries
        .filter(entry => entry.isDirectory())
        .map(async entry => {
          try {
            const projectPath = join(claudeProjectsPath, entry.name);
            const stats = await stat(projectPath);

            // Get directory creation time, fallback to modification time
            const lastModified = validateTimestamp(stats.birthtime || stats.mtime);

            // Extract actual project path from JSONL files
            const realProjectPath = await getProjectPathFromSessions(projectPath);

            if (realProjectPath) {
              // Get sessions count
              const sessionEntries = await readdir(projectPath, { withFileTypes: true });
              const sessionCount = sessionEntries.filter(e => e.name.endsWith('.jsonl')).length;

              // Get project stats
              const projectStats = await getProjectStats(realProjectPath);

              return {
                name: extractProjectName(realProjectPath),
                path: realProjectPath,
                claude_project_id: entry.name,
                session_count: sessionCount,
                last_modified: lastModified,
                stats: projectStats
              };
            }
            return null;
          } catch (error) {
            console.error(`Failed to process Claude project ${entry.name}:`, {
              error: error instanceof Error ? error.message : String(error),
              // projectPath: projectPath,
              entry: entry.name
            });
            return null;
          }
        })
    );

    return candidates.filter(candidate => candidate !== null);
  } catch (error) {
    console.error('Failed to scan Claude projects:', error);
    return [];
  }
}

// ===================
// New Database-Driven Project Management
// ===================

/**
 * Open folder dialog and add project to database
 */
async function openFolder(): Promise<Project> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Project Folder'
  });

  if (result.canceled || !result.filePaths.length) {
    throw new Error('No folder selected');
  }

  const selectedPath = result.filePaths[0];
  
  // Check if project already exists
  const existingProject = dbManager.getProjectByPath(selectedPath);
  if (existingProject) {
    // Update last opened time
    const updatedProject = dbManager.updateProject(existingProject.id, {
      last_opened: Date.now()
    });
    if (!updatedProject) {
      throw new Error('Failed to update existing project');
    }
    return updatedProject;
  }

  // Create new project
  const project = dbManager.createProject({
    id: generateProjectId(),
    name: extractProjectName(selectedPath),
    path: selectedPath,
    type: 'manual',
    last_opened: Date.now(),
    is_pinned: false
  });

  return project;
}

/**
 * Get all projects from database
 */
async function listProjects(): Promise<Project[]> {
  const projects = dbManager.getAllProjects();
  return projects;
}

/**
 * Create a new project
 */
async function createProject(request: ProjectCreateRequest): Promise<Project> {
  // Validate path exists
  if (!(await validateWorkingDirectory(request.path))) {
    throw new Error('Invalid project path');
  }

  // Check if project already exists
  const existingProject = dbManager.getProjectByPath(request.path);
  if (existingProject) {
    throw new Error('Project already exists');
  }

  const project = dbManager.createProject({
    id: generateProjectId(),
    name: request.name,
    path: request.path,
    type: request.type || 'manual',
    last_opened: Date.now(),
    is_pinned: false,
    tags: request.tags,
    claude_project_id: request.claude_project_id
  });

  return project;
}

/**
 * Update project
 */
async function updateProject(id: string, request: ProjectUpdateRequest): Promise<Project> {
  const project = dbManager.updateProject(id, request);
  if (!project) {
    throw new Error('Project not found');
  }
  return project;
}

/**
 * Delete project
 */
async function deleteProject(id: string): Promise<boolean> {
  const success = dbManager.deleteProject(id);
  return success;
}

/**
 * Open project (updates last opened time)
 */
async function openProject(id: string): Promise<Project> {
  const project = dbManager.updateProject(id, {
    last_opened: Date.now()
  });
  if (!project) {
    throw new Error('Project not found');
  }
  return project;
}

/**
 * Import Claude projects into database
 */
async function importClaudeProjects(claudeProjectIds: string[]): Promise<{ imported: number, failed: number }> {
  const candidates = await scanClaudeProjectsForImport();
  let imported = 0;
  let failed = 0;

  for (const candidate of candidates) {
    if (claudeProjectIds.includes(candidate.claude_project_id)) {
      try {
        // Check if already exists
        const existingProject = dbManager.getProjectByPath(candidate.path);
        if (!existingProject) {
          const validatedTimestamp = validateTimestamp(candidate.last_modified);
          console.log(`Importing project ${candidate.name} with timestamp ${validatedTimestamp} (original: ${candidate.last_modified}, type: ${typeof candidate.last_modified})`);
          
          dbManager.createProject({
            id: generateProjectId(),
            name: candidate.name,
            path: candidate.path,
            type: 'claude-imported',
            last_opened: validatedTimestamp,
            is_pinned: false,
            claude_project_id: candidate.claude_project_id
          });
          imported++;
        }
      } catch (error) {
        console.error(`Failed to import Claude project ${candidate.claude_project_id}:`, {
          error: error instanceof Error ? error.message : String(error),
          candidateData: {
            name: candidate.name,
            path: candidate.path,
            last_modified: candidate.last_modified,
            last_modified_type: typeof candidate.last_modified
          }
        });
        failed++;
      }
    }
  }

  return { imported, failed };
}

/**
 * Get Claude project import candidates
 */
async function getClaudeProjectImportCandidates(): Promise<ClaudeProjectImportCandidate[]> {
  const candidates = await scanClaudeProjectsForImport();
  return candidates;
}

/**
 * Get all sessions for a specific project (legacy support)
 */
async function getProjectSessions(projectId: string): Promise<Session[]> {
  try {
    const projectPath = join(homedir(), '.claude', 'projects', projectId);
    const entries = await readdir(projectPath, { withFileTypes: true });

    // Get the actual project path from JSONL files
    const realProjectPath = await getProjectPathFromSessions(projectPath);

    const sessions = await Promise.all(
      entries
        .filter(entry => entry.name.endsWith('.jsonl'))
        .map(async entry => {
          try {
            const sessionFilePath = join(projectPath, entry.name);
            const stats = await stat(sessionFilePath);

            // Get file creation time, fallback to modification time
            const createdAt = (stats.birthtime || stats.mtime).toISOString();

            return {
              id: entry.name.replace('.jsonl', ''),
              name: entry.name,
              path: sessionFilePath,
              project_path: realProjectPath || projectPath, // Include actual project path
              created_at: createdAt
            };
          } catch (error) {
            console.error(`Failed to get stats for session ${entry.name}:`, error);
            return {
              id: entry.name.replace('.jsonl', ''),
              name: entry.name,
              path: join(projectPath, entry.name),
              project_path: realProjectPath || projectPath, // Include actual project path
              created_at: new Date().toISOString() // fallback to current time
            };
          }
        })
    );

    return sessions;
  } catch (error) {
    console.error('Failed to list project sessions:', error);
    return [];
  }
}

/**
 * Register all project management related IPC handlers
 */
export function setupProjectManagementHandlers(ipcMain: IpcMain): void {
  // New database-driven project management
  registerHandler(
    ipcMain,
    'open-folder',
    openFolder,
    { requiresValidation: false, timeout: 10000 }
  );

  registerHandler(
    ipcMain,
    'list-projects',
    listProjects,
    { requiresValidation: false, timeout: 10000 }
  );

  registerHandler(
    ipcMain,
    'create-project',
    createProject,
    { requiresValidation: true, timeout: 10000 }
  );

  registerHandler(
    ipcMain,
    'update-project',
    updateProject,
    { requiresValidation: true, timeout: 10000 }
  );

  registerHandler(
    ipcMain,
    'delete-project',
    deleteProject,
    { requiresValidation: true, timeout: 10000 }
  );

  registerHandler(
    ipcMain,
    'open-project',
    openProject,
    { requiresValidation: true, timeout: 10000 }
  );

  // Claude project import functionality
  registerHandler(
    ipcMain,
    'get-claude-project-import-candidates',
    getClaudeProjectImportCandidates,
    { requiresValidation: false, timeout: 15000 }
  );

  registerHandler(
    ipcMain,
    'import-claude-projects',
    importClaudeProjects,
    { requiresValidation: true, timeout: 15000 }
  );

  // Legacy support for existing functionality
  registerHandler(
    ipcMain,
    'get-project-sessions',
    getProjectSessions,
    { requiresValidation: true, timeout: 10000 }
  );

  registerHandler(
    ipcMain,
    'get-project-stats',
    getProjectStats,
    { requiresValidation: true, timeout: 15000 }
  );
}

// Export utility functions for use in other modules
export { 
  resolveProjectPath, 
  validateWorkingDirectory, 
  getProjectPathFromSessions 
};