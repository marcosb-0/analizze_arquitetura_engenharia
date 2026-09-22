import { memo, useMemo } from 'react';
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, FileText, HardHat,
  ListChecks, RefreshCw, Ruler, Send, TrendingUp, UserPlus,
  type LucideIcon,
} from 'lucide-react';
import type { Cliente, DesvioCategoria, EtapaAtrasada, MedicaoRecente, Projeto, Proposta, ResumoObra } from '../types';
import type { Role } from '../lib/database.types';
import type { montarControladoria } from '../lib/controladoria';
import { formatarDataBR } from '../lib/data';
import { canAccessTab } from '../constants/tabAccess';
import { Button, PaginaAba, PREENCHIMENTO } from './ui';
import Calendario from './dashboard/Calendario';

interface DashboardOverviewProps {
  clientes: Cliente[];
  propostas: Proposta[];
  projetos: Projeto[];
  resumos: ResumoObra[];
  desvios: DesvioCategoria[];
  atrasos: EtapaAtrasada[];
  medicoesRecentes: MedicaoRecente[];
  equipeCount: number;
  nomeUsuario?: string | null;
  role?: Role;
  onNavigate: (tabId: string, projectId?: string | null) => void;
  quadroEmpresa?: ReturnType<typeof montarControladoria> | null;
  controleLoading?: boolean;
  onRecarregar?: () => Promise<void>;
}

