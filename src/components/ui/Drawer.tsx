import React from 'react';
import { X } from 'lucide-react';
import { Drawer as HeroDrawer } from '@heroui/react';
import { IconButton } from './Button';
import { NIVEIS } from './Modal';

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
  const descricaoId = React.useId();

  return (
    <HeroDrawer.Backdrop isOpen={open} onOpenChange={(aberto) => !aberto && onClose()} className={NIVEIS[nivel]}>
      <HeroDrawer.Content placement="right">
        <HeroDrawer.Dialog
          id={id}
          aria-label={ariaLabel}
          aria-describedby={description ? descricaoId : undefined}
          className={`w-full ${LARGURAS[size]} bg-superficie h-screen shadow-dialogo flex flex-col sm:rounded-l-superficie overflow-hidden p-0 text-left`}
        >
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-left min-w-0">
              {icon && <div className="p-2 bg-blue-50 text-blue-600 rounded-xl shrink-0">{icon}</div>}
              <div className="min-w-0">
                <HeroDrawer.Heading className="font-semibold text-slate-900 text-lg leading-tight truncate">
                  {title}
                </HeroDrawer.Heading>
                {description && (
                  <p id={descricaoId} className="text-xs text-slate-500 mt-0.5 truncate">
                    {description}
                  </p>
                )}
              </div>
            </div>
            <IconButton rotulo="Fechar" onClick={onClose} tamanho="sm">
              <X size={14} />
            </IconButton>
          </div>

          {children}

          {footer && (
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              {footer}
            </div>
          )}
        </HeroDrawer.Dialog>
      </HeroDrawer.Content>
    </HeroDrawer.Backdrop>
  );
}
