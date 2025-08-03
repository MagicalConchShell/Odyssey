/**
 * API Contract - Single Source of Truth
 * 
 * This file defines the complete IElectronAPI interface that serves as the
 * contract between frontend and backend. All handler implementations must
 * strictly match this interface structure and types.
 */

import { IpcMainInvokeEvent } from 'electron';
import {
  Project,
  ProjectStats,
  Session,
  McpServer,
  McpResponse,
  UsageEntry,
  UsageStats,
  ClaudeCliInfo,
  ClaudeExecutionOptions,
  ClaudeExecutionResult,
  ProjectCreateRequest,
  ProjectUpdateRequest,
  ClaudeProjectImportCandidate
} from './index.js';
import type {
  ProjectWorkspaceMeta
} from './workspace-state';

// Define a unified handler type that all API methods must follow
type ApiHandler<TArgs extends any[] = [], TResult = void> = 
  (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<TResult>;

/**
 * Complete Electron API interface - the single source of truth for all IPC communication
 * All handlers now follow the unified ApiHandler signature with IpcMainInvokeEvent as first parameter.
 */
export interface IElectronAPI {
  // System utilities
  ping: ApiHandler<[], string>;
  getPlatform: ApiHandler<[], string>;
  openExternal: ApiHandler<[string], void>;
  captureWebviewScreenshot: ApiHandler<[string], { path: string }>;

  // Terminal handlers
  terminal: {
    create: ApiHandler<[string, string?, string?], { terminalId: string }>;
    write: ApiHandler<[string, string], void>;
    resize: ApiHandler<[string, number, number], void>;
    close: ApiHandler<[string], void>;
    info: ApiHandler<[string], { isActive: boolean; workingDirectory: string; shell: string }>;
    list: ApiHandler<[], string[]>;
    pause: ApiHandler<[string], void>;
    resume: ApiHandler<[string], void>;
    getState: ApiHandler<[string], any>;
    cwdChanged: ApiHandler<[string, string], void>;
    registerWebContents: ApiHandler<[string], void>;
    updateCleanBuffer: ApiHandler<[string, string[]], void>;
  };

  // Claude CLI handlers
  claudeCli: {
    getBinaryPath: ApiHandler<[], string | null>;
    setBinaryPath: ApiHandler<[string], void>;
    getInfo: ApiHandler<[], ClaudeCliInfo>;
    executeCommand: ApiHandler<[string[], ClaudeExecutionOptions?], ClaudeExecutionResult>;
  };

  // Event listeners
  on?: (channel: string, listener: (...args: any[]) => void) => void;
  removeListener?: (channel: string, listener: (...args: any[]) => void) => void;

  // Settings handlers
  settings: {
    getClaudeSettings: ApiHandler<[], any>;
    saveClaudeSettings: ApiHandler<[any], void>;
  };

  // MCP handlers
  mcp: {
    list: ApiHandler<[], McpServer[]>;
    clearCache: ApiHandler<[], void>;
    add: ApiHandler<[string, string, string?, string[]?, Record<string, string>?, string?, string?], McpResponse>;
    remove: ApiHandler<[string], McpResponse>;
    testConnection: ApiHandler<[string], McpResponse>;
    addFromClaudeDesktop: ApiHandler<[string?], McpResponse>;
    addJson: ApiHandler<[string, string, string?], McpResponse>;
    serve: ApiHandler<[], McpResponse>;
  };

  // Usage analytics handlers
  usage: {
    createEntry: ApiHandler<[Omit<UsageEntry, 'id' | 'created_at'>], UsageEntry>;
    getAllEntries: ApiHandler<[], UsageEntry[]>;
    getStats: ApiHandler<[], UsageStats>;
    getByDateRange: ApiHandler<[string, string], UsageStats>;
    clearCache: ApiHandler<[], void>;
    getCacheStats: ApiHandler<[], any>;
  };

  // Project management handlers (pure data operations)
  projectManagement: {
    // Pure database-driven project management
    openFolder: ApiHandler<[], Project>;
    listProjects: ApiHandler<[], Project[]>;
    createProject: ApiHandler<[ProjectCreateRequest], Project>;
    updateProject: ApiHandler<[string, ProjectUpdateRequest], Project>;
    deleteProject: ApiHandler<[string], boolean>;
    openProject: ApiHandler<[string], Project>;
    
    // Claude project import functionality  
    getClaudeProjectImportCandidates: ApiHandler<[], ClaudeProjectImportCandidate[]>;
    importClaudeProjects: ApiHandler<[string[]], { imported: number, failed: number }>;
    
    // Legacy support
    getProjectSessions: ApiHandler<[string], Session[]>;
    getProjectStats: ApiHandler<[string], ProjectStats>;
  };

  // Business-oriented workspace operations (keeping frontend compatibility)
  workspace: {
    /**
     * 加载一个项目到工作区，这会关闭当前所有终端，并恢复目标项目的所有终端和状态。
     * 这是用户点击"打开项目"时调用的核心方法。
     * @param projectId - 要加载的项目的唯一 ID。
     */
    load: ApiHandler<[projectId: string], {
      project: Project;
      terminals: any[]; // SerializedTerminalInstance[]
      activeTerminalId: string | null;
    }>;

    /**
     * 保存当前活动项目的工作区状态（例如，打开的终端、布局等）。
     * 这个方法可以在关闭窗口或切换项目前自动调用。
     * @param projectId - 要保存的项目的唯一 ID。
     */
    save: ApiHandler<[projectId: string], void>;

    /**
     * 获取所有已知项目的元数据列表，用于在欢迎屏幕上显示项目列表。
     */
    listProjects: ApiHandler<[], ProjectWorkspaceMeta[]>;

    /**
     * 清理那些已经不存在于文件系统上的项目的状态文件。
     */
    cleanupOrphanedStates: ApiHandler<[], number>;
  };
}

// Type utilities for API routing
export type ApiChannel = keyof IElectronAPI;
export type ApiMethod<T extends ApiChannel> = keyof IElectronAPI[T];