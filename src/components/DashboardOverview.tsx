/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { memo, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  DollarSign,
  FileText,
  HardHat,
  ListChecks,
  LucideIcon,
  Ruler,
  Send,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import { Cliente, Proposta, Projeto, DesvioCategoria, EtapaAtrasada, LancamentoFinanceiro, MargemObra, MedicaoRecente, ResumoObra } from '../types';
import type { Role } from '../lib/database.types';
import { canAccessTab } from '../constants/tabAccess';
import { StatusBadge } from '../constants/status';
import {
  ALVO,
  AnelProgresso,
  Button,
  Card,
  Chip,
  CONTROLE_GRUPO,
  CONTROLE_GRUPO_ITEM,
  DESTAQUE_PAINEL,
  PaginaAba,
  PREENCHIMENTO,
} from './ui';
import Calendario from './dashboard/Calendario';
import BarrasMensais, { type MesDoGrafico } from './dashboard/BarrasMensais';

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
 *
 * ## REDESENHO 14/ago/2026 — a tela virou o mockup "Analizze - App"
 *
 * O layout passou a ser o do Claude Design: duas colunas (conteúdo + trilho de
 * 300 px), saudação no lugar do título institucional, e os números em CARTÃO,
 * não em `<Secao>` aberta. É a exceção consciente ao redesenho "seções
 * abertas" de 13/ago: ali a régua é "moldura só para alvo clicável", e aqui a
 * tela inteira é um painel de vitrine — o cartão é o que separa um indicador
 * do outro quando não há título para fazê-lo.
 *
 * `margens` e `lancamentos` entraram junto porque duas peças do mockup pedem
 * dado que o painel não tinha: a margem real da carteira (o diferencial que o
 * PRODUCT.md declara) e o gráfico de barras pareadas. Não desfazem o item 23 —
 * o que ele tirou daqui foi orçamento, cronograma e medições, as três de
 * escrita frequente no console da obra.
 */
interface DashboardOverviewProps {
  clientes: Cliente[];
  propostas: Proposta[];
  projetos: Projeto[];
  resumos: ResumoObra[];
  desvios: DesvioCategoria[];
  atrasos: EtapaAtrasada[];
  medicoesRecentes: MedicaoRecente[];
  margens: MargemObra[];
  lancamentos: LancamentoFinanceiro[];
  equipeCount: number;
  /** `full_name` do perfil. Ausente enquanto o perfil não chegou. */
  nomeUsuario?: string | null;
  role?: Role;
  onNavigate: (tabId: string, projectId?: string | null) => void;
}

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

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * "R$ 2,06 mi" em vez de "R$ 2.058.412,90".
 *
 * O mockup escreve todo valor grande assim, e o motivo é de leitura, não de
 * espaço: o número do topo do painel existe para ser lido de longe e comparado
 * com o de ontem — os centavos aí são ruído. O valor exato continua a um
 * clique, nas telas que existem para ele (Financeiro, console da obra).
 */
function brlCompacto(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) {
    return `R$ ${(valor / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mi`;
  }
  if (abs >= 1_000) {
    return `R$ ${(valor / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`;
  }
  return fmtBRL(valor);
}

function saudacaoDaHora(hora: number): string {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/**
 * O primeiro nome — ou nada.
 *
 * `profiles.full_name` nasce igual ao e-mail do cadastro enquanto ninguém
 * preenche a ficha, e "Boa tarde, marcosbarreto5531@gmail.com" é pior do que
 * não cumprimentar pelo nome. Um e-mail não vira nome bonito por corte: o
 * trecho antes do @ costuma ter sobrenome grudado e dígitos, e capitalizar
 * isso produz "Marcosbarreto5531", que continua não sendo o nome de ninguém.
 * Então: se parece e-mail, a saudação fica só com a hora.
 */
function primeiroNomeDe(valor?: string | null): string | undefined {
  const limpo = valor?.trim();
  if (!limpo || limpo.includes('@')) return undefined;
  return limpo.split(/\s+/)[0];
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Os seis meses que terminam no atual, sempre nessa ordem. */
function ultimosSeisMeses(hoje: Date): { chave: string; rotulo: string }[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - i), 1);
    return {
      chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: MES_CURTO[d.getMonth()],
    };
  });
}

