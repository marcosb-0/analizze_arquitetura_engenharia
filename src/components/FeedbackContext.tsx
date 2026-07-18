import React, { createContext, useContext, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  description?: string;
  type: ToastType;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

interface FeedbackContextProps {
  toast: {
    success: (message: string, description?: string) => void;
    error: (message: string, description?: string) => void;
    warning: (message: string, description?: string) => void;
    info: (message: string, description?: string) => void;
  };
  confirm: (options: ConfirmOptions) => void;
}

const FeedbackContext = createContext<FeedbackContextProps | undefined>(undefined);

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Helper to add toast
  const addToast = (message: string, type: ToastType, description?: string) => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts((prev) => [...prev, { id, message, description, type }]);
  };

  const toast = {
    success: (msg: string, desc?: string) => addToast(msg, 'success', desc),
    error: (msg: string, desc?: string) => addToast(msg, 'error', desc),
    warning: (msg: string, desc?: string) => addToast(msg, 'warning', desc),
    info: (msg: string, desc?: string) => addToast(msg, 'info', desc),
  };

  const confirm = (options: ConfirmOptions) => {
    setConfirmOptions(options);
    setConfirmOpen(true);
  };

  const handleConfirmClose = (isConfirmed: boolean) => {
    setConfirmOpen(false);
    if (confirmOptions) {
      if (isConfirmed) {
        confirmOptions.onConfirm();
      } else if (confirmOptions.onCancel) {
        confirmOptions.onCancel();
      }
    }
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* TOAST CONTAINER */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onClose={(id) => setToasts((prev) => prev.filter((x) => x.id !== id))} />
          ))}
        </AnimatePresence>
      </div>

      {/* CONFIRM MODAL */}
      <AnimatePresence>
        {confirmOpen && confirmOptions && (
          <ConfirmModal options={confirmOptions} onClose={handleConfirmClose} />
        )}
      </AnimatePresence>
    </FeedbackContext.Provider>
  );
}

// INDIVIDUAL TOAST ITEM WITH TIMER PROGRESS BAR
function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: string) => void; key?: string }) {
  const duration = 4000; // 4 seconds

  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  const icons = {
    success: <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />,
    error: <XCircle size={18} className="text-rose-500 shrink-0" />,
    warning: <AlertTriangle size={18} className="text-amber-500 shrink-0" />,
    info: <Info size={18} className="text-blue-500 shrink-0" />,
  };

  const borderColors = {
    success: 'border-emerald-200 bg-emerald-50/50',
    error: 'border-rose-200 bg-rose-50/50',
    warning: 'border-amber-200 bg-amber-50/50',
    info: 'border-blue-200 bg-blue-50/50',
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      transition={{ type: 'spring', damping: 20, stiffness: 250 }}
      className={`pointer-events-auto w-full bg-white border rounded-lg shadow-lg overflow-hidden flex flex-col relative ${borderColors[toast.type]}`}
    >
      <div className="p-3.5 flex items-start gap-3">
        {icons[toast.type]}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-900 leading-tight">{toast.message}</p>
          {toast.description && (
            <p className="text-xs text-slate-500 mt-1 leading-snug">{toast.description}</p>
          )}
        </div>
        <button
          onClick={() => onClose(toast.id)}
          className="text-slate-400 hover:text-slate-600 transition p-0.5 rounded hover:bg-slate-100"
        >
          <X size={14} />
        </button>
      </div>

      {/* Progress Bar timer */}
      <div className="w-full h-[3px] bg-slate-100 mt-auto">
        <motion.div
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
          className={`h-full ${
            toast.type === 'success'
              ? 'bg-emerald-500'
              : toast.type === 'error'
              ? 'bg-rose-500'
              : toast.type === 'warning'
              ? 'bg-amber-500'
              : 'bg-blue-500'
          }`}
        />
      </div>
    </motion.div>
  );
}

// ELEGANT CUSTOM CONFIRMATION MODAL
function ConfirmModal({ options, onClose }: { options: ConfirmOptions; onClose: (confirmed: boolean) => void }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onClose(false)}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
      />

      {/* Modal Dialog Content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300, duration: 0.2 }}
        className="relative bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden p-5 space-y-4 text-left border border-slate-200"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-rose-50 border border-rose-100 rounded-lg shrink-0">
            <AlertTriangle size={20} className="text-rose-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 text-sm">
              {options.title || 'Confirmar Exclusão'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {options.message}
            </p>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 rounded transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onClose(true)}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded transition shadow-sm"
          >
            Excluir
          </button>
        </div>
      </motion.div>
    </div>
  );
}
