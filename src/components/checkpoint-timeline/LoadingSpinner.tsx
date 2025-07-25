/**
 * Simple Loading Spinner Component
 * 
 * A lightweight, practical loading indicator with:
 * - Basic progress indication
 * - Simple cancellation support
 * - Minimal animation
 */

import React from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface LoadingSpinnerProps {
  /** Loading message */
  message?: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Whether to show cancel button */
  showCancel?: boolean;
  /** Cancel callback */
  onCancel?: () => void;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Custom className */
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Loading...',
  progress,
  showCancel = false,
  onCancel,
  size = 'md',
  className
}) => {
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  };

  return (
    <div className={cn('flex flex-col items-center gap-3 p-4', className)}>
      <div className="flex items-center gap-3">
        <Loader2 className={cn(iconSizes[size], 'animate-spin text-primary')} />
        <span className={cn(sizeClasses[size], 'text-foreground')}>{message}</span>
        {showCancel && onCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      {progress !== undefined && (
        <div className="w-full max-w-xs space-y-1">
          <Progress value={progress} className="h-2" />
          <div className="text-xs text-muted-foreground text-center">
            {Math.round(progress)}%
          </div>
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner;