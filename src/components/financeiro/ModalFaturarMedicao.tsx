import { useState } from 'react';
import { ContaFinanceira, MedicaoRecente } from '../../types';
import { Button, Field, Modal, Select, Checkbox, Typography } from '../ui';
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
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
          <div>
            <Typography type="body-sm" weight="semibold">{obraNome}</Typography>
            <Typography type="body-xs" color="muted" className="mt-0.5">Medição de {formatarDataBR(medicao.dataMedicao)}</Typography>
          </div>
          <span className="text-base font-mono font-semibold text-emerald-700">
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
        <Checkbox checked={pago} onChange={setPago} className="flex items-center gap-2 text-sm font-semibold text-slate-500 cursor-pointer">
          Marcar como já recebido (senão entra como "a receber")
        </Checkbox>
        <Typography type="body-xs" color="muted" className="leading-snug">
          Será criada uma receita <strong>Faturamento Obra</strong> vinculada a esta medição e à obra. Cada medição só pode ser faturada uma vez.
        </Typography>
      </div>
      <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
        <Button onClick={onClose} disabled={gerando} variante="secundario">Cancelar</Button>
        <Button onClick={confirmar} carregando={gerando}>
          {gerando ? 'Gerando…' : 'Gerar faturamento'}
        </Button>
      </div>
    </>
  );
}
