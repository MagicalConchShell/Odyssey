// Custom hook for standardized async operation handling with loading, error, and data states

import { useState, useCallback } from 'react';

interface AsyncOperationState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface AsyncOperationReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (...args: any[]) => Promise<T | null>;
  reset: () => void;
}

export const useAsyncOperation = <T>(
  operation: (...args: any[]) => Promise<T>,
  options?: {
    onSuccess?: (data: T) => void;
    onError?: (error: string) => void;
    initialData?: T;
  }
): AsyncOperationReturn<T> => {
  const [state, setState] = useState<AsyncOperationState<T>>({
    data: options?.initialData || null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (...args: any[]): Promise<T | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const result = await operation(...args);
      setState({ data: result, loading: false, error: null });
      
      if (options?.onSuccess) {
        options.onSuccess(result);
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      
      if (options?.onError) {
        options.onError(errorMessage);
      }
      
      return null;
    }
  }, [operation, options]);

  const reset = useCallback(() => {
    setState({
      data: options?.initialData || null,
      loading: false,
      error: null,
    });
  }, [options?.initialData]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    execute,
    reset,
  };
};