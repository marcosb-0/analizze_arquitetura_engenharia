import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from './ui';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Ação que não é "criar o primeiro item" — hoje só o "limpar filtros" do `EstadoDaLista`. */
  children?: ReactNode;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  children
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center space-y-4 w-full bg-white border border-slate-200 rounded-lg shadow-sm">
      <div className="anim-selo">
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-full text-slate-500 inline-block">
          <Icon size={40} className="stroke-1" />
        </div>
      </div>
      
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-slate-800">
          {title}
        </h3>
        <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
          {description}
        </p>
      </div>
      
      {actionLabel && onAction && (
        <Button
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}

      {children}
    </div>
  );
}
