import React, { useState } from 'react';
import { X } from 'lucide-react';
import { MedicaoObra } from '../../types';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Modal } from '../ui';

interface Props {
  /** A medição a recusar, ou `null` com o diálogo fechado. */
  medicao: MedicaoObra | null;
  nomeEtapa?: string;
  onFechar: () => void;
  /** Trava o diálogo enquanto a recusa está em curso. */
  ocupado: boolean;
  onConfirmar: (motivo: string) => Promise<void>;
}

/**
 * Rejeitar exige justificativa: o `confirm` compartilhado não coleta texto, e
 * sem motivo quem lançou o boletim (o campo, pelo app) fica sabendo só que foi
 * recusado. O banco aceita motivo nulo por compatibilidade — a obrigação é aqui.
 */
export default function ModalRejeitarMedicao({
  medicao,
  nomeEtapa,
  onFechar,
  ocupado,
  onConfirmar,
}: Props) {
  return (
    <Modal
      id="rejeitar-medicao-modal"
      open={!!medicao}
      onClose={onFechar}
      title="Rejeitar Medição"
      description={
        medicao ? `${nomeEtapa ?? 'Etapa removida'} · +${medicao.percentualMedido}%` : undefined
      }
      size="sm"
      bloqueado={ocupado}
    >
      {medicao && <Formulario ocupado={ocupado} onConfirmar={onConfirmar} onFechar={onFechar} />}
    </Modal>
  );
}

function Formulario({
  ocupado,
  onConfirmar,
  onFechar,
}: Pick<Props, 'ocupado' | 'onConfirmar' | 'onFechar'>) {
  const { toast } = useFeedback();
  const [motivo, setMotivo] = useState('');

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    const texto = motivo.trim();
    if (texto.length < 5) {
      toast.error('Descreva o motivo da recusa.', 'Quem lançou a medição precisa saber o que corrigir.');
      return;
    }
    await onConfirmar(texto);
  };

  return (
    <form onSubmit={submeter} className="p-4 space-y-4 text-left">
      <p className="text-xs text-slate-600 leading-relaxed">
        O boletim fica marcado como rejeitado e não afeta o orçamento. O motivo abaixo aparece no
        boletim para quem o lançou.
      </p>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
          Motivo da recusa *
        </label>
        <textarea
          id="motivo-rejeicao-input"
          required
          autoFocus
          disabled={ocupado}
          rows={3}
          placeholder="Ex: falta o registro fotográfico da face norte; o percentual não confere com o executado em campo."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-rose-500 text-slate-800 disabled:bg-slate-50"
        />
      </div>

      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <button
          type="button"
          disabled={ocupado}
          onClick={onFechar}
          className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          id="submit-rejeitar-medicao-btn"
          type="submit"
          disabled={ocupado}
          className="bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-60"
        >
          {ocupado ? (
            <>
              <Spinner size={14} />
              <span>Rejeitando...</span>
            </>
          ) : (
            <>
              <X size={14} />
              <span>Rejeitar Boletim</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
