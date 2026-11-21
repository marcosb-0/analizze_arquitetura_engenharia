import React from 'react';
import { X } from 'lucide-react';
import { Modal as HeroModal } from '@heroui/react';
import { IconButton } from './Button';
import { Typography } from './Texto';

/**
 * Diálogo da aplicação.
 *
 * Havia 27 overlays escritos à mão. Destes, 8 se anunciavam como diálogo, 9
 * fechavam com Esc e **nenhum** prendia o foco: o Tab passeava pela página
 * atrás do backdrop e o leitor de tela nunca sabia que um diálogo tinha aberto.
 * Concentrar isso aqui é o que faz cada um herdar o comportamento correto.
 */

const LARGURAS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  xl: 'max-w-2xl',
  full: 'max-w-5xl',
} as const;

export const NIVEIS = {
  base: 'z-50',
  /** Acima de outros diálogos — confirmações e alertas disparados de dentro de um modal. */
  acima: 'z-[9999]',
} as const;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  /** Barra de ações fixa no rodapé, fora da área de rolagem. */
  footer?: React.ReactNode;
  size?: keyof typeof LARGURAS;
  /** Descrição curta sob o título. */
  description?: React.ReactNode;
  /**
   * Trava o fechamento enquanto uma gravação está em curso — some com o ✕,
   * ignora o Esc e o clique no backdrop.
   */
  bloqueado?: boolean;
  /** `acima` empilha sobre outro diálogo já aberto. */
  nivel?: keyof typeof NIVEIS;
  id?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  description,
  bloqueado = false,
  nivel = 'base',
  id,
}: ModalProps) {
  const descricaoId = React.useId();

  // Foco preso, Esc, rolagem travada, pilha de diálogos e animação de saída são
  // do React Aria (via HeroUI). `bloqueado` desliga Esc e clique fora.
  return (
    <HeroModal.Backdrop
      isOpen={open}
      onOpenChange={(aberto) => {
        if (!aberto && !bloqueado) onClose();
      }}
      isDismissable={!bloqueado}
      isKeyboardDismissDisabled={bloqueado}
      className={NIVEIS[nivel]}
    >
      <HeroModal.Container>
        <HeroModal.Dialog
          id={id}
          aria-describedby={description ? descricaoId : undefined}
          className={`bg-superficie rounded-superficie shadow-dialogo w-full ${LARGURAS[size]} max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col p-0 text-left`}
        >
          <div className="px-6 pt-5 pb-2 flex justify-between items-start gap-3 shrink-0">
            <div className="min-w-0">
              <HeroModal.Heading className="font-semibold text-slate-900 text-lg leading-tight">
                {title}
              </HeroModal.Heading>
              {description && (
                <Typography type="body-sm" color="muted" id={descricaoId} className="mt-1 leading-snug">
                  {description}
                </Typography>
              )}
            </div>
            {/* Desabilitado, não escondido: durante a gravação o botão continua
                no lugar, sinalizando que existe e está indisponível. */}
            <IconButton rotulo="Fechar" onClick={onClose} disabled={bloqueado} tamanho="sm" className="-mr-1 -mt-0.5">
              <X size={14} />
            </IconButton>
          </div>

          {children}

          {footer && (
            <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap justify-end gap-2 shrink-0">
              {footer}
            </div>
          )}
        </HeroModal.Dialog>
      </HeroModal.Container>
    </HeroModal.Backdrop>
  );
}

/** Corpo rolável do diálogo. Separado para o cabeçalho e o rodapé ficarem fixos. */
export function ModalBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex-1 overflow-y-auto px-6 py-4 text-left ${className}`}>{children}</div>;
}

/**
 * Corpo do diálogo quando ele é um formulário — o caso mais comum aqui.
 *
 * O rodapé entra como prop, e não pelo `footer` do Modal, porque precisa ficar
 * *dentro* do <form>: um botão `type="submit"` fora do formulário a que pertence
 * não envia nada, e o Enter num campo deixaria de funcionar.
 */
export function ModalForm({
  children,
  footer,
  className = '',
  ...rest
}: React.ComponentPropsWithRef<'form'> & { footer?: React.ReactNode; className?: string }) {
  // `ComponentPropsWithRef` e não `FormHTMLAttributes`: o `ref` precisa chegar ao
  // `<form>` para o `useValidacao` limitar a busca pelo campo inválido a ESTE
  // formulário. No React 19 o `ref` é uma prop comum, então o spread já o leva —
  // o que faltava era o tipo admiti-lo.
  return (
    <form className="flex-1 flex flex-col min-h-0" {...rest}>
      <div className={`flex-1 overflow-y-auto px-6 py-4 text-left ${className}`}>{children}</div>
      {footer && (
        <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap justify-end gap-2 shrink-0">
          {footer}
        </div>
      )}
    </form>
  );
}
