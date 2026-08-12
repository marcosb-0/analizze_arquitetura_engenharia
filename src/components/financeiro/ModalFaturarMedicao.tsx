import { useState } from 'react';
import { ContaFinanceira, MedicaoRecente } from '../../types';
import { Button, Field, Modal, Select } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import { naoEscolhido } from '../../lib/validacao';
import { formatBRL } from '../../lib/preco';
import { formatarDataBR } from '../../lib/data';

interface ModalFaturarMedicaoProps {
  /** Medição a faturar; `null` mantém o diálogo fechado. */
  medicao: MedicaoRecente | null;
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
  medicao: MedicaoRecente;
  gerando: boolean;
  setGerando: (v: boolean) => void;
}) {
  const { erros, validar, limparErro, areaRef } = useValidacao<'conta'>();
  const [contaId, setContaId] = useState(contasAtivas[0]?.id ?? '');
  const [pago, setPago] = useState(false);

  const confirmar = async () => {
    if (
      !validar([{ campo: 'conta', invalido: naoEscolhido(contaId), erro: 'Escolha a conta de destino.' }])
    ) return;
    setGerando(true);
    const ok = await onGerarFaturamento(medicao.id, contaId, pago);
    setGerando(false);
    if (ok) onClose();
  };

  return (
    <>
      <div ref={areaRef as React.RefObject<HTMLDivElement>} className="p-5 space-y-4 text-left overflow-y-auto">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-800">{obraNome}</p>
            <p className="text-2xs text-slate-500 mt-0.5">Medição de {formatarDataBR(medicao.dataMedicao)}</p>
          </div>
          <span className="text-base font-mono font-bold text-emerald-600">
            {formatBRL(medicao.valorMedido)}
          </span>
        </div>
        <Field label="Conta de destino" erro={erros.conta} required>
          {(props) => (
            <Select {...props} value={contaId} onChange={(e) => { setContaId(e.target.value); limparErro('conta'); }}>
              <option value="">Selecione a conta…</option>
              {contasAtivas.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.banco}</option>)}
            </Select>
          )}
        </Field>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-200" />
          Marcar como já recebido (senão entra como "a receber")
        </label>
        <p className="text-2xs text-slate-500 leading-snug">
          Será criada uma receita <strong>Faturamento Obra</strong> vinculada a esta medição e à obra. Cada medição só pode ser faturada uma vez.
        </p>
      </div>
      <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 flex justify-end gap-2">
        <Button onClick={onClose} disabled={gerando} variante="secundario">Cancelar</Button>
        <button onClick={confirmar} disabled={gerando} className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition shadow-sm disabled:opacity-60">
          {gerando ? 'Gerando…' : 'Gerar faturamento'}
        </button>
      </div>
    </>
  );
}