function DashboardOverview({
  clientes,
  propostas,
  projetos,
  resumos,
  desvios,
  atrasos,
  medicoesRecentes,
  margens,
  lancamentos,
  equipeCount,
  nomeUsuario,
  role,
  onNavigate,
}: DashboardOverviewProps) {
  /**
   * O trilho do mockup. Ele não é decorativo: troca o painel de baixo entre a
   * lista de obras e o caixa, que são as duas leituras que a mesma pessoa faz
   * da mesma carteira. Os dois blocos existem no mockup; o trilho decide qual
   * lidera, em vez de empilhar os dois e empurrar o resto para fora da tela.
   */
  const [visao, setVisao] = useState<'obras' | 'financeiro'>('obras');

  const agora = useMemo(() => new Date(), []);

  const activeProjects = projetos.filter(p => p.situacao === 'Em Execução' || p.situacao === 'Planejamento');
  const emExecucao = projetos.filter(p => p.situacao === 'Em Execução').length;

  const pendingProposalCount = propostas.filter(p => p.status === 'Enviada' || p.status === 'Elaboração').length;

  /**
   * O nome da obra é a única coisa que as três listas agregadas NÃO trazem: elas
   * saem de views escopadas por obra, e repetir `projetos.nome` em cada linha
   * seria mandar o mesmo texto dezenas de vezes. O cruzamento é aqui, onde
   * `projetos` já está em memória.
   */
  const nomePorProjeto = useMemo(
    () => new Map(projetos.map(p => [p.id, p.nome])),
    [projetos]
  );
  const resumoPorProjeto = useMemo(
    () => new Map(resumos.map(r => [r.projetoId, r])),
    [resumos]
  );
  const nomePorCliente = useMemo(
    () => new Map(clientes.map(c => [c.id, c.nome])),
    [clientes]
  );

  // Budget calculations — somadas sobre uma linha por obra, não sobre a tabela
  // de itens de todas as obras.
  const totalBudgeted = resumos.reduce((sum, r) => sum + r.valorOrcado, 0);
  const totalExecuted = resumos.reduce((sum, r) => sum + r.valorExecutado, 0);

  const financialExecutionRate = totalBudgeted > 0 ? (totalExecuted / totalBudgeted) * 100 : 0;

  /**
   * Avanço físico ponderado pelo orçamento vinculado a cada etapa. Vem de
   * `v_resumo_obra`, que reimplementa `calcularAvancoFisico` em SQL — o console
   * segue calculando a partir das listas da obra aberta, e as duas contas são a
   * mesma. Antes esta tela tinha sua própria média simples e discordava dele.
   */
  const getProjectPhysicalProgress = (projId: string) =>
    resumoPorProjeto.get(projId)?.avancoFisico ?? 0;

  const avgPhysical = activeProjects.length > 0
    ? Math.round(activeProjects.reduce((s, p) => s + getProjectPhysicalProgress(p.id), 0) / activeProjects.length)
    : 0;

  /**
   * O desembolso à frente do avanço é o alerta que a tela existe para dar: a
   * obra gastou mais do que construiu. 10 pontos é a folga que separa "ritmo
   * normal" de "descolou" — abaixo disso a diferença cabe no arredondamento das
   * duas contas, que saem de views diferentes.
   */
  const desembolsoAdiantado = financialExecutionRate > avgPhysical + 10;

  /**
   * Margem REAL da carteira: `v_margem_obra` soma venda e custo com procedência
   * por obra, e aqui elas viram uma razão só. Somar os percentuais das obras e
   * dividir por N daria a média das margens, não a margem da carteira — uma
   * obra de R$ 5 mil com 40% pesaria igual a uma de R$ 5 milhões com 8%.
   */
  const margemCarteira = useMemo(() => {
    const comCusto = margens.filter(m => m.margemValor != null && m.vendaTotal > 0);
    if (comCusto.length === 0) return null;
    const venda = comCusto.reduce((s, m) => s + m.vendaTotal, 0);
    const margem = comCusto.reduce((s, m) => s + (m.margemValor ?? 0), 0);
    if (venda === 0) return null;
    return { percentual: (margem / venda) * 100, obras: comCusto.length };
  }, [margens]);

  /** Receitas × despesas EFETIVADAS por mês — só o que foi pago de fato. */
  const fluxoMensal = useMemo<MesDoGrafico[]>(() => {
    const meses = ultimosSeisMeses(agora);
    const porMes = new Map(meses.map(m => [m.chave, { rotulo: m.rotulo, a: 0, b: 0 }]));
    lancamentos.forEach(l => {
      if (!l.pago) return;
      // `data` é coluna `date` (YYYY-MM-DD): fatiar a string é o que evita o
      // fuso de `new Date()` — o mesmo motivo de `formatarDataBR` existir.
      const alvo = porMes.get(l.data.slice(0, 7));
      if (!alvo) return;
      if (l.tipo === 'Receita') alvo.a += l.valor;
      else alvo.b += l.valor;
    });
    return meses.map(m => porMes.get(m.chave)!);
  }, [lancamentos, agora]);

  const temFluxo = fluxoMensal.some(m => m.a > 0 || m.b > 0);

  // Desvio e atraso chegam prontos do servidor: a view já descartou o que está
  // dentro do planejado e o que não venceu. Aqui só se junta o nome da obra.
  const alertas = useMemo(() => {
    const lista: { id: string; tom: 'negativo' | 'atencao'; icone: LucideIcon; titulo: string; detalhe: string }[] = [];
    atrasos.forEach(a => lista.push({
      id: `atraso-${a.projetoId}-${a.etapaNome}`,
      tom: 'negativo',
      icone: AlertTriangle,
      titulo: `${a.etapaNome} — ${a.diasAtraso} ${a.diasAtraso === 1 ? 'dia' : 'dias'} de atraso`,
      detalhe: nomePorProjeto.get(a.projetoId) ?? 'Obra indefinida',
    }));
    desvios.forEach(d => lista.push({
      id: `desvio-${d.projetoId}-${d.categoria}`,
      tom: 'atencao',
      icone: TrendingUp,
      titulo: `${d.categoria} ${brlCompacto(d.excesso)} acima do orçado`,
      detalhe: nomePorProjeto.get(d.projetoId) ?? 'Obra indefinida',
    }));
    return lista.slice(0, 4);
  }, [atrasos, desvios, nomePorProjeto]);

  // Guided flow: the ordered list of "next actions" the user should take,
  // derived from the current state and filtered by what the role can reach.
  const nextSteps = useMemo(() => {
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
      atrasos.forEach(a => {
        const cur = obrasComAtraso.get(a.projetoId);
        obrasComAtraso.set(a.projetoId, {
          nome: nomePorProjeto.get(a.projetoId) ?? 'Projeto Indefinido',
          qtd: (cur?.qtd ?? 0) + 1,
        });
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
  }, [role, clientes, propostas, projetos, resumoPorProjeto, atrasos, nomePorProjeto, onNavigate]);

  const proximoPasso = nextSteps[0];
  const hasAnyData = projetos.length > 0 || propostas.length > 0 || clientes.length > 0;

  /** Boletins que esperam aprovação — o que o mockup põe no painel de destaque. */
  const medicoesPendentes = resumos.reduce((s, r) => s + r.medicoesPendentes, 0);
  const medicoesTotais = resumos.reduce((s, r) => s + r.medicoesTotal, 0);

  const primeiroNome = primeiroNomeDe(nomeUsuario);

  return (
    <PaginaAba largura="painel" id="dashboard-tab-content">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)] gap-5 items-start">

        {/* ─────────────── coluna do conteúdo ─────────────── */}
        <div className="min-w-0 flex flex-col gap-4">

          <div id="dashboard-title-section" className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {saudacaoDaHora(agora.getHours())}{primeiroNome ? `, ${primeiroNome}` : ''}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {emExecucao} {emExecucao === 1 ? 'obra em execução' : 'obras em execução'}
                {' · '}
                {nextSteps.length} {nextSteps.length === 1 ? 'pendência sua hoje' : 'pendências suas hoje'}
              </p>
            </div>

            <div role="tablist" aria-label="Leitura da carteira" className={CONTROLE_GRUPO}>
              {([['obras', 'Obras'], ['financeiro', 'Financeiro']] as const).map(([id, rotulo]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={visao === id}
                  onClick={() => setVisao(id)}
                  className={`${CONTROLE_GRUPO_ITEM.base} ${ALVO.md} ${visao === id ? CONTROLE_GRUPO_ITEM.ativo : CONTROLE_GRUPO_ITEM.inativo}`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>

          {/* Execução + os dois indicadores ao lado: o bloco que o mockup põe
              acima de tudo, porque é o que se lê de longe. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4">
            <Card className="flex items-center gap-5">
              <div className="min-w-0">
                <span className="text-2xs font-semibold text-slate-500">Execução financeira</span>
                <p className="mt-1.5 data-font text-2xl font-bold tracking-tight text-slate-900">
                  {brlCompacto(totalExecuted)}
                </p>
                <p className="mt-2 text-2xs text-slate-500">
                  de {brlCompacto(totalBudgeted)} orçados
                </p>
              </div>
              <div className="ml-auto shrink-0">
                <AnelProgresso percentual={Math.round(financialExecutionRate)} tamanho={104} tom="acao">
                  <span className="data-font text-sm font-bold text-slate-900">
                    {Math.round(financialExecutionRate)}%
                  </span>
                  <span className="text-2xs font-semibold text-slate-500">executado</span>
                </AnelProgresso>
              </div>
            </Card>

            <div className="grid grid-rows-2 gap-4">
              <Card>
                <span className="text-2xs font-semibold text-slate-500">Avanço físico médio</span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="data-font text-xl font-bold text-slate-900">{avgPhysical}%</span>
                  <span className={`text-2xs font-bold ${desembolsoAdiantado ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {desembolsoAdiantado ? 'desembolso à frente' : 'no ritmo'}
                  </span>
                </div>
                <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${PREENCHIMENTO.acao}`} style={{ width: `${avgPhysical}%` }} />
                </div>
              </Card>

              <Card>
                <span className="text-2xs font-semibold text-slate-500">Margem real da carteira</span>
                {margemCarteira ? (
                  <>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="data-font text-xl font-bold text-slate-900">
                        {margemCarteira.percentual.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                      </span>
                    </div>
                    <span className="mt-2 block text-2xs text-slate-500">
                      {margemCarteira.obras} {margemCarteira.obras === 1 ? 'obra com' : 'obras com'} custo de procedência
                    </span>
                  </>
                ) : (
                  <p className="mt-1.5 text-2xs leading-snug text-slate-500">
                    Vincule insumos com preço rastreável ao orçamento para a obra passar a ter margem real.
                  </p>
                )}
              </Card>
            </div>
          </div>

          {visao === 'obras' ? (
            <Card>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-slate-900">Obras em andamento</h3>
                  <p className="mt-0.5 text-2xs text-slate-500">
                    Avanço físico contra desembolso — a discrepância é o alerta.
                  </p>
                </div>
                <Button variante="secundario" tamanho="sm" onClick={() => onNavigate('projetos')}>
                  Ver todas
                </Button>
              </div>

              <div className="mt-3">
                {activeProjects.length === 0 ? (
                  <p className="py-3 text-2xs text-slate-500">Nenhuma obra em andamento.</p>
                ) : (
                  activeProjects.map(proj => {
                    const resumo = resumoPorProjeto.get(proj.id);
                    const avanco = getProjectPhysicalProgress(proj.id);
                    return (
                      <div
                        key={proj.id}
                        className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.1fr)_110px] items-center gap-4 border-t border-slate-100 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900">{proj.nome}</p>
                          <p className="mt-0.5 truncate text-2xs text-slate-500">
                            {nomePorCliente.get(proj.clienteId) ?? 'Cliente não informado'}
                          </p>
                        </div>
                        <span className="justify-self-start">
                          <StatusBadge type="projeto" status={proj.situacao} size="sm" />
                        </span>
                        <div className="flex items-center gap-2.5">
                          <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full rounded-full ${PREENCHIMENTO.acao}`} style={{ width: `${avanco}%` }} />
                          </div>
                          <span className="data-font w-9 shrink-0 text-right text-2xs font-bold text-slate-700">
                            {avanco}%
                          </span>
                        </div>
                        <span className="data-font text-right text-2xs font-bold text-slate-900">
                          {brlCompacto(resumo?.valorExecutado ?? 0)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          ) : (
            <Card>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-slate-900">Receitas × despesas efetivadas</h3>
                  <p className="mt-0.5 text-2xs text-slate-500">
                    Últimos seis meses, só o que já foi pago ou recebido.
                  </p>
                </div>
                <Button variante="secundario" tamanho="sm" onClick={() => onNavigate('empresa')}>
                  Abrir financeiro
                </Button>
              </div>
              <div className="mt-3">
                {temFluxo ? (
                  <BarrasMensais
                    dados={fluxoMensal}
                    rotuloA="Receitas"
                    rotuloB="Despesas"
                    formatar={brlCompacto}
                  />
                ) : (
                  <p className="py-6 text-center text-2xs text-slate-500">
                    Nenhum lançamento efetivado nos últimos seis meses.
                  </p>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* ─────────────── trilho de 300 px ─────────────── */}
        <div className="min-w-0 flex flex-col gap-4">
          <Calendario />

          <Card id="dashboard-next-steps">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <ListChecks size={14} className="text-slate-500" aria-hidden="true" />
                Próximo passo
              </span>
              {nextSteps.length > 0 && (
                <Chip tom="atencao">
                  {nextSteps.length} {nextSteps.length === 1 ? 'ação' : 'ações'}
                </Chip>
              )}
            </div>

            {proximoPasso ? (
              <div className="mt-3 flex flex-col gap-3">
                <div>
                  <p className="text-xs font-semibold leading-snug text-slate-900">{proximoPasso.title}</p>
                  <p className="mt-1 text-2xs leading-relaxed text-slate-500">{proximoPasso.description}</p>
                </div>
                <Button bloco onClick={proximoPasso.onAction}>
                  {proximoPasso.actionLabel}
                  <ArrowRight size={13} />
                </Button>
                {nextSteps.length > 1 && (
                  <p className="text-2xs text-slate-500">
                    + {nextSteps.length - 1} {nextSteps.length - 1 === 1 ? 'outra ação pendente' : 'outras ações pendentes'} no fluxo.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3 flex items-start gap-2 text-2xs leading-relaxed text-slate-600">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>
                  {hasAnyData
                    ? 'Nenhuma ação pendente no fluxo — propostas, obras e medições estão em dia.'
                    : 'Comece cadastrando um cliente e elaborando a primeira proposta.'}
                </span>
              </div>
            )}
          </Card>

          {/* Painel de destaque — o CTA do mockup. Só monta quando há boletim
              esperando alguém: um convite de ação sem ação é só cor na tela. */}
          {medicoesPendentes > 0 && (
            <Card variante="destaque" className="flex flex-col gap-3">
              <div>
                <span className="text-xs font-bold">Medições a aprovar</span>
                <p className="mt-0.5 text-2xs leading-snug opacity-80">
                  Boletins registrados pelo campo aguardando sua aprovação.
                </p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="data-font text-xl font-bold">{medicoesPendentes}</p>
                  <span className="text-2xs font-semibold opacity-80">
                    de {medicoesTotais} {medicoesTotais === 1 ? 'boletim' : 'boletins'}
                  </span>
                </div>
                <AnelProgresso
                  percentual={medicoesTotais > 0 ? (medicoesPendentes / medicoesTotais) * 100 : 0}
                  tamanho={60}
                  tom="acao"
                  corDoMiolo={DESTAQUE_PAINEL.fundo}
                >
                  <span className="data-font text-2xs font-bold" style={{ color: DESTAQUE_PAINEL.texto }}>
                    {medicoesPendentes}
                  </span>
                </AnelProgresso>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('projetos')}
                className={`h-9 rounded-lg text-2xs font-bold text-white transition hover:opacity-90 ${ALVO.md}`}
                style={{ background: DESTAQUE_PAINEL.texto }}
              >
                Abrir obras
              </button>
            </Card>
          )}

          <Card>
            <span className="text-xs font-bold text-slate-900">Atenção</span>
            {alertas.length === 0 ? (
              <div className="mt-2.5 flex items-start gap-2 text-2xs leading-relaxed text-slate-600">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>Nenhum desvio ou atraso crítico hoje.</span>
              </div>
            ) : (
              <div className="mt-2.5 flex flex-col gap-2.5">
                {alertas.map(a => {
                  const Icone = a.icone;
                  return (
                    <div key={a.id} className="flex items-start gap-2.5">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                          a.tom === 'negativo' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        <Icone size={13} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-2xs font-semibold leading-snug text-slate-900">{a.titulo}</p>
                        <p className="mt-0.5 truncate text-2xs text-slate-500">{a.detalhe}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* A carteira comercial e a equipe não têm cartão no mockup, mas são
              dois números que a tela antiga mostrava e que ninguém mais mostra:
              viram uma linha de rodapé do trilho em vez de sumirem. */}
          <Card className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('propostas')}
              className="flex items-center justify-between gap-2 text-left"
            >
              <span className="inline-flex items-center gap-2 text-2xs font-semibold text-slate-500">
                <FileText size={13} aria-hidden="true" />
                Propostas em aberto
              </span>
              <span className="data-font text-xs font-bold text-slate-900">{pendingProposalCount}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('equipe')}
              className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-left"
            >
              <span className="inline-flex items-center gap-2 text-2xs font-semibold text-slate-500">
                <HardHat size={13} aria-hidden="true" />
                Funcionários ativos
              </span>
              <span className="data-font text-xs font-bold text-slate-900">{equipeCount}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('empresa')}
              className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-left"
            >
              <span className="inline-flex items-center gap-2 text-2xs font-semibold text-slate-500">
                <DollarSign size={13} aria-hidden="true" />
                Medições recentes
              </span>
              <span className="data-font text-xs font-bold text-slate-900">{medicoesRecentes.length}</span>
            </button>
          </Card>
        </div>
      </div>
    </PaginaAba>
  );
}

export default memo(DashboardOverview);
