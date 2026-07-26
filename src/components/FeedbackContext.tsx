import React, { createContext, useContext, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { Modal, Button } from './ui';

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
  /**
   * Rótulo do botão de confirmação. O diálogo só sabia dizer "Excluir", com
   * ícone de alerta vermelho, mesmo quando era usado para confirmar algo que não
   * apagava nada — o que ensina o usuário a ignorar o alerta justamente quando
   * ele é real.
   */
  confirmLabel?: string;
  /** `normal` troca o vermelho pelo azul, para confirmações não destrutivas. */
  tone?: 'perigo' | 'normal';
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
      {confirmOptions && (
        <ConfirmModal open={confirmOpen} options={confirmOptions} onClose={handleConfirmClose} />
      )}
    </FeedbackContext.Provider>
  );
}

/**
 * Quanto tempo cada tipo fica na tela.
 *
 * Todos duravam 4s. Um erro carrega a `message` técnica devolvida pelo Supabase
 * numa segunda linha em `text-xs` — 4s não bastam para ler, entender e decidir
 * o que fazer, e o toast some sem deixar rastro. Erro e aviso pedem o dobro ou
 * mais; sucesso e informação só confirmam algo que o usuário acabou de fazer.
 */
const TOAST_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 7000,
  error: 12000,
};

// INDIVIDUAL TOAST ITEM WITH TIMER PROGRESS BAR
function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: string) => void; key?: string }) {
  const duration = TOAST_DURATIONS[toast.type];
  // Passar o mouse sobre o toast congela a contagem: sem isto, ler uma mensagem
  // longa é uma corrida contra o timer e não há como recuperá-la depois.
  const [pausado, setPausado] = useState(false);

  // Não há `setTimeout` aqui de propósito: a barra de progresso *é* o
  // cronômetro. Antes eram dois relógios independentes (um timeout de 4s e uma
  // animação do motion de 4s) que só coincidiam por acaso — e pausar um deixaria
  // o outro correndo. Com uma animação CSS, `animationPlayState` pausa os dois de
  // uma vez e o fim da animação é o que dispensa o toast.
  const dispensarAoFim = (e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.animationName === 'toast-progresso') onClose(toast.id);
  };

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
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      // O toast some sozinho; quem usa teclado nunca alcança o "✕" a tempo.
      // Receber foco (via Tab no botão de fechar) também congela a contagem.
      onFocusCapture={() => setPausado(true)}
      onBlurCapture={() => setPausado(false)}
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
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
          type="button"
          onClick={() => onClose(toast.id)}
          aria-label="Dispensar notificação"
          className="text-slate-400 hover:text-slate-600 transition p-0.5 rounded hover:bg-slate-100"
        >
          <X size={14} />
        </button>
      </div>

      {/* Progress Bar timer */}
      <div className="w-full h-[3px] bg-slate-100 mt-auto">
        <div
          onAnimationEnd={dispensarAoFim}
          style={{
            animation: `toast-progresso ${duration}ms linear forwards`,
            animationPlayState: pausado ? 'paused' : 'running',
          }}
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
function ConfirmModal({
  open,
  options,
  onClose,
}: {
  open: boolean;
  options: ConfirmOptions;
  onClose: (confirmed: boolean) => void;
}) {
  const perigo = (options.tone ?? 'perigo') === 'perigo';

  return (
    <Modal
      open={open}
      onClose={() => onClose(false)}
      title={options.title || (perigo ? 'Confirmar Exclusão' : 'Confirmar')}
      size="sm"
      // Pode ser disparado de dentro de outro diálogo — precisa ficar por cima.
      nivel="acima"
      footer={
        <>
          <Button variante="fantasma" onClick={() => onClose(false)}>
            Cancelar
          </Button>
          <Button
            variante={perigo ? 'perigo' : 'primario'}
            onClick={() => onClose(true)}
            // O foco abre na ação de confirmação para o Enter funcionar, mas o
            // Esc e o Cancelar continuam sendo a saída óbvia.
            data-autofocus
          >
            {options.confirmLabel ?? (perigo ? 'Excluir' : 'Confirmar')}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3 p-4 text-left">
        <div
          className={`p-2 rounded-lg shrink-0 border ${
            perigo ? 'bg-rose-50 border-rose-100' : 'bg-blue-50 border-blue-100'
          }`}
        >
          <AlertTriangle size={20} className={perigo ? 'text-rose-600' : 'text-blue-600'} />
        </div>
        <p className="text-xs text-slate-600 leading-relaxed flex-1 min-w-0">{options.message}</p>
      </div>
    </Modal>
  );
}
