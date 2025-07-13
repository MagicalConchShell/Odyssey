import { IpcMain } from 'electron';
import { ChildProcess } from 'child_process';
import { registerHandler } from './base-handler.js';

/**
 * AI-neutral interaction handler
 * Provides a unified interface for different AI providers
 */

// AI Provider types
export type AIProvider = 'anthropic' | 'openai' | 'google' | 'local' | 'custom';
export type AIModel = 'claude-sonnet' | 'claude-opus' | 'gpt-4' | 'gpt-3.5-turbo' | 'gemini-pro' | 'gemini-pro-vision' | 'local-model';

// AI interaction types
export interface AIInteractionRequest {
  provider: AIProvider;
  model: AIModel;
  prompt: string;
  projectPath: string;
  sessionId?: string;
  context?: {
    conversationHistory?: any[];
    projectContext?: any;
    systemPrompt?: string;
  };
  options?: {
    temperature?: number;
    maxTokens?: number;
    streaming?: boolean;
    tools?: string[];
  };
}

export interface AIInteractionResponse {
  success: boolean;
  sessionId?: string;
  response?: {
    content: string;
    tokens?: {
      input: number;
      output: number;
      total: number;
    };
    model: string;
    provider: string;
    responseTime: number;
  };
  error?: string;
}

export interface AIStreamEvent {
  type: 'start' | 'content' | 'tool_call' | 'complete' | 'error';
  data?: any;
  sessionId: string;
}

/**
 * Process registry for tracking active AI processes
 */
const activeAIProcesses = new Map<string, ChildProcess>();

/**
 * Session registry for tracking AI sessions
 */
const aiSessions = new Map<string, {
  provider: AIProvider;
  model: AIModel;
  projectPath: string;
  conversationHistory: any[];
  createdAt: Date;
  lastActiveAt: Date;
}>();


/**
 * Generate unique session ID
 */
