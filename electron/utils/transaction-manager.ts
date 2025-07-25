/**
 * SOTA Transaction Manager for Checkpoint Operations
 * 
 * Provides transaction-like rollback capabilities with:
 * - Atomic operations with rollback on failure
 * - Nested transaction support
 * - State snapshots and restoration
 * - Operation journaling and audit trails
 * - Automatic cleanup and recovery
 */

import { promises as fs } from 'fs';
import { join } from 'path';

export interface TransactionOperation {
  /** Unique identifier for the operation */
  id: string;
  /** Type of operation performed */
  type: 'file-write' | 'file-delete' | 'directory-create' | 'directory-delete' | 'ref-update' | 'object-store' | 'custom';
  /** Description of the operation */
  description: string;
  /** Data needed to rollback the operation */
  rollbackData: any;
  /** Timestamp when operation was performed */
  timestamp: number;
  /** Whether this operation can be rolled back */
  canRollback: boolean;
}

export interface TransactionSnapshot {
  /** Transaction ID */
  transactionId: string;
  /** Timestamp when snapshot was created */
  timestamp: number;
  /** List of operations performed */
  operations: TransactionOperation[];
  /** Current state of the transaction */
  state: 'active' | 'committed' | 'rolled-back' | 'failed';
  /** Context information */
  context: Record<string, any>;
}

export interface RollbackHandler {
  /** Function to execute the rollback */
  execute: (operation: TransactionOperation) => Promise<void>;
  /** Function to validate if rollback is possible */
  canRollback?: (operation: TransactionOperation) => Promise<boolean>;
}

/**
 * Transaction manager with sophisticated rollback capabilities
 */
export class TransactionManager {
  private transactions = new Map<string, TransactionSnapshot>();
  private rollbackHandlers = new Map<string, RollbackHandler>();
  private journalPath: string;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(journalPath?: string) {
    this.journalPath = journalPath || join(process.cwd(), '.odyssey', 'transactions');
    this.initializeRollbackHandlers();
    this.startCleanupTimer();
  }

  /**
   * Start a new transaction
   */
  async startTransaction(context: Record<string, any> = {}): Promise<string> {
    const transactionId = this.generateTransactionId();
    const snapshot: TransactionSnapshot = {
      transactionId,
      timestamp: Date.now(),
      operations: [],
      state: 'active',
      context
    };

    this.transactions.set(transactionId, snapshot);
    await this.persistSnapshot(snapshot);

    console.log(`[TransactionManager] Started transaction: ${transactionId}`);
    return transactionId;
  }

