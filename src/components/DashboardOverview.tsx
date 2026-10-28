import React, { memo, useMemo } from 'react';
import {
  AlertTriangle, ArrowRight, CheckCircle2, FileText, HardHat,
  RefreshCw, Ruler, Send, TrendingUp, UserPlus, Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Cliente, DesvioCategoria, LancamentoFinanceiro, EtapaAtrasada, MedicaoRecente, Projeto, Proposta, ResumoObra } from '../types';
import type { Role } from '../lib/database.types';
import type { montarControladoria } from '../lib/controladoria';
import { formatarDataBR } from '../lib/data';
import { canAccessTab } from '../constants/tabAccess';
import { Button, Card, Chip, IconButton, PaginaAba, Trena } from './ui';
import ReceitaDespesaMensal from './dashboard/ReceitaDespesaMensal';
import { rotuloCategoriaCusto } from '../constants/categorias';

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
  clientes, propostas, projetos, resumos, desvios, atrasos,
  nomeUsuario, role, onNavigate, quadroEmpresa, controleLoading, onRecarregar, lancamentos = [],
}: DashboardOverviewProps) {
  const agora = useMemo(() => new Date(), []);
  const nome = primeiroNome(nomeUsuario);
  const obrasAtivas = projetos.filter((projeto) => projeto.situacao === 'Em Execução' || projeto.situacao === 'Planejamento');
  const obrasEmExecucao = projetos.filter((projeto) => projeto.situacao === 'Em Execução').length;
  const medicoesPendentes = resumos.reduce((soma, resumo) => soma + resumo.medicoesPendentes, 0);

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
      titulo: `${rotuloCategoriaCusto(desvio.categoria)} · ${dinheiroCurto(desvio.excesso)} acima do orçado`,
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
  const valorNegociacao = enviadas.reduce((t, p) => t + p.valorEstimado, 0);
  const hojeISO = agora.toISOString().slice(0, 10);
  const propostasDaLista = propostas
    .filter((p) => p.status === 'Enviada' || p.status === 'Elaboração')
    .sort((a, b) => a.dataValidade.localeCompare(b.dataValidade))
    .slice(0, 3);
  const obrasPlanejamento = projetos.filter((p) => p.situacao === 'Planejamento').length;
  const etapasAtrasadas = resumos.reduce((t, r) => t + r.etapasAtrasadas, 0);

  return (
    <PaginaAba largura="painel" id="dashboard-tab-content" className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 first-letter:uppercase">
            {agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="titulo-pagina mt-1 text-slate-900">{saudacao(agora.getHours())}{nome ? `, ${nome}` : ''}</h1>
        </div>
        {quadroEmpresa && onRecarregar && (
          <IconButton rotulo={controleLoading ? 'Atualizando…' : 'Atualizar dados'} onClick={() => void onRecarregar()} disabled={controleLoading}>
            <RefreshCw size={17} aria-hidden="true" className={controleLoading ? 'animate-spin' : ''} />
          </IconButton>
        )}
      </header>

      {/* PRECISA DE VOCÊ — a fila única de ações, no topo e em destaque. */}
      <Card className="md:p-6">
        <section aria-labelledby="fila-titulo">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="fila-titulo" className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
              Precisa de você
              {fila.length > 0 && <span className="data-font rounded-full bg-blue-50 px-2 text-sm font-semibold text-blue-700">{fila.length}</span>}
            </h2>
            {fila.length > filaVisivel.length && (
              <span className="text-xs text-slate-500">Mostrando as {filaVisivel.length} mais importantes</span>
            )}
          </div>
          {filaVisivel.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-700" aria-hidden="true" />
              {temDados ? 'Tudo em dia. Nenhuma ação pendente.' : 'Comece cadastrando um cliente para abrir o fluxo comercial.'}
            </p>
          ) : (
            <ol className="mt-4 space-y-2">
              {filaVisivel.map((item, n) => {
                const Icone = item.icone;
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-slate-50 px-4 py-3">
                    <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${item.tom === 'atencao' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`} aria-hidden="true">
                      <Icone size={18} />
                    </span>
                    <div className="min-w-[180px] flex-1">
                      <p className="text-sm font-semibold leading-snug text-slate-900">{item.titulo}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500" title={item.detalhe}>{item.detalhe}</p>
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
      </Card>

      {/* OS TRÊS PILARES — um número que responde a pergunta da área, e só os
          alertas que pedem ação. O detalhe mora na própria aba. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-stretch gap-5">
        {podeComercial && (
          <Pilar
            icone={FileText}
            titulo="Comercial"
            rotulo="Em negociação"
            valor={dinheiroCurto(valorNegociacao)}
            valorTitulo={dinheiro(valorNegociacao)}
            legenda={`${enviadas.length} ${enviadas.length === 1 ? 'proposta aguardando' : 'propostas aguardando'} o cliente · ${emElaboracao} em elaboração`}
            alertas={aprovadasSemObra > 0 ? [`${aprovadasSemObra} ${aprovadasSemObra === 1 ? 'aprovada sem obra' : 'aprovadas sem obra'}`] : []}
            rodape={{ rotulo: 'Propostas', acao: () => onNavigate('propostas') }}
          >
            <ListaDoPilar titulo="Vencem primeiro" vazio="Nenhuma proposta em aberto.">
              {propostasDaLista.map((p) => {
                const vencida = p.dataValidade < hojeISO;
                return (
                  <LinhaDoPilar key={p.id} onClick={() => onNavigate('propostas', p.id)} rotulo={`Abrir proposta ${p.numero}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">{p.descricao}</span>
                      <span className={`block text-xs ${vencida ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>
                        {vencida ? 'Venceu em' : 'Até'} {formatarDataBR(p.dataValidade)}
                      </span>
                    </span>
                    <span className="data-font shrink-0 text-sm font-semibold text-slate-900">{dinheiroCurto(p.valorEstimado)}</span>
                  </LinhaDoPilar>
                );
              })}
            </ListaDoPilar>
          </Pilar>
        )}

        {podeOperacao && (
          <Pilar
            icone={HardHat}
            titulo="Obras"
            rotulo="Em execução"
            valor={String(obrasEmExecucao)}
            legenda={`${avancoMedio}% de avanço médio · ${obrasPlanejamento} em planejamento`}
            alertas={[
              ...(medicoesPendentes > 0 ? [`${medicoesPendentes} ${medicoesPendentes === 1 ? 'medição a aprovar' : 'medições a aprovar'}`] : []),
              ...(etapasAtrasadas > 0 ? [`${etapasAtrasadas} ${etapasAtrasadas === 1 ? 'etapa atrasada' : 'etapas atrasadas'}`] : []),
            ]}
            rodape={{ rotulo: 'Obras', acao: () => onNavigate('projetos') }}
          >
            <ListaDoPilar titulo="Obras ativas" vazio="Nenhuma obra em planejamento ou execução.">
              {obrasAtivas.slice(0, 3).map((obra) => {
                const pct = Math.max(0, Math.min(100, resumosObra.get(obra.id)?.avancoFisico ?? 0));
                return (
                  <LinhaDoPilar key={obra.id} onClick={() => onNavigate('projetos', obra.id)} rotulo={`Abrir obra ${obra.nome}`}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">{obra.nome}</span>
                        <span className="data-font text-sm font-semibold text-slate-900">{Math.round(pct)}%</span>
                      </span>
                      <Trena className="mt-2" altura={6} percentual={pct} rotulo={`Avanço de ${obra.nome}`}
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
            rotulo="Resultado (receitas − despesas)"
            valor={resultadoCompetencia === null ? '—' : dinheiroCurto(resultadoCompetencia)}
            valorTitulo={resultadoCompetencia === null ? undefined : dinheiro(resultadoCompetencia)}
            valorTom={resultadoCompetencia !== null && resultadoCompetencia < 0 ? 'negativo' : undefined}
            legenda={resultadoCaixa === null ? 'Pelos lançamentos do período' : `Em caixa: ${dinheiroCurto(resultadoCaixa)}`}
            alertas={[]}
            rodape={{ rotulo: 'Financeiro', acao: () => onNavigate('empresa') }}
          >
            <ReceitaDespesaMensal lancamentos={lancamentos} formatar={dinheiroCurto} />
          </Pilar>
        )}
      </div>

      {quadroEmpresa && quadroEmpresa.fatos.length > 0 && (
        <Card>
          <section aria-labelledby="registros-recentes">
            <h2 id="registros-recentes" className="text-lg font-semibold text-slate-900">Atividade recente</h2>
            <ul className="-mx-2 mt-2">{quadroEmpresa.fatos.slice(0, 5).map((fato) => {
              const destino = fato.propostaId ? 'propostas' : fato.origem === 'Financeiro' ? 'empresa' : 'projetos';
              const registroId = fato.propostaId ?? (destino === 'projetos' ? fato.projetoId : undefined);
              return (
                <li key={fato.id}>
                  <button type="button" onClick={() => onNavigate(destino, registroId)} aria-label={`Abrir ${fato.titulo}`}
                    className="group flex w-full items-center justify-between gap-4 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900 group-hover:text-blue-600">{fato.titulo}</span>
                      <span className="block text-xs text-slate-500">{formatarDataBR(fato.data)}{fato.projetoId && nomesObra.get(fato.projetoId) ? ` · ${nomesObra.get(fato.projetoId)}` : ''}</span>
                    </span>
                    {fato.valor !== undefined && <span className={`data-font shrink-0 text-sm font-semibold ${fato.valor < 0 ? 'text-slate-900' : 'text-emerald-700'}`}>{dinheiroCurto(fato.valor)}</span>}
                  </button>
                </li>
              );
            })}</ul>
          </section>
        </Card>
      )}
    </PaginaAba>
  );
}

/* ---------- Peças do pilar ---------- */


function Pilar({ icone: Icone, titulo, rotulo, valor, valorTitulo, valorTom, legenda, alertas, rodape, children }: {
  icone: LucideIcon; titulo: string; rotulo: string; valor: string; valorTitulo?: string; valorTom?: 'negativo';
  legenda: string; alertas: string[]; rodape: { rotulo: string; acao: () => void }; children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <section aria-label={titulo} className="flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-sm font-semibold text-slate-900">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600" aria-hidden="true">
              <Icone size={18} />
            </span>
            {titulo}
          </h2>
          <Button variante="acao" tamanho="sm" onClick={rodape.acao} aria-label={`Abrir ${rodape.rotulo}`}>
            Ver tudo <ArrowRight size={14} aria-hidden="true" />
          </Button>
        </div>
        <p className="mt-5 text-xs font-medium text-slate-500">{rotulo}</p>
        <p className={`data-font mt-1 text-4xl font-bold leading-none tracking-[-0.02em] ${valorTom === 'negativo' ? 'text-rose-700' : 'text-slate-900'}`} title={valorTitulo}>
          {valor}
        </p>
        <p className="mt-2 text-xs text-slate-500">{legenda}</p>
        {alertas.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {alertas.map((a) => <Chip key={a} tom="atencao" ponto>{a}</Chip>)}
          </div>
        )}
        <div className="mt-5 flex-1 border-t border-slate-100 pt-4">{children}</div>
      </section>
    </Card>
  );
}

function ListaDoPilar({ titulo, vazio, children }: { titulo: string; vazio: string; children: React.ReactNode }) {
  const itens = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <div>
      <h3 className="text-xs font-medium text-slate-500">{titulo}</h3>
      {itens.length === 0 ? <p className="mt-2 text-xs text-slate-500">{vazio}</p> : <ul className="mt-1.5 -mx-2">{itens}</ul>}
    </div>
  );
}

function LinhaDoPilar({ onClick, rotulo, children }: { onClick: () => void; rotulo: string; children: React.ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} aria-label={rotulo}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500">
        {children}
      </button>
    </li>
  );
}

export default memo(DashboardOverview);
