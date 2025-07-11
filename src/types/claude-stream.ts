// Claude stream message types
export interface ClaudeStreamMessage {
  id?: string;
  type: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result' | 'error' | 'result' | 'status';
  subtype?: string;
  content?: string;
  timestamp: string;
  
  // Message-specific fields
  message?: any;
  thinking?: string;
  summary?: string;
  leafUuid?: string;
  uuid?: string;
  session_id?: string;
  model?: string;
  cwd?: string;
  tools?: any[];
  
  // Status and result fields
  result?: any;
  error?: any;
  is_error?: boolean;
  
  // Usage and cost tracking
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens?: number;
    cache_read_tokens?: number;
  };
  cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  
  // Metadata
  metadata?: {
    model?: string;
    tokens?: {
      input: number;
      output: number;
      cache_creation?: number;
      cache_read?: number;
    };
    cost?: number;
    tool_use_id?: string;
    tool_name?: string;
    raw_content?: any;
  };
  
  // Meta fields
  isMeta?: boolean;
  _processingId?: string;
  _processedAt?: string;
  _updatedAt?: string;
}