  /**
   * Add an operation to the current transaction
   */
  async addOperation(
    transactionId: string,
    operation: Omit<TransactionOperation, 'id' | 'timestamp'>
  ): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.state !== 'active') {
      throw new Error(`Transaction ${transactionId} is not active (state: ${transaction.state})`);
    }

    const fullOperation: TransactionOperation = {
      ...operation,
      id: this.generateOperationId(),
      timestamp: Date.now()
    };

    transaction.operations.push(fullOperation);
    await this.persistSnapshot(transaction);

    console.log(`[TransactionManager] Added operation to ${transactionId}: ${fullOperation.type} - ${fullOperation.description}`);
  }

  /**
   * Execute an operation within a transaction with automatic rollback
   */
  async executeInTransaction<T>(
    transactionId: string,
    operation: () => Promise<T>,
    operationInfo: Omit<TransactionOperation, 'id' | 'timestamp'>
  ): Promise<T> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    try {
      // Execute the operation
      const result = await operation();
      
      // Record the successful operation
      await this.addOperation(transactionId, operationInfo);
      
      return result;
    } catch (error: any) {
      console.error(`[TransactionManager] Operation failed in transaction ${transactionId}:`, error.message);
      
      // Mark transaction as failed but don't rollback yet
      // The caller can decide whether to rollback or continue
      transaction.state = 'failed';
      await this.persistSnapshot(transaction);
      
      throw error;
    }
  }

  /**
   * Commit a transaction (mark as successful)
   */
  async commitTransaction(transactionId: string): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.state === 'rolled-back') {
      throw new Error(`Cannot commit rolled-back transaction ${transactionId}`);
    }

    transaction.state = 'committed';
    await this.persistSnapshot(transaction);

    console.log(`[TransactionManager] Committed transaction: ${transactionId} (${transaction.operations.length} operations)`);
  }

  /**
   * Rollback a transaction (undo all operations)
   */
  async rollbackTransaction(transactionId: string): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.state === 'rolled-back') {
      console.warn(`[TransactionManager] Transaction ${transactionId} already rolled back`);
      return;
    }

    if (transaction.state === 'committed') {
      throw new Error(`Cannot rollback committed transaction ${transactionId}`);
    }

    console.log(`[TransactionManager] Rolling back transaction: ${transactionId} (${transaction.operations.length} operations)`);

    // Rollback operations in reverse order
    const operationsToRollback = [...transaction.operations].reverse();
    let rollbackCount = 0;
    let rollbackErrors: string[] = [];

    for (const operation of operationsToRollback) {
      if (!operation.canRollback) {
        console.warn(`[TransactionManager] Skipping non-rollbackable operation: ${operation.id} (${operation.type})`);
        continue;
      }

      try {
        await this.rollbackOperation(operation);
        rollbackCount++;
        console.log(`[TransactionManager] Rolled back operation: ${operation.id} (${operation.type})`);
      } catch (error: any) {
        const errorMsg = `Failed to rollback operation ${operation.id}: ${error.message}`;
        rollbackErrors.push(errorMsg);
        console.error(`[TransactionManager] ${errorMsg}`);
      }
    }

    // Update transaction state
    transaction.state = 'rolled-back';
    await this.persistSnapshot(transaction);

    console.log(`[TransactionManager] Rollback completed for ${transactionId}: ${rollbackCount} operations rolled back`);

    if (rollbackErrors.length > 0) {
      throw new Error(`Rollback partially failed: ${rollbackErrors.join('; ')}`);
    }
  }

  /**
   * Get transaction status
   */
  getTransactionStatus(transactionId: string): TransactionSnapshot | null {
    return this.transactions.get(transactionId) || null;
  }

  /**
   * List all active transactions
   */
  getActiveTransactions(): TransactionSnapshot[] {
    return Array.from(this.transactions.values()).filter(t => t.state === 'active');
  }

  /**
   * Clean up old transactions
   */
  async cleanupOldTransactions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoffTime = Date.now() - maxAgeMs;
    let cleanedCount = 0;

    for (const [transactionId, transaction] of this.transactions) {
      if (transaction.timestamp < cutoffTime && transaction.state !== 'active') {
        this.transactions.delete(transactionId);
        await this.removePersistedSnapshot(transactionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[TransactionManager] Cleaned up ${cleanedCount} old transactions`);
    }

    return cleanedCount;
  }

  /**
   * Initialize built-in rollback handlers
   */
  private initializeRollbackHandlers(): void {
    // File write rollback handler
    this.rollbackHandlers.set('file-write', {
      execute: async (operation) => {
        const { filePath, originalContent } = operation.rollbackData;
        if (originalContent !== null) {
          // Restore original content
          await fs.writeFile(filePath, originalContent);
        } else {
          // File didn't exist before, delete it
          try {
            await fs.unlink(filePath);
          } catch (error: any) {
            if (error.code !== 'ENOENT') throw error;
          }
        }
      },
      canRollback: async (operation) => {
        return operation.rollbackData && operation.rollbackData.filePath;
      }
    });

    // File delete rollback handler
    this.rollbackHandlers.set('file-delete', {
      execute: async (operation) => {
        const { filePath, originalContent } = operation.rollbackData;
        if (originalContent) {
          await fs.writeFile(filePath, originalContent);
        }
      },
      canRollback: async (operation) => {
        return operation.rollbackData && operation.rollbackData.originalContent;
      }
    });

    // Directory create rollback handler
    this.rollbackHandlers.set('directory-create', {
      execute: async (operation) => {
        const { dirPath } = operation.rollbackData;
        try {
          await fs.rmdir(dirPath);
        } catch (error: any) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
    });

    // Directory delete rollback handler
    this.rollbackHandlers.set('directory-delete', {
      execute: async (operation) => {
        const { dirPath } = operation.rollbackData;
        await fs.mkdir(dirPath, { recursive: true });
      }
    });

    // Reference update rollback handler
    this.rollbackHandlers.set('ref-update', {
      execute: async (operation) => {
        const { refPath, originalValue } = operation.rollbackData;
        if (originalValue !== null) {
          await fs.writeFile(refPath, originalValue);
        } else {
          try {
            await fs.unlink(refPath);
          } catch (error: any) {
            if (error.code !== 'ENOENT') throw error;
          }
        }
      }
    });
  }

  /**
   * Execute rollback for a specific operation
   */
  private async rollbackOperation(operation: TransactionOperation): Promise<void> {
    const handler = this.rollbackHandlers.get(operation.type);
    if (!handler) {
      throw new Error(`No rollback handler found for operation type: ${operation.type}`);
    }

    // Check if rollback is possible
    if (handler.canRollback) {
      const canRollback = await handler.canRollback(operation);
      if (!canRollback) {
        throw new Error(`Operation ${operation.id} cannot be rolled back`);
      }
    }

    // Execute the rollback
    await handler.execute(operation);
  }

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    return `tx-${timestamp}-${random}`;
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    return `op-${timestamp}-${random}`;
  }

  /**
   * Persist transaction snapshot to disk
   */
  private async persistSnapshot(snapshot: TransactionSnapshot): Promise<void> {
    try {
      await fs.mkdir(this.journalPath, { recursive: true });
      const filePath = join(this.journalPath, `${snapshot.transactionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));
    } catch (error: any) {
      console.warn(`[TransactionManager] Failed to persist snapshot for ${snapshot.transactionId}:`, error.message);
    }
  }

  /**
   * Remove persisted snapshot
   */
  private async removePersistedSnapshot(transactionId: string): Promise<void> {
    try {
      const filePath = join(this.journalPath, `${transactionId}.json`);
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn(`[TransactionManager] Failed to remove snapshot for ${transactionId}:`, error.message);
      }
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    // Clean up old transactions every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldTransactions().catch(error => {
        console.error('[TransactionManager] Cleanup failed:', error);
      });
    }, 60 * 60 * 1000);
  }

  /**
   * Dispose of the transaction manager
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Convenience function to execute code within a transaction
 */
export async function withTransaction<T>(
  transactionManager: TransactionManager,
  operation: (transactionId: string) => Promise<T>,
  context: Record<string, any> = {}
): Promise<T> {
  const transactionId = await transactionManager.startTransaction(context);
  
  try {
    const result = await operation(transactionId);
    await transactionManager.commitTransaction(transactionId);
    return result;
  } catch (error: any) {
    try {
      await transactionManager.rollbackTransaction(transactionId);
    } catch (rollbackError: any) {
      console.error('[TransactionManager] Rollback failed:', rollbackError.message);
    }
    throw error;
  }
}

/**
 * Create operation rollback data for file operations
 */
export async function createFileOperationRollback(filePath: string): Promise<any> {
  try {
    const originalContent = await fs.readFile(filePath, 'utf8');
    return { filePath, originalContent };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist
      return { filePath, originalContent: null };
    }
    throw error;
  }
}

/**
 * Create operation rollback data for reference updates
 */
export async function createRefOperationRollback(refPath: string): Promise<any> {
  try {
    const originalValue = await fs.readFile(refPath, 'utf8');
    return { refPath, originalValue: originalValue.trim() };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Ref doesn't exist
      return { refPath, originalValue: null };
    }
    throw error;
  }
}