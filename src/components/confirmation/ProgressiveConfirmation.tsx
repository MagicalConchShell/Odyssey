/**
 * SOTA Progressive Confirmation System for Destructive Operations
 * 
 * Provides sophisticated multi-step confirmation with:
 * - Risk-based progressive disclosure
 * - Impact analysis and preview
 * - Safety checks and validations
 * - Undo/recovery information
 * - Accessibility and keyboard navigation
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, 
  Shield, 
  Clock, 
  Eye, 
  XCircle, 
  ArrowRight, 
  ArrowLeft,
  Zap,
  RotateCcw,
  HelpCircle,
  AlertOctagon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export type OperationRisk = 'low' | 'medium' | 'high' | 'critical';
export type ConfirmationStep = 'warning' | 'impact' | 'verification' | 'final';

export interface OperationImpact {
  description: string;
  severity: OperationRisk;
  affected: string;
  consequences: string[];
  recovery?: {
    possible: boolean;
    method?: string;
    timeEstimate?: string;
  };
}

export interface ConfirmationFlow {
  operationType: string;
  operationName: string;
  risk: OperationRisk;
  impacts: OperationImpact[];
  requiresTyping?: {
    text: string;
    placeholder: string;
  };
  safetyChecks?: {
    id: string;
    label: string;
    required: boolean;
  }[];
  customContent?: React.ReactNode;
  timeDelay?: number; // Minimum time before allowing confirmation
}

interface ProgressiveConfirmationProps {
  isOpen: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  flow: ConfirmationFlow;
  isLoading?: boolean;
  className?: string;
}

/**
 * Progressive confirmation component with multi-step validation
 */
