import {dialog} from 'electron';
import {readdir} from 'fs/promises';
import {join} from 'path';
import {homedir} from 'os';
import {dbManager} from './database-service.js';
import {ClaudeProject, Project} from '../types';

// Constants
const CLAUDE_PROJECT_DIR = join(homedir(), '.claude', 'projects');
const SESSION_FILE_EXTENSION = '.jsonl';

/**
 * Service class responsible for all project-related business logic.
 * Handles project creation, import, management, and Claude project integration.
 */
export class ProjectService {
  /**
   * Generate unique project ID
   */
  private generateProjectId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * Extract project name from path
   */
  private extractProjectName(path: string): string {
    return path.split('/').pop() || 'Unnamed Project';
  }


  /**
   * Extracts the real project path from Claude session JSONL files
   */
  private async getClaudeProjectPath(projectDir: string): Promise<string | null> {
    try {
      const entries = await readdir(projectDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(SESSION_FILE_EXTENSION)) {
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
            } catch {
              continue;
            }
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Scan Claude projects directory for import candidates
   */
  async scanClaudeProjects(): Promise<ClaudeProject[]> {
    try {
      const entries = await readdir(CLAUDE_PROJECT_DIR, { withFileTypes: true });

      const claudeProjects = await Promise.all(
        entries
          .filter(entry => entry.isDirectory())
          .map(async entry => {
            try {
              const projectPath = join(CLAUDE_PROJECT_DIR, entry.name);
              const realProjectPath = await this.getClaudeProjectPath(projectPath);

              if (realProjectPath) {
                return {
                  name: this.extractProjectName(realProjectPath),
                  path: realProjectPath,
                  claude_project_id: entry.name
                };
              }
              return null;
            } catch (error) {
              console.error(`Failed to process Claude project ${entry.name}:`, {
                error: error instanceof Error ? error.message : String(error),
                entry: entry.name
              });
              return null;
            }
          })
      );

      return claudeProjects.filter(claudeProject => claudeProject !== null);
    } catch (error) {
      console.error('Failed to scan Claude projects:', error);
      return [];
    }
  }

  /**
   * Open folder dialog and add project to database
   */
  async openFolder(): Promise<Project> {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Folder'
    });

    if (result.canceled || !result.filePaths.length) {
      throw new Error('No folder selected');
    }

    const selectedPath = result.filePaths[0];
    
    const existingProject = dbManager.getProjectByPath(selectedPath);
    if (existingProject) {
      const updatedProject = dbManager.updateProject(existingProject.id, {
        last_opened: Date.now()
      });
      if (!updatedProject) {
        throw new Error('Failed to update existing project');
      }
      return updatedProject;
    }

    return dbManager.createProject({
      id: this.generateProjectId(),
      name: this.extractProjectName(selectedPath),
      path: selectedPath,
      type: 'manual',
      last_opened: Date.now(),
      is_pinned: false
    });
  }

  /**
   * Get all projects from database
   */
  async listProjects(): Promise<Project[]> {
    return dbManager.getAllProjects();
  }

  /**
   * Delete project
   */
  async deleteProject(id: string): Promise<boolean> {
    return dbManager.deleteProject(id);
  }

  /**
   * Import Claude projects into database
   */
  async importClaudeProjects(claudeProjectIds: string[]): Promise<{ imported: number, failed: number }> {
    const claudeProjects = await this.scanClaudeProjects();
    let imported = 0;
    let failed = 0;

    for (const claudeProject of claudeProjects) {
      if (claudeProjectIds.includes(claudeProject.claude_project_id)) {
        try {
          const existingProject = dbManager.getProjectByPath(claudeProject.path);
          if (!existingProject) {
            dbManager.createProject({
              id: this.generateProjectId(),
              name: claudeProject.name,
              path: claudeProject.path,
              type: 'claude-imported',
              last_opened: Date.now(),
              is_pinned: false,
              claude_project_id: claudeProject.claude_project_id
            });
            imported++;
          }
        } catch (error) {
          console.error(`Failed to import Claude project ${claudeProject.claude_project_id}:`, {
            error: error instanceof Error ? error.message : String(error),
            candidateData: {
              name: claudeProject.name,
              path: claudeProject.path,
              claude_project_id: claudeProject.claude_project_id
            }
          });
          failed++;
        }
      }
    }

    return { imported, failed };
  }

}

export const projectService = new ProjectService();