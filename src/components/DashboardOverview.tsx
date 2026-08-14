/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo } from 'react';
import {
  Briefcase,
  FileText,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Activity,
  ArrowRight,
  HardHat,
  Ruler,
  Send,
  UserPlus,
  ListChecks,
  LucideIcon
} from 'lucide-react';
import { Cliente, Proposta, Projeto, DesvioCategoria, EtapaAtrasada, MedicaoRecente, ResumoObra } from '../types';
import type { Role } from '../lib/database.types';
import { canAccessTab } from '../constants/tabAccess';
import { StatusBadge, statusDot } from '../constants/status';
import { dataLocal, formatarDataBR } from '../lib/data';
import { FaixaKpis, GRADE_PAINEIS, GRADE_PAINEL_ASSIMETRICO, Kpi, PaginaAba, PREENCHIMENTO, Secao } from './ui';

/**
 * O painel deixou de receber linhas e passou a receber números — item 23 da
 * auditoria (§4.2).
 *
 * Antes: `orcamentos`, `alteracoesOrcamento`, `cronograma`, `vinculos` e
 * `medicoes`, TODAS as obras, para somar aqui. Com 50 obras × 20 etapas × 12
 * medições × 15 itens isso é a base inteira no navegador para desenhar meia dúzia
 * de cartões — e cada soma no cliente é uma oportunidade de discordar do console.
 *
 * Agora: `resumos` (uma linha por obra), `desvios` e `atrasos` (já filtrados
 * pelo servidor: cada linha É uma linha da tela) e `medicoesRecentes` (as três
 * que o feed mostra). Ver `v_resumo_obra` e irmãs.
 */
interface DashboardOverviewProps {
  clientes: Cliente[];
  propostas: Proposta[];
  projetos: Projeto[];
  resumos: ResumoObra[];
  desvios: DesvioCategoria[];
  atrasos: EtapaAtrasada[];
  medicoesRecentes: MedicaoRecente[];
  equipeCount: number;
  role?: Role;
  onNavigate: (tabId: string, projectId?: string | null) => void;
}

