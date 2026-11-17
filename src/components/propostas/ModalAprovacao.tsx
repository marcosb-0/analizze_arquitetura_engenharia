import { FileText } from 'lucide-react';
import { Proposta } from '../../types';
import { useFeedback } from '../FeedbackContext';
import { Aviso, Button, Modal } from '../ui';

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
            <p className="text-xs text-slate-500 leading-relaxed">
              A proposta{' '}
              <strong className="font-mono text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded-lg">
                {proposta.numero}
              </strong>{' '}
              foi marcada como <strong>Aprovada</strong>!
            </p>
            <Aviso tom="informativo" icone={<FileText size={14} />}>
              <span className="block font-semibold">Deseja inicializar o Projeto/Obra automaticamente?</span>
              <p className="text-2xs leading-normal">
                Abriremos o assistente de início de obra: você revisa o orçamento por categoria e o
                cronograma de etapas (pré-preenchidos a partir da proposta) antes de confirmar.
              </p>
            </Aviso>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-2 justify-end">
            <Button
              id="btn-close-proposal-conv"
              type="button"
              onClick={onFechar} variante="secundario"
            >
              Cancelar
            </Button>
            <Button id="btn-approve-only" variante="secundario" onClick={apenasAprovar}>
              Apenas Aprovar
            </Button>
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
