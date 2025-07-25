/**
 * Simple Async Operation Hook
 * 
 * Provides basic async operation management with:
 * - Loading state tracking
 * - Simple cancellation support
 * - Error handling
 */

import { useState, useCallback, useRef } from 'react';

export interface AsyncOperationState {
  isLoading: boolean;
  error: string | null;
  canCancel: boolean;
}

export const useAsyncOperation = () => {
  const [state, setState] = useState<AsyncOperationState>({
    isLoading: false,
    error: null,
    canCancel: false
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const execute = useCallback(async <T>(
    operation: (signal: AbortSignal) => Promise<T>,
    options: { cancellable?: boolean } = {}
  ): Promise<T | null> => {
    // Cancel any existing operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setState({
      isLoading: true,
      error: null,
      canCancel: options.cancellable ?? false
    });

    try {
      const result = await operation(abortController.signal);
      
      // Only update state if not aborted
      if (!abortController.signal.aborted) {
        setState({
          isLoading: false,
          error: null,
          canCancel: false
        });
        return result;
      }
      return null;
    } catch (error: any) {
      if (!abortController.signal.aborted) {
        setState({
          isLoading: false,
          error: error.message || 'Operation failed',
          canCancel: false
        });
      }
      throw error;
    }
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
      abortControllerRef.current.abort();
      setState({
        isLoading: false,
        error: null,
        canCancel: false
      });
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      canCancel: false
    });
  }, []);

  return {
    ...state,
    execute,
    cancel,
    reset
  };
};

export default useAsyncOperation;