export const ProgressiveConfirmation: React.FC<ProgressiveConfirmationProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  flow,
  isLoading = false,
  className
}) => {
  const [currentStep, setCurrentStep] = useState<ConfirmationStep>('warning');
  const [typedText, setTypedText] = useState('');
  const [safetyChecks, setSafetyChecks] = useState<Record<string, boolean>>({});
  const [timeRemaining, setTimeRemaining] = useState(flow.timeDelay || 0);
  const [hasReadImpacts, setHasReadImpacts] = useState(false);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCurrentStep('warning');
      setTypedText('');
      setSafetyChecks({});
      setTimeRemaining(flow.timeDelay || 0);
      setHasReadImpacts(false);
      setShowAdvancedDetails(false);
    }
  }, [isOpen, flow.timeDelay]);

  // Countdown timer for time delay
  useEffect(() => {
    if (timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [timeRemaining]);

  // Focus input when verification step is reached
  useEffect(() => {
    if (currentStep === 'verification' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentStep]);

  const steps: ConfirmationStep[] = ['warning', 'impact', 'verification', 'final'];
  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const getRiskStyles = (risk: OperationRisk) => {
    switch (risk) {
      case 'critical':
        return {
          bg: 'bg-red-50 dark:bg-red-900/10',
          border: 'border-red-200 dark:border-red-800',
          text: 'text-red-900 dark:text-red-100',
          accent: 'text-red-600 dark:text-red-400',
          icon: AlertOctagon
        };
      case 'high':
        return {
          bg: 'bg-orange-50 dark:bg-orange-900/10',
          border: 'border-orange-200 dark:border-orange-800',
          text: 'text-orange-900 dark:text-orange-100',
          accent: 'text-orange-600 dark:text-orange-400',
          icon: AlertTriangle
        };
      case 'medium':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-900/10',
          border: 'border-yellow-200 dark:border-yellow-800',
          text: 'text-yellow-900 dark:text-yellow-100',
          accent: 'text-yellow-600 dark:text-yellow-400',
          icon: AlertTriangle
        };
      default:
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/10',
          border: 'border-blue-200 dark:border-blue-800',
          text: 'text-blue-900 dark:text-blue-100',
          accent: 'text-blue-600 dark:text-blue-400',
          icon: Shield
        };
    }
  };

  const canProceedToNext = () => {
    switch (currentStep) {
      case 'warning':
        return timeRemaining === 0;
      case 'impact':
        return hasReadImpacts;
      case 'verification':
        const typingValid = !flow.requiresTyping || typedText === flow.requiresTyping.text;
        const checksValid = !flow.safetyChecks || flow.safetyChecks.every(check => 
          !check.required || safetyChecks[check.id]
        );
        return typingValid && checksValid;
      case 'final':
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex]);
    }
  };

  const handlePrevious = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex]);
    }
  };

  const handleSafetyCheck = (checkId: string, checked: boolean) => {
    setSafetyChecks(prev => ({
      ...prev,
      [checkId]: checked
    }));
  };

  const handleConfirm = async () => {
    if (canProceedToNext() && currentStep === 'final') {
      await onConfirm();
    }
  };

  const riskStyles = getRiskStyles(flow.risk);
  const RiskIcon = riskStyles.icon;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <Card className={cn("w-full max-w-2xl max-h-[90vh] overflow-hidden", className)}>
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-full", riskStyles.bg)}>
                <RiskIcon className={cn("h-5 w-5", riskStyles.accent)} />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  {flow.operationName}
                  <Badge variant="outline" className={cn(riskStyles.border, riskStyles.accent)}>
                    {flow.risk} risk
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Step {currentStepIndex + 1} of {steps.length} - {currentStep}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isLoading}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <AnimatePresence mode="wait">
            {/* Warning Step */}
            {currentStep === 'warning' && (
              <motion.div
                key="warning"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <Alert className={cn(riskStyles.bg, riskStyles.border)}>
                  <AlertTriangle className={cn("h-4 w-4", riskStyles.accent)} />
                  <AlertDescription className={riskStyles.text}>
                    <strong>Warning:</strong> You are about to perform a {flow.risk} risk operation that may have permanent consequences.
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <h4 className="font-medium">Operation Details</h4>
                  <div className="bg-muted p-3 rounded-lg space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Type:</span>
                      <span className="text-sm">{flow.operationType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Risk Level:</span>
                      <Badge variant="outline" className={cn(riskStyles.accent)}>
                        {flow.risk}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Impacts:</span>
                      <span className="text-sm">{flow.impacts.length} identified</span>
                    </div>
                  </div>
                </div>

                {timeRemaining > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Please wait {timeRemaining} seconds before proceeding</span>
                  </div>
                )}
              </motion.div>
            )}

            {/* Impact Analysis Step */}
            {currentStep === 'impact' && (
              <motion.div
                key="impact"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Impact Analysis</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {showAdvancedDetails ? 'Hide' : 'Show'} Details
                  </Button>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {flow.impacts.map((impact, index) => (
                    <Card key={index} className={cn(
                      "p-3",
                      getRiskStyles(impact.severity).bg,
                      getRiskStyles(impact.severity).border
                    )}>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{impact.affected}</span>
                          <Badge variant="outline" className={cn("text-xs", getRiskStyles(impact.severity).accent)}>
                            {impact.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{impact.description}</p>
                        
                        {showAdvancedDetails && (
                          <>
                            <Separator />
                            <div className="space-y-2">
                              <h6 className="text-xs font-medium">Consequences:</h6>
                              <ul className="text-xs text-muted-foreground space-y-1">
                                {impact.consequences.map((consequence, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-muted-foreground">•</span>
                                    <span>{consequence}</span>
                                  </li>
                                ))}
                              </ul>
                              
                              {impact.recovery && (
                                <div className="mt-2 p-2 bg-background rounded border">
                                  <div className="flex items-center gap-2 text-xs">
                                    <RotateCcw className="h-3 w-3" />
                                    <span className="font-medium">Recovery:</span>
                                    <span className={impact.recovery.possible ? 'text-green-600' : 'text-red-600'}>
                                      {impact.recovery.possible ? 'Possible' : 'Not possible'}
                                    </span>
                                  </div>
                                  {impact.recovery.method && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {impact.recovery.method}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="read-impacts"
                    checked={hasReadImpacts}
                    onCheckedChange={(checked: boolean) => setHasReadImpacts(checked)}
                  />
                  <Label htmlFor="read-impacts" className="text-sm">
                    I have read and understand the potential impacts of this operation
                  </Label>
                </div>
              </motion.div>
            )}

            {/* Verification Step */}
            {currentStep === 'verification' && (
              <motion.div
                key="verification"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h4 className="font-medium">Verification Required</h4>

                {flow.requiresTyping && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmation-text">
                      Type <span className="font-mono bg-muted px-1 rounded">{flow.requiresTyping.text}</span> to confirm:
                    </Label>
                    <Input
                      ref={inputRef}
                      id="confirmation-text"
                      value={typedText}
                      onChange={(e) => setTypedText(e.target.value)}
                      placeholder={flow.requiresTyping.placeholder}
                      className={cn(
                        flow.requiresTyping.text === typedText 
                          ? 'border-green-500 focus-visible:ring-green-500' 
                          : 'border-red-500 focus-visible:ring-red-500'
                      )}
                      autoComplete="off"
                    />
                  </div>
                )}

                {flow.safetyChecks && flow.safetyChecks.length > 0 && (
                  <div className="space-y-3">
                    <Label>Safety Acknowledgments:</Label>
                    <div className="space-y-2">
                      {flow.safetyChecks.map((check) => (
                        <div key={check.id} className="flex items-start space-x-2">
                          <Checkbox
                            id={check.id}
                            checked={safetyChecks[check.id] || false}
                            onCheckedChange={(checked: boolean) => handleSafetyCheck(check.id, checked)}
                          />
                          <Label htmlFor={check.id} className="text-sm leading-5">
                            {check.label}
                            {check.required && <span className="text-red-500 ml-1">*</span>}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {flow.customContent && (
                  <div className="border rounded-lg p-3">
                    {flow.customContent}
                  </div>
                )}
              </motion.div>
            )}

            {/* Final Confirmation Step */}
            {currentStep === 'final' && (
              <motion.div
                key="final"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <Alert className={cn(riskStyles.bg, riskStyles.border)}>
                  <Zap className={cn("h-4 w-4", riskStyles.accent)} />
                  <AlertDescription className={riskStyles.text}>
                    <strong>Final Confirmation:</strong> This action will be executed immediately and cannot be undone.
                  </AlertDescription>
                </Alert>

                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <h5 className="font-medium">Summary:</h5>
                  <ul className="text-sm space-y-1">
                    <li>• Operation: {flow.operationName}</li>
                    <li>• Risk Level: {flow.risk}</li>
                    <li>• Impacts: {flow.impacts.length} areas affected</li>
                    <li>• Recovery: {flow.impacts.some(i => i.recovery?.possible) ? 'Partially possible' : 'Not possible'}</li>
                  </ul>
                </div>

                {isLoading && (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <span className="ml-2 text-sm">Executing operation...</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>

        <div className="flex justify-between items-center p-6 border-t">
          <Button
            variant="outline"
            onClick={currentStepIndex === 0 ? onCancel : handlePrevious}
            disabled={isLoading}
          >
            {currentStepIndex === 0 ? (
              <>
                <XCircle className="h-4 w-4 mr-2" />
                Cancel
              </>
            ) : (
              <>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </>
            )}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              Help
            </Button>

            {currentStep === 'final' ? (
              <Button
                onClick={handleConfirm}
                disabled={!canProceedToNext() || isLoading}
                variant="destructive"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Executing...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Execute Operation
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={!canProceedToNext()}
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ProgressiveConfirmation;