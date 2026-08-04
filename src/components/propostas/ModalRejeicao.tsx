import React, { useState } from 'react';
import { Proposta } from '../../types';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Modal } from '../ui';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  proposta: Proposta;
  onRejeitar: (id: string, motivo: string) => Promise<boolean>;
}

/**
 * Recusa sem motivo registrado é a informação mais cara do ciclo indo embora —
 * preço, prazo, escopo ou concorrente. Por isso a recusa não passa pelo
 * seletor de status direto.
 */
export default function ModalRejeicao({ aberto, onFechar, ...resto }: Props) {
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal
      id="rejeicao-modal"
      open={aberto}
      onClose={onFechar}
      title="Registrar recusa"
      size="sm"
      bloqueado={salvando}
    >
      <Formulario {...resto} salvando={salvando} setSalvando={setSalvando} onFechar={onFechar} />
    </Modal>
  );
}

function Formulario({
  proposta,
  onRejeitar,
  onFechar,
  salvando,
  setSalvando,
}: Omit<Props, 'aberto'> & {
  salvando: boolean;
  setSalvando: (v: boolean) => void;
}) {
  const { toast } = useFeedback();
  const [motivo, setMotivo] = useState('');

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) {
      toast.error('Informe o motivo da recusa.');
      return;
    }
    setSalvando(true);
    const ok = await onRejeitar(proposta.id, motivo.trim());
    setSalvando(false);
    if (!ok) return;
    onFechar();
    toast.success('Proposta marcada como rejeitada.', 'O motivo ficou registrado no histórico.');
  };

  return (
    <form onSubmit={submeter} className="p-4 space-y-4 text-left">
      <p className="text-xs text-slate-600 leading-relaxed">
        A proposta <strong className="font-mono text-slate-900">{proposta.numero}</strong> será
        marcada como rejeitada. O orçamento fica preservado como histórico.
      </p>
      <div>
        <label
          htmlFor="motivo-rejeicao"
          className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1"
        >
          Motivo da recusa *
        </label>
        <textarea
          id="motivo-rejeicao"
          required
          autoFocus
          disabled={salvando}
          rows={3}
          placeholder="Ex: preço acima do concorrente; prazo de execução incompatível; obra adiada pelo cliente."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-800 disabled:bg-slate-50"
        />
        <p className="text-2xs text-slate-500 mt-1 leading-tight">
          É o dado que explica a taxa de conversão — sem ele, só se sabe que perdeu.
        </p>
      </div>
      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <button
          type="button"
          disabled={salvando}
          onClick={onFechar}
          className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={salvando}
          className="bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          {salvando ? (
            <>
              <Spinner size={14} />
              <span>Registrando...</span>
            </>
          ) : (
            <span>Marcar como rejeitada</span>
          )}
        </button>
      </div>
    </form>
  );
}
