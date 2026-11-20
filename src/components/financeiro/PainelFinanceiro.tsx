import { useMemo, useState } from 'react';
import { Landmark, TrendingDown, TrendingUp, Users } from 'lucide-react';
import {
  CentroCusto,
  ContaFinanceira,
  Fornecedor,
  Funcionario,
  LancamentoFinanceiro,
  MedicaoRecente,
  Projeto,
} from '../../types';
import { formatarDataBR } from '../../lib/data';
import ModalConta from './ModalConta';
import ModalFaturarMedicao from './ModalFaturarMedicao';
import ModalLancamento from './ModalLancamento';
import { Button, FaixaKpis } from '../ui';
import BlocoGrafico from '../indicadores/BlocoGrafico';
import KpiBI from '../indicadores/KpiBI';
import TabelaBI, { type ColunaBI } from '../indicadores/TabelaBI';
import { GraficoBarras, GraficoRosca, type Fatia } from '../indicadores/graficos';
import { ESTADO, SERIE } from '../indicadores/cores';
import { GRADE_GRAFICOS } from '../indicadores/contexto';
import { dinheiro, dinheiroCurto, plural } from '../../lib/indicadores/formato';

const MESES_CURTOS: { [key: string]: string } = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez'
};

const dataLocal = (data: Date) => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;

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
  centrosCusto: CentroCusto[];
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
  centrosCusto,
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
  const hoje = dataLocal(new Date());

  const aging = useMemo(() => {
    const emSete = new Date();
    emSete.setDate(emSete.getDate() + 7);
    const limite = dataLocal(emSete);

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
        receitas: grouped[key].receitas,
        despesas: grouped[key].despesas,
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

  // Rosca: as três maiores categorias e o resto em "Outros" — uma quarta cor
  // não passaria no validador da paleta (ver `indicadores/cores.ts`).
  const fatiasCategoria: Fatia[] = useMemo(() => {
    const cores = [SERIE.primaria, SERIE.secundaria, SERIE.terciaria];
    const topo = despesasPorCategoria.slice(0, 3).map((c, i) => ({ chave: c.name, rotulo: c.name, valor: c.value, cor: cores[i] }));
    const resto = despesasPorCategoria.slice(3);
    return resto.length > 0
      ? [...topo, { chave: 'outros', rotulo: `Outras ${resto.length} categorias`, valor: resto.reduce((t, c) => t + c.value, 0), cor: SERIE.outros }]
      : topo;
  }, [despesasPorCategoria]);

  const colunasMedicao: ColunaBI<MedicaoRecente>[] = [
    { id: 'obra', titulo: 'Obra', render: (m) => getProjetoNome(m.projetoId), ordenar: (m) => getProjetoNome(m.projetoId), csv: (m) => getProjetoNome(m.projetoId) },
    { id: 'data', titulo: 'Data', render: (m) => formatarDataBR(m.dataMedicao), ordenar: (m) => m.dataMedicao, csv: (m) => m.dataMedicao },
    { id: 'percentual', titulo: 'Avanço medido', align: 'right', render: (m) => `+${m.percentualMedido}%`, ordenar: (m) => m.percentualMedido, csv: (m) => m.percentualMedido },
    { id: 'valor', titulo: 'Valor', align: 'right', render: (m) => dinheiro(m.valorMedido), ordenar: (m) => m.valorMedido, csv: (m) => m.valorMedido },
    { id: 'acao', titulo: '', align: 'right', render: (m) => <Button tamanho="sm" onClick={() => setFaturarMedicao(m)}>Faturar</Button> },
  ];

  const detalheAberto = (d: { vencido: number; proximo: number }) =>
    d.vencido > 0 ? `${dinheiroCurto(d.vencido)} vencido · ${dinheiroCurto(d.proximo)} em 7 dias` : `Nada vencido · ${dinheiroCurto(d.proximo)} em 7 dias`;
  const totalAberto = (d: { vencido: number; proximo: number; aVencer: number }) => d.vencido + d.proximo + d.aVencer;

  return (
    /* Desde 20/nov/2026 no desenho da aba Indicadores: faixa de KPIs, gráficos
       em bloco expansível e tabela de detalhe — as mesmas peças, importadas de
       `indicadores/`, para as duas telas não divergirem. */
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-500">Resumo financeiro · histórico completo</p>
        <div className="flex flex-wrap gap-2">
          <Button tamanho="sm" variante="secundario" onClick={() => abrirLancamento('Despesa')}><TrendingDown size={14} aria-hidden="true" /> Registrar despesa</Button>
          <Button tamanho="sm" variante="secundario" onClick={() => abrirLancamento('Receita')}><TrendingUp size={14} aria-hidden="true" /> Lançar receita</Button>
          <Button tamanho="sm" variante="secundario" onClick={onIrParaFolha}><Users size={14} aria-hidden="true" /> Folha de salários</Button>
          <Button tamanho="sm" variante="secundario" onClick={() => setModalContaAberto(true)}><Landmark size={14} aria-hidden="true" /> Vincular conta</Button>
        </div>
      </div>

      <FaixaKpis colunas={3}>
        <KpiBI
          rotulo="Saldo em caixa"
          valor={dinheiroCurto(metrics.totalContasBalance)}
          titulo={dinheiro(metrics.totalContasBalance)}
          detalhe={`Em ${plural(contasAtivas.length, 'conta ativa', 'contas ativas')}`}
          onClick={onIrParaContas}
        />
        <KpiBI
          rotulo="Receitas recebidas"
          valor={dinheiroCurto(metrics.totalRecebido)}
          titulo={dinheiro(metrics.totalRecebido)}
          detalhe={`${dinheiroCurto(metrics.totalPendenteReceber)} ainda pendentes`}
        />
        <KpiBI
          rotulo="Despesas pagas"
          valor={dinheiroCurto(metrics.totalPago)}
          titulo={dinheiro(metrics.totalPago)}
          detalhe={`${dinheiroCurto(metrics.totalPendentePagar)} a pagar`}
        />
        <KpiBI
          rotulo="Recebido menos pago"
          valor={dinheiroCurto(metrics.netBalance)}
          titulo={dinheiro(metrics.netBalance)}
          detalhe="Acumulado de todo o histórico"
        />
        {/* Abrem o razão filtrado no que está vencido daquele lado. */}
        <KpiBI
          rotulo="A receber"
          valor={dinheiroCurto(totalAberto(aging.receber))}
          titulo={dinheiro(totalAberto(aging.receber))}
          detalhe={detalheAberto(aging.receber)}
          onClick={() => onVerVencidos('Receita')}
        />
        <KpiBI
          rotulo="A pagar"
          valor={dinheiroCurto(totalAberto(aging.pagar))}
          titulo={dinheiro(totalAberto(aging.pagar))}
          detalhe={detalheAberto(aging.pagar)}
          onClick={() => onVerVencidos('Despesa')}
        />
      </FaixaKpis>

      <TabelaBI
        titulo="Medições a faturar"
        descricao="Execução medida em obra que ainda não virou receita."
        linhas={pendentesDeFaturamento}
        colunas={colunasMedicao}
        chave={(m) => m.id}
        arquivo="medicoes-a-faturar"
        vazio="Nenhuma medição aprovada esperando faturamento."
        ordemInicial={{ coluna: 'data', direcao: 'desc' }}
      />

      <div className={GRADE_GRAFICOS}>
        <BlocoGrafico
          titulo="Fluxo de caixa"
          descricao="Entradas e saídas efetivadas nos últimos 6 meses com movimento."
          vazio={chartData.length > 0 ? null : 'Nenhum lançamento efetivado ainda.'}
          tabela={{
            colunas: ['Mês', 'Receitas', 'Despesas', 'Saldo'],
            linhas: chartData.map((m) => [m.mes, dinheiro(m.receitas), dinheiro(m.despesas), dinheiro(m.receitas - m.despesas)]),
          }}
        >
          {(tamanho) => (
            <GraficoBarras
              dados={chartData}
              categoria="mes"
              tamanho={tamanho}
              formatar={dinheiro}
              formatarEixo={dinheiroCurto}
              series={[
                { chave: 'receitas', rotulo: 'Receitas', cor: ESTADO.positivo },
                { chave: 'despesas', rotulo: 'Despesas', cor: ESTADO.negativo },
              ]}
            />
          )}
        </BlocoGrafico>

        {/* Agrupa por CATEGORIA, a natureza do gasto — centro de custo tem sub-aba própria. */}
        <BlocoGrafico
          titulo="Despesas por categoria"
          descricao="Despesas efetivadas por natureza do gasto — histórico completo."
          vazio={fatiasCategoria.length > 0 ? null : 'Nenhuma despesa efetivada para distribuir por categoria.'}
          tabela={{
            colunas: ['Categoria', 'Valor', 'Participação'],
            linhas: despesasPorCategoria.map((c) => [c.name, dinheiro(c.value), `${c.percent.toFixed(1)}%`]),
          }}
        >
          {(tamanho) => <GraficoRosca fatias={fatiasCategoria} tamanho={tamanho} formatar={dinheiroCurto} rotuloTotal="pago" />}
        </BlocoGrafico>
      </div>

      <ModalLancamento
        open={modalLancamentoAberto}
        lancamento={null}
        tipoInicial={tipoNovoLancamento}
        onClose={() => setModalLancamentoAberto(false)}
        contasAtivas={contasAtivas}
        centrosCusto={centrosCusto}
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
