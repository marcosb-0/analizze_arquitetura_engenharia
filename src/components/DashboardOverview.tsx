import React, { memo, useMemo } from 'react';
import {
  AlertTriangle, ArrowRight, CheckCircle2, FileText, HardHat,
  Ruler, Send, TrendingUp, UserPlus, Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Cliente, DesvioCategoria, LancamentoFinanceiro, EtapaAtrasada, Projeto, Proposta, ResumoObra } from '../types';
import type { Role } from '../lib/database.types';
import type { montarControladoria } from '../lib/controladoria';
import { formatarDataBR, formatarISO } from '../lib/data';
import { dinheiro, dinheiroCurto } from '../lib/indicadores/formato';
import { canAccessTab } from '../constants/tabAccess';
import { Button, Card, Chip } from './ui';
import ReceitaDespesaMensal from './dashboard/ReceitaDespesaMensal';
import { rotuloCategoriaCusto } from '../constants/categorias';

/**
 * A parte do painel de Indicadores que NÃO segue os filtros: a fila "Precisa de
 * você", o resultado da empresa e a atividade recente.
 *
 * Até 15/nov/2026 este componente ERA o painel — saudação, fila, os três
 * pilares (Comercial, Obras, Financeiro) e a atividade. Com o painel de BI
 * (`indicadores/PainelIndicadores`), os pilares viraram as categorias do
 * seletor, a saudação subiu para o cabeçalho da página e sobrou aqui o que
 * responde "o que eu preciso fazer agora", que não tem recorte por obra nem
 * por período: uma proposta aprovada sem obra continua pedindo ação mesmo com
 * o filtro em outra obra.
 */
