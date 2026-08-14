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
import { Card, CONTROLE_ALTURA, FaixaKpis, GRADE_PAINEIS, GRADE_PAINEL_ASSIMETRICO, GRAFICO_FONTE, GRAFICO_NEUTRO_HEX, Kpi, PREENCHIMENTO, PREENCHIMENTO_HEX, SECAO_ESPACO, Secao } from '../ui';

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
    <div className={SECAO_ESPACO}>

      {/* Medições a Faturar — liga a execução física da obra ao caixa.
          Painel `destaque` desde 14/ago/2026: é exatamente o CTA financeiro
          que o mockup "Analizze - App" pinta de azul-escuro sólido — o único
          bloco do app com fundo saturado atrás de texto. Reintroduz moldura
          num lugar que o redesenho de 13/ago tinha deliberadamente desemoldurado,
          e é uma exceção CIENTE: aqui a cor É a informação (isto pede ação
          financeira), não decoração de assunto. */}
      {pendentesDeFaturamento.length > 0 && (
        <Card variante="destaque">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Percent size={15} className="shrink-0" />
              <h3 className="text-sm font-bold truncate">Medições a Faturar</h3>
            </div>
            <span className="text-2xs font-bold font-mono bg-white/50 px-2 py-0.5 rounded-full shrink-0">
              {pendentesDeFaturamento.length}
            </span>
          </div>
          <p className="text-2xs opacity-80 -mt-2 mb-3">
            Execução medida em obra que ainda não virou receita. Revise e gere o faturamento.
          </p>
          <div className="divide-y divide-[#1b2a6b]/10">
            {pendentesDeFaturamento.map(m => (
              <div key={m.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate">{getProjetoNome(m.projetoId)}</p>
                  <p className="text-2xs opacity-70 mt-0.5">
                    Medição de {formatarDataBR(m.dataMedicao)} · +{m.percentualMedido}%
                  </p>
                </div>
                <span className="text-sm font-mono font-bold shrink-0">
                  {formatBRL(m.valorMedido)}
                </span>
                <button
                  onClick={() => setFaturarMedicao(m)}
                  className={`shrink-0 ${CONTROLE_ALTURA.sm} inline-flex items-center bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white text-xs font-bold px-3 rounded-lg transition shadow-sm`}
                >
                  Faturar
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Aging — o que está em aberto, por urgência. Antes "Contas a pagar"
          era um número só, sem noção de atraso.

          Eram dois cards, cada um com três mini-blocos coloridos dentro: seis
          molduras para seis números. A cor sobrevive onde ela informa — no
          próprio número. */}
      {(aging.pagar.vencido + aging.pagar.proximo + aging.pagar.aVencer +
        aging.receber.vencido + aging.receber.proximo + aging.receber.aVencer) > 0 && (
        <Secao titulo="Em aberto por vencimento" descricao="O que ainda não foi pago nem recebido, separado por urgência.">
          <div className={GRADE_PAINEIS.indicadores}>
            {([
              { titulo: 'A Pagar', dados: aging.pagar, corAVencer: 'text-slate-600', tipo: 'Despesa' as const },
              { titulo: 'A Receber', dados: aging.receber, corAVencer: 'text-emerald-600', tipo: 'Receita' as const },
            ]).map(({ titulo, dados, corAVencer, tipo }) => (
              <div key={titulo}>
                <h3 className="font-bold text-slate-800 text-xs mb-3">{titulo}</h3>
                <FaixaKpis colunas={3}>
                  <Kpi
                    rotulo="Vencido"
                    valor={
                      <span className={dados.vencido > 0 ? 'text-rose-600' : 'text-slate-500'}>
                        {formatBRL(dados.vencido)}
                      </span>
                    }
                    onClick={() => onVerVencidos(tipo)}
                  />
                  <Kpi rotulo="Em 7 dias" valor={<span className="text-amber-600">{formatBRL(dados.proximo)}</span>} />
                  <Kpi rotulo="A vencer" valor={<span className={corAVencer}>{formatBRL(dados.aVencer)}</span>} />
                </FaixaKpis>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {/* Key Metrics — quatro cards de `p-5` com chip de ícone viraram quatro
          números. */}
      <FaixaKpis colunas={4}>
        <Kpi
          icone={<Landmark size={13} />}
          rotulo="Saldo total em caixa"
          valor={formatBRL(metrics.totalContasBalance)}
          detalhe={`Consolidado em ${contasAtivas.length} conta(s) ativa(s)`}
        />
        <Kpi
          icone={<TrendingUp size={13} />}
          rotulo="Receitas consolidadas"
          valor={<span className="text-emerald-600">{formatBRL(metrics.totalRecebido)}</span>}
          detalhe={`Pendentes: ${formatBRL(metrics.totalPendenteReceber)}`}
        />
        <Kpi
          icone={<TrendingDown size={13} />}
          rotulo="Despesas consolidadas"
          valor={<span className="text-rose-600">{formatBRL(metrics.totalPago)}</span>}
          detalhe={`Contas a pagar: ${formatBRL(metrics.totalPendentePagar)}`}
        />
        <Kpi
          icone={<DollarSign size={13} />}
          rotulo="Resultado líquido"
          valor={
            <span className={metrics.netBalance >= 0 ? 'text-blue-600' : 'text-rose-600'}>
              {formatBRL(metrics.netBalance)}
            </span>
          }
          detalhe="Diferença entre Receitas e Despesas Pagas"
        />
      </FaixaKpis>

      {/* Cash Flow Graphics and Category Distribution */}
      <div className={GRADE_PAINEL_ASSIMETRICO}>

        {/* Coluna larga: o gráfico. A proporção vem das trilhas do token. */}
        <Secao
          titulo="Evolução do Fluxo de Caixa"
          descricao="Histórico mensal consolidado de entradas e saídas efetivadas."
        >
          <div className="h-64">
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
        </Secao>

        {/* Quick overview of Corporate Expenses */}
        <Secao
          titulo="Distribuição de Despesas"
          descricao="Centros de custo das despesas efetivadas — histórico completo."
        >
          <div className="space-y-3">
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
        </Secao>
      </div>

      {/* Quick Actions and Bank Account Summary inside Dashboard */}
      <div className={GRADE_PAINEIS.lista}>

        {/* Os quatro atalhos mantêm moldura: aqui ela delimita o ALVO do clique,
            não um assunto. O que saiu foi o card em volta dos quatro.

            O chip de ícone (o quadrado colorido) já nascia sempre colorido —
            é exatamente o padrão que o mockup "Analizze - App" usa nas quatro
            ações financeiras, então não precisou mudar em 14/ago/2026; só o
            hover do botão em volta escurece um degrau. */}
        <Secao titulo="Ações Financeiras Rápidas">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => abrirLancamento('Despesa')}
              className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-rose-50/40 border border-slate-200 hover:border-rose-200 rounded-lg transition text-center space-y-2 group"
            >
              <div className="w-10 h-10 bg-rose-50 group-hover:bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center transition">
                <TrendingDown size={18} />
              </div>
              <span className="text-xs font-bold text-slate-800">Registrar Despesa</span>
              <span className="text-2xs text-slate-500 font-semibold">Contas, taxas, compras</span>
            </button>

            <button
              onClick={() => abrirLancamento('Receita')}
              className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-emerald-50/40 border border-slate-200 hover:border-emerald-200 rounded-lg transition text-center space-y-2 group"
            >
              <div className="w-10 h-10 bg-emerald-50 group-hover:bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center transition">
                <TrendingUp size={18} />
              </div>
              <span className="text-xs font-bold text-slate-800">Lançar Receita</span>
              <span className="text-2xs text-slate-500 font-semibold">Faturamento de obra, aporte</span>
            </button>

            <button
              onClick={onIrParaFolha}
              className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-blue-50/40 border border-slate-200 hover:border-blue-200 rounded-lg transition text-center space-y-2 group"
            >
              <div className="w-10 h-10 bg-blue-50 group-hover:bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center transition">
                <Users size={18} />
              </div>
              <span className="text-xs font-bold text-slate-800">Folha de Salários</span>
              <span className="text-2xs text-slate-500 font-semibold">Pagar colaboradores</span>
            </button>

            <button
              onClick={() => setModalContaAberto(true)}
              className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-violet-50/40 border border-slate-200 hover:border-violet-200 rounded-lg transition text-center space-y-2 group"
            >
              <div className="w-10 h-10 bg-violet-50 group-hover:bg-violet-100 text-violet-600 rounded-lg flex items-center justify-center transition">
                <Landmark size={18} />
              </div>
              <span className="text-xs font-bold text-slate-800">Vincular Conta</span>
              <span className="text-2xs text-slate-500 font-semibold">Bancos e caixinhas</span>
            </button>
          </div>
        </Secao>

        {/* Account List Summary */}
        <Secao
          titulo="Saldos Disponíveis por Conta"
          acoes={
            <button onClick={onIrParaContas} className="text-2xs text-blue-600 hover:underline font-bold">
              Ver Contas Bancárias →
            </button>
          }
        >
          {contasAtivas.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhuma conta ativa vinculada.</p>
          ) : (
            <div className="divide-y divide-slate-200">
              {contasAtivas.map(acc => (
                <div key={acc.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center text-slate-500 shrink-0">
                      <Landmark size={14} />
                    </div>
                    <div className="text-left text-xs min-w-0">
                      <p className="font-extrabold text-slate-800 truncate">{acc.nome}</p>
                      <p className="text-2xs text-slate-500 font-semibold truncate">{acc.banco} ({acc.tipo})</p>
                    </div>
                  </div>
                  <div className="text-right text-xs font-mono font-bold text-slate-900 shrink-0">
                    {formatBRL(acc.saldoAtual)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Secao>
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
