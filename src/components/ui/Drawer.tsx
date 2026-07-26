import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { useEscapeParaFechar } from '../../hooks/useEscapeParaFechar';
import { useArmadilhaDeFoco } from '../../hooks/useArmadilhaDeFoco';
import { IconButton } from './Button';
import { pilha, noTopo, NIVEIS } from './Modal';

/**
 * Painel lateral. Mesmo contrato de acessibilidade do <Modal> — muda só a
 * geometria: entra pela direita e ocupa a altura inteira.
 *
 * Existe porque dois overlays do app são painéis, não diálogos centrados (o
 * detalhe do documento e o do insumo do catálogo). Forçá-los no Modal mudaria o
 * gesto de navegação; o que eles precisavam era do teclado, não do formato.
 */

const LARGURAS = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
} as const;

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  /** Bloco à esquerda do título — ícone do tipo de documento, por exemplo. */
  icon?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof LARGURAS;
  nivel?: keyof typeof NIVEIS;
  id?: string;
  /** Rótulo acessível quando o título é um nó complexo (nome truncado, ícones). */
  ariaLabel?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  icon,
  description,
  footer,
  size = 'md',
  nivel = 'base',
  id,
  ariaLabel,
}: DrawerProps) {
  const meuId = React.useMemo(() => Symbol('drawer'), []);

  useEffect(() => {
    if (!open) return;
    pilha.push(meuId);
    return () => {
      const i = pilha.indexOf(meuId);
      if (i !== -1) pilha.splice(i, 1);
    };
  }, [open, meuId]);

  useEscapeParaFechar(open, () => {
    if (noTopo(meuId)) onClose();
  });

  const caixaRef = useArmadilhaDeFoco(open && noTopo(meuId));
  const tituloId = React.useId();
  const descricaoId = React.useId();

  return (
    <AnimatePresence>
      {open && (
        <div id={id} className={`fixed inset-0 ${NIVEIS[nivel]} flex justify-end`}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
          />

          <motion.div
            ref={caixaRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={ariaLabel ? undefined : tituloId}
            aria-label={ariaLabel}
            aria-describedby={description ? descricaoId : undefined}
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className={`relative w-full ${LARGURAS[size]} bg-white h-screen shadow-2xl border-l border-slate-200 flex flex-col focus:outline-none`}
          >
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-left min-w-0">
                {icon && <div className="p-1.5 bg-blue-50 text-blue-600 rounded shrink-0">{icon}</div>}
                <div className="min-w-0">
                  <h2 id={tituloId} className="font-bold text-slate-900 text-xs truncate">
                    {title}
                  </h2>
                  {description && (
                    <p id={descricaoId} className="text-2xs text-slate-400 font-semibold uppercase tracking-wider truncate">
                      {description}
                    </p>
                  )}
                </div>
              </div>
              <IconButton rotulo="Fechar" onClick={onClose} tamanho="sm">
                <X size={15} />
              </IconButton>
            </div>

            {children}

            {footer && (
              <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
