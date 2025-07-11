// Generic form state management hook with validation support

import { useState, useCallback } from 'react';

interface ValidationRule<T> {
  validate: (value: T) => boolean;
  message: string;
}

interface FormField<T> {
  value: T;
  error: string | null;
  touched: boolean;
}

interface FormState<T extends Record<string, any>> {
  fields: { [K in keyof T]: FormField<T[K]> };
  isValid: boolean;
  isDirty: boolean;
}

interface UseFormStateReturn<T extends Record<string, any>> {
  values: T;
  errors: { [K in keyof T]: string | null };
  touched: { [K in keyof T]: boolean };
  isValid: boolean;
  isDirty: boolean;
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setError: <K extends keyof T>(field: K, error: string | null) => void;
  setTouched: <K extends keyof T>(field: K, touched?: boolean) => void;
  validateField: <K extends keyof T>(field: K) => boolean;
  validateForm: () => boolean;
  reset: (newInitialValues?: Partial<T>) => void;
  handleSubmit: (onSubmit: (values: T) => void | Promise<void>) => (e?: React.FormEvent) => Promise<void>;
}

type ValidationSchema<T extends Record<string, any>> = {
  [K in keyof T]?: ValidationRule<T[K]>[];
};

export const useFormState = <T extends Record<string, any>>(
  initialValues: T,
  validationSchema?: ValidationSchema<T>
): UseFormStateReturn<T> => {
  const createInitialState = (values: T): FormState<T> => {
    const fields = {} as { [K in keyof T]: FormField<T[K]> };
    
    for (const key in values) {
      fields[key] = {
        value: values[key],
        error: null,
        touched: false,
      };
    }
    
    return {
      fields,
      isValid: true,
      isDirty: false,
    };
  };

  const [state, setState] = useState<FormState<T>>(() => createInitialState(initialValues));

  const validateFieldValue = useCallback(<K extends keyof T>(field: K, value: T[K]): string | null => {
    if (!validationSchema || !validationSchema[field]) {
      return null;
    }

    for (const rule of validationSchema[field]!) {
      if (!rule.validate(value)) {
        return rule.message;
      }
    }

    return null;
  }, [validationSchema]);

  const setValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setState(prev => {
      const newFields = { ...prev.fields };
      newFields[field] = {
        ...newFields[field],
        value,
        error: validateFieldValue(field, value),
      };

      const isValid = Object.values(newFields).every(f => f.error === null);
      const isDirty = Object.keys(newFields).some(key => 
        newFields[key as keyof T].value !== initialValues[key as keyof T]
      );

      return {
        fields: newFields,
        isValid,
        isDirty,
      };
    });
  }, [validateFieldValue, initialValues]);

  const setError = useCallback(<K extends keyof T>(field: K, error: string | null) => {
    setState(prev => {
      const newFields = { ...prev.fields };
      newFields[field] = {
        ...newFields[field],
        error,
      };

      const isValid = Object.values(newFields).every(f => f.error === null);

      return {
        ...prev,
        fields: newFields,
        isValid,
      };
    });
  }, []);

  const setTouched = useCallback(<K extends keyof T>(field: K, touched: boolean = true) => {
    setState(prev => {
      const newFields = { ...prev.fields };
      newFields[field] = {
        ...newFields[field],
        touched,
      };

      return {
        ...prev,
        fields: newFields,
      };
    });
  }, []);

  const validateField = useCallback(<K extends keyof T>(field: K): boolean => {
    const value = state.fields[field].value;
    const error = validateFieldValue(field, value);
    
    setState(prev => {
      const newFields = { ...prev.fields };
      newFields[field] = {
        ...newFields[field],
        error,
        touched: true,
      };

      const isValid = Object.values(newFields).every(f => f.error === null);

      return {
        ...prev,
        fields: newFields,
        isValid,
      };
    });

    return error === null;
  }, [state.fields, validateFieldValue]);

  const validateForm = useCallback((): boolean => {
    setState(prev => {
      const newFields = { ...prev.fields };
      let isValid = true;

      for (const field in newFields) {
        const error = validateFieldValue(field, newFields[field].value);
        newFields[field] = {
          ...newFields[field],
          error,
          touched: true,
        };

        if (error !== null) {
          isValid = false;
        }
      }

      return {
        ...prev,
        fields: newFields,
        isValid,
      };
    });

    return state.isValid;
  }, [validateFieldValue, state.isValid]);

  const reset = useCallback((newInitialValues?: Partial<T>) => {
    const values = newInitialValues ? { ...initialValues, ...newInitialValues } : initialValues;
    setState(createInitialState(values));
  }, [initialValues]);

  const handleSubmit = useCallback((onSubmit: (values: T) => void | Promise<void>) => {
    return async (e?: React.FormEvent) => {
      if (e) {
        e.preventDefault();
      }

      if (validateForm()) {
        const values = {} as T;
        for (const key in state.fields) {
          values[key] = state.fields[key].value;
        }
        await onSubmit(values);
      }
    };
  }, [validateForm, state.fields]);

  // Extract current values, errors, and touched states
  const values = {} as T;
  const errors = {} as { [K in keyof T]: string | null };
  const touched = {} as { [K in keyof T]: boolean };

  for (const key in state.fields) {
    values[key] = state.fields[key].value;
    errors[key] = state.fields[key].error;
    touched[key] = state.fields[key].touched;
  }

  return {
    values,
    errors,
    touched,
    isValid: state.isValid,
    isDirty: state.isDirty,
    setValue,
    setError,
    setTouched,
    validateField,
    validateForm,
    reset,
    handleSubmit,
  };
};