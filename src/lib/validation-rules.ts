// Common validation rules for forms

export interface ValidationResult {
  isValid: boolean;
  message?: string;
}

export const validationRules = {
  required: (value: any): ValidationResult => ({
    isValid: value !== null && value !== undefined && value !== '',
    message: 'This field is required',
  }),

  email: (value: string): ValidationResult => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return {
      isValid: !value || emailRegex.test(value),
      message: 'Please enter a valid email address',
    };
  },

  url: (value: string): ValidationResult => {
    try {
      new URL(value);
      return { isValid: true };
    } catch {
      return {
        isValid: false,
        message: 'Please enter a valid URL',
      };
    }
  },

  path: (value: string): ValidationResult => ({
    isValid: !value || (value.length > 0 && !value.includes('<') && !value.includes('>')),
    message: 'Please enter a valid file path',
  }),

  minLength: (min: number) => (value: string): ValidationResult => ({
    isValid: !value || value.length >= min,
    message: `Must be at least ${min} characters long`,
  }),

  maxLength: (max: number) => (value: string): ValidationResult => ({
    isValid: !value || value.length <= max,
    message: `Must be no more than ${max} characters long`,
  }),

  pattern: (regex: RegExp, message: string) => (value: string): ValidationResult => ({
    isValid: !value || regex.test(value),
    message,
  }),

  numeric: (value: string): ValidationResult => ({
    isValid: !value || !isNaN(Number(value)),
    message: 'Must be a valid number',
  }),

  positive: (value: number): ValidationResult => ({
    isValid: value > 0,
    message: 'Must be a positive number',
  }),

  range: (min: number, max: number) => (value: number): ValidationResult => ({
    isValid: value >= min && value <= max,
    message: `Must be between ${min} and ${max}`,
  }),

  oneOf: (options: any[]) => (value: any): ValidationResult => ({
    isValid: options.includes(value),
    message: `Must be one of: ${options.join(', ')}`,
  }),

  permissionRule: (value: string): ValidationResult => {
    if (!value) return { isValid: true };
    
    // Basic validation for permission rules (allow/deny patterns)
    const validPatterns = [
      /^allow:/i,
      /^deny:/i,
      /^read:/i,
      /^write:/i,
      /^exec:/i,
      /^net:/i,
    ];
    
    const isValid = validPatterns.some(pattern => pattern.test(value));
    
    return {
      isValid,
      message: 'Invalid permission rule format. Use allow:, deny:, read:, write:, exec:, or net: prefixes',
    };
  },

  modelName: (value: string): ValidationResult => {
    const validModels = [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];
    
    return {
      isValid: !value || validModels.includes(value),
      message: 'Please select a valid Claude model',
    };
  },


  systemPrompt: (value: string): ValidationResult => {
    if (!value) {
      return { isValid: false, message: 'System prompt is required' };
    }
    
    if (value.length < 10) {
      return { isValid: false, message: 'System prompt must be at least 10 characters long' };
    }
    
    if (value.length > 4000) {
      return { isValid: false, message: 'System prompt must be no more than 4000 characters long' };
    }
    
    return { isValid: true };
  },
};

// Helper function to create validation rules for form hooks
export const createValidationRule = <T>(
  validator: (value: T) => ValidationResult
) => ({
  validate: (value: T) => validator(value).isValid,
  message: validator('' as unknown as T).message || 'Invalid value',
});