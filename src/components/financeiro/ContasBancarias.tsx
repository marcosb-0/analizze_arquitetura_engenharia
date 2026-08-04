import { useState } from 'react';
import { Eye, EyeOff, Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { ContaFinanceira, LancamentoFinanceiro } from '../../types';
import { useFeedback } from '../FeedbackContext';
import { formatBRL } from '../../lib/preco';
import ModalConta from './ModalConta';

interface ContasBancariasProps {
  /** Lista crua, com inativas: aqui elas continuam visíveis para poder reativar. */
  contas: ContaFinanceira[];
  lancamentos: LancamentoFinanceiro[];
  onAddConta: (conta: ContaFinanceira) => Promise<boolean>;
  onUpdateConta: (id: string, patch: Partial<ContaFinanceira>) => Promise<boolean>;
  onExcluirConta: (id: string) => Promise<boolean>;
  onToggleContaAtiva: (id: string, ativa: boolean) => Promise<boolean>;
}

export default function ContasBancarias({
  contas,
  lancamentos,
  onAddConta,
  onUpdateConta,
  onExcluirConta,
  onToggleContaAtiva,
}: ContasBancariasProps) {
  const { toast, confirm } = useFeedback();
  const [modalAberto, setModalAberto] = useState(false);
  /** Conta que o diálogo vai editar; `null` = criação. */
  const [contaEmEdicao, setContaEmEdicao] = useState<ContaFinanceira | null>(null);

  const abrirCriacao = () => { setContaEmEdicao(null); setModalAberto(true); };
  const abrirEdicao = (c: ContaFinanceira) => { setContaEmEdicao(c); setModalAberto(true); };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
        <div>
          <h3 className="font-bold text-slate-800 text-sm">Contas Bancárias de Caixa Ativos</h3>
          <p className="text-2xs text-slate-500 font-semibold uppercase tracking-wider">Bancos cadastrados para faturamentos e pagamentos da empresa</p>
        </div>
        <button
          onClick={abrirCriacao}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1 transition shadow-sm"
        >
          <Plus size={14} /> Cadastrar Nova Conta
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {contas.map(acc => {
          // Calculate receipts and expenses on this specific account
          const accRecebido = lancamentos.filter(l => l.contaId === acc.id && l.tipo === 'Receita' && l.pago).reduce((sum, l) => sum + l.valor, 0);
          const accPago = lancamentos.filter(l => l.contaId === acc.id && l.tipo === 'Despesa' && l.pago).reduce((sum, l) => sum + l.valor, 0);
          // O banco é quem decide (conta_excluir / trg_conta_valida_desativacao);
          // isto aqui só evita oferecer um botão que já se sabe que vai recusar.
          const movimentos = lancamentos.filter(l => l.contaId === acc.id).length;
          const podeExcluir = movimentos === 0;
          const podeDesativar = acc.ativa && movimentos > 0 && acc.saldoAtual === 0;

          return (
            <div key={acc.id} className={`bg-white rounded-2xl border p-5 space-y-4 flex flex-col justify-between shadow-xs relative overflow-hidden group ${acc.ativa ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-2xs bg-slate-100 font-bold px-2 py-0.5 rounded text-slate-500 uppercase tracking-wide">{acc.tipo}</span>
                    {!acc.ativa && (
                      <span className="text-2xs bg-slate-200 font-extrabold px-2 py-0.5 rounded text-slate-600 uppercase tracking-wide">Inativa</span>
                    )}
                  </div>
                  <h4 className="font-extrabold text-slate-800 text-sm pt-1">{acc.nome}</h4>
                  <p className="text-2xs text-slate-500 font-semibold">{acc.banco}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => abrirEdicao(acc)}
                    className="p-2 hover:bg-slate-100 hover:text-blue-600 rounded-lg text-slate-500 transition"
                    title="Editar conta"
                  >
                    <Pencil size={14} />
                  </button>

                  {podeExcluir && (
                    <button
                      onClick={() => confirm({
                        title: `Excluir a conta "${acc.nome}"?`,
                        message: acc.saldoInicial !== 0
                          ? `Esta conta nunca movimentou, mas declara saldo inicial de ${formatBRL(acc.saldoInicial)} — esse valor sai do total em caixa. Esta ação é irreversível.`
                          : 'Esta conta nunca movimentou. Esta ação é irreversível.',
                        onConfirm: async () => {
                          if (await onExcluirConta(acc.id)) toast.success('Conta excluída.');
                        },
                      })}
                      className="p-2 hover:bg-slate-100 hover:text-rose-600 rounded-lg text-slate-500 transition"
                      title="Excluir conta (sem movimento)"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}

                  {podeDesativar && (
                    <button
                      onClick={() => confirm({
                        title: `Desativar a conta "${acc.nome}"?`,
                        message: 'Ela sai dos seletores de lançamento, folha e faturamento, e do total em caixa. Os lançamentos históricos continuam intactos e seguem mostrando o nome dela. Dá para reativar depois.',
                        confirmLabel: 'Desativar',
                        tone: 'normal',
                        onConfirm: async () => {
                          if (await onToggleContaAtiva(acc.id, false)) toast.success('Conta desativada.');
                        },
                      })}
                      className="p-2 hover:bg-slate-100 hover:text-amber-600 rounded-lg text-slate-500 transition"
                      title="Desativar conta (saldo zerado)"
                    >
                      <EyeOff size={14} />
                    </button>
                  )}

                  {!acc.ativa && (
                    <button
                      onClick={async () => {
                        if (await onToggleContaAtiva(acc.id, true)) toast.success('Conta reativada.');
                      }}
                      className="p-2 hover:bg-slate-100 hover:text-emerald-600 rounded-lg text-slate-500 transition"
                      title="Reativar conta"
                    >
                      <Eye size={14} />
                    </button>
                  )}

                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                    <Landmark size={18} />
                  </div>
                </div>
              </div>

              <div className="py-2 border-t border-b border-dashed border-slate-100 flex justify-between text-2xs">
                <div className="text-left">
                  <span className="text-slate-500 font-bold text-2xs block uppercase">Entradas Acumuladas</span>
                  <span className="text-emerald-600 font-bold font-mono">{formatBRL(accRecebido)}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 font-bold text-2xs block uppercase">Saídas Acumuladas</span>
                  <span className="text-rose-600 font-bold font-mono">{formatBRL(accPago)}</span>
                </div>
              </div>

              <div className="flex justify-between items-baseline pt-1">
                <span className="text-2xs text-slate-500 font-bold uppercase">Saldo Atual</span>
                <span className="text-xl font-extrabold text-slate-900 font-mono">
                  {formatBRL(acc.saldoAtual)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <ModalConta
        open={modalAberto}
        conta={contaEmEdicao}
        onClose={() => setModalAberto(false)}
        onAddConta={onAddConta}
        onUpdateConta={onUpdateConta}
      />
    </div>
  );
}
