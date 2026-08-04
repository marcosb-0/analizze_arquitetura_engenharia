import { FileText } from 'lucide-react';
import { Proposta } from '../../types';
import { useFeedback } from '../FeedbackContext';
import { Button, Modal } from '../ui';

interface Props {
  /** A proposta recém-marcada como aprovada, ou `null` com o diálogo fechado. */
  proposta: Proposta | null;
  onFechar: () => void;
  onAprovar: (id: string, status: Proposta['status']) => Promise<boolean>;
  /** Abre o assistente de conversão com a proposta já aprovada. */
  onConverter: (proposta: Proposta) => void;
}

export default function ModalAprovacao({ proposta, onFechar, onAprovar, onConverter }: Props) {
  const { toast } = useFeedback();

  const apenasAprovar = async () => {
    if (!proposta) return;
    const ok = await onAprovar(proposta.id, 'Aprovada');
    onFechar();
    if (ok) toast.success('Proposta aprovada com sucesso.');
  };

  const aprovarEConverter = async () => {
    if (!proposta) return;
    // A aprovação é gravada ANTES de abrir o assistente: a RPC confere o status
    // da proposta no servidor na hora de confirmar, e sem isso o assistente só
    // levaria a uma recusa no fim.
    const ok = await onAprovar(proposta.id, 'Aprovada');
    if (!ok) return;
    const aprovada = { ...proposta, status: 'Aprovada' as const };
    onFechar();
    onConverter(aprovada);
  };

  return (
    <Modal
      id="proposal-conversion-modal"
      open={!!proposta}
      onClose={onFechar}
      title="Criação Automática de Obra"
      size="md"
    >
      {proposta && (
        <>
          <div className="p-4 space-y-3 text-left">
            <p className="text-xs text-slate-600 leading-relaxed">
              A proposta{' '}
              <strong className="font-mono text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                {proposta.numero}
              </strong>{' '}
              foi marcada como <strong>Aprovada</strong>!
            </p>
            <div className="p-3 bg-blue-50 border border-blue-200/50 rounded-lg space-y-1.5">
              <p className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                <FileText size={14} className="text-blue-600" />
                <span>Deseja inicializar o Projeto/Obra automaticamente?</span>
              </p>
              <p className="text-2xs text-blue-800 leading-normal">
                Abriremos o assistente de início de obra: você revisa o orçamento por categoria e o
                cronograma de etapas (pré-preenchidos a partir da proposta) antes de confirmar.
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-2 justify-end">
            <Button
              id="btn-close-proposal-conv"
              type="button"
              onClick={onFechar} variante="secundario"
            >
              Cancelar
            </Button>
            <button
              id="btn-approve-only"
              type="button"
              onClick={apenasAprovar}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-300 rounded transition active:scale-95"
            >
              Apenas Aprovar
            </button>
            <Button
              id="btn-convert-fully"
              type="button"
              onClick={aprovarEConverter}
            >
              Iniciar Obra
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
