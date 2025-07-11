import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Toast } from '../../hooks/useToast'

interface ToastProps {
  toast: Toast | null
}

export const ToastComponent: React.FC<ToastProps> = ({ toast }) => {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
            toast.type === 'success' 
              ? 'bg-accent/10 border border-accent text-accent-foreground' 
              : 'bg-destructive/10 border border-destructive text-destructive'
          }`}
        >
          {toast.message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}