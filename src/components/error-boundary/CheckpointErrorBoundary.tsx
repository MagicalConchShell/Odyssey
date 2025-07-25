/**
 * SOTA Enhanced Error Boundary for Checkpoint Operations
 * 
 * Provides sophisticated error handling with:
 * - Contextual error categorization
 * - Automated recovery suggestions
 * - User-friendly troubleshooting guides
 * - Performance monitoring and reporting
 * - Graceful degradation strategies
 */

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Settings, HelpCircle, Bug, Zap, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface CheckpointError extends Error {
  code?: string;
  context?: Record<string, any>;
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  recoverable?: boolean;
  timestamp?: number;
}

export type ErrorCategory = 
  | 'network'
  | 'filesystem' 
  | 'permission'
  | 'storage'
  | 'corruption'
  | 'resource'
  | 'validation'
  | 'unknown';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RecoveryAction {
  id: string;
  label: string;
  description: string;
  action: () => Promise<void>;
  icon: React.ComponentType<{ className?: string }>;
  severity: 'safe' | 'caution' | 'destructive';
  automated?: boolean;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: CheckpointError | null;
  errorId: string | null;
  recoveryActions: RecoveryAction[];
  isRecovering: boolean;
  showTechnicalDetails: boolean;
}

interface CheckpointErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: CheckpointError, errorInfo: React.ErrorInfo) => void;
  fallbackComponent?: React.ComponentType<{ error: CheckpointError; reset: () => void }>;
}

/**
 * Enhanced error boundary with contextual recovery
 */
export class CheckpointErrorBoundary extends Component<CheckpointErrorBoundaryProps, ErrorBoundaryState> {
  private errorAnalyzer: ErrorAnalyzer;

