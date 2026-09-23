import React, { memo, useMemo } from 'react';
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, FileText, HardHat,
  RefreshCw, Ruler, Send, TrendingUp, UserPlus, Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Cliente, DesvioCategoria, LancamentoFinanceiro, EtapaAtrasada, MedicaoRecente, Projeto, Proposta, ResumoObra } from '../types';
import type { Role } from '../lib/database.types';
import type { montarControladoria } from '../lib/controladoria';
import { formatarDataBR } from '../lib/data';
import { canAccessTab } from '../constants/tabAccess';
import { Button, PaginaAba, PREENCHIMENTO, Trena } from './ui';
import Calendario from './dashboard/Calendario';
import ReceitaDespesaMensal from './dashboard/ReceitaDespesaMensal';

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
  /** Lançamentos da empresa — só o administrador recebe (a leitura é por papel). */
  lancamentos?: LancamentoFinanceiro[];
}

type StepTone = 'blue' | 'sky' | 'amber' | 'emerald';
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
  if (abs >= 1_000_000) return `${valor < 0 ? '-' : ''}R$ ${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 10_000) return `${valor < 0 ? '-' : ''}R$ ${(abs / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return dinheiro(valor);
}

/** Para a faixa de métricas do pilar, onde cabe ~9 caracteres: compacta a partir de mil. */
function dinheiroCompacto(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `${valor < 0 ? '-' : ''}R$ ${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `${valor < 0 ? '-' : ''}R$ ${(abs / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
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
  equipeCount, nomeUsuario, role, onNavigate, quadroEmpresa, controleLoading, onRecarregar, lancamentos = [],
}: DashboardOverviewProps) {
  const agora = useMemo(() => new Date(), []);
  const nome = primeiroNome(nomeUsuario);
  const obrasAtivas = projetos.filter((projeto) => projeto.situacao === 'Em Execução' || projeto.situacao === 'Planejamento');
  const obrasEmExecucao = projetos.filter((projeto) => projeto.situacao === 'Em Execução').length;
  const medicoesPendentes = resumos.reduce((soma, resumo) => soma + resumo.medicoesPendentes, 0);
  const totalOrcado = resumos.reduce((soma, resumo) => soma + resumo.valorOrcado, 0);
  const totalMedido = resumos.reduce((soma, resumo) => soma + resumo.valorExecutado, 0);

  const nomesObra = useMemo(() => new Map(projetos.map((projeto) => [projeto.id, projeto.nome])), [projetos]);
  const resumosObra = useMemo(() => new Map(resumos.map((resumo) => [resumo.projetoId, resumo])), [resumos]);
  const avancoMedio = obrasAtivas.length > 0
    ? Math.round(obrasAtivas.reduce((soma, obra) => soma + (resumosObra.get(obra.id)?.avancoFisico ?? 0), 0) / obrasAtivas.length)
    : 0;

  const alertas = useMemo(() => {
    const lista: { id: string; projetoId: string; titulo: string; detalhe: string; tom: 'negativo' | 'atencao'; icone: LucideIcon }[] = [];
    atrasos.forEach((atraso) => lista.push({
      id: `atraso-${atraso.projetoId}-${atraso.etapaNome}`, projetoId: atraso.projetoId,
      titulo: `${atraso.etapaNome} · ${atraso.diasAtraso} ${atraso.diasAtraso === 1 ? 'dia' : 'dias'} de atraso`,
      detalhe: nomesObra.get(atraso.projetoId) ?? 'Obra indefinida',
      tom: 'negativo', icone: AlertTriangle,
    }));
    desvios.forEach((desvio) => lista.push({
      id: `desvio-${desvio.projetoId}-${desvio.categoria}`, projetoId: desvio.projetoId,
      titulo: `${desvio.categoria} · ${dinheiroCurto(desvio.excesso)} acima do orçado`,
      detalhe: nomesObra.get(desvio.projetoId) ?? 'Obra indefinida',
      tom: 'atencao', icone: TrendingUp,
    }));
    return lista;
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

  const temDados = projetos.length > 0 || propostas.length > 0 || clientes.length > 0;
  const resultadoCompetencia = quadroEmpresa?.raiz
    ? quadroEmpresa.raiz.receitaLancadaArvore - quadroEmpresa.raiz.despesaLancadaArvore : null;
  const resultadoCaixa = quadroEmpresa?.raiz
    ? quadroEmpresa.raiz.receitaRecebidaArvore - quadroEmpresa.raiz.despesaPagaArvore : null;
  const maiorCusto = Math.max(0, ...(quadroEmpresa?.grupos.map((grupo) => grupo.despesaLancadaArvore) ?? []));

  /* ---------- Fila única "Precisa de você" ----------
     O painel tinha três lugares para a mesma pergunta — um cartão azul de
     "Próximo passo" com UMA ação, uma lista de "Atenção" sem botão e um contador
     escondido em "Outros indicadores". Agora é uma fila só, ordenada: primeiro
     o que trava o fluxo (próximos passos), depois os desvios. Cada item tem
     destino. */
  const fila = [
    ...proximosPassos.map((passo) => ({
      id: passo.id, icone: passo.icon, tom: passo.tone === 'amber' ? 'atencao' as const : 'neutro' as const,
      titulo: passo.title, detalhe: passo.description, rotulo: passo.actionLabel, acao: passo.onAction,
    })),
    ...alertas.filter((a) => a.tom === 'atencao').map((a) => ({
      id: a.id, icone: a.icone, tom: 'atencao' as const, titulo: a.titulo, detalhe: a.detalhe, rotulo: 'Abrir obra',
      acao: () => onNavigate('projetos', a.projetoId),
    })),
  ];
  const filaVisivel = fila.slice(0, 3);

  /* ---------- Pilares ---------- */
  const podeComercial = canAccessTab(role, 'propostas');
  const podeOperacao = canAccessTab(role, 'projetos');
  const enviadas = propostas.filter((p) => p.status === 'Enviada');
  const emElaboracao = propostas.filter((p) => p.status === 'Elaboração').length;
  const aprovadasSemObra = propostas.filter((p) => p.status === 'Aprovada' && !projetos.some((o) => o.propostaId === p.id)).length;
  const decididas = propostas.filter((p) => p.status === 'Aprovada' || p.status === 'Rejeitada');
  const conversao = decididas.length > 0
    ? Math.round((decididas.filter((p) => p.status === 'Aprovada').length / decididas.length) * 100) : null;
  const valorNegociacao = enviadas.reduce((t, p) => t + p.valorEstimado, 0);
  const hojeISO = agora.toISOString().slice(0, 10);
  const propostasDaLista = propostas
    .filter((p) => p.status === 'Enviada' || p.status === 'Elaboração')
    .sort((a, b) => a.dataValidade.localeCompare(b.dataValidade))
    .slice(0, 3);
  const obrasPlanejamento = projetos.filter((p) => p.situacao === 'Planejamento').length;
  const etapasAtrasadas = resumos.reduce((t, r) => t + r.etapasAtrasadas, 0);

  return (
    <PaginaAba largura="painel" id="dashboard-tab-content" className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo-pagina text-slate-900">Indicadores</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            {saudacao(agora.getHours())}{nome ? `, ${nome}` : ''} · {agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        {quadroEmpresa && onRecarregar && (
          <Button variante="secundario" tamanho="sm" onClick={() => void onRecarregar()} disabled={controleLoading} aria-label="Atualizar dados da empresa">
            <RefreshCw size={15} aria-hidden="true" className={controleLoading ? 'animate-spin' : ''} /> {controleLoading ? 'Atualizando…' : 'Atualizar'}
          </Button>
        )}
      </header>

      {/* PRECISA DE VOCÊ — a única superfície escura da página. */}
      <section aria-labelledby="fila-titulo" data-ilha="escura" className="rounded-2xl border border-carcaca-borda bg-carcaca text-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 md:px-6">
          <h2 id="fila-titulo" className="inline-flex items-center gap-2.5 text-lg font-bold text-white">
            <span aria-hidden="true" className="h-5 w-[3px] rounded-full bg-trena" />
            Precisa de você
            {fila.length > 0 && <span className="data-font rounded-md bg-trena px-1.5 text-sm text-trena-tinta">{fila.length}</span>}
          </h2>
          {fila.length > filaVisivel.length && (
            <span className="text-xs text-white/70">Mostrando {filaVisivel.length} de {fila.length}, por prioridade</span>
          )}
        </div>
        {filaVisivel.length === 0 ? (
          <p className="flex items-center gap-2 px-5 pb-5 pt-3 text-sm text-white/80 md:px-6">
            <CheckCircle2 size={17} className="shrink-0 text-emerald-700" aria-hidden="true" />
            {temDados ? 'Tudo em dia: nenhuma ação pendente no fluxo e nenhum desvio de orçamento.' : 'Comece cadastrando um cliente para abrir o fluxo comercial.'}
          </p>
        ) : (
          <ol className="mx-2 mb-2 mt-3 divide-y divide-white/10 overflow-hidden rounded-xl bg-carcaca-2">
            {filaVisivel.map((item, n) => {
              const Icone = item.icone;
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
                  <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.tom === 'atencao' ? 'bg-amber-100 text-amber-700' : 'bg-white/10 text-white'}`} aria-hidden="true">
                    <Icone size={16} />
                  </span>
                  <div className="min-w-[200px] flex-1">
                    <p className="text-sm font-bold leading-snug text-white">{item.titulo}</p>
                    <p className="mt-0.5 truncate text-xs text-white/70" title={item.detalhe}>{item.detalhe}</p>
                  </div>
                  <Button tamanho="sm" variante={n === 0 ? 'primario' : 'secundario'} onClick={item.acao}>
                    {item.rotulo} <ArrowRight size={14} aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* OS TRÊS PILARES — a mesma divisão do menu. Cada coluna responde uma
          pergunta: quanto está em negociação, como estão as obras, como está o
          dinheiro. Quem não tem acesso a um pilar não o vê, e a grade reparte
          a linha entre os que sobram. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-stretch gap-5">
        {podeComercial && (
          <Pilar
            icone={FileText}
            titulo="Comercial"
            rotulo="Em negociação"
            valor={dinheiroCurto(valorNegociacao)}
            valorTitulo={dinheiro(valorNegociacao)}
            legenda={`${enviadas.length} ${enviadas.length === 1 ? 'proposta aguardando' : 'propostas aguardando'} o cliente`}
            metricas={[
              { rotulo: 'Elaboração', valor: String(emElaboracao), dica: 'Propostas ainda em elaboração.' },
              { rotulo: 'Sem obra', valor: String(aprovadasSemObra), alerta: aprovadasSemObra > 0, dica: 'Propostas aprovadas que ainda não viraram obra.' },
              { rotulo: 'Conversão', valor: conversao === null ? '—' : `${conversao}%`, dica: 'Aprovadas sobre propostas decididas (aprovadas + rejeitadas).' },
            ]}
            rodape={{ rotulo: 'Abrir propostas', acao: () => onNavigate('propostas') }}
          >
            <ListaDoPilar titulo="Validade mais próxima" vazio="Nenhuma proposta em aberto.">
              {propostasDaLista.map((p) => {
                const vencida = p.dataValidade < hojeISO;
                return (
                  <LinhaDoPilar key={p.id} onClick={() => onNavigate('propostas', p.id)} rotulo={`Abrir proposta ${p.numero}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{p.numero} · {p.descricao}</span>
                      <span className={`block text-xs ${vencida ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>
                        {p.status} · {vencida ? 'venceu em' : 'válida até'} {formatarDataBR(p.dataValidade)}
                      </span>
                    </span>
                    <span className="data-font shrink-0 text-sm font-bold text-slate-900">{dinheiroCurto(p.valorEstimado)}</span>
                  </LinhaDoPilar>
                );
              })}
            </ListaDoPilar>
          </Pilar>
        )}

        {podeOperacao && (
          <Pilar
            icone={HardHat}
            titulo="Operação"
            rotulo="Obras em execução"
            valor={String(obrasEmExecucao)}
            legenda={`${obrasPlanejamento} em planejamento · ${dinheiroCurto(totalMedido)} medidos de ${dinheiroCurto(totalOrcado)}`}
            metricas={[
              { rotulo: 'Avanço', valor: `${avancoMedio}%`, dica: 'Avanço físico médio das obras ativas.' },
              { rotulo: 'Medições', valor: String(medicoesPendentes), alerta: medicoesPendentes > 0, dica: 'Boletins de medição aguardando aprovação.' },
              { rotulo: 'Atrasos', valor: String(etapasAtrasadas), alerta: etapasAtrasadas > 0, dica: 'Etapas com prazo vencido sem conclusão.' },
            ]}
            rodape={{ rotulo: 'Todas as obras', acao: () => onNavigate('projetos') }}
          >
            <ListaDoPilar titulo="Obras ativas" vazio="Nenhuma obra em planejamento ou execução.">
              {obrasAtivas.slice(0, 4).map((obra) => {
                const pct = Math.max(0, Math.min(100, resumosObra.get(obra.id)?.avancoFisico ?? 0));
                return (
                  <LinhaDoPilar key={obra.id} onClick={() => onNavigate('projetos', obra.id)} rotulo={`Abrir obra ${obra.nome}`}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{obra.nome}</span>
                        <span className="data-font text-sm font-bold text-slate-900">{Math.round(pct)}%</span>
                      </span>
                      <Trena className="mt-1.5" altura={6} percentual={pct} rotulo={`Avanço de ${obra.nome}`}
                        tom={obra.situacao === 'Em Execução' ? 'trena' : 'neutro'} />
                    </span>
                  </LinhaDoPilar>
                );
              })}
            </ListaDoPilar>
          </Pilar>
        )}

        {quadroEmpresa && (
          <Pilar
            icone={Wallet}
            titulo="Financeiro"
            rotulo="Resultado por competência"
            valor={resultadoCompetencia === null ? '—' : dinheiroCurto(resultadoCompetencia)}
            valorTitulo={resultadoCompetencia === null ? undefined : dinheiro(resultadoCompetencia)}
            valorTom={resultadoCompetencia !== null && resultadoCompetencia < 0 ? 'negativo' : undefined}
            legenda="Receitas menos despesas lançadas"
            metricas={[
              { rotulo: 'Caixa', valor: resultadoCaixa === null ? '—' : dinheiroCompacto(resultadoCaixa), dica: resultadoCaixa === null ? 'Recebido menos pago.' : `Recebido menos pago: ${dinheiro(resultadoCaixa)}.` },
              { rotulo: 'Compromissos', valor: dinheiroCompacto(quadroEmpresa.compromissosAtivos), dica: `Contratado e ainda não lançado (${dinheiro(quadroEmpresa.compromissosAtivos)}). Não entra no resultado.` },
              {
                rotulo: 'Margem',
                valor: quadroEmpresa.margemCobertura.completas ? dinheiroCompacto(quadroEmpresa.margemProjetada) : '—',
                dica: `Margem prevista. ${quadroEmpresa.margemCobertura.completas} de ${quadroEmpresa.margemCobertura.total} obras com análise completa.`,
              },
            ]}
            rodape={{ rotulo: 'Abrir razão', acao: () => onNavigate('empresa') }}
          >
            <div className="pt-1">
              <ReceitaDespesaMensal lancamentos={lancamentos} formatar={dinheiroCurto} />
            </div>
          </Pilar>
        )}
      </div>

      {/* Detalhe: onde o dinheiro foi e o que aconteceu por último. */}
      {quadroEmpresa && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-x-8 gap-y-8">
          <section aria-labelledby="despesas-area">
            <div className="mb-4 flex items-end justify-between gap-3 border-b border-slate-200 pb-2.5">
              <h2 id="despesas-area" className="text-lg font-bold text-slate-900">Despesas por área</h2>
              <Button variante="acao" tamanho="sm" onClick={() => onNavigate('empresa')}>Ver centros <ArrowRight size={14} aria-hidden="true" /></Button>
            </div>
            {quadroEmpresa.grupos.length === 0 ? <p className="text-sm text-slate-600">Sem centros de custo cadastrados.</p> : (
              <dl className="space-y-4">{quadroEmpresa.grupos.map((grupo) => (
                <div key={grupo.centroId}>
                  <div className="flex justify-between gap-4 text-sm">
                    <dt className="font-medium text-slate-700">{grupo.nome}</dt>
                    <dd className="data-font font-bold text-slate-900">{dinheiroCurto(grupo.despesaLancadaArvore)}</dd>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-[3px] bg-slate-100" aria-hidden="true">
                    <div className={`h-full rounded-[3px] ${PREENCHIMENTO.neutro}`} style={{ width: `${maiorCusto > 0 ? (grupo.despesaLancadaArvore / maiorCusto) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}</dl>
            )}
          </section>

          <section aria-labelledby="registros-recentes">
            <div className="mb-1 border-b border-slate-200 pb-2.5">
              <h2 id="registros-recentes" className="text-lg font-bold text-slate-900">Registros recentes</h2>
            </div>
            {quadroEmpresa.fatos.length === 0 ? <p className="pt-3 text-sm text-slate-600">Nenhum registro recente.</p> : (
              <ul className="divide-y divide-slate-200">{quadroEmpresa.fatos.slice(0, 5).map((fato) => {
                const destino = fato.propostaId ? 'propostas' : fato.origem === 'Financeiro' ? 'empresa' : 'projetos';
                const registroId = fato.propostaId ?? (destino === 'projetos' ? fato.projetoId : undefined);
                return (
                  <li key={fato.id}>
                    <button type="button" onClick={() => onNavigate(destino, registroId)} aria-label={`Abrir ${fato.titulo}`}
                      className="group flex w-full items-center justify-between gap-4 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-slate-100/70 focus-visible:outline-2 focus-visible:outline-blue-500">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-blue-600">{fato.titulo}</span>
                        <span className="block text-xs text-slate-500">{fato.origem} · {formatarDataBR(fato.data)}{fato.projetoId && nomesObra.get(fato.projetoId) ? ` · ${nomesObra.get(fato.projetoId)}` : ''}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        {fato.valor !== undefined && <span className={`data-font text-sm font-bold ${fato.valor < 0 ? 'text-slate-900' : 'text-emerald-700'}`}>{dinheiroCurto(fato.valor)}</span>}
                        <ArrowRight size={15} className="text-slate-500 group-hover:text-blue-600" aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                );
              })}</ul>
            )}
          </section>
        </div>
      )}

      {/* Alertas negativos (atrasos) que não couberam na fila e a agenda:
          consulta, não decisão — por isso fecham recolhidos. */}
      <div className="space-y-3 border-t border-slate-200 pt-5">
        {alertas.some((a) => a.tom === 'negativo') && (
          <details className="group rounded-xl border border-slate-200 bg-superficie px-4 py-3">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-900">
              <AlertTriangle size={16} className="text-rose-700" aria-hidden="true" />
              Etapas atrasadas <span className="data-font text-slate-500">({alertas.filter((a) => a.tom === 'negativo').length})</span>
            </summary>
            <ul className="mt-3 space-y-2">{alertas.filter((a) => a.tom === 'negativo').map((a) => (
              <li key={a.id} className="text-sm"><span className="font-semibold text-slate-900">{a.titulo}</span> <span className="text-slate-500">· {a.detalhe}</span></li>
            ))}</ul>
          </details>
        )}
        <details className="rounded-xl border border-slate-200 bg-superficie px-4 py-3">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-900">
            <CalendarDays size={16} className="text-slate-500" aria-hidden="true" /> Agenda do mês
          </summary>
          <div className="mt-4"><Calendario /></div>
        </details>
        {canAccessTab(role, 'equipe') && (
          <p className="text-xs text-slate-500">
            {equipeCount} {equipeCount === 1 ? 'funcionário ativo' : 'funcionários ativos'} · {medicoesRecentes.length} medições nos últimos registros ·{' '}
            <button type="button" onClick={() => onNavigate('equipe')} className="font-semibold text-blue-600 hover:underline">ver equipe</button>
          </p>
        )}
      </div>
    </PaginaAba>
  );
}

/* ---------- Peças do pilar ---------- */

interface Metrica { rotulo: string; valor: string; alerta?: boolean; dica?: string }

function Pilar({ icone: Icone, titulo, rotulo, valor, valorTitulo, valorTom, legenda, metricas, rodape, children }: {
  icone: LucideIcon; titulo: string; rotulo: string; valor: string; valorTitulo?: string; valorTom?: 'negativo';
  legenda: string; metricas: Metrica[]; rodape: { rotulo: string; acao: () => void }; children: React.ReactNode;
}) {
  return (
    <section aria-label={titulo} className="flex flex-col rounded-2xl border border-slate-200 bg-superficie">
      <div className="p-5 pb-4">
        <h2 className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          <Icone size={14} aria-hidden="true" /> {titulo}
        </h2>
        <p className="mt-4 text-xs font-semibold text-slate-600">{rotulo}</p>
        <p className={`data-font mt-1 text-4xl font-bold leading-none tracking-tight ${valorTom === 'negativo' ? 'text-rose-700' : 'text-slate-900'}`} title={valorTitulo}>
          {valor}
        </p>
        <p className="mt-2 text-xs text-slate-500">{legenda}</p>
      </div>
      <dl className="grid grid-cols-3 border-y border-slate-200 bg-slate-50">
        {metricas.map((m) => (
          <div key={m.rotulo} className="min-w-0 border-l border-slate-200 px-3.5 py-3 first:border-l-0" title={m.dica}>
            <dt className="text-2xs font-semibold text-slate-500">{m.rotulo}</dt>
            <dd className={`data-font mt-0.5 whitespace-nowrap text-lg font-bold leading-tight ${m.alerta ? 'text-amber-700' : 'text-slate-900'}`}>{m.valor}</dd>
          </div>
        ))}
      </dl>
      <div className="flex-1 px-5 py-4">{children}</div>
      <div className="border-t border-slate-200 px-3 py-2">
        <Button variante="acao" tamanho="sm" onClick={rodape.acao}>{rodape.rotulo} <ArrowRight size={14} aria-hidden="true" /></Button>
      </div>
    </section>
  );
}

function ListaDoPilar({ titulo, vazio, children }: { titulo: string; vazio: string; children: React.ReactNode }) {
  const itens = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-700">{titulo}</h3>
      {itens.length === 0 ? <p className="mt-2 text-xs text-slate-500">{vazio}</p> : <ul className="mt-1.5 -mx-2">{itens}</ul>}
    </div>
  );
}

function LinhaDoPilar({ onClick, rotulo, children }: { onClick: () => void; rotulo: string; children: React.ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} aria-label={rotulo}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-100/70 focus-visible:outline-2 focus-visible:outline-blue-500">
        {children}
      </button>
    </li>
  );
}

export default memo(DashboardOverview);
