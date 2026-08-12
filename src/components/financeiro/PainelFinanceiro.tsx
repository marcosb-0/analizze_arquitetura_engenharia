import { useMemo, useState } from 'react';
import {
  DollarSign,
  Landmark,
  Percent,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  ContaFinanceira,
  Fornecedor,
  Funcionario,
  LancamentoFinanceiro,
  MedicaoRecente,
  Projeto,
} from '../../types';
import { formatBRL } from '../../lib/preco';
import { formatarDataBR } from '../../lib/data';
import ModalConta from './ModalConta';
import ModalFaturarMedicao from './ModalFaturarMedicao';
import ModalLancamento from './ModalLancamento';

const MESES_CURTOS: { [key: string]: string } = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez'
};

interface PainelFinanceiroProps {
  lancamentos: LancamentoFinanceiro[];
  contasAtivas: ContaFinanceira[];
  /**
   * Só os boletins aprovados com valor, de todas as obras (`v_medicao_recente`).
   * Era `MedicaoObra[]` com as medições INTEIRAS de todas as obras — §4.2, item
   * 23: esta tela nunca usou foto, motivo de rejeição nem autor da aprovação.
   */
  medicoesAFaturar: MedicaoRecente[];
  projetos: Projeto[];
  funcionarios: Funcionario[];
  fornecedores: Fornecedor[];
  onAddConta: (conta: ContaFinanceira) => Promise<boolean>;
  onUpdateConta: (id: string, patch: Partial<ContaFinanceira>) => Promise<boolean>;
  onAddLancamento: (lan: LancamentoFinanceiro) => Promise<boolean>;
  onUpdateLancamento: (id: string, patch: Partial<LancamentoFinanceiro>) => Promise<boolean>;
  onGerarFaturamento: (medicaoId: string, contaId: string, pago: boolean) => Promise<boolean>;
  /** Abre o razão já filtrado no que está vencido daquele lado. */
  onVerVencidos: (tipo: 'Receita' | 'Despesa') => void;
  onIrParaContas: () => void;
  onIrParaFolha: () => void;
}