  constructor(props: CheckpointErrorBoundaryProps) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorId: null,
      recoveryActions: [],
      isRecovering: false,
      showTechnicalDetails: false
    };

    this.errorAnalyzer = new ErrorAnalyzer();
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error: error as CheckpointError,
      errorId: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const enhancedError = this.errorAnalyzer.analyzeError(error, errorInfo);
    const recoveryActions = this.errorAnalyzer.generateRecoveryActions(enhancedError);

    this.setState({
      error: enhancedError,
      recoveryActions
    });

    // Report error to monitoring system
    this.reportError(enhancedError, errorInfo);

    // Call custom error handler
    if (this.props.onError) {
      this.props.onError(enhancedError, errorInfo);
    }
  }

  private reportError = async (error: CheckpointError, errorInfo: React.ErrorInfo) => {
    try {
      // Report to usage analytics if available
      if (window.electronAPI?.usage) {
        await window.electronAPI.usage.createEntry({
          feature: 'error-boundary',
          action: 'error-caught',
          metadata: {
            errorId: this.state.errorId,
            errorMessage: error.message,
            errorCategory: error.category,
            errorSeverity: error.severity,
            stackTrace: error.stack?.substring(0, 500), // Truncate for storage
            componentStack: errorInfo.componentStack?.substring(0, 500)
          }
        });
      }
    } catch (reportError) {
      console.warn('Failed to report error to analytics:', reportError);
    }
  };

  private handleRecoveryAction = async (action: RecoveryAction) => {
    this.setState({ isRecovering: true });

    try {
      await action.action();
      
      // If recovery was successful, reset the error boundary
      this.setState({
        hasError: false,
        error: null,
        errorId: null,
        recoveryActions: [],
        isRecovering: false
      });

      // Report successful recovery
      if (window.electronAPI?.usage) {
        await window.electronAPI.usage.createEntry({
          feature: 'error-boundary',
          action: 'recovery-success',
          metadata: {
            errorId: this.state.errorId,
            recoveryAction: action.id
          }
        });
      }
    } catch (recoveryError: any) {
      console.error('Recovery action failed:', recoveryError);
      
      // Report failed recovery
      if (window.electronAPI?.usage) {
        await window.electronAPI.usage.createEntry({
          feature: 'error-boundary',
          action: 'recovery-failed',
          metadata: {
            errorId: this.state.errorId,
            recoveryAction: action.id,
            recoveryErrorMessage: recoveryError.message
          }
        });
      }
    } finally {
      this.setState({ isRecovering: false });
    }
  };

  private resetErrorBoundary = () => {
    this.setState({
      hasError: false,
      error: null,
      errorId: null,
      recoveryActions: [],
      isRecovering: false,
      showTechnicalDetails: false
    });
  };

  private toggleTechnicalDetails = () => {
    this.setState(prev => ({ showTechnicalDetails: !prev.showTechnicalDetails }));
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallbackComponent) {
      return <this.props.fallbackComponent error={this.state.error!} reset={this.resetErrorBoundary} />;
    }

    const { error, recoveryActions, isRecovering } = this.state;

    if (!error) {
      return <div>An unknown error occurred</div>;
    }

    return (
      <div className="min-h-[400px] flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${this.getSeverityStyles(error.severity).bg}`}>
                <AlertTriangle className={`h-5 w-5 ${this.getSeverityStyles(error.severity).text}`} />
              </div>
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2">
                  Checkpoint Operation Failed
                  <Badge variant="outline">{error.category}</Badge>
                </CardTitle>
                <CardDescription>
                  {this.getErrorDescription(error)}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Error Message */}
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="font-medium">
                {error.message}
              </AlertDescription>
            </Alert>

            {/* Recovery Actions */}
            {recoveryActions.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Recovery Options
                </h4>
                <div className="grid gap-2">
                  {recoveryActions.map((action) => (
                    <Button
                      key={action.id}
                      variant={action.severity === 'destructive' ? 'destructive' : 
                              action.severity === 'caution' ? 'outline' : 'default'}
                      onClick={() => this.handleRecoveryAction(action)}
                      disabled={isRecovering}
                      className="justify-start h-auto p-3"
                    >
                      <action.icon className="h-4 w-4 mr-3 flex-shrink-0" />
                      <div className="text-left">
                        <div className="font-medium">{action.label}</div>
                        <div className="text-xs opacity-70">{action.description}</div>
                      </div>
                      {action.automated && (
                        <Badge variant="secondary" className="ml-auto">Auto</Badge>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Troubleshooting Guide */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4" />
                    Troubleshooting Guide
                  </span>
                  <span className="text-xs">Click to expand</span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="text-sm space-y-2 text-muted-foreground">
                  {this.getTroubleshootingSteps(error).map((step, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Technical Details */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between"
                  onClick={this.toggleTechnicalDetails}
                >
                  <span className="flex items-center gap-2">
                    <Bug className="h-4 w-4" />
                    Technical Details
                  </span>
                  <span className="text-xs">For developers</span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="space-y-2">
                  <div className="text-xs space-y-1">
                    <div><strong>Error ID:</strong> {this.state.errorId}</div>
                    <div><strong>Timestamp:</strong> {new Date(error.timestamp || Date.now()).toISOString()}</div>
                    <div><strong>Category:</strong> {error.category}</div>
                    <div><strong>Severity:</strong> {error.severity}</div>
                    <div><strong>Recoverable:</strong> {error.recoverable ? 'Yes' : 'No'}</div>
                  </div>
                  {error.stack && (
                    <div className="bg-muted p-2 rounded text-xs font-mono overflow-auto max-h-32">
                      {error.stack}
                    </div>
                  )}
                  {error.context && Object.keys(error.context).length > 0 && (
                    <div className="bg-muted p-2 rounded text-xs">
                      <strong>Context:</strong>
                      <pre className="mt-1 overflow-auto">
                        {JSON.stringify(error.context, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>

          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={this.resetErrorBoundary}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
              <Button variant="ghost" size="sm">
                <HelpCircle className="h-4 w-4 mr-2" />
                Help
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    );
  }

  private getSeverityStyles(severity?: ErrorSeverity) {
    switch (severity) {
      case 'critical':
        return { bg: 'bg-red-100 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400' };
      case 'high':
        return { bg: 'bg-orange-100 dark:bg-orange-900/20', text: 'text-orange-600 dark:text-orange-400' };
      case 'medium':
        return { bg: 'bg-yellow-100 dark:bg-yellow-900/20', text: 'text-yellow-600 dark:text-yellow-400' };
      case 'low':
        return { bg: 'bg-blue-100 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400' };
      default:
        return { bg: 'bg-gray-100 dark:bg-gray-900/20', text: 'text-gray-600 dark:text-gray-400' };
    }
  }

  private getErrorDescription(error: CheckpointError): string {
    switch (error.category) {
      case 'network':
        return 'A network connectivity issue prevented the operation from completing.';
      case 'filesystem':
        return 'A file system error occurred while accessing project files.';
      case 'permission':
        return 'Insufficient permissions to perform the requested operation.';
      case 'storage':
        return 'A storage-related error occurred in the checkpoint system.';
      case 'corruption':
        return 'Data corruption was detected in the checkpoint storage.';
      case 'resource':
        return 'System resources were insufficient to complete the operation.';
      case 'validation':
        return 'The operation failed due to invalid data or parameters.';
      default:
        return 'An unexpected error occurred during the checkpoint operation.';
    }
  }

  private getTroubleshootingSteps(error: CheckpointError): string[] {
    const commonSteps = [
      'Check that you have sufficient disk space available',
      'Ensure no other applications are using the project files',
      'Verify your system has adequate memory available'
    ];

    switch (error.category) {
      case 'filesystem':
        return [
          'Check file and directory permissions',
          'Verify the project path exists and is accessible',
          'Ensure no files are locked by other applications',
          ...commonSteps
        ];
      case 'permission':
        return [
          'Run the application with appropriate permissions',
          'Check file and directory ownership',
          'Verify write access to the project directory',
          'Consider running as administrator if necessary'
        ];
      case 'storage':
        return [
          'Check available disk space in the checkpoint storage directory',
          'Verify the storage directory is writable',
          'Consider running garbage collection to free up space',
          'Check for storage device errors'
        ];
      case 'corruption':
        return [
          'Try running the built-in repair tools',
          'Check for filesystem errors on the storage device',
          'Consider restoring from a backup if available',
          'Verify the integrity of your storage device'
        ];
      case 'resource':
        return [
          'Close unnecessary applications to free up memory',
          'Wait for other system processes to complete',
          'Consider restarting the application',
          'Check system performance and resource usage'
        ];
      default:
        return commonSteps;
    }
  }
}

/**
 * Error analysis and recovery action generation
 */
class ErrorAnalyzer {
  analyzeError(error: Error, _errorInfo?: React.ErrorInfo): CheckpointError {
    const enhancedError = error as CheckpointError;
    
    // Set timestamp if not already set
    if (!enhancedError.timestamp) {
      enhancedError.timestamp = Date.now();
    }

    // Categorize the error
    if (!enhancedError.category) {
      enhancedError.category = this.categorizeError(error);
    }

    // Determine severity
    if (!enhancedError.severity) {
      enhancedError.severity = this.determineSeverity(error);
    }

    // Determine if recoverable
    if (enhancedError.recoverable === undefined) {
      enhancedError.recoverable = this.isRecoverable(error);
    }

    return enhancedError;
  }

  generateRecoveryActions(error: CheckpointError): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    // Always provide a refresh option
    actions.push({
      id: 'refresh-timeline',
      label: 'Refresh Timeline',
      description: 'Reload the checkpoint timeline to get the latest state',
      action: async () => {
        window.location.reload();
      },
      icon: RefreshCw,
      severity: 'safe',
      automated: false
    });

    // Category-specific recovery actions
    switch (error.category) {
      case 'storage':
        actions.push({
          id: 'garbage-collect',
          label: 'Clean Up Storage',
          description: 'Run garbage collection to free up storage space',
          action: async () => {
            // Implementation would call garbage collection
            console.log('Running garbage collection...');
          },
          icon: Zap,
          severity: 'safe',
          automated: true
        });
        break;

      case 'corruption':
        actions.push({
          id: 'repair-storage',
          label: 'Repair Storage',
          description: 'Attempt to repair corrupted checkpoint data',
          action: async () => {
            // Implementation would run repair tools
            console.log('Running storage repair...');
          },
          icon: Settings,
          severity: 'caution',
          automated: false
        });
        break;

      case 'resource':
        actions.push({
          id: 'restart-app',
          label: 'Restart Application',
          description: 'Restart to free up system resources',
          action: async () => {
            // Implementation would restart the app
            if (window.electronAPI) {
              // Request app restart through electron
              console.log('Requesting application restart...');
            }
          },
          icon: RefreshCw,
          severity: 'safe',
          automated: false
        });
        break;
    }

    return actions;
  }

  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      return 'network';
    }
    
    if (message.includes('permission') || message.includes('access denied') || message.includes('eacces')) {
      return 'permission';
    }
    
    if (message.includes('enoent') || message.includes('file') || message.includes('directory') || message.includes('ebusy')) {
      return 'filesystem';
    }
    
    if (message.includes('storage') || message.includes('disk') || message.includes('space')) {
      return 'storage';
    }
    
    if (message.includes('corrupt') || message.includes('invalid') || message.includes('malformed')) {
      return 'corruption';
    }
    
    if (message.includes('memory') || message.includes('resource') || message.includes('emfile')) {
      return 'resource';
    }
    
    if (message.includes('validation') || message.includes('parameter') || message.includes('argument')) {
      return 'validation';
    }

    return 'unknown';
  }

  private determineSeverity(error: Error): ErrorSeverity {
    const message = error.message.toLowerCase();
    
    if (message.includes('critical') || message.includes('fatal') || message.includes('corrupt')) {
      return 'critical';
    }
    
    if (message.includes('error') || message.includes('failed') || message.includes('permission')) {
      return 'high';
    }
    
    if (message.includes('warning') || message.includes('timeout')) {
      return 'medium';
    }
    
    return 'low';
  }

  private isRecoverable(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Non-recoverable conditions
    if (message.includes('corrupt') || message.includes('fatal') || message.includes('critical')) {
      return false;
    }
    
    // Typically recoverable conditions
    if (message.includes('timeout') || message.includes('busy') || message.includes('temporary')) {
      return true;
    }
    
    // Default to recoverable
    return true;
  }
}

export default CheckpointErrorBoundary;