interface DashboardOverviewProps {
  clientes: Cliente[];
  propostas: Proposta[];
  projetos: Projeto[];
  resumos: ResumoObra[];
  desvios: DesvioCategoria[];
  atrasos: EtapaAtrasada[];
  role?: Role;
  onNavigate: (tabId: string, projectId?: string | null) => void;
  quadroEmpresa?: ReturnType<typeof montarControladoria> | null;
  controleLoading?: boolean;
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

function DashboardOverview({
  clientes, propostas, projetos, resumos, desvios, atrasos,
  role, onNavigate, quadroEmpresa, controleLoading, lancamentos = [],
}: DashboardOverviewProps) {
  const nomesObra = useMemo(() => new Map(projetos.map((projeto) => [projeto.id, projeto.nome])), [projetos]);
  const resumosObra = useMemo(() => new Map(resumos.map((resumo) => [resumo.projetoId, resumo])), [resumos]);

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

  /* ---------- Pilares que ficaram ----------
     Comercial e o resultado da empresa. O pilar Obras saiu: avanço, medições a
     aprovar e atrasos são as categorias Obras, Medições e Prazos do BI, agora
     com filtro. */
  const podeComercial = canAccessTab(role, 'propostas');
  const enviadas = propostas.filter((p) => p.status === 'Enviada');
  const emElaboracao = propostas.filter((p) => p.status === 'Elaboração').length;
  const aprovadasSemObra = propostas.filter((p) => p.status === 'Aprovada' && !projetos.some((o) => o.propostaId === p.id)).length;
  const valorNegociacao = enviadas.reduce((t, p) => t + p.valorEstimado, 0);
  const hojeISO = formatarISO(new Date());
  const propostasDaLista = propostas
    .filter((p) => p.status === 'Enviada' || p.status === 'Elaboração')
    .sort((a, b) => a.dataValidade.localeCompare(b.dataValidade))
    .slice(0, 3);

  return (
    <section aria-labelledby="fora-dos-filtros" className="space-y-5">
      <div>
        <h2 id="fora-dos-filtros" className="text-lg font-semibold text-slate-900">Para agir agora</h2>
        <p className="mt-1 text-xs text-slate-500">A fila de ações e o resultado da empresa olham o sistema inteiro — não seguem os filtros acima.</p>
      </div>

      {/* PRECISA DE VOCÊ — a fila única de ações. */}
      <Card className="md:p-6">
          <section aria-labelledby="fila-titulo">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="fila-titulo" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                Precisa de você
                {fila.length > 0 && <span className="font-mono rounded-full bg-blue-50 px-2 text-sm font-semibold text-blue-700">{fila.length}</span>}
              </h3>
              {fila.length > filaVisivel.length && (
                <span className="text-xs text-slate-500">Mostrando as {filaVisivel.length} mais importantes</span>
              )}
            </div>
            {filaVisivel.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-700" aria-hidden="true" />
                {temDados ? 'Tudo em dia. Nenhuma ação pendente.' : 'Comece cadastrando um cliente para abrir o fluxo comercial.'}
              </p>
            ) : (
              <ol className="mt-4 space-y-2">
                {filaVisivel.map((item, n) => {
                  const Icone = item.icone;
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-slate-50 px-4 py-3">
                      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${item.tom === 'atencao' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`} aria-hidden="true">
                        <Icone size={16} />
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

      {(podeComercial || quadroEmpresa) && (
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
                      <span className="font-mono shrink-0 text-sm font-semibold text-slate-900">{dinheiroCurto(p.valorEstimado)}</span>
                    </LinhaDoPilar>
                  );
                })}
              </ListaDoPilar>
            </Pilar>
          )}

          {/* Resultado da empresa — todos os lançamentos, inclusive os sem obra
              (aluguel, salário do escritório). Só o administrador recebe. */}
          {quadroEmpresa && (
            <Pilar
              icone={Wallet}
              titulo="Resultado da empresa"
              rotulo="Receitas − despesas lançadas"
              valor={resultadoCompetencia === null ? '—' : dinheiroCurto(resultadoCompetencia)}
              valorTitulo={resultadoCompetencia === null ? undefined : dinheiro(resultadoCompetencia)}
              valorTom={resultadoCompetencia !== null && resultadoCompetencia < 0 ? 'negativo' : undefined}
              legenda={controleLoading ? 'Atualizando…' : resultadoCaixa === null ? 'Pelos lançamentos registrados' : `Em caixa: ${dinheiroCurto(resultadoCaixa)}`}
              alertas={[]}
              rodape={{ rotulo: 'Financeiro', acao: () => onNavigate('empresa') }}
            >
              <ReceitaDespesaMensal lancamentos={lancamentos} formatar={dinheiroCurto} />
            </Pilar>
          )}
        </div>
      )}

      {quadroEmpresa && quadroEmpresa.fatos.length > 0 && (
        <Card>
          <section aria-labelledby="registros-recentes">
            <h3 id="registros-recentes" className="text-sm font-semibold text-slate-900">Atividade recente</h3>
            <ul className="-mx-2 mt-2">{quadroEmpresa.fatos.slice(0, 5).map((fato) => {
              const destino = fato.propostaId ? 'propostas' : fato.origem === 'Financeiro' ? 'empresa' : 'projetos';
              const registroId = fato.propostaId ?? (destino === 'projetos' ? fato.projetoId : undefined);
              return (
                <li key={fato.id}>
                  <button type="button" onClick={() => onNavigate(destino, registroId)} aria-label={`Abrir ${fato.titulo}`}
                    className="group flex w-full items-center justify-between gap-4 rounded-xl px-2 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900 group-hover:text-blue-600">{fato.titulo}</span>
                      <span className="block text-xs text-slate-500">{formatarDataBR(fato.data)}{fato.projetoId && nomesObra.get(fato.projetoId) ? ` · ${nomesObra.get(fato.projetoId)}` : ''}</span>
                    </span>
                    {fato.valor !== undefined && <span className={`font-mono shrink-0 text-sm font-semibold ${fato.valor < 0 ? 'text-slate-900' : 'text-emerald-700'}`}>{dinheiroCurto(fato.valor)}</span>}
                  </button>
                </li>
              );
            })}</ul>
          </section>
        </Card>
      )}
    </section>
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
          <h2 className="flex items-center gap-3 text-sm font-semibold text-slate-900">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600" aria-hidden="true">
              <Icone size={16} />
            </span>
            {titulo}
          </h2>
          <Button variante="fantasma" tamanho="sm" onClick={rodape.acao} aria-label={`Abrir ${rodape.rotulo}`}>
            Ver tudo <ArrowRight size={14} aria-hidden="true" />
          </Button>
        </div>
        <p className="mt-5 text-xs font-medium text-slate-500">{rotulo}</p>
        <p className={`font-mono mt-1 text-2xl font-bold leading-none ${valorTom === 'negativo' ? 'text-rose-700' : 'text-slate-900'}`} title={valorTitulo}>
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
