import { useState } from 'react';
import { ContaFinanceira, MedicaoObra } from '../../types';
import { Modal } from '../ui';
import { useFeedback } from '../FeedbackContext';
import { formatBRL } from '../../lib/preco';
import { formatarDataBR } from '../../lib/data';

interface ModalFaturarMedicaoProps {
  /** Medição a faturar; `null` mantém o diálogo fechado. */
  medicao: MedicaoObra | null;
  obraNome: string;
  contasAtivas: ContaFinanceira[];
  onClose: () => void;
  onGerarFaturamento: (medicaoId: string, contaId: string, pago: boolean) => Promise<boolean>;
}

export default function ModalFaturarMedicao({ medicao, ...resto }: ModalFaturarMedicaoProps) {
  // `gerando` fica aqui porque o Modal precisa dele para travar o fechamento;
  // o resto do formulário mora no corpo, que só monta quando o diálogo abre.
  const [gerando, setGerando] = useState(false);

  return (
    <Modal open={!!medicao} onClose={resto.onClose} title="Faturar Medição" size="md" bloqueado={gerando}>
      {medicao && <CorpoFaturamento medicao={medicao} gerando={gerando} setGerando={setGerando} {...resto} />}
    </Modal>
  );
}

function CorpoFaturamento({
  medicao,
  obraNome,
  contasAtivas,
  onClose,
  onGerarFaturamento,
  gerando,
  setGerando,
}: ModalFaturarMedicaoProps & {
  medicao: MedicaoObra;
  gerando: boolean;
  setGerando: (v: boolean) => void;
}) {
  const { toast } = useFeedback();
  const [contaId, setContaId] = useState(contasAtivas[0]?.id ?? '');
  const [pago, setPago] = useState(false);

  const confirmar = async () => {
    if (!contaId) {
      toast.error('Selecione a conta de destino.');
      return;
    }
    setGerando(true);
    const ok = await onGerarFaturamento(medicao.id, contaId, pago);
    setGerando(false);
    if (ok) onClose();
  };

  return (
    <>
      <div className="p-5 space-y-4 text-left overflow-y-auto">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-800">{obraNome}</p>
            <p className="text-2xs text-slate-500 mt-0.5">Medição de {formatarDataBR(medicao.dataMedicao)}</p>
          </div>
          <span className="text-base font-mono font-bold text-emerald-600">
            {formatBRL(medicao.valorMedido)}
          </span>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">Conta de destino</label>
          <select value={contaId} onChange={(e) => setContaId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300">
            <option value="">Selecione a conta…</option>
            {contasAtivas.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.banco}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-200" />
          Marcar como já recebido (senão entra como "a receber")
        </label>
        <p className="text-2xs text-slate-500 leading-snug">
          Será criada uma receita <strong>Faturamento Obra</strong> vinculada a esta medição e à obra. Cada medição só pode ser faturada uma vez.
        </p>
      </div>
      <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 flex justify-end gap-2">
        <button onClick={onClose} disabled={gerando} className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg transition disabled:opacity-50">Cancelar</button>
        <button onClick={confirmar} disabled={gerando} className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-sm disabled:opacity-60">
          {gerando ? 'Gerando…' : 'Gerar faturamento'}
        </button>
      </div>
    </>
  );
}