function generateSessionId(): string {
  return `ai_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}


/**
 * Start a new AI interaction session
 */
async function startAISession(request: AIInteractionRequest): Promise<AIInteractionResponse> {
  const sessionId = generateSessionId();
  
  try {
    console.log(`🤖 Starting AI session ${sessionId} with ${request.provider}/${request.model}`);
    
    // const providerConfig = getProviderConfig(request.provider);
    
    // Store session info
    aiSessions.set(sessionId, {
      provider: request.provider,
      model: request.model,
      projectPath: request.projectPath,
      conversationHistory: request.context?.conversationHistory || [],
      createdAt: new Date(),
      lastActiveAt: new Date()
    });
    
    // Route to appropriate AI provider
    let response: AIInteractionResponse;
    
    switch (request.provider) {
      case 'anthropic':
        response = await handleAnthropicRequest(request, sessionId);
        break;
      case 'google':
        response = await handleGoogleRequest(request, sessionId);
        break;
      default:
        throw new Error(`Unsupported AI provider: ${request.provider}. Supported providers: 'anthropic', 'google'`);
    }
    
    return {
      ...response,
      sessionId
    };
    
  } catch (error) {
    console.error(`Failed to start AI session:`, error);
    // Clean up session on error
    aiSessions.delete(sessionId);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Resume an existing AI session
 */
async function resumeAISession(sessionId: string, request: AIInteractionRequest): Promise<AIInteractionResponse> {
  const session = aiSessions.get(sessionId);
  
  if (!session) {
    return {
      success: false,
      error: 'AI session not found'
    };
  }
  
  try {
    console.log(`🔄 Resuming AI session ${sessionId}`);
    
    // Update session
    session.lastActiveAt = new Date();
    session.conversationHistory.push({
      role: 'user',
      content: request.prompt,
      timestamp: new Date()
    });
    
    // Route to appropriate AI provider
    let response: AIInteractionResponse;
    
    switch (session.provider) {
      case 'anthropic':
        response = await handleAnthropicRequest(request, sessionId);
        break;
      case 'google':
        response = await handleGoogleRequest(request, sessionId);
        break;
      default:
        throw new Error(`Unsupported AI provider: ${session.provider}. Supported providers: 'anthropic', 'google'`);
    }
    
    // Update conversation history with response
    if (response.success && response.response) {
      session.conversationHistory.push({
        role: 'assistant',
        content: response.response.content,
        timestamp: new Date(),
        tokens: response.response.tokens
      });
    }
    
    return {
      ...response,
      sessionId
    };
    
  } catch (error) {
    console.error(`Failed to resume AI session:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Handle Anthropic (Claude) requests
 */
async function handleAnthropicRequest(_request: AIInteractionRequest, _sessionId: string): Promise<AIInteractionResponse> {
  // const startTime = Date.now();
  
  try {
    // Direct Anthropic Claude integration would go here
    // For now, return a placeholder indicating the integration is needed
    return {
      success: false,
      error: 'Anthropic Claude integration is not yet implemented. Please use the existing Claude handler.'
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Anthropic request failed'
    };
  }
}

/**
 * Handle Google (Gemini) requests
 */
async function handleGoogleRequest(_request: AIInteractionRequest, _sessionId: string): Promise<AIInteractionResponse> {
  // const startTime = Date.now();
  
  try {
    // Google Gemini integration would go here
    // This would include:
    // 1. Setting up Google AI Studio or Vertex AI client
    // 2. Formatting the request for Gemini API
    // 3. Handling streaming responses if needed
    // 4. Converting response to our standard format
    
    return {
      success: false,
      error: 'Google Gemini integration is not yet implemented. This feature is coming soon.'
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Google Gemini request failed'
    };
  }
}





/**
 * Cancel an AI session
 */
async function cancelAISession(sessionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = aiSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    
    // Cancel any active process
    const process = activeAIProcesses.get(sessionId);
    if (process && !process.killed) {
      process.kill('SIGTERM');
      activeAIProcesses.delete(sessionId);
    }
    
    // Remove session
    aiSessions.delete(sessionId);
    
    console.log(`🛑 AI session ${sessionId} cancelled`);
    return { success: true };
  } catch (error) {
    console.error(`Failed to cancel AI session:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}

/**
 * Get session information
 */
async function getAISessionInfo(sessionId: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = aiSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    
    return {
      success: true,
      data: {
        sessionId,
        provider: session.provider,
        model: session.model,
        projectPath: session.projectPath,
        conversationLength: session.conversationHistory.length,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}

/**
 * List all active AI sessions
 */
async function listAISessions(): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const sessions = Array.from(aiSessions.entries()).map(([sessionId, session]) => ({
      sessionId,
      provider: session.provider,
      model: session.model,
      projectPath: session.projectPath,
      conversationLength: session.conversationHistory.length,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt
    }));
    
    return { success: true, data: sessions };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}

/**
 * Cleanup all AI sessions
 */
export function cleanupAllAISessions(): void {
  console.log(`🧹 Cleaning up ${aiSessions.size} AI sessions...`);
  
  // Cancel all active processes
  for (const [sessionId, process] of activeAIProcesses) {
    try {
      if (process.pid && !process.killed) {
        console.log(`Terminating AI process for session ${sessionId} (PID: ${process.pid})`);
        process.kill('SIGTERM');
      }
    } catch (error) {
      console.error(`Failed to terminate AI process for session ${sessionId}:`, error);
    }
  }
  
  // Clear all sessions
  activeAIProcesses.clear();
  aiSessions.clear();
}

/**
 * Register all AI interaction related IPC handlers
 */
export function setupAIInteractionHandlers(ipcMain: IpcMain): void {
  // Start new AI session
  registerHandler(
    ipcMain,
    'ai-start-session',
    startAISession,
    { requiresValidation: true, timeout: 60000 }
  );
  
  // Resume AI session
  registerHandler(
    ipcMain,
    'ai-resume-session',
    async (sessionId: string, request: AIInteractionRequest) => {
      return await resumeAISession(sessionId, request);
    },
    { requiresValidation: true, timeout: 60000 }
  );
  
  // Cancel AI session
  registerHandler(
    ipcMain,
    'ai-cancel-session',
    cancelAISession,
    { requiresValidation: true, timeout: 10000 }
  );
  
  // Get session info
  registerHandler(
    ipcMain,
    'ai-get-session-info',
    getAISessionInfo,
    { requiresValidation: true, timeout: 5000 }
  );
  
  // List sessions
  registerHandler(
    ipcMain,
    'ai-list-sessions',
    listAISessions,
    { requiresValidation: false, timeout: 5000 }
  );
}