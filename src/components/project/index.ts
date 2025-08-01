// Project module exports
export { ProjectHeader } from './ProjectHeader';
export { ProjectWorkspace } from './ProjectWorkspace';
export { ProjectInfoSidebar } from './ProjectInfoSidebar';

// Utilities
export * from './lib/file-utils';

// Re-export types from the unified store
export type { Project, ProjectSettings } from '@/store';