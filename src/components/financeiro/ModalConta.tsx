import React, { useState } from 'react';
import { ContaFinanceira } from '../../types';
import { Modal } from '../ui';
import { useFeedback } from '../FeedbackContext';

interface ModalContaProps {
  open: boolean;
  /** Conta em edição; `null` = o diálogo está criando. */
  conta: ContaFinanceira | null;
  onClose: () => void;
  onAddConta: (conta: ContaFinanceira) => Promise<boolean>;
  onUpdateConta: (id: string, patch: Partial<ContaFinanceira>) => Promise<boolean>;
}

/**
 * O corpo do `Modal` só é montado enquanto ele está aberto, então o estado
 * nasce da conta recebida a cada abertura — sem helper de limpeza e sem risco
 * de um ponto de abertura esquecer de zerar os campos.
 */
export default function ModalConta({ open, conta, onClose, onAddConta, onUpdateConta }: ModalContaProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={conta ? `Editar conta — ${conta.nome}` : 'Vincular Nova Conta Financeira'}
      size="md"
    >
      <FormularioConta conta={conta} onClose={onClose} onAddConta={onAddConta} onUpdateConta={onUpdateConta} />
    </Modal>
  );
}

function FormularioConta({
  conta,
  onClose,
  onAddConta,
  onUpdateConta,
}: Omit<ModalContaProps, 'open'>) {
  const { toast } = useFeedback();
  const [nome, setNome] = useState(conta?.nome ?? '');
  const [banco, setBanco] = useState(conta?.banco ?? '');
  const [tipo, setTipo] = useState<'Corrente' | 'Poupança' | 'Caixa Interno'>(conta?.tipo ?? 'Corrente');
  const [saldo, setSaldo] = useState(conta ? String(conta.saldoInicial) : '');

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !banco || !saldo) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    const saldoInicial = parseFloat(saldo);
    if (isNaN(saldoInicial)) {
      toast.error('Saldo inicial inválido.');
      return;
    }

    if (conta) {
      if (!(await onUpdateConta(conta.id, { nome, banco, tipo, saldoInicial }))) return;
      onClose();
      toast.success('Conta financeira atualizada.');
      return;
    }

    // O modal só fecha se o banco aceitou — senão o usuário perderia o que
    // digitou junto com o registro que não existiu.
    const nova: ContaFinanceira = {
      id: crypto.randomUUID(),
      nome,
      banco,
      tipo,
      saldoInicial,
      saldoAtual: saldoInicial,
      ativa: true,
    };
    if (!(await onAddConta(nova))) return;

    onClose();
    toast.success('Conta financeira registrada com sucesso.');
  };

  return (
    <form onSubmit={salvar} className="p-5 space-y-4 overflow-y-auto">
      <div className="space-y-1">
        <label className="text-2xs font-bold text-slate-500 uppercase">Nome Identificador da Conta</label>
        <input
          type="text"
          required
          placeholder="Ex: Conta Caixa PJ, Fundo Reserva..."
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase">Instituição / Banco</label>
          <input
            type="text"
            required
            placeholder="Ex: Banco do Brasil, Itaú..."
            value={banco}
            onChange={(e) => setBanco(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600"
          />
        </div>

        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase">Tipo de Caixa</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as ContaFinanceira['tipo'])}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-medium text-slate-700"
          >
            <option value="Corrente">Conta Corrente</option>
            <option value="Poupança">Conta Poupança</option>
            <option value="Caixa Interno">Caixa Interno (Caixinha)</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-2xs font-bold text-slate-500 uppercase">Saldo Inicial de Implantação (R$)</label>
        <input
          type="number"
          step="any"
          required
          placeholder="0.00"
          value={saldo}
          onChange={(e) => setSaldo(e.target.value)}
          className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-mono font-bold"
        />
      </div>

      <button
        type="submit"
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-2.5 rounded-lg text-xs transition mt-2 shadow-sm"
      >
        {conta ? 'Salvar Alterações' : 'Vincular Conta Bancária'}
      </button>
    </form>
  );
}
