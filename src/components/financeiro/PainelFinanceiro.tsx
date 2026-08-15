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
import { Button, Card, FOCO, GRADE_PAINEL_ASSIMETRICO, GRAFICO_FONTE, GRAFICO_NEUTRO_HEX, PREENCHIMENTO, PREENCHIMENTO_HEX } from '../ui';

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

  /**
   * O painel de destaque mora no TRILHO da direita (mockup "Analizze - App"),
   * e por isso sai como variável em vez de ficar no corpo do JSX: ele é o
   * primeiro bloco lido do painel, mas não o primeiro da coluna larga.
   *
   * Painel `destaque` desde 14/ago/2026: é exatamente o CTA financeiro que o
   * mockup pinta de azul-escuro sólido — o único bloco do app com fundo
   * saturado atrás de texto. Reintroduz moldura num lugar que o redesenho de
   * 13/ago tinha deliberadamente desemoldurado, e é uma exceção CIENTE: aqui a
   * cor É a informação (isto pede ação financeira), não decoração de assunto.
   */
  const painelMedicoes = pendentesDeFaturamento.length > 0 ? (
    <Card variante="destaque">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Percent size={14} className="shrink-0" />
          <h3 className="text-xs font-bold truncate">Medições a faturar</h3>
        </div>
        <span className="data-font text-2xs font-bold bg-white/50 px-2 py-0.5 rounded-full shrink-0">
          {pendentesDeFaturamento.length}
        </span>
      </div>
      <p className="text-2xs opacity-80 -mt-2 mb-2 leading-snug">
        Execução medida em obra que ainda não virou receita.
      </p>
      <div className="divide-y divide-[#1b2a6b]/10">
        {pendentesDeFaturamento.map(m => (
          <div key={m.id} className="flex items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-2xs font-bold truncate">{getProjetoNome(m.projetoId)}</p>
              <p className="text-2xs opacity-70 mt-0.5">
                {formatarDataBR(m.dataMedicao)} · +{m.percentualMedido}%
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="data-font text-2xs font-bold">{formatBRL(m.valorMedido)}</span>
              {/* Era verde sólido dentro do painel `destaque` azul — a cor de
                  um ESTADO ("faturado") no controle que ainda vai faturar, e o
                  único verde do painel. `primario` é o azul de ação: dentro
                  deste bloco ele é o único botão, então não disputa nada. */}
              <Button tamanho="sm" onClick={() => setFaturarMedicao(m)}>
                Faturar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  ) : null;

  const temAging =
    (aging.pagar.vencido + aging.pagar.proximo + aging.pagar.aVencer +
      aging.receber.vencido + aging.receber.proximo + aging.receber.aVencer) > 0;

  return (
    /* REDESENHO 14/ago/2026 — o painel virou as duas colunas do mockup: à
       esquerda o que se analisa (números, vencimentos, gráficos), à direita o
       que pede ação (faturar, contas, atalhos). Antes eram sete blocos
       empilhados numa coluna só, e os atalhos — a única coisa clicável da
       tela — ficavam no rodapé, abaixo de dois gráficos. */
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)] gap-5 items-start">
      <div className="min-w-0 flex flex-col gap-4">

        {/* Key Metrics — cartão com chip de ícone, valor e barra de escala, o
            desenho do mockup. O `Kpi` sem caixa continua sendo o primitivo do
            app para número solto dentro de uma seção; aqui os quatro SÃO a
            seção, e o cartão é o que os separa um do outro. */}
        {/* 260 px é o piso MEDIDO do cartão: um valor em mono `text-lg`
            ("R$ 1.284.900,00") ocupa ~180 px, mais o chip de ícone, o padding
            do cartão e a barra de escala. Abaixo disso o número quebra — e é
            ele que a tela existe para mostrar. Com esse piso a faixa fica 2×2
            no notebook e 4-em-linha no monitor largo, sem escada de
            breakpoint (ver "A Regra da Grade Medida" no DESIGN.md). */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
          {([
            {
              chave: 'caixa',
              icone: <Landmark size={14} />,
              tomChip: 'bg-slate-100 text-slate-600',
              barra: PREENCHIMENTO.neutro,
              rotulo: 'Saldo total em caixa',
              valor: formatBRL(metrics.totalContasBalance),
              corValor: 'text-slate-900',
              detalhe: `Consolidado em ${contasAtivas.length} ${contasAtivas.length === 1 ? 'conta ativa' : 'contas ativas'}`,
              proporcao: 1,
            },
            {
              chave: 'receitas',
              icone: <TrendingUp size={14} />,
              tomChip: 'bg-emerald-50 text-emerald-700',
              barra: PREENCHIMENTO.positivo,
              rotulo: 'Receitas consolidadas',
              valor: formatBRL(metrics.totalRecebido),
              corValor: 'text-emerald-700',
              detalhe: `${formatBRL(metrics.totalPendenteReceber)} ainda pendentes`,
              proporcao: metrics.totalRecebido + metrics.totalPendenteReceber > 0
                ? metrics.totalRecebido / (metrics.totalRecebido + metrics.totalPendenteReceber)
                : 0,
            },
            {
              chave: 'despesas',
              icone: <TrendingDown size={14} />,
              tomChip: 'bg-rose-50 text-rose-700',
              barra: PREENCHIMENTO.negativo,
              rotulo: 'Despesas consolidadas',
              valor: formatBRL(metrics.totalPago),
              corValor: 'text-rose-700',
              detalhe: `${formatBRL(metrics.totalPendentePagar)} a pagar`,
              proporcao: metrics.totalPago + metrics.totalPendentePagar > 0
                ? metrics.totalPago / (metrics.totalPago + metrics.totalPendentePagar)
                : 0,
            },
            {
              chave: 'resultado',
              icone: <DollarSign size={14} />,
              tomChip: 'bg-blue-50 text-blue-600',
              barra: PREENCHIMENTO.acao,
              rotulo: 'Resultado líquido',
              valor: formatBRL(metrics.netBalance),
              corValor: metrics.netBalance >= 0 ? 'text-blue-600' : 'text-rose-700',
              detalhe: 'Receitas menos despesas pagas',
              proporcao: metrics.totalRecebido > 0
                ? Math.abs(metrics.netBalance) / metrics.totalRecebido
                : 0,
            },
          ]).map((kpi) => {
            const pct = Math.round(Math.min(1, Math.max(0, kpi.proporcao)) * 100);
            return (
              <Card key={kpi.chave} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${kpi.tomChip}`}>
                    {kpi.icone}
                  </span>
                  <span className="min-w-0 truncate text-2xs font-semibold text-slate-500">{kpi.rotulo}</span>
                </div>
                <div>
                  <p className={`data-font text-lg font-bold tracking-tight ${kpi.corValor}`}>{kpi.valor}</p>
                  <span className="mt-0.5 block text-2xs text-slate-500">{kpi.detalhe}</span>
                </div>
                <div className="mt-auto flex items-center gap-2">
                  <div className="h-1 flex-1 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${kpi.barra}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="data-font shrink-0 text-2xs text-slate-500">{pct}%</span>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Aging — o que está em aberto, por urgência. Antes "Contas a pagar"
            era um número só, sem noção de atraso. */}
        {temAging && (
          <Card>
            <h3 className="text-xs font-bold text-slate-900">Em aberto por vencimento</h3>
            <p className="mt-0.5 text-2xs text-slate-500">
              O que ainda não foi pago nem recebido, separado por urgência.
            </p>
            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-6">
              {([
                { titulo: 'A pagar', dados: aging.pagar, tomAVencer: 'bg-slate-50 text-slate-700', tipo: 'Despesa' as const },
                { titulo: 'A receber', dados: aging.receber, tomAVencer: 'bg-emerald-50 text-emerald-700', tipo: 'Receita' as const },
              ]).map(({ titulo, dados, tomAVencer, tipo }) => (
                <div key={titulo}>
                  <span className="text-2xs font-bold text-slate-900">{titulo}</span>
                  <div className="mt-2.5 grid grid-cols-3 gap-3">
                    {/* Vencido é o único clicável: é o que abre o razão
                        filtrado, e por isso é `<button>` de verdade. */}
                    <button
                      type="button"
                      onClick={() => onVerVencidos(tipo)}
                      className={`rounded-xl p-3 text-left transition hover:brightness-95 ${FOCO} ${
                        dados.vencido > 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'
                      }`}
                    >
                      <span className="text-2xs font-bold uppercase tracking-wider">Vencido</span>
                      <p className="data-font mt-1 text-xs font-bold text-slate-900">{formatBRL(dados.vencido)}</p>
                    </button>
                    <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
                      <span className="text-2xs font-bold uppercase tracking-wider">Em 7 dias</span>
                      <p className="data-font mt-1 text-xs font-bold text-slate-900">{formatBRL(dados.proximo)}</p>
                    </div>
                    <div className={`rounded-xl p-3 ${tomAVencer}`}>
                      <span className="text-2xs font-bold uppercase tracking-wider">A vencer</span>
                      <p className="data-font mt-1 text-xs font-bold text-slate-900">{formatBRL(dados.aVencer)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

      {/* Cash Flow Graphics and Category Distribution */}
      <div className={GRADE_PAINEL_ASSIMETRICO}>

        {/* Coluna larga: o gráfico. A proporção vem das trilhas do token. */}
        <Card>
          <h3 className="text-xs font-bold text-slate-900">Evolução do fluxo de caixa</h3>
          <p className="mt-0.5 text-2xs text-slate-500">
            Histórico mensal consolidado de entradas e saídas efetivadas.
          </p>
          <div className="mt-3 h-64">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Dados insuficientes para desenhar gráfico histórico.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRAFICO_NEUTRO_HEX.grade} />
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: GRAFICO_FONTE, fill: GRAFICO_NEUTRO_HEX.rotulo, fontWeight: 600 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: GRAFICO_FONTE, fill: GRAFICO_NEUTRO_HEX.rotulo, fontWeight: 600 }} />
                  <Tooltip formatter={(value) => [formatBRL(Number(value))]} contentStyle={{ borderRadius: '8px', border: `1px solid ${GRAFICO_NEUTRO_HEX.borda}`, fontSize: `${GRAFICO_FONTE}px`, fontWeight: 'bold' }} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: `${GRAFICO_FONTE}px`, fontWeight: 'bold', paddingTop: '10px' }} />
                  <Bar dataKey="Receitas (R$)" fill={PREENCHIMENTO_HEX.positivo} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Despesas (R$)" fill={PREENCHIMENTO_HEX.negativo} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Quick overview of Corporate Expenses */}
        <Card>
          <h3 className="text-xs font-bold text-slate-900">Centros de custo</h3>
          <p className="mt-0.5 text-2xs text-slate-500">
            Distribuição das despesas efetivadas — histórico completo.
          </p>
          <div className="mt-3 space-y-3">
            {despesasPorCategoria.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                Nenhuma despesa efetivada para cálculo de centros de custo.
              </div>
            ) : (
              despesasPorCategoria.map((item, idx) => {
                const colors = [PREENCHIMENTO.negativo, PREENCHIMENTO.atencao, PREENCHIMENTO.destaque, PREENCHIMENTO.acao, PREENCHIMENTO.alternativo, PREENCHIMENTO.neutro];
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
        </Card>
      </div>
      </div>

      {/* ─────────────── trilho de 300 px ─────────────── */}
      <div className="min-w-0 flex flex-col gap-4">
        {painelMedicoes}

        {/* Account List Summary */}
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-900">Contas</h3>
            <button onClick={onIrParaContas} className="text-2xs font-bold text-blue-600 hover:underline">
              Ver todas →
            </button>
          </div>
          {contasAtivas.length === 0 ? (
            <p className="mt-2 text-2xs text-slate-500">Nenhuma conta ativa vinculada.</p>
          ) : (
            <div className="mt-1 divide-y divide-slate-100">
              {contasAtivas.map(acc => (
                <div key={acc.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                      <Landmark size={13} />
                    </span>
                    <div className="min-w-0 text-left">
                      <p className="truncate text-2xs font-bold text-slate-900">{acc.nome}</p>
                      <p className="truncate text-2xs text-slate-500">{acc.banco} · {acc.tipo}</p>
                    </div>
                  </div>
                  <span className="data-font shrink-0 text-2xs font-bold text-slate-900">
                    {formatBRL(acc.saldoAtual)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Os quatro atalhos mantêm moldura: aqui ela delimita o ALVO do clique,
            não um assunto.

            O chip de ícone (o quadrado colorido) já nascia sempre colorido —
            é exatamente o padrão que o mockup "Analizze - App" usa nas quatro
            ações financeiras, então não precisou mudar em 14/ago/2026; só o
            hover do botão em volta escurece um degrau. */}
        <Card>
          <h3 className="text-xs font-bold text-slate-900">Ações rápidas</h3>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {([
              {
                chave: 'despesa',
                icone: <TrendingDown size={14} />,
                chip: 'bg-rose-50 text-rose-600 group-hover:bg-rose-100',
                borda: 'hover:border-rose-200',
                titulo: 'Registrar despesa',
                onClick: () => abrirLancamento('Despesa'),
              },
              {
                chave: 'receita',
                icone: <TrendingUp size={14} />,
                chip: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100',
                borda: 'hover:border-emerald-200',
                titulo: 'Lançar receita',
                onClick: () => abrirLancamento('Receita'),
              },
              {
                chave: 'folha',
                icone: <Users size={14} />,
                chip: 'bg-blue-50 text-blue-600 group-hover:bg-blue-100',
                borda: 'hover:border-blue-200',
                titulo: 'Folha de salários',
                onClick: onIrParaFolha,
              },
              {
                chave: 'conta',
                icone: <Landmark size={14} />,
                chip: 'bg-violet-50 text-violet-600 group-hover:bg-violet-100',
                borda: 'hover:border-violet-200',
                titulo: 'Vincular conta',
                onClick: () => setModalContaAberto(true),
              },
            ]).map((acao) => (
              <button
                key={acao.chave}
                type="button"
                onClick={acao.onClick}
                className={`group flex flex-col items-start gap-2 rounded-xl border border-slate-200 p-3 text-left transition hover:bg-slate-50 ${acao.borda} ${FOCO}`}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${acao.chip}`}>
                  {acao.icone}
                </span>
                <span className="text-2xs font-bold text-slate-900">{acao.titulo}</span>
              </button>
            ))}
          </div>
        </Card>
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
