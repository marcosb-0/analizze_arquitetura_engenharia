import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Button, Card } from './ui';

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
    /* Era `rounded-lg shadow-sm` escrito à mão — o dialeto de superfície que o
       redesenho de 14/ago aposentou (a superfície é `<Card>`: 16px de raio e
       nenhuma sombra parada). O estado vazio aparece em treze telas, então era
       a peça que mais espalhava o raio antigo. */
    <Card className="flex flex-col items-center justify-center p-10 text-center space-y-4 w-full">
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
    </Card>
  );
}
