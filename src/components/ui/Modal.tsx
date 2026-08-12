import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useEscapeParaFechar } from '../../hooks/useEscapeParaFechar';
import { useArmadilhaDeFoco } from '../../hooks/useArmadilhaDeFoco';
import { usePresenca } from '../../hooks/usePresenca';
import { IconButton } from './Button';

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
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  full: 'max-w-5xl',
} as const;

/**
 * Pilha de diálogos abertos.
 *
 * Um diálogo pode abrir outro — a confirmação de exclusão do FeedbackContext
 * sobe por cima de qualquer tela, inclusive de um modal já aberto. Sem uma
 * pilha, as duas armadilhas de foco disputariam o Tab entre si e o Esc fecharia
 * os dois de uma vez. Só o diálogo do topo reage.
 */
export const pilha: symbol[] = [];
export const noTopo = (id: symbol) => pilha[pilha.length - 1] === id;

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
  const meuId = React.useMemo(() => Symbol('modal'), []);

  const fechar = () => {
    if (!bloqueado) onClose();
  };

  // Entra e sai da pilha junto com a abertura, para o topo estar sempre correto.
  useEffect(() => {
    if (!open) return;
    pilha.push(meuId);
    return () => {
      const i = pilha.indexOf(meuId);
      if (i !== -1) pilha.splice(i, 1);
    };
  }, [open, meuId]);

  useEscapeParaFechar(open && !bloqueado, () => {
    if (noTopo(meuId)) onClose();
  });

  // Foco inicial, devolução, armadilha de Tab e trava de rolagem vivem no hook,
  // compartilhado com os overlays que não cabem neste primitivo.
  const caixaRef = useArmadilhaDeFoco<HTMLDivElement>(open && noTopo(meuId));

  const tituloId = React.useId();
  const descricaoId = React.useId();

  // 150ms = a duração de `.anim-dialogo-sai` em index.css.
  const { montado, saindo } = usePresenca(open, 150);
  if (!montado) return null;

  return (
    <div id={id} className={`fixed inset-0 ${NIVEIS[nivel]} flex items-center justify-center p-4`}>
      <div
        onClick={fechar}
        className={`fixed inset-0 bg-slate-900/60 backdrop-blur-xs ${saindo ? 'anim-fade-sai' : 'anim-fade-entra'}`}
      />

      <div
        ref={caixaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={description ? descricaoId : undefined}
        tabIndex={-1}
        className={`relative bg-white rounded-lg shadow-xl w-full ${LARGURAS[size]} max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 focus:outline-none ${saindo ? 'anim-dialogo-sai' : 'anim-dialogo-entra'}`}
      >
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex justify-between items-start gap-3 shrink-0">
          <div className="min-w-0">
            <h2 id={tituloId} className="font-bold text-slate-900 text-xs">
              {title}
            </h2>
            {description && (
              <p id={descricaoId} className="text-2xs text-slate-500 mt-0.5 leading-snug">
                {description}
              </p>
            )}
          </div>
          {/* Desabilitado, não escondido: durante a gravação o botão continua
              no lugar, sinalizando que existe e está indisponível. Somindo
              com ele o cabeçalho reflui e parece que a ação sumiu. */}
          <IconButton
            rotulo="Fechar"
            onClick={onClose}
            disabled={bloqueado}
            tamanho="sm"
            className="-mr-1 -mt-0.5"
          >
            <X size={15} />
          </IconButton>
        </div>

        {children}

        {footer && (
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Corpo rolável do diálogo. Separado para o cabeçalho e o rodapé ficarem fixos. */
export function ModalBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex-1 overflow-y-auto p-4 text-left ${className}`}>{children}</div>;
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
      <div className={`flex-1 overflow-y-auto p-4 text-left ${className}`}>{children}</div>
      {footer && (
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 shrink-0">
          {footer}
        </div>
      )}
    </form>
  );
}
