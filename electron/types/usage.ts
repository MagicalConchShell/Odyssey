/**
 * Usage Analytics and Statistics Types
 */

/**
 * Individual usage entry for database storage
 */
export interface UsageEntry {
  id?: number;
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost: number;
  session_id: string;
  project_path: string;
}

/**
 * Aggregated usage statistics
 */
export interface UsageStats {
  total_cost: number;
  total_sessions: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  by_model: ModelUsageStats[];
  by_project: ProjectUsageStats[];
  by_date: DateUsageStats[];
}

/**
 * Usage statistics aggregated by model
 */
export interface ModelUsageStats {
  model: string;
  total_cost: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  session_count: number;
}

/**
 * Usage statistics aggregated by project
 */
export interface ProjectUsageStats {
  project_path: string;
  total_cost: number;
  total_tokens: number;
  session_count: number;
}

/**
 * Usage statistics aggregated by date
 */
export interface DateUsageStats {
  date: string;
  total_cost: number;
  total_tokens: number;
  models_used: string[];
}