// Guided "próximo passo": one actionable step in the business flow
// (proposta → obra → medição → …), derived from state the dashboard already has.
type StepTone = 'blue' | 'sky' | 'amber' | 'emerald';
interface NextStep {
  id: string;
  priority: number; // lower = more urgent, shown first
  icon: LucideIcon;
  tone: StepTone;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

const STEP_TONES: Record<StepTone, { wrap: string; icon: string; btn: string }> = {
  blue:    { wrap: 'bg-blue-50/60 border-blue-100',    icon: 'bg-blue-100 text-blue-600',       btn: 'text-blue-600 hover:text-blue-700' },
  sky:     { wrap: 'bg-sky-50/60 border-sky-100',      icon: 'bg-sky-100 text-sky-600',         btn: 'text-sky-600 hover:text-sky-700' },
  amber:   { wrap: 'bg-amber-50/60 border-amber-100',  icon: 'bg-amber-100 text-amber-600',     btn: 'text-amber-700 hover:text-amber-800' },
  emerald: { wrap: 'bg-emerald-50/60 border-emerald-100', icon: 'bg-emerald-100 text-emerald-600', btn: 'text-emerald-700 hover:text-emerald-800' },
};

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function DashboardOverview({
  clientes,
  propostas,
  projetos,
  resumos,
  desvios,
  atrasos,
  medicoesRecentes,
  equipeCount,
  role,
  onNavigate
}: DashboardOverviewProps) {
  // 1. Calculations
  const activeProjects = projetos.filter(p => p.situacao === 'Em Execução' || p.situacao === 'Planejamento');
  
  const totalApprovedProposalValue = propostas
    .filter(p => p.status === 'Aprovada')
    .reduce((sum, curr) => sum + curr.valorEstimado, 0);

  const pendingProposalCount = propostas.filter(p => p.status === 'Enviada' || p.status === 'Elaboração').length;

  /**
   * O nome da obra é a única coisa que as três listas agregadas NÃO trazem: elas
   * saem de views escopadas por obra, e repetir `projetos.nome` em cada linha
   * seria mandar o mesmo texto dezenas de vezes. O cruzamento é aqui, onde
   * `projetos` já está em memória.
   */
  const nomePorProjeto = React.useMemo(
    () => new Map(projetos.map(p => [p.id, p.nome])),
    [projetos]
  );
  const resumoPorProjeto = React.useMemo(
    () => new Map(resumos.map(r => [r.projetoId, r])),
    [resumos]
  );

  // Budget calculations — somadas sobre uma linha por obra, não sobre a tabela
  // de itens de todas as obras.
  const totalBudgeted = resumos.reduce((sum, r) => sum + r.valorOrcado, 0);
  const totalContracted = resumos.reduce((sum, r) => sum + r.valorContratado, 0);
  const totalExecuted = resumos.reduce((sum, r) => sum + r.valorExecutado, 0);

  const financialExecutionRate = totalBudgeted > 0 ? (totalExecuted / totalBudgeted) * 100 : 0;

  /**
   * Avanço físico ponderado pelo orçamento vinculado a cada etapa. Vem de
   * `v_resumo_obra`, que reimplementa `calcularAvancoFisico` em SQL — o console
   * segue calculando a partir das listas da obra aberta, e as duas contas são a
   * mesma. Antes esta tela tinha sua própria média simples e discordava dele.
   *
   * Zero para obra sem linha de resumo: obra recém-criada, ou resumo ainda a
   * caminho. É o mesmo valor que a função devolvia para obra sem etapas.
   */
  const getProjectPhysicalProgress = (projId: string) =>
    resumoPorProjeto.get(projId)?.avancoFisico ?? 0;

  // Desvio e atraso chegam prontos do servidor: a view já descartou o que está
  // dentro do planejado e o que não venceu. Aqui só se junta o nome da obra.
  const budgetOverruns = React.useMemo(
    () => desvios.map(d => ({
      projetoNome: nomePorProjeto.get(d.projetoId) ?? 'Projeto Indefinido',
      categoria: d.categoria,
      excesso: d.excesso,
      executado: d.executado,
      planejado: d.planejado,
    })),
    [desvios, nomePorProjeto]
  );

  const criticalDelays = React.useMemo(
    () => atrasos.map(a => ({
      projetoId: a.projetoId,
      projetoNome: nomePorProjeto.get(a.projetoId) ?? 'Projeto Indefinido',
      atividadeNome: a.etapaNome,
      // `dataFim` é coluna `date`: `formatarDataBR` em vez de `new Date()`, que
      // atrasaria um dia. `diasAtraso` já veio calculado no servidor pelo mesmo
      // motivo.
      dataFimPlanejada: formatarDataBR(a.dataFim),
      diasAtraso: a.diasAtraso,
    })),
    [atrasos, nomePorProjeto]
  );

  // Guided flow: the ordered list of "next actions" the user should take,
  // derived from the current state and filtered by what the role can reach.
  const nextSteps = React.useMemo(() => {
    const steps: NextStep[] = [];
    const can = (tab: string) => canAccessTab(role, tab);

    // Onboarding — the flow hasn't started yet.
    if (can('clientes') && clientes.length === 0) {
      steps.push({
        id: 'onboard-cliente', priority: 0, icon: UserPlus, tone: 'blue',
        title: 'Cadastre o primeiro cliente',
        description: 'O fluxo começa pelo cliente: cadastre-o para poder elaborar propostas.',
        actionLabel: 'Ir para Clientes', onAction: () => onNavigate('clientes'),
      });
    } else if (can('propostas') && propostas.length === 0 && clientes.length > 0) {
      steps.push({
        id: 'onboard-proposta', priority: 0, icon: FileText, tone: 'blue',
        title: 'Elabore a primeira proposta',
        description: 'Você já tem clientes cadastrados — crie uma proposta comercial para iniciar o funil.',
        actionLabel: 'Ir para Propostas', onAction: () => onNavigate('propostas'),
      });
    }

    // Proposta aprovada que ainda não virou obra — maior gargalo do fluxo.
    if (can('propostas')) {
      propostas
        .filter(p => p.status === 'Aprovada' && !projetos.some(pr => pr.propostaId === p.id))
        .forEach(p => steps.push({
          id: `iniciar-obra-${p.id}`, priority: 1, icon: HardHat, tone: 'blue',
          title: `Iniciar obra: ${p.descricao}`,
          description: `Proposta ${p.numero} (${fmtBRL(p.valorEstimado)}) foi aprovada e ainda não foi convertida em obra.`,
          actionLabel: 'Iniciar obra', onAction: () => onNavigate('propostas'),
        }));
    }

    // Obra em planejamento sem nenhuma medição — a 1ª medição a coloca em execução.
    // `?? 0` e não `?? 1`: obra sem linha de resumo ainda não tem medição, e
    // esconder o passo por falta de dado é justamente perder o empurrão inicial.
    if (can('projetos')) {
      projetos
        .filter(pr => pr.situacao === 'Planejamento' && (resumoPorProjeto.get(pr.id)?.medicoesTotal ?? 0) === 0)
        .forEach(pr => steps.push({
          id: `primeira-medicao-${pr.id}`, priority: 2, icon: Ruler, tone: 'sky',
          title: `Registrar 1ª medição: ${pr.nome}`,
          description: 'A obra está em planejamento. A primeira medição de campo a coloca em execução.',
          actionLabel: 'Abrir obra', onAction: () => onNavigate('projetos', pr.id),
        }));
    }

    // Etapas atrasadas — uma ação por obra para não poluir a lista.
    if (can('projetos')) {
      const obrasComAtraso = new Map<string, { nome: string; qtd: number }>();
      criticalDelays.forEach(d => {
        const cur = obrasComAtraso.get(d.projetoId);
        obrasComAtraso.set(d.projetoId, { nome: d.projetoNome, qtd: (cur?.qtd ?? 0) + 1 });
      });
      obrasComAtraso.forEach((info, projetoId) => steps.push({
        id: `medir-atraso-${projetoId}`, priority: 3, icon: AlertTriangle, tone: 'amber',
        title: `Atualizar medição: ${info.nome}`,
        description: `${info.qtd} ${info.qtd === 1 ? 'etapa está atrasada' : 'etapas estão atrasadas'} — registre a medição para refletir o avanço real.`,
        actionLabel: 'Abrir obra', onAction: () => onNavigate('projetos', projetoId),
      }));
    }

    // Propostas em elaboração aguardando envio.
    if (can('propostas')) {
      const emElaboracao = propostas.filter(p => p.status === 'Elaboração');
      if (emElaboracao.length > 0) {
        steps.push({
          id: 'enviar-propostas', priority: 4, icon: Send, tone: 'emerald',
          title: emElaboracao.length === 1
            ? `Finalize e envie a proposta ${emElaboracao[0].numero}`
            : `${emElaboracao.length} propostas em elaboração`,
          description: 'Conclua a elaboração e envie ao cliente para avançar o funil comercial.',
          actionLabel: 'Ir para Propostas', onAction: () => onNavigate('propostas'),
        });
      }
    }

    return steps.sort((a, b) => a.priority - b.priority);
  }, [role, clientes, propostas, projetos, resumoPorProjeto, criticalDelays, onNavigate]);

  const MAX_STEPS = 5;
  const visibleSteps = nextSteps.slice(0, MAX_STEPS);
  const hiddenStepsCount = nextSteps.length - visibleSteps.length;
  const hasAnyData = projetos.length > 0 || propostas.length > 0 || clientes.length > 0;

  return (
    <PaginaAba largura="painel" id="dashboard-tab-content">
      {/* Page Title */}
      <div id="dashboard-title-section" className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Indicadores de Desempenho</h2>
          <p className="text-sm text-slate-500">Resumo analítico integrado do canteiro de obras e saúde financeira.</p>
        </div>
        {/* Era uma pastilha com fundo, borda e raio para dizer uma data. */}
        <div id="dashboard-current-date" className="text-2xs text-slate-500 font-mono shrink-0">
          Atualizado: {new Date().toLocaleDateString('pt-BR')}
        </div>
      </div>

      {/* Os números vêm primeiro: são o que se lê de longe, e antes ficavam
          abaixo de dois blocos de texto. */}
      <FaixaKpis id="dashboard-metrics-grid" colunas={4}>
        <Kpi
          id="metric-obras-ativas"
          icone={<Briefcase size={13} />}
          rotulo="Obras ativas"
          valor={activeProjects.length}
          detalhe={`De um total de ${projetos.length} cadastradas`}
          onClick={() => onNavigate('projetos')}
        />
        <Kpi
          id="metric-faturamento"
          icone={<DollarSign size={13} />}
          rotulo="Carteira contratada"
          valor={fmtBRL(totalApprovedProposalValue)}
          detalhe={`${propostas.filter(p => p.status === 'Aprovada').length} propostas aprovadas`}
          onClick={() => onNavigate('propostas')}
        />
        <Kpi
          id="metric-executado"
          icone={<TrendingUp size={13} />}
          rotulo="Custo global executado"
          valor={fmtBRL(totalExecuted)}
          detalhe={`${financialExecutionRate.toFixed(1)}% do orçamento`}
          onClick={() => onNavigate('projetos')}
        />
        <Kpi
          id="metric-equipe-ativa"
          icone={<Users size={13} />}
          rotulo="Funcionários ativos"
          valor={equipeCount}
          detalhe="Alocados e vinculados"
          onClick={() => onNavigate('equipe')}
        />
      </FaixaKpis>

      {/* Guided "Próximos Passos" — the next action in the business flow.
          A moldura branca externa saiu: cada passo já é um bloco colorido com
          borda, e o card em volta era borda sobre borda. */}
      <Secao
        id="dashboard-next-steps"
        icone={<ListChecks size={15} />}
        titulo="Próximos Passos"
        descricao="O que fazer agora para o fluxo avançar."
        acoes={
          visibleSteps.length > 0 ? (
            <span className="text-2xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
              {nextSteps.length} {nextSteps.length === 1 ? 'ação' : 'ações'}
            </span>
          ) : undefined
        }
      >
        {visibleSteps.length > 0 ? (
          <div className="space-y-2">
            {visibleSteps.map(step => {
              const Icon = step.icon;
              const tone = STEP_TONES[step.tone];
              return (
                <div key={step.id} className={`flex items-center gap-3 p-3 rounded-lg border border-l-2 ${tone.wrap}`}>
                  <div className={`p-2 rounded-lg shrink-0 ${tone.icon}`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 truncate">{step.title}</p>
                    <p className="text-2xs text-slate-500 mt-0.5 leading-snug">{step.description}</p>
                  </div>
                  <button
                    onClick={step.onAction}
                    className={`shrink-0 flex items-center gap-1 text-xs font-bold transition ${tone.btn}`}
                  >
                    {step.actionLabel}
                    <ArrowRight size={13} />
                  </button>
                </div>
              );
            })}
            {hiddenStepsCount > 0 && (
              <p className="text-2xs text-slate-500 pt-1">
                + {hiddenStepsCount} {hiddenStepsCount === 1 ? 'outra ação pendente' : 'outras ações pendentes'} no fluxo.
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 text-xs text-slate-600">
            <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
            <span>
              {hasAnyData
                ? 'Nenhuma ação pendente no fluxo — propostas, obras e medições estão em dia.'
                : 'Comece cadastrando um cliente e elaborando a primeira proposta.'}
            </span>
          </div>
        )}
      </Secao>

      {/* Dynamic System Alerts Section.
          Os dois blocos coloridos ficam — aqui a cor É a informação. O que saiu
          foi o mini-card branco de cada linha (moldura dentro de moldura) e o
          `max-h` de 140 px: a página rola, a lista de alertas não precisa mais
          esconder o quarto item atrás de uma barra de rolagem de 140 px. */}
      <div id="dashboard-system-alerts">
        {(budgetOverruns.length > 0 || criticalDelays.length > 0) ? (
          <div className={GRADE_PAINEIS.lista}>
            {/* Budget overruns box (Red) */}
            {budgetOverruns.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5">
                <div className="flex items-center gap-2 text-rose-800 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                  <span>Desvio Orçamentário Crítico ({budgetOverruns.length})</span>
                </div>
                <div className="mt-2 divide-y divide-rose-200/70">
                  {budgetOverruns.map((ov, idx) => (
                    <div key={idx} className="py-2 text-xs text-rose-950 flex justify-between items-center gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{ov.projetoNome}</p>
                        <p className="text-2xs text-slate-500">Categoria: <strong className="text-slate-700">{ov.categoria}</strong></p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-rose-600 font-mono text-2xs block">
                          +{ov.excesso.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <span className="text-2xs text-slate-500 block font-mono">Exec: {ov.executado.toLocaleString('pt-BR')} / Plan: {ov.planejado.toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delay alerts box (Amber) */}
            {criticalDelays.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                  <span>Atividades com Atraso Crítico ({criticalDelays.length})</span>
                </div>
                <div className="mt-2 divide-y divide-amber-200/70">
                  {criticalDelays.map((dl, idx) => (
                    <div key={idx} className="py-2 text-xs text-amber-950 flex justify-between items-center gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{dl.projetoNome}</p>
                        <p className="text-2xs text-slate-500">Atividade: <strong className="text-slate-800">{dl.atividadeNome}</strong></p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-amber-600 font-mono text-2xs block">
                          {dl.diasAtraso} {dl.diasAtraso === 1 ? 'dia' : 'dias'} de atraso
                        </span>
                        <span className="text-2xs text-slate-500 block font-mono">Prazo: {dl.dataFimPlanejada}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-2.5 text-xs text-slate-600">
            <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
            <span>Não há desvios ou atrasos críticos identificados hoje. Todas as frentes de trabalho operam dentro do planejado.</span>
          </div>
        )}
      </div>

      {/* Main Charts & Progress Segment */}
      <div id="dashboard-charts-grid" className={GRADE_PAINEL_ASSIMETRICO}>
        {/* Coluna larga: o gráfico. A proporção 2:1 é das trilhas do token —
            `col-span-2` saiu junto com a contagem implícita de colunas. */}
        <Secao
          id="financial-health-card"
          titulo="Evolução Financeira Consolidada"
          descricao="Comparação global entre Previsto (Orçado), Contratado e Executado."
        >
          {/* O marcador sai do MESMO token da barra que ele nomeia. Estavam
              escritos à mão e os três divergiam do que a barra pinta —
              `emerald-500` para uma barra `emerald-700`, e `slate-300` (1,49:1,
              o caso que o cabeçalho de `PREENCHIMENTO` chama de invisível) para
              uma barra `slate-500`. Legenda que não bate com o gráfico não é
              questão de estilo: ela atribui o número à série errada. */}
          <div className="flex flex-wrap gap-4 text-xs mb-4">
            <div className="flex items-center gap-1.5 font-medium text-slate-500">
              <span className={`w-3 h-3 ${PREENCHIMENTO.neutro} rounded-sm inline-block`}></span>
              <span>Orçado</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-slate-500">
              <span className={`w-3 h-3 ${PREENCHIMENTO.acao} rounded-sm inline-block`}></span>
              <span>Contratado</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-slate-500">
              <span className={`w-3 h-3 ${PREENCHIMENTO.positivo} rounded-sm inline-block`}></span>
              <span>Executado</span>
            </div>
          </div>

          {/* Simulated Custom Bar Chart */}
          <div id="financial-bars-chart">
            <div className="flex justify-between text-xs mb-2">
              <span className="font-semibold text-slate-700">Consolidado Geral Obras</span>
              <span className="text-slate-500 font-mono">Saldo Disponível: {(totalBudgeted - totalExecuted).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>

            {/* As três barras eram um bloco cinza com borda DENTRO do card. */}
            <div className="space-y-2">
              {/* Orçado */}
              <div>
                <div className="flex justify-between text-2xs text-slate-500 mb-0.5">
                  <span>Valor Orçado (Base)</span>
                  <span className="font-mono">{totalBudgeted.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div className={`${PREENCHIMENTO.neutro} h-full rounded-full transition-all duration-500`} style={{ width: '100%' }}></div>
                </div>
              </div>

              {/* Contratado */}
              <div>
                <div className="flex justify-between text-2xs text-slate-500 mb-0.5">
                  <span>Valor Contratado</span>
                  <span className="font-mono">{totalContracted.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div className={`${PREENCHIMENTO.acao} h-full rounded-full transition-all duration-500`} style={{ width: `${totalBudgeted > 0 ? (totalContracted / totalBudgeted) * 100 : 0}%` }}></div>
                </div>
              </div>

              {/* Executado */}
              <div>
                <div className="flex justify-between text-2xs text-slate-500 mb-0.5">
                  <span>Valor Medido & Executado</span>
                  <span className="font-mono">{totalExecuted.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div className={`${PREENCHIMENTO.positivo} h-full rounded-full transition-all duration-500`} style={{ width: `${totalBudgeted > 0 ? (totalExecuted / totalBudgeted) * 100 : 0}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap justify-between items-center gap-2">
            {(() => {
              // Real burn-rate insight: compares global financial execution
              // against the average physical progress of active projects.
              const avgPhysical = activeProjects.length > 0
                ? Math.round(activeProjects.reduce((sum, p) => sum + getProjectPhysicalProgress(p.id), 0) / activeProjects.length)
                : 0;

              if (totalBudgeted === 0) {
                return (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Activity size={14} className="text-slate-500" />
                    <span>Sem orçamentos cadastrados — cadastre itens de orçamento para acompanhar o ritmo financeiro.</span>
                  </div>
                );
              }

              const financialAhead = financialExecutionRate > avgPhysical + 10;
              return (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  {financialAhead ? (
                    <AlertTriangle size={14} className="text-amber-500" />
                  ) : (
                    <Activity size={14} className="text-emerald-500" />
                  )}
                  <span>
                    {financialAhead
                      ? `Atenção: desembolso financeiro (${financialExecutionRate.toFixed(0)}%) está à frente do avanço físico médio (${avgPhysical}%).`
                      : `Ritmo de queima financeira (${financialExecutionRate.toFixed(0)}%) compatível com o avanço físico médio das obras ativas (${avgPhysical}%).`}
                  </span>
                </div>
              );
            })()}
            <button 
              id="dashboard-go-projects-btn"
              onClick={() => onNavigate('projetos')} 
              className="text-xs text-blue-600 font-bold hover:text-blue-700 transition"
            >
              Auditar Orçamentos →
            </button>
          </div>
        </Secao>

        {/* Column 3: Physical Progress of Active Projects */}
        <Secao
          id="physical-progress-card"
          titulo="Evolução Física das Obras"
          descricao="Progresso médio das atividades do cronograma."
        >
          <div className="space-y-3">
            {projetos.length === 0 && (
              <p className="text-xs text-slate-500">Nenhuma obra cadastrada.</p>
            )}
            {projetos.map(proj => {
              const progress = getProjectPhysicalProgress(proj.id);

              return (
                <div key={proj.id} className="space-y-1">
                  <div className="flex justify-between items-center gap-2 text-xs">
                    <span className="font-medium text-slate-800 truncate">{proj.nome}</span>
                    <span className="font-mono font-bold text-slate-900 shrink-0">{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/50 flex">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${statusDot('projeto', proj.situacao)}`}
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between items-center text-2xs text-slate-500">
                    <span>Início: {formatarDataBR(proj.dataInicio)}</span>
                    <StatusBadge type="projeto" status={proj.situacao} size="sm" />
                  </div>
                </div>
              );
            })}
          </div>
        </Secao>
      </div>

      {/* Lower Row: Last Measurements & Alerts */}
      <div id="dashboard-lower-grid" className={GRADE_PAINEIS.lista}>
        {/* Latest Measurements (Medições Recentes) */}
        <Secao
          id="recent-measurements-card"
          titulo="Medições de Campo Recentes"
          descricao="Últimos boletins de medição (BM) de obra aprovados."
        >
          <div className="space-y-1">
            {medicoesRecentes.length === 0 && (
              <p className="text-xs text-slate-500">Nenhuma medição registrada até agora.</p>
            )}
            {medicoesRecentes.map((med, index) => {
              const projetoNome = nomePorProjeto.get(med.projetoId);
              // `dataMedicao` é coluna `date`. `new Date('2026-08-04')` a lê como
              // meia-noite UTC e, a oeste de Greenwich, `getDate()` devolve 3 —
              // o boletim aparecia no dia anterior. `dataLocal` é o helper.
              const data = dataLocal(med.dataMedicao);

              return (
                <div key={med.id || index} className="flex gap-4 p-2.5 -mx-2.5 rounded-lg hover:bg-slate-50 transition">
                  <div className="h-10 w-10 rounded-lg bg-blue-50 flex flex-col items-center justify-center border border-blue-200 shrink-0">
                    <span className="text-2xs font-bold text-blue-800 leading-none">
                      {data ? data.getDate() : '—'}
                    </span>
                    <span className="text-2xs text-blue-700 font-mono uppercase">
                      {data ? data.toLocaleString('pt-BR', { month: 'short' }).slice(0, 3) : ''}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {projetoNome ?? 'Projeto Desconhecido'}
                      </h4>
                      <span className="text-xs font-mono font-bold text-emerald-600">
                        {med.valorMedido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>
                    <p className="text-2xs text-slate-500 mt-0.5 truncate">
                      Etapa: <strong>{med.etapaNome ?? 'Geral'}</strong> (+{med.percentualMedido}%)
                    </p>
                    <p className="text-2xs text-slate-500 italic mt-1 truncate">
                      "{med.observacoes}"
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Secao>

        {/* Sales Pipeline & Active Proposals */}
        <Secao
          id="pipeline-proposals-card"
          titulo="Pipeline de Propostas Comerciais"
          descricao="Acompanhamento e prazos de conversão."
          acoes={
            <span className="bg-blue-50 border border-blue-200 text-blue-800 text-2xs font-bold px-2 py-0.5 rounded-full">
              {pendingProposalCount} Pendentes
            </span>
          }
        >
          {(() => {
            const pipeline = propostas.filter(p => p.status === 'Enviada' || p.status === 'Elaboração').slice(0, 3);
            if (pipeline.length === 0) {
              return <p className="text-xs text-slate-500">Nenhuma proposta em andamento.</p>;
            }
            return (
              <div className="divide-y divide-slate-200">
                {pipeline.map(prop => {
                  const cli = clientes.find(c => c.id === prop.clienteId);
                  return (
                    <div key={prop.id} className="py-2.5 flex justify-between items-center gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-2xs font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                            {prop.numero}
                          </span>
                          <h4 className="text-xs font-bold text-slate-800 truncate">
                            {prop.descricao}
                          </h4>
                        </div>
                        <p className="text-2xs text-slate-500 mt-1">
                          Cliente: <strong className="text-slate-600">{cli ? cli.nome : 'N/A'}</strong>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-mono font-bold text-slate-900 block">
                          {prop.valorEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <div className="mt-1">
                          <StatusBadge type="proposta" status={prop.status} size="sm" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </Secao>
      </div>
    </PaginaAba>
  );
}

/**
 * `memo` porque o conector acima é assinante de contexto: ele re-renderiza a
 * cada mudança de navegação (abrir a gaveta do menu, selecionar uma obra) mesmo
 * quando nenhuma prop desta tela mudou. Só vale porque os handlers vêm de
 * `useCallback` nos hooks de domínio — com uma prop instável o `memo` seria
 * custo de leitura com ganho zero, que é o que a auditoria previa no item 30.
 */
export default memo(DashboardOverview);
