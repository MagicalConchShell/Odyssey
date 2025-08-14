// Import backend types for consistency
export type {
  Project,
  UsageEntry,
  UsageStats,
  ModelUsageStats,
  ProjectUsageStats,
  DateUsageStats,
  ApiResponse,
  GitStatusResult,
  ClaudeProjectImportCandidate,
} from '../../electron/types';


// Import workspace state types
export type {
  WorkspaceState,
  ProjectWorkspaceMeta,
} from '../../electron/types/workspace-state';


export interface MessageDebugInfo {
  component: string;
  action: string;
  timestamp?: number | string;
  messageType?: string;
  processingId?: string;
  details?: Record<string, any>;
}

declare global {
  interface Window {
    electronAPI: {
      // System utilities
      ping: () => Promise<ApiResponse<string>>;
      getPlatform: () => Promise<ApiResponse<string>>;
      openExternal: (url: string) => Promise<ApiResponse<void>>;

      // Terminal handlers
      terminal: {
        create: (workingDirectory: string, shell?: string, projectPath?: string) => Promise<ApiResponse<{ terminalId: string }>>;
        write: (terminalId: string, data: string) => Promise<ApiResponse<void>>;
        resize: (terminalId: string, cols: number, rows: number) => Promise<ApiResponse<void>>;
        close: (terminalId: string) => Promise<ApiResponse<void>>;
        registerWebContents: (terminalId: string) => Promise<ApiResponse<void>>;
      };

      // Event listeners
      on?: (channel: string, listener: (...args: any[]) => void) => void;
      removeListener?: (channel: string, listener: (...args: any[]) => void) => void;
      removeAllListeners?: (channel: string) => void;



      // Environment variables handlers
      settings: {
        getEnvironmentVariables: () => Promise<ApiResponse<Record<string, string>>>;
        saveEnvironmentVariables: (env: Record<string, string>) => Promise<ApiResponse<void>>;
      };



      // Usage analytics handlers
      usage: {
        createEntry: (entry: Omit<UsageEntry, 'id' | 'created_at'>) => Promise<ApiResponse<UsageEntry>>;
        getAllEntries: () => Promise<ApiResponse<UsageEntry[]>>;
        getStats: () => Promise<ApiResponse<UsageStats>>;
        getByDateRange: (startDate: string, endDate: string) => Promise<ApiResponse<UsageStats>>;
        clearCache: () => Promise<ApiResponse<void>>;
        getCacheStats: () => Promise<ApiResponse<any>>;
      };


      // Project handlers (pure data operations)
      project: {
        // Pure database-driven project operations
        openFolder: () => Promise<ApiResponse<Project>>;
        listProjects: () => Promise<ApiResponse<Project[]>>;
        
        // Claude project import functionality  
        getClaudeProjectImportCandidates: () => Promise<ApiResponse<ClaudeProjectImportCandidate[]>>;
        importClaudeProjects: (claudeProjectIds: string[]) => Promise<ApiResponse<{ imported: number, failed: number }>>;
        
      };

      // Business-oriented workspace operations
      workspace: {
        load: (projectId: string) => Promise<ApiResponse<{
          terminals: any[];
          activeTerminalId: string | null;
          project: Project;
          terminalStates?: Record<string, string>;
        }>>;
        save: (projectId: string, terminalStates?: Record<string, string>) => Promise<ApiResponse<void>>;
      };
    };
  }
}

export {};