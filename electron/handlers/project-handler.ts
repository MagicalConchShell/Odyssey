import {IpcMainInvokeEvent} from 'electron';
import {projectService} from '../services';
import {ClaudeProject, Project} from '../types';

/**
 * Open folder dialog and add project to database
 */
export async function openFolder(_event: IpcMainInvokeEvent): Promise<Project> {
  return await projectService.openFolder();
}

/**
 * Get all projects from database
 */
export async function listProjects(_event: IpcMainInvokeEvent): Promise<Project[]> {
  return await projectService.listProjects();
}

/**
 * Scan for Claude projects
 */
export async function scanClaudeProjects(_event: IpcMainInvokeEvent): Promise<ClaudeProject[]> {
  return await projectService.scanClaudeProjects();
}

/**
 * Import Claude projects into database
 */
export async function importClaudeProjects(_event: IpcMainInvokeEvent, claudeProjectIds: string[]): Promise<{ imported: number, failed: number }> {
  return await projectService.importClaudeProjects(claudeProjectIds);
}