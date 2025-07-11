import { useState, useEffect } from 'react'

export interface Toast {
  message: string
  type: 'success' | 'error'
}

export const useToast = () => {
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
  }

  const showSuccess = (message: string) => {
    showToast(message, 'success')
  }

  const showError = (message: string) => {
    showToast(message, 'error')
  }

  const hideToast = () => {
    setToast(null)
  }

  return {
    toast,
    showToast,
    showSuccess,
    showError,
    hideToast
  }
}