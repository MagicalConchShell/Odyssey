// Hook Rules Checker - Development utility to validate React hooks usage
// This file helps identify components that might violate the Rules of Hooks

export interface HookUsageReport {
  componentName: string;
  violations: HookViolation[];
  warnings: HookWarning[];
}

export interface HookViolation {
  type: 'conditional_hook' | 'early_return' | 'loop_hook';
  line: number;
  description: string;
  severity: 'error' | 'warning';
}

export interface HookWarning {
  type: 'missing_dependency' | 'unnecessary_dependency';
  line: number;
  description: string;
}

// Common patterns that violate Rules of Hooks
export const HOOK_VIOLATION_PATTERNS = {
  conditionalHook: /if\s*\([^)]+\)\s*{[^}]*use[A-Z]/,
  loopHook: /(for|while)\s*\([^)]+\)\s*{[^}]*use[A-Z]/,
  earlyReturnAfterHook: /use[A-Z][^;]*;[\s\S]*if\s*\([^)]+\)\s*return/,
};

// Validate component follows Rules of Hooks
export const validateHooksUsage = (componentCode: string, componentName: string): HookUsageReport => {
  const violations: HookViolation[] = [];
  const warnings: HookWarning[] = [];
  
  const lines = componentCode.split('\n');
  
  let hasHooks = false;
  let hooksSectionEnded = false;
  
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    
    // Check for hook usage
    if (/use[A-Z]/.test(line)) {
      hasHooks = true;
      
      // If we've seen a return statement, this is a violation
      if (hooksSectionEnded) {
        violations.push({
          type: 'early_return',
          line: lineNumber,
          description: `Hook called after conditional return statement`,
          severity: 'error'
        });
      }
    }
    
    // Check for early returns
    if (/^\s*if\s*\([^)]+\)\s*{?\s*return/.test(line) && hasHooks) {
      hooksSectionEnded = true;
    }
    
    // Check for conditional hooks
    if (HOOK_VIOLATION_PATTERNS.conditionalHook.test(line)) {
      violations.push({
        type: 'conditional_hook',
        line: lineNumber,
        description: `Hook called conditionally inside if statement`,
        severity: 'error'
      });
    }
    
    // Check for hooks in loops
    if (HOOK_VIOLATION_PATTERNS.loopHook.test(line)) {
      violations.push({
        type: 'loop_hook',
        line: lineNumber,
        description: `Hook called inside loop`,
        severity: 'error'
      });
    }
  });
  
  return {
    componentName,
    violations,
    warnings
  };
};

// Helper to check if component structure is safe
export const isComponentStructureSafe = (componentCode: string): boolean => {
  const report = validateHooksUsage(componentCode, 'component');
  return report.violations.filter(v => v.severity === 'error').length === 0;
};

// Development mode hook checker
export const enableHooksRuleChecker = () => {
  if (process.env.NODE_ENV === 'development') {
    console.warn('🔧 Hooks Rules Checker enabled - monitoring for violations');
    
    // Add runtime checks for development
    const originalConsoleError = console.error;
    console.error = (...args) => {
      const message = args.join(' ');
      if (message.includes('Hooks order') || message.includes('rendered more hooks')) {
        console.group('🚨 React Hooks Violation Detected');
        console.error('This error indicates a violation of the Rules of Hooks');
        console.warn('Common causes:');
        console.warn('1. Conditional hook calls (if statements around hooks)');
        console.warn('2. Early returns before all hooks are called');
        console.warn('3. Hooks called in loops or nested functions');
        console.warn('4. Different number of hooks between renders');
        console.groupEnd();
      }
      originalConsoleError(...args);
    };
  }
};