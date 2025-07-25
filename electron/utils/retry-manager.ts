/**
 * SOTA Retry Manager with Exponential Backoff
 * 
 * Provides sophisticated retry mechanisms for checkpoint operations with:
 * - Exponential backoff with jitter
 * - Circuit breaker pattern
 * - Contextual error classification
 * - Performance monitoring
 * - Graceful degradation
 */


export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Add jitter to prevent thundering herd (default: true) */
  enableJitter: boolean;
  /** Function to determine if error is retryable */
  isRetryableError?: (error: Error) => boolean;
  /** Context for logging and monitoring */
  context?: string;
  /** Enable performance monitoring */
  enableMonitoring?: boolean;
}

export interface RetryResult<T> {
  /** The successful result */
  result: T;
  /** Number of attempts made */
  attempts: number;
  /** Total time taken in milliseconds */
  totalTime: number;
  /** Whether any retries were performed */
  hadRetries: boolean;
}

export interface CircuitBreakerState {
  /** Number of consecutive failures */
  failures: number;
  /** Timestamp when circuit was last opened */
  lastFailureTime: number;
  /** Current state of the circuit */
  state: 'closed' | 'open' | 'half-open';
  /** Next allowed attempt time when circuit is open */
  nextAttemptTime: number;
}

/**
 * Default retry options with sensible defaults for checkpoint operations
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  enableJitter: true,
  enableMonitoring: true,
  isRetryableError: (error: Error) => {
    // Default retryable errors for checkpoint operations
    const retryablePatterns = [
      /EBUSY/i,           // Resource busy
      /ENOENT/i,          // File not found (temporary)
      /EMFILE/i,          // Too many open files
      /EAGAIN/i,          // Resource temporarily unavailable
      /ETIMEDOUT/i,       // Operation timed out
      /EIO/i,             // I/O error
      /network/i,         // Network errors
      /timeout/i,         // Timeout errors
      /temporary/i,       // Temporary failures
    ];
    
    return retryablePatterns.some(pattern => 
      pattern.test(error.message) || pattern.test(error.name)
    );
  }
};

/**
 * Circuit breakers for different operation types
 */
const circuitBreakers = new Map<string, CircuitBreakerState>();

/**
 * Performance metrics collection
 */
interface PerformanceMetrics {
  operationType: string;
  attempts: number;
  totalTime: number;
  success: boolean;
  timestamp: number;
}

const performanceMetrics: PerformanceMetrics[] = [];
const MAX_METRICS_HISTORY = 1000;

/**
 * Enhanced retry manager with circuit breaker and monitoring
 */
export class RetryManager {
  private options: RetryOptions;

  constructor(options: Partial<RetryOptions> = {}) {
    this.options = { ...DEFAULT_RETRY_OPTIONS, ...options };
  }

  /**
   * Execute operation with sophisticated retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'unknown',
    customOptions?: Partial<RetryOptions>
  ): Promise<RetryResult<T>> {
    const opts = customOptions ? { ...this.options, ...customOptions } : this.options;
    const startTime = Date.now();
    const circuitKey = this.getCircuitKey(operationName, opts.context);
    
    // Check circuit breaker
    if (!this.canAttemptOperation(circuitKey)) {
      throw new Error(`Circuit breaker is open for operation: ${operationName}. Too many recent failures.`);
    }

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < opts.maxAttempts) {
      attempt++;
      
      try {
        const result = await operation();
        const totalTime = Date.now() - startTime;
        
        // Reset circuit breaker on success
        this.recordSuccess(circuitKey);
        
        // Record performance metrics
        if (opts.enableMonitoring) {
          this.recordMetrics({
            operationType: operationName,
            attempts: attempt,
            totalTime,
            success: true,
            timestamp: Date.now()
          });
        }

        return {
          result,
          attempts: attempt,
          totalTime,
          hadRetries: attempt > 1
        };

      } catch (error: any) {
        lastError = error;
        
        // Log attempt failure
        console.warn(`[RetryManager] Attempt ${attempt}/${opts.maxAttempts} failed for ${operationName}:`, error.message);
        
        // Check if error is retryable
        const isRetryable = opts.isRetryableError ? opts.isRetryableError(error) : true;
        
        if (!isRetryable || attempt >= opts.maxAttempts) {
          // Record final failure
          this.recordFailure(circuitKey);
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt, opts);
        console.log(`[RetryManager] Retrying ${operationName} in ${delay}ms (attempt ${attempt + 1}/${opts.maxAttempts})`);
        
        // Wait before retry
        await this.sleep(delay);
      }
    }

    // All attempts failed
    const totalTime = Date.now() - startTime;
    
    // Record performance metrics for failure
    if (opts.enableMonitoring) {
      this.recordMetrics({
        operationType: operationName,
        attempts: attempt,
        totalTime,
        success: false,
        timestamp: Date.now()
      });
    }

    throw new Error(
      `Operation '${operationName}' failed after ${attempt} attempts. Last error: ${lastError?.message}`
    );
  }

  /**
   * Calculate delay with exponential backoff and optional jitter
   */
  private calculateDelay(attempt: number, options: RetryOptions): number {
    const baseDelay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(baseDelay, options.maxDelay);
    
    if (options.enableJitter) {
      // Add ±25% jitter to prevent thundering herd
      const jitterRange = cappedDelay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      return Math.max(0, cappedDelay + jitter);
    }
    
    return cappedDelay;
  }

  /**
   * Generate circuit breaker key
   */
  private getCircuitKey(operationName: string, context?: string): string {
    const contextPart = context ? `-${context}` : '';
    return `${operationName}${contextPart}`;
  }

  /**
   * Check if operation can be attempted based on circuit breaker state
   */
  private canAttemptOperation(circuitKey: string): boolean {
    const circuit = circuitBreakers.get(circuitKey);
    if (!circuit) return true;

    const now = Date.now();

    switch (circuit.state) {
      case 'closed':
        return true;
        
      case 'open':
        if (now >= circuit.nextAttemptTime) {
          // Transition to half-open for testing
          circuit.state = 'half-open';
          return true;
        }
        return false;
        
      case 'half-open':
        return true;
        
      default:
        return true;
    }
  }

  /**
   * Record successful operation
   */
  private recordSuccess(circuitKey: string): void {
    const circuit = circuitBreakers.get(circuitKey);
    if (circuit) {
      // Reset circuit breaker
      circuit.failures = 0;
      circuit.state = 'closed';
    }
  }

  /**
   * Record failed operation
   */
  private recordFailure(circuitKey: string): void {
    let circuit = circuitBreakers.get(circuitKey);
    if (!circuit) {
      circuit = {
        failures: 0,
        lastFailureTime: 0,
        state: 'closed',
        nextAttemptTime: 0
      };
      circuitBreakers.set(circuitKey, circuit);
    }

    circuit.failures++;
    circuit.lastFailureTime = Date.now();

    // Open circuit after 5 consecutive failures
    if (circuit.failures >= 5) {
      circuit.state = 'open';
      // Keep circuit open for 60 seconds
      circuit.nextAttemptTime = Date.now() + 60000;
      console.warn(`[RetryManager] Circuit breaker opened for ${circuitKey} after ${circuit.failures} failures`);
    }
  }

  /**
   * Record performance metrics
   */
  private recordMetrics(metric: PerformanceMetrics): void {
    performanceMetrics.push(metric);
    
    // Keep only recent metrics to prevent memory bloat
    if (performanceMetrics.length > MAX_METRICS_HISTORY) {
      performanceMetrics.splice(0, performanceMetrics.length - MAX_METRICS_HISTORY);
    }
  }

  /**
   * Get performance statistics
   */
  static getPerformanceStats(operationType?: string): {
    totalOperations: number;
    successRate: number;
    averageAttempts: number;
    averageTime: number;
    recentFailures: number;
  } {
    const relevantMetrics = operationType 
      ? performanceMetrics.filter(m => m.operationType === operationType)
      : performanceMetrics;

    if (relevantMetrics.length === 0) {
      return {
        totalOperations: 0,
        successRate: 0,
        averageAttempts: 0,
        averageTime: 0,
        recentFailures: 0
      };
    }

    const successful = relevantMetrics.filter(m => m.success);
    const recentTimeThreshold = Date.now() - 300000; // Last 5 minutes
    const recentFailures = relevantMetrics.filter(m => 
      !m.success && m.timestamp > recentTimeThreshold
    ).length;

    return {
      totalOperations: relevantMetrics.length,
      successRate: successful.length / relevantMetrics.length,
      averageAttempts: relevantMetrics.reduce((sum, m) => sum + m.attempts, 0) / relevantMetrics.length,
      averageTime: relevantMetrics.reduce((sum, m) => sum + m.totalTime, 0) / relevantMetrics.length,
      recentFailures
    };
  }

  /**
   * Reset circuit breaker for specific operation
   */
  static resetCircuitBreaker(operationName: string, context?: string): void {
    const circuitKey = context ? `${operationName}-${context}` : operationName;
    circuitBreakers.delete(circuitKey);
    console.log(`[RetryManager] Reset circuit breaker for ${circuitKey}`);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Convenience function for simple retry operations
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string = 'operation',
  options?: Partial<RetryOptions>
): Promise<T> {
  const retryManager = new RetryManager(options);
  const result = await retryManager.execute(operation, operationName, options);
  return result.result;
}

/**
 * Specialized retry options for different checkpoint operations
 */
export const CHECKPOINT_RETRY_OPTIONS = {
  // For file I/O operations
  fileOperations: {
    maxAttempts: 4,
    initialDelay: 500,
    maxDelay: 15000,
    context: 'file-io'
  } as Partial<RetryOptions>,

  // For database operations
  databaseOperations: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    context: 'database'
  } as Partial<RetryOptions>,

  // For heavy operations like garbage collection
  heavyOperations: {
    maxAttempts: 2,
    initialDelay: 2000,
    maxDelay: 30000,
    context: 'heavy-ops'
  } as Partial<RetryOptions>,

  // For network-like operations
  networkOperations: {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 20000,
    backoffMultiplier: 1.5,
    context: 'network'
  } as Partial<RetryOptions>
};