type StepTone = 'blue' | 'sky' | 'amber' | 'emerald';
const TOM_PASSO: Record<StepTone, string> = {
  blue: 'text-blue-700', sky: 'text-sky-700', amber: 'text-amber-700', emerald: 'text-emerald-700',
};
interface NextStep {
  id: string;
  priority: number;
  icon: LucideIcon;
  tone: StepTone;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

const dinheiro = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function dinheiroCurto(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `R$ ${(valor / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 10_000) return `R$ ${(valor / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return dinheiro(valor);
}

function saudacao(hora: number) {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function primeiroNome(valor?: string | null): string | undefined {
  const nome = valor?.trim();
  return nome && !nome.includes('@') ? nome.split(/\s+/)[0] : undefined;
}

function DashboardOverview({
  clientes, propostas, projetos, resumos, desvios, atrasos, medicoesRecentes,
  equipeCount, nomeUsuario, role, onNavigate, quadroEmpresa, controleLoading, onRecarregar,
}: DashboardOverviewProps) {
  const agora = useMemo(() => new Date(), []);
  const nome = primeiroNome(nomeUsuario);
  const obrasAtivas = projetos.filter((projeto) => projeto.situacao === 'Em Execução' || projeto.situacao === 'Planejamento');
  const obrasEmExecucao = projetos.filter((projeto) => projeto.situacao === 'Em Execução').length;
  const propostasAbertas = propostas.filter((proposta) => proposta.status === 'Enviada' || proposta.status === 'Elaboração').length;
  const medicoesPendentes = resumos.reduce((soma, resumo) => soma + resumo.medicoesPendentes, 0);
  const totalOrcado = resumos.reduce((soma, resumo) => soma + resumo.valorOrcado, 0);
  const totalMedido = resumos.reduce((soma, resumo) => soma + resumo.valorExecutado, 0);

  const nomesObra = useMemo(() => new Map(projetos.map((projeto) => [projeto.id, projeto.nome])), [projetos]);
  const resumosObra = useMemo(() => new Map(resumos.map((resumo) => [resumo.projetoId, resumo])), [resumos]);
  const nomesCliente = useMemo(() => new Map(clientes.map((cliente) => [cliente.id, cliente.nome])), [clientes]);
  const resultadosObra = useMemo(
    () => new Map(quadroEmpresa?.obras.map((obra) => [obra.projeto.id, obra]) ?? []),
    [quadroEmpresa]
  );
  const avancoMedio = obrasAtivas.length > 0
    ? Math.round(obrasAtivas.reduce((soma, obra) => soma + (resumosObra.get(obra.id)?.avancoFisico ?? 0), 0) / obrasAtivas.length)
    : 0;

  const alertas = useMemo(() => {
    const lista: { id: string; titulo: string; detalhe: string; tom: 'negativo' | 'atencao'; icone: LucideIcon }[] = [];
    atrasos.forEach((atraso) => lista.push({
      id: `atraso-${atraso.projetoId}-${atraso.etapaNome}`,
      titulo: `${atraso.etapaNome} · ${atraso.diasAtraso} ${atraso.diasAtraso === 1 ? 'dia' : 'dias'} de atraso`,
      detalhe: nomesObra.get(atraso.projetoId) ?? 'Obra indefinida',
      tom: 'negativo', icone: AlertTriangle,
    }));
    desvios.forEach((desvio) => lista.push({
      id: `desvio-${desvio.projetoId}-${desvio.categoria}`,
      titulo: `${desvio.categoria} · ${dinheiroCurto(desvio.excesso)} acima do orçado`,
      detalhe: nomesObra.get(desvio.projetoId) ?? 'Obra indefinida',
      tom: 'atencao', icone: TrendingUp,
    }));
    return lista.slice(0, 4);
  }, [atrasos, desvios, nomesObra]);

  const proximosPassos = useMemo(() => {
    const passos: NextStep[] = [];
    const pode = (aba: string) => canAccessTab(role, aba);
    if (pode('clientes') && clientes.length === 0) {
      passos.push({ id: 'cliente', priority: 0, icon: UserPlus, tone: 'blue', title: 'Cadastre o primeiro cliente',
        description: 'O cadastro do cliente inicia o fluxo comercial.', actionLabel: 'Abrir clientes', onAction: () => onNavigate('clientes') });
    } else if (pode('propostas') && propostas.length === 0 && clientes.length > 0) {
      passos.push({ id: 'proposta', priority: 0, icon: FileText, tone: 'blue', title: 'Elabore a primeira proposta',
        description: 'Você já tem clientes cadastrados.', actionLabel: 'Abrir propostas', onAction: () => onNavigate('propostas') });
    }
    if (pode('propostas')) {
      propostas.filter((proposta) => proposta.status === 'Aprovada' && !projetos.some((obra) => obra.propostaId === proposta.id))
        .forEach((proposta) => passos.push({ id: `obra-${proposta.id}`, priority: 1, icon: HardHat, tone: 'blue',
          title: `Iniciar obra da proposta ${proposta.numero}`, description: proposta.descricao,
          actionLabel: 'Abrir proposta', onAction: () => onNavigate('propostas', proposta.id) }));
    }
    if (pode('projetos')) {
      projetos.filter((obra) => obra.situacao === 'Planejamento' && (resumosObra.get(obra.id)?.medicoesTotal ?? 0) === 0)
        .forEach((obra) => passos.push({ id: `medicao-${obra.id}`, priority: 2, icon: Ruler, tone: 'sky',
          title: `Registrar primeira medição`, description: obra.nome,
          actionLabel: 'Abrir obra', onAction: () => onNavigate('projetos', obra.id) }));
      const obrasAtrasadas = new Map<string, number>();
      atrasos.forEach((atraso) => obrasAtrasadas.set(atraso.projetoId, (obrasAtrasadas.get(atraso.projetoId) ?? 0) + 1));
      obrasAtrasadas.forEach((quantidade, projetoId) => passos.push({ id: `atraso-${projetoId}`, priority: 3,
        icon: AlertTriangle, tone: 'amber', title: `Atualizar medição`,
        description: `${nomesObra.get(projetoId) ?? 'Obra'} · ${quantidade} ${quantidade === 1 ? 'etapa atrasada' : 'etapas atrasadas'}`,
        actionLabel: 'Abrir obra', onAction: () => onNavigate('projetos', projetoId) }));
    }
    if (pode('propostas')) {
      const elaboracao = propostas.filter((proposta) => proposta.status === 'Elaboração');
      if (elaboracao.length > 0) passos.push({ id: 'enviar', priority: 4, icon: Send, tone: 'emerald',
        title: elaboracao.length === 1 ? `Finalize a proposta ${elaboracao[0].numero}` : `${elaboracao.length} propostas em elaboração`,
        description: 'Conclua a elaboração e envie ao cliente.', actionLabel: 'Abrir propostas', onAction: () => onNavigate('propostas') });
    }
    return passos.sort((a, b) => a.priority - b.priority);
  }, [role, clientes, propostas, projetos, resumosObra, atrasos, nomesObra, onNavigate]);

  const proximo = proximosPassos[0];
  const IconeProximo = proximo?.icon ?? ListChecks;
  const temDados = projetos.length > 0 || propostas.length > 0 || clientes.length > 0;
  const obrasDaLista = (quadroEmpresa?.obras.map((obra) => obra.projeto) ?? obrasAtivas).slice(0, 6);
  const resultadoCompetencia = quadroEmpresa?.raiz
    ? quadroEmpresa.raiz.receitaLancadaArvore - quadroEmpresa.raiz.despesaLancadaArvore : null;
  const resultadoCaixa = quadroEmpresa?.raiz
    ? quadroEmpresa.raiz.receitaRecebidaArvore - quadroEmpresa.raiz.despesaPagaArvore : null;
  const maiorCusto = Math.max(0, ...(quadroEmpresa?.grupos.map((grupo) => grupo.despesaLancadaArvore) ?? []));

  return (
    <PaginaAba largura="cheia" id="dashboard-tab-content" className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Indicadores</h1>
          <p className="mt-1 text-sm text-slate-600">
            {saudacao(agora.getHours())}{nome ? `, ${nome}` : ''} · {obrasEmExecucao} {obrasEmExecucao === 1 ? 'obra em execução' : 'obras em execução'}
          </p>
        </div>
        {quadroEmpresa && onRecarregar && (
          <Button variante="secundario" tamanho="sm" onClick={() => void onRecarregar()} disabled={controleLoading} aria-label="Atualizar dados da empresa">
            <RefreshCw size={15} aria-hidden="true" /> Atualizar
          </Button>
        )}
      </header>

      {quadroEmpresa ? (
        <section aria-label="Resultado da empresa" className="rounded-2xl bg-slate-900 px-5 py-6 text-white md:px-7 md:py-7 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)] lg:gap-10">
          <div className="flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-white">Resultado da empresa</h2>
              <button type="button" onClick={() => onNavigate('empresa')} className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-blue-100 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                Abrir razão <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-8 lg:mt-10">
              <p className="text-sm font-semibold text-white/75">Por competência</p>
              <p className="data-font mt-1 break-words text-3xl font-bold tracking-tight text-white sm:text-4xl" title={resultadoCompetencia === null ? undefined : dinheiro(resultadoCompetencia)}>
                {resultadoCompetencia === null ? '—' : dinheiroCurto(resultadoCompetencia)}
              </p>
              <p className="mt-2 text-sm text-white/75">Receitas menos despesas lançadas</p>
            </div>
          </div>
          <dl className="mt-7 divide-y divide-white/15 border-t border-white/15 lg:mt-0 lg:border-t-0">
            <div className="flex items-baseline justify-between gap-4 py-3 first:pt-0 lg:first:pt-1">
              <dt className="text-sm text-white/75">Resultado de caixa</dt>
              <dd className="data-font text-lg font-bold text-white" title={resultadoCaixa === null ? undefined : dinheiro(resultadoCaixa)}>{resultadoCaixa === null ? '—' : dinheiroCurto(resultadoCaixa)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-sm text-white/75">Em negociação</dt>
              <dd className="data-font text-lg font-bold text-white" title={dinheiro(quadroEmpresa.valorEmNegociacao)}>{dinheiroCurto(quadroEmpresa.valorEmNegociacao)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3 last:pb-0">
              <dt className="text-sm text-white/75">Compromissos ativos</dt>
              <dd className="data-font text-lg font-bold text-white" title={dinheiro(quadroEmpresa.compromissosAtivos)}>{dinheiroCurto(quadroEmpresa.compromissosAtivos)}</dd>
            </div>
          </dl>
          {controleLoading && <p role="status" className="mt-3 text-sm text-white/75 lg:col-span-2">Atualizando dados da empresa…</p>}
          {!controleLoading && !quadroEmpresa.raiz && <p role="status" className="mt-3 text-sm text-white/75 lg:col-span-2">Custos indisponíveis. Use Atualizar dados para tentar novamente.</p>}
          <p className="mt-5 text-xs text-white/75 lg:col-span-2">Compromissos ainda não entram no resultado lançado.</p>
        </section>
      ) : (
        <section aria-label="Resumo da operação" className="rounded-2xl bg-slate-900 px-5 py-6 text-white md:px-7 md:py-7">
          <h2 className="text-base font-bold text-white">Obras em execução</h2>
          <div className="mt-5 flex flex-wrap items-end gap-x-12 gap-y-5">
            <div><p className="data-font text-4xl font-bold text-white">{obrasEmExecucao}</p><p className="mt-1 text-sm text-white/75">{avancoMedio}% de avanço físico médio</p></div>
            <div><p className="data-font text-2xl font-bold text-white">{dinheiroCurto(totalMedido)}</p><p className="mt-1 text-sm text-white/75">valor medido de {dinheiroCurto(totalOrcado)} orçados</p></div>
            <div><p className="data-font text-2xl font-bold text-white">{medicoesPendentes}</p><p className="mt-1 text-sm text-white/75">medições pendentes</p></div>
          </div>
        </section>
      )}

      <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.8fr)]">
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Carteira de obras</h2>
              <p className="mt-0.5 text-sm text-slate-600">{obrasAtivas.length} em andamento · {medicoesPendentes} medições pendentes</p>
            </div>
            <Button variante="acao" onClick={() => onNavigate('projetos')}>Todas as obras <ArrowRight size={15} aria-hidden="true" /></Button>
          </div>
          {obrasDaLista.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
              <p className="text-sm font-semibold text-slate-900">Nenhuma obra cadastrada</p>
              <p className="mt-1 text-sm text-slate-600">As obras aparecerão aqui quando forem iniciadas.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {obrasDaLista.map((obra) => {
                const resumo = resumosObra.get(obra.id);
                const resultado = resultadosObra.get(obra.id)?.resultado;
                const percentual = Math.max(0, Math.min(100, resumo?.avancoFisico ?? 0));
                return (
                  <button key={obra.id} type="button" onClick={() => onNavigate('projetos', obra.id)} className="group flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-slate-200 px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500">
                    <div className="min-w-[150px] flex-1">
                      <p className="truncate text-sm font-bold text-slate-900 group-hover:text-blue-700">{obra.nome}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-600">{nomesCliente.get(obra.clienteId) ? `${nomesCliente.get(obra.clienteId)} · ` : ''}{obra.situacao}</p>
                    </div>
                    <div className="flex min-w-[125px] items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className={`h-full rounded-full ${PREENCHIMENTO.acao}`} style={{ width: `${percentual}%` }} /></div>
                      <span className="data-font text-xs font-bold text-slate-700">{Math.round(percentual)}%</span>
                    </div>
                    <div className="min-w-[105px] text-right">
                      <p className="text-xs text-slate-500">{quadroEmpresa ? 'Resultado' : 'Valor medido'}</p>
                      <p className="data-font text-sm font-bold text-slate-900" title={quadroEmpresa && resultado ? dinheiro(resultado.resultadoCompetencia) : dinheiro(resumo?.valorExecutado ?? 0)}>
                        {quadroEmpresa ? resultado ? dinheiroCurto(resultado.resultadoCompetencia) : '—' : dinheiroCurto(resumo?.valorExecutado ?? 0)}
                      </p>
                    </div>
                    <ArrowRight size={16} className="shrink-0 text-slate-500 group-hover:text-blue-700" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="inline-flex items-center gap-2 text-sm font-bold text-slate-900"><IconeProximo size={17} className={TOM_PASSO[proximo?.tone ?? 'blue']} aria-hidden="true" /> Próximo passo</h2>
              {proximosPassos.length > 0 && <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-blue-700">{proximosPassos.length} {proximosPassos.length === 1 ? 'ação' : 'ações'}</span>}
            </div>
            {proximo ? (
              <div className="mt-5">
                <p className="text-base font-bold leading-snug text-slate-900">{proximo.title}</p>
                <p className="mt-1 text-sm text-slate-600">{proximo.description}</p>
                <Button className="mt-5" onClick={proximo.onAction}>{proximo.actionLabel} <ArrowRight size={15} aria-hidden="true" /></Button>
              </div>
            ) : (
              <p className="mt-4 flex items-start gap-2 text-sm text-slate-700"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" /> {temDados ? 'Nenhuma ação pendente no fluxo.' : 'Comece cadastrando um cliente.'}</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900">Atenção</h2>
            {alertas.length === 0 ? <p className="mt-3 flex items-start gap-2 text-sm text-slate-600"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" /> Nenhum desvio ou atraso crítico.</p> : (
              <ul className="mt-3 space-y-3">{alertas.map((alerta) => {
                const Icone = alerta.icone;
                return <li key={alerta.id} className="flex items-start gap-3"><Icone size={17} className={`mt-0.5 shrink-0 ${alerta.tom === 'negativo' ? 'text-rose-700' : 'text-amber-700'}`} aria-hidden="true" /><div><p className="text-sm font-semibold text-slate-900">{alerta.titulo}</p><p className="text-xs text-slate-600">{alerta.detalhe}</p></div></li>;
              })}</ul>
            )}
          </section>

          <details className="rounded-2xl border border-slate-200 bg-white p-5">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-900"><CalendarDays size={17} className="text-slate-500" aria-hidden="true" /> Agenda do mês</summary>
            <div className="mt-4"><Calendario /></div>
          </details>
        </aside>
      </div>

      {quadroEmpresa && (
        <section>
          <div className="mb-4 border-b border-slate-200 pb-3"><h2 className="text-lg font-bold text-slate-900">Financeiro em detalhe</h2></div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.6fr)]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-slate-900">Despesas por área</h3><Button variante="acao" tamanho="sm" onClick={() => onNavigate('empresa')}>Ver centros <ArrowRight size={14} aria-hidden="true" /></Button></div>
              {quadroEmpresa.grupos.length === 0 ? <p className="mt-5 text-sm text-slate-600">Sem centros de custo.</p> : (
                <dl className="mt-5 space-y-5">{quadroEmpresa.grupos.map((grupo) => (
                  <div key={grupo.centroId}>
                    <div className="flex justify-between gap-4 text-sm"><dt className="font-medium text-slate-700">{grupo.nome}</dt><dd className="data-font font-bold text-slate-900">{dinheiroCurto(grupo.despesaLancadaArvore)}</dd></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className={`h-full rounded-full ${PREENCHIMENTO.acao}`} style={{ width: `${maiorCusto > 0 ? (grupo.despesaLancadaArvore / maiorCusto) * 100 : 0}%` }} /></div>
                  </div>
                ))}</dl>
              )}
            </div>
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-bold text-slate-900">Margem prevista</h3>
              <div className="mt-6"><p className="data-font text-2xl font-bold text-slate-900">{quadroEmpresa.margemCobertura.completas ? dinheiroCurto(quadroEmpresa.margemProjetada) : '—'}</p><p className="mt-2 text-sm text-slate-600">{quadroEmpresa.margemCobertura.completas} de {quadroEmpresa.margemCobertura.total} obras com análise completa</p></div>
            </div>
          </div>
        </section>
      )}

      {quadroEmpresa && (
        <section>
          <div className="mb-2 border-b border-slate-200 pb-3"><h2 className="text-lg font-bold text-slate-900">Registros recentes</h2></div>
          {quadroEmpresa.fatos.length === 0 ? <p className="text-sm text-slate-600">Nenhum registro recente.</p> : (
            <ul className="divide-y divide-slate-200">{quadroEmpresa.fatos.slice(0, 5).map((fato) => {
              const destino = fato.propostaId ? 'propostas' : fato.origem === 'Financeiro' ? 'empresa' : 'projetos';
              const registroId = fato.propostaId ?? (destino === 'projetos' ? fato.projetoId : undefined);
              return <li key={fato.id} className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{fato.titulo}</p><p className="text-xs text-slate-600">{fato.origem} · {formatarDataBR(fato.data)}{fato.projetoId && nomesObra.get(fato.projetoId) ? ` · ${nomesObra.get(fato.projetoId)}` : ''}</p></div>
                <div className="flex items-center gap-4">{fato.valor !== undefined && <span className="data-font text-sm font-bold text-slate-900">{dinheiroCurto(fato.valor)}</span>}<Button variante="acao" tamanho="sm" onClick={() => onNavigate(destino, registroId)} aria-label={`Abrir ${fato.titulo}`}><ArrowRight size={16} aria-hidden="true" /></Button></div>
              </li>;
            })}</ul>
          )}
        </section>
      )}

      <details className="border-t border-slate-200 pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Outros indicadores</summary>
        <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
          {canAccessTab(role, 'propostas') && <button type="button" onClick={() => onNavigate('propostas')} className="text-left"><span className="block text-xs text-slate-600">Propostas abertas</span><span className="data-font text-lg font-bold text-slate-900">{propostasAbertas}</span></button>}
          {canAccessTab(role, 'equipe') && <button type="button" onClick={() => onNavigate('equipe')} className="text-left"><span className="block text-xs text-slate-600">Funcionários ativos</span><span className="data-font text-lg font-bold text-slate-900">{equipeCount}</span></button>}
          <button type="button" onClick={() => onNavigate('projetos')} className="text-left"><span className="block text-xs text-slate-600">Medições recentes</span><span className="data-font text-lg font-bold text-slate-900">{medicoesRecentes.length}</span></button>
        </div>
      </details>
    </PaginaAba>
  );
}

export default memo(DashboardOverview);
