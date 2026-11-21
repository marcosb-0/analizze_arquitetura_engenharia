import React, { createContext, useContext, useState, useEffect } from 'react';
import { AlertDialog, Toast, toast as heroToast } from '@heroui/react';
import { Button, Typography } from './ui';
import { NIVEIS } from './ui/Modal';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

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

/**
 * =============================================================================
 * O ESTADO DO FEEDBACK NÃO MORA NO PROVIDER — e essa é a correção inteira.
 * =============================================================================
 *
 * §4.3 da auditoria. A versão anterior guardava `toasts`, `confirmOptions` e
 * `confirmOpen` dentro do `FeedbackProvider`, e passava `value={{ toast, confirm }}`
 * — objeto literal novo a cada render, com um `toast` também recriado a cada
 * render. Três problemas somados num só efeito:
 *
 *   1. o provider re-renderizava a cada toast criado, removido e a cada
 *      abertura/fechamento de confirmação;
 *   2. `children` é filho do provider, então re-renderizava junto;
 *   3. `App` consome `useFeedback()`, e `App` monta a aba ativa — um componente
 *      de 2.000+ linhas com 30 a 40 estados.
 *
 * Ou seja: **um único toast de sucesso re-renderizava a aplicação inteira**, e o
 * toast é o evento mais frequente do app, já que toda mutação produz um.
 *
 * `useMemo` no `value` não bastaria: o provider continuaria re-renderizando por
 * causa do próprio estado, e `children` com ele. O estado tem de sair.
 *
 * A solução é uma fila de assinantes fora do React. `FeedbackProvider` passa a
 * ser puramente estrutural — o `value` é criado UMA vez e nunca muda —, e quem
 * guarda estado é `<PainelDeFeedback />`, um IRMÃO de `children`. Quando um toast
 * entra, só o painel re-renderiza; `children` nem sabe que aconteceu.
 *
 * Efeito colateral bem-vindo: os `eslint-disable` de `exhaustive-deps` que
 * existiam nos 20 hooks por causa de `toast` instável deixam de ser necessários —
 * `toast` agora é referencialmente estável para sempre.
 */
type Acao =
  | { tipo: 'toast'; message: string; toastType: ToastType; description?: string }
  | { tipo: 'confirm'; options: ConfirmOptions };

type Ouvinte = (acao: Acao) => void;

const ouvintes = new Set<Ouvinte>();

function emitir(acao: Acao) {
  // Em produção há exatamente um ouvinte (o painel). Um `Set` em vez de uma
  // única referência porque o StrictMode monta e desmonta o painel duas vezes em
  // desenvolvimento, e uma referência solta ficaria apontando para a instância
  // descartada.
  if (ouvintes.size === 0 && import.meta.env.DEV) {
    console.warn('Feedback emitido antes de <PainelDeFeedback/> montar — mensagem descartada:', acao);
  }
  for (const ouvinte of ouvintes) ouvinte(acao);
}

/**
 * A API pública, montada uma única vez fora de qualquer componente. Não depende
 * de estado nem de props, então não há motivo para recriá-la em render nenhum.
 */
const API: FeedbackContextProps = {
  toast: {
    success: (message, description) => emitir({ tipo: 'toast', message, description, toastType: 'success' }),
    error: (message, description) => emitir({ tipo: 'toast', message, description, toastType: 'error' }),
    warning: (message, description) => emitir({ tipo: 'toast', message, description, toastType: 'warning' }),
    info: (message, description) => emitir({ tipo: 'toast', message, description, toastType: 'info' }),
  },
  confirm: (options) => emitir({ tipo: 'confirm', options }),
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  return (
    <FeedbackContext.Provider value={API}>
      {children}
      <PainelDeFeedback />
    </FeedbackContext.Provider>
  );
}

/**
 * Quanto tempo cada tipo fica na tela. Erro e aviso pedem o dobro ou mais:
 * a segunda linha costuma ser a mensagem técnica do Supabase, que precisa de
 * tempo para ser lida. Passar o mouse ou o foco pausa (a fila do React Aria faz isso).
 */
const TOAST_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 7000,
  error: 12000,
};

const MOSTRAR: Record<ToastType, (m: string, o: { description?: string; timeout: number }) => void> = {
  success: (m, o) => heroToast.success(m, o),
  error: (m, o) => heroToast.danger(m, o),
  warning: (m, o) => heroToast.warning(m, o),
  info: (m, o) => heroToast.info(m, o),
};

/** Onde o estado do feedback vive: irmão de `children`, não ancestral. */
function PainelDeFeedback() {
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const ouvinte: Ouvinte = (acao) => {
      if (acao.tipo === 'toast') {
        MOSTRAR[acao.toastType](acao.message, { description: acao.description, timeout: TOAST_DURATIONS[acao.toastType] });
        return;
      }
      setConfirmOptions(acao.options);
      setConfirmOpen(true);
    };
    ouvintes.add(ouvinte);
    return () => {
      ouvintes.delete(ouvinte);
    };
  }, []);

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
    <>
      <Toast.Provider placement="top end" />
      {confirmOptions && <ConfirmModal open={confirmOpen} options={confirmOptions} onClose={handleConfirmClose} />}
    </>
  );
}

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
    // `acima`: pode ser disparado de dentro de outro diálogo e precisa ficar por cima.
    <AlertDialog.Backdrop isOpen={open} onOpenChange={(aberto) => !aberto && onClose(false)} className={NIVEIS.acima}>
      <AlertDialog.Container>
        <AlertDialog.Dialog className="sm:max-w-sm text-left">
          <AlertDialog.Header>
            <AlertDialog.Icon status={perigo ? 'danger' : 'accent'} />
            <AlertDialog.Heading>{options.title || (perigo ? 'Confirmar Exclusão' : 'Confirmar')}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <Typography type="body-sm" color="muted" className="leading-relaxed">{options.message}</Typography>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variante="fantasma" onClick={() => onClose(false)}>
              Cancelar
            </Button>
            {/* O foco abre na confirmação para o Enter funcionar; Esc e Cancelar seguem sendo a saída óbvia. */}
            <Button variante={perigo ? 'perigo' : 'primario'} onClick={() => onClose(true)} autoFocus>
              {options.confirmLabel ?? (perigo ? 'Excluir' : 'Confirmar')}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