export default function PainelFinanceiro({
  lancamentos,
  contasAtivas,
  medicoesAFaturar,
  projetos,
  funcionarios,
  fornecedores,
  onAddConta,
  onUpdateConta,
  onAddLancamento,
  onUpdateLancamento,
  onGerarFaturamento,
  onVerVencidos,
  onIrParaContas,
  onIrParaFolha,
}: PainelFinanceiroProps) {
  const [modalLancamentoAberto, setModalLancamentoAberto] = useState(false);
  /** Sobrevive ao fechamento de propósito: zerá-lo trocaria o título do diálogo
   *  no meio da animação de saída. */
  const [tipoNovoLancamento, setTipoNovoLancamento] = useState<'Receita' | 'Despesa'>('Despesa');
  const [modalContaAberto, setModalContaAberto] = useState(false);
  const [faturarMedicao, setFaturarMedicao] = useState<MedicaoRecente | null>(null);

  const getProjetoNome = (projetoId?: string) => projetos.find(p => p.id === projetoId)?.nome ?? 'Obra';

  const abrirLancamento = (tipo: 'Receita' | 'Despesa') => {
    setTipoNovoLancamento(tipo);
    setModalLancamentoAberto(true);
  };

  // "Medições a Faturar": measurements that executed budget value but haven't
  // been turned into a "Faturamento Obra" revenue yet. Links the obra's physical
  // execution to the ledger without any silent write — the user confirms each.
  const faturadasMedicaoIds = useMemo(
    () => new Set(lancamentos.filter(l => l.categoria === 'Faturamento Obra' && l.medicaoId).map(l => l.medicaoId)),
    [lancamentos]
  );
  /**
   * `valorMedido > 0` saiu daqui: agora é filtro de servidor
   * (`resumoService.listAFaturar`). O que sobra é o cruzamento com o razão, que
   * não dá para fazer lá — `lancamentos_financeiros` tem matriz de acesso
   * própria e uma view sobre ele teria de escolher entre mentir para `gestao` ou
   * abrir o razão para ele (§11.8).
   */
  const pendentesDeFaturamento = useMemo(
    () => medicoesAFaturar
      .filter(m => !faturadasMedicaoIds.has(m.id))
      .sort((a, b) => (a.dataMedicao < b.dataMedicao ? 1 : -1)),
    [medicoesAFaturar, faturadasMedicaoIds]
  );

  /**
   * Comparação de vencimento é feita em string YYYY-MM-DD, não em Date: `data`
   * e `data_vencimento` são `date` no Postgres, sem fuso, e `new Date('2026-07-31')`
   * é interpretado como UTC — em BRT vira o dia 30 e uma conta que vence hoje
   * apareceria como vencida.
   */
  const hoje = new Date().toISOString().split('T')[0];

  const aging = useMemo(() => {
    const emSete = new Date();
    emSete.setDate(emSete.getDate() + 7);
    const limite = emSete.toISOString().split('T')[0];

    const bucket = () => ({ vencido: 0, proximo: 0, aVencer: 0 });
    const pagar = bucket();
    const receber = bucket();

    lancamentos.forEach(l => {
      if (l.pago) return;
      const alvo = l.tipo === 'Despesa' ? pagar : receber;
      if (l.dataVencimento < hoje) alvo.vencido += l.valor;
      else if (l.dataVencimento <= limite) alvo.proximo += l.valor;
      else alvo.aVencer += l.valor;
    });

    return { pagar, receber };
  }, [lancamentos, hoje]);

  // --- CALCULATE SUMMARY METRICS ---
  const metrics = useMemo(() => {
    const totalContasBalance = contasAtivas.reduce((sum, c) => sum + c.saldoAtual, 0);

    let totalRecebido = 0;
    let totalPendenteReceber = 0;
    let totalPago = 0;
    let totalPendentePagar = 0;

    lancamentos.forEach(l => {
      if (l.tipo === 'Receita') {
        if (l.pago) {
          totalRecebido += l.valor;
        } else {
          totalPendenteReceber += l.valor;
        }
      } else {
        if (l.pago) {
          totalPago += l.valor;
        } else {
          totalPendentePagar += l.valor;
        }
      }
    });

    return {
      totalContasBalance,
      totalRecebido,
      totalPendenteReceber,
      totalPago,
      totalPendentePagar,
      netBalance: totalRecebido - totalPago,
    };
  }, [lancamentos, contasAtivas]);

  // --- PREPARE CHART DATA ---
  const chartData = useMemo(() => {
    // Group lancamentos by month (YYYY-MM)
    const grouped: { [key: string]: { receitas: number; despesas: number } } = {};

    // Sort transactions chronologically
    const sorted = [...lancamentos].sort((a, b) => a.data.localeCompare(b.data));

    sorted.forEach(l => {
      if (!l.data) return;
      const dateParts = l.data.split('-');
      if (dateParts.length < 2) return;
      const monthLabel = `${dateParts[0]}-${dateParts[1]}`; // YYYY-MM

      if (!grouped[monthLabel]) {
        grouped[monthLabel] = { receitas: 0, despesas: 0 };
      }

      if (l.pago) { // Only count executed flow
        if (l.tipo === 'Receita') {
          grouped[monthLabel].receitas += l.valor;
        } else {
          grouped[monthLabel].despesas += l.valor;
        }
      }
    });

    return Object.keys(grouped).map(key => {
      const [year, month] = key.split('-');
      const monthName = MESES_CURTOS[month] || month;
      return {
        mes: `${monthName}/${year.substring(2)}`,
        'Receitas (R$)': parseFloat(grouped[key].receitas.toFixed(2)),
        'Despesas (R$)': parseFloat(grouped[key].despesas.toFixed(2)),
        'Saldo (R$)': parseFloat((grouped[key].receitas - grouped[key].despesas).toFixed(2))
      };
    }).slice(-6); // Last 6 active months
  }, [lancamentos]);

  /**
   * Só despesa efetivada, igual ao gráfico ao lado e ao card "Despesas
   * Consolidadas": este painel decompõe exatamente aquele total. Antes somava
   * também as pendentes, então os dois quadros vizinhos mostravam números que
   * não fechavam.
   */
  const despesasPorCategoria = useMemo(() => {
    const porCategoria: { [key: string]: number } = {};
    let total = 0;

    lancamentos.forEach(l => {
      if (l.tipo === 'Despesa' && l.pago) {
        porCategoria[l.categoria] = (porCategoria[l.categoria] || 0) + l.valor;
        total += l.valor;
      }
    });

    return Object.keys(porCategoria)
      .map(cat => ({
        name: cat,
        value: porCategoria[cat],
        percent: total > 0 ? (porCategoria[cat] / total) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);
  }, [lancamentos]);

  return (
    <div className="space-y-6">

      {/* Medições a Faturar — liga a execução física da obra ao caixa */}
      {pendentesDeFaturamento.length > 0 && (
        <div className="bg-white border border-emerald-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-emerald-100 bg-emerald-50/50">
            <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
              <Percent size={15} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-none">Medições a Faturar</h3>
              <p className="text-2xs text-slate-500 mt-1">Execução medida em obra que ainda não virou receita. Revise e gere o faturamento.</p>
            </div>
            <span className="ml-auto text-2xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
              {pendentesDeFaturamento.length}
            </span>
          </div>
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {pendentesDeFaturamento.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-800 truncate">{getProjetoNome(m.projetoId)}</p>
                  <p className="text-2xs text-slate-500 mt-0.5">
                    Medição de {formatarDataBR(m.dataMedicao)} · +{m.percentualMedido}%
                  </p>
                </div>
                <span className="text-sm font-mono font-bold text-emerald-600 shrink-0">
                  {formatBRL(m.valorMedido)}
                </span>
                <button
                  onClick={() => setFaturarMedicao(m)}
                  className="shrink-0 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shadow-sm"
                >
                  Faturar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aging — o que está em aberto, por urgência. Antes "Contas a pagar"
          era um número só, sem noção de atraso. */}
      {(aging.pagar.vencido + aging.pagar.proximo + aging.pagar.aVencer +
        aging.receber.vencido + aging.receber.proximo + aging.receber.aVencer) > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {([
            { titulo: 'A Pagar', dados: aging.pagar, cor: 'rose' as const, tipo: 'Despesa' as const },
            { titulo: 'A Receber', dados: aging.receber, cor: 'emerald' as const, tipo: 'Receita' as const },
          ]).map(({ titulo, dados, cor, tipo }) => (
            <div key={titulo} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-800 text-sm">{titulo}</h3>
                <span className="text-2xs text-slate-500 font-bold uppercase tracking-wider">Por vencimento</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <button
                  onClick={() => onVerVencidos(tipo)}
                  className={`p-3 rounded-xl border transition text-left ${dados.vencido > 0 ? 'bg-rose-50 border-rose-200 hover:bg-rose-100/60' : 'bg-slate-50 border-slate-200'}`}
                >
                  <span className="text-2xs font-extrabold uppercase tracking-wider block text-slate-500">Vencido</span>
                  <span className={`text-sm font-mono font-extrabold ${dados.vencido > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                    {formatBRL(dados.vencido)}
                  </span>
                </button>
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 text-left">
                  <span className="text-2xs font-extrabold uppercase tracking-wider block text-slate-500">Em 7 dias</span>
                  <span className="text-sm font-mono font-extrabold text-amber-600">{formatBRL(dados.proximo)}</span>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-left">
                  <span className="text-2xs font-extrabold uppercase tracking-wider block text-slate-500">A vencer</span>
                  <span className={`text-sm font-mono font-extrabold ${cor === 'rose' ? 'text-slate-600' : 'text-emerald-600'}`}>
                    {formatBRL(dados.aVencer)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Account Balance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-2xs font-bold uppercase tracking-wider">Saldo Total em Caixa</span>
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
              <Landmark size={15} />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-extrabold text-slate-900 font-mono">
              {formatBRL(metrics.totalContasBalance)}
            </span>
            <p className="text-2xs text-slate-500 mt-1 font-semibold">Consolidado em {contasAtivas.length} conta(s) ativa(s)</p>
          </div>
        </div>

        {/* Income Received */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-2xs font-bold uppercase tracking-wider">Receitas Consolidadas</span>
            <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
              <TrendingUp size={15} />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-extrabold text-emerald-600 font-mono">
              {formatBRL(metrics.totalRecebido)}
            </span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-2xs text-slate-500 font-semibold">Pendentes: {formatBRL(metrics.totalPendenteReceber)}</span>
            </div>
          </div>
        </div>

        {/* Expenses Paid */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-2xs font-bold uppercase tracking-wider">Despesas Consolidadas</span>
            <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center">
              <TrendingDown size={15} />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-extrabold text-rose-600 font-mono">
              {formatBRL(metrics.totalPago)}
            </span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-2xs text-slate-500 font-semibold">Contas a pagar: {formatBRL(metrics.totalPendentePagar)}</span>
            </div>
          </div>
        </div>

        {/* Net Operating Balance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-2xs font-bold uppercase tracking-wider">Resultado Líquido</span>
            <div className="w-8 h-8 bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center">
              <DollarSign size={15} />
            </div>
          </div>
          <div className="mt-4">
            <span className={`text-2xl font-extrabold font-mono ${metrics.netBalance >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
              {formatBRL(metrics.netBalance)}
            </span>
            <p className="text-2xs text-slate-500 mt-1 font-semibold">Diferença entre Receitas e Despesas Pagas</p>
          </div>
        </div>
      </div>

      {/* Cash Flow Graphics and Category Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Evolução do Fluxo de Caixa</h3>
              <p className="text-2xs text-slate-500 font-semibold uppercase">Histórico mensal consolidado de entradas e saídas efetivadas</p>
            </div>
          </div>
          <div className="h-64 mt-2">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Dados insuficientes para desenhar gráfico histórico.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#64748B', fontWeight: 600 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#64748B', fontWeight: 600 }} />
                  <Tooltip formatter={(value) => [formatBRL(Number(value))]} contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px', fontWeight: 'bold' }} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }} />
                  <Bar dataKey="Receitas (R$)" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Despesas (R$)" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Quick overview of Corporate Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Distribuição de Despesas</h3>
            <p className="text-2xs text-slate-500 font-semibold uppercase">Centros de custo das despesas efetivadas — histórico completo</p>
          </div>

          <div className="space-y-3 pt-2">
            {despesasPorCategoria.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                Nenhuma despesa efetivada para cálculo de centros de custo.
              </div>
            ) : (
              despesasPorCategoria.map((item, idx) => {
                const colors = ['bg-rose-500', 'bg-amber-500', 'bg-violet-500', 'bg-blue-500', 'bg-indigo-500', 'bg-slate-500'];
                const colorClass = colors[idx % colors.length];

                return (
                  <div key={item.name} className="space-y-1 text-xs">
                    <div className="flex justify-between items-center font-semibold text-slate-700">
                      <span className="truncate">{item.name}</span>
                      <span className="font-mono text-slate-900">{formatBRL(item.value)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className={`${colorClass} h-full rounded-full`} style={{ width: `${item.percent}%` }} />
                      </div>
                      <span className="text-2xs font-bold text-slate-500 font-mono shrink-0 w-8 text-right">{item.percent.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions and Bank Account Summary inside Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Quick Actions Cards */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-800 text-sm">Ações Financeiras Rápidas</h3>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={() => abrirLancamento('Despesa')}
              className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-rose-50/40 border border-slate-200 hover:border-rose-200 rounded-xl transition text-center space-y-2 group"
            >
              <div className="w-10 h-10 bg-rose-50 group-hover:bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center transition">
                <TrendingDown size={18} />
              </div>
              <span className="text-xs font-bold text-slate-800">Registrar Despesa</span>
              <span className="text-2xs text-slate-500 font-semibold">Contas, taxas, compras</span>
            </button>

            <button
              onClick={() => abrirLancamento('Receita')}
              className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-emerald-50/40 border border-slate-200 hover:border-emerald-200 rounded-xl transition text-center space-y-2 group"
            >
              <div className="w-10 h-10 bg-emerald-50 group-hover:bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center transition">
                <TrendingUp size={18} />
              </div>
              <span className="text-xs font-bold text-slate-800">Lançar Receita</span>
              <span className="text-2xs text-slate-500 font-semibold">Faturamento de obra, aporte</span>
            </button>

            <button
              onClick={onIrParaFolha}
              className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-blue-50/40 border border-slate-200 hover:border-blue-200 rounded-xl transition text-center space-y-2 group"
            >
              <div className="w-10 h-10 bg-blue-50 group-hover:bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center transition">
                <Users size={18} />
              </div>
              <span className="text-xs font-bold text-slate-800">Folha de Salários</span>
              <span className="text-2xs text-slate-500 font-semibold">Pagar colaboradores</span>
            </button>

            <button
              onClick={() => setModalContaAberto(true)}
              className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-violet-50/40 border border-slate-200 hover:border-violet-200 rounded-xl transition text-center space-y-2 group"
            >
              <div className="w-10 h-10 bg-violet-50 group-hover:bg-violet-100 text-violet-600 rounded-lg flex items-center justify-center transition">
                <Landmark size={18} />
              </div>
              <span className="text-xs font-bold text-slate-800">Vincular Conta</span>
              <span className="text-2xs text-slate-500 font-semibold">Bancos e caixinhas</span>
            </button>
          </div>
        </div>

        {/* Account List Summary */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-sm">Saldos Disponíveis por Conta</h3>
            <button onClick={onIrParaContas} className="text-2xs text-blue-600 hover:underline font-bold">Ver Contas Bancárias →</button>
          </div>

          <div className="space-y-2.5 pt-1">
            {contasAtivas.map(acc => (
              <div key={acc.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-500">
                    <Landmark size={14} />
                  </div>
                  <div className="text-left text-xs">
                    <p className="font-extrabold text-slate-800">{acc.nome}</p>
                    <p className="text-2xs text-slate-500 font-semibold">{acc.banco} ({acc.tipo})</p>
                  </div>
                </div>
                <div className="text-right text-xs font-mono font-bold text-slate-900">
                  {formatBRL(acc.saldoAtual)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ModalLancamento
        open={modalLancamentoAberto}
        lancamento={null}
        tipoInicial={tipoNovoLancamento}
        onClose={() => setModalLancamentoAberto(false)}
        contasAtivas={contasAtivas}
        projetos={projetos}
        funcionarios={funcionarios}
        fornecedores={fornecedores}
        onAddLancamento={onAddLancamento}
        onUpdateLancamento={onUpdateLancamento}
      />

      <ModalConta
        open={modalContaAberto}
        conta={null}
        onClose={() => setModalContaAberto(false)}
        onAddConta={onAddConta}
        onUpdateConta={onUpdateConta}
      />

      <ModalFaturarMedicao
        medicao={faturarMedicao}
        obraNome={getProjetoNome(faturarMedicao?.projetoId)}
        contasAtivas={contasAtivas}
        onClose={() => setFaturarMedicao(null)}
        onGerarFaturamento={onGerarFaturamento}
      />
    </div>
  );
}
