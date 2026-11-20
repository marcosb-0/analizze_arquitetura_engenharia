import type { Projeto, ResumoObra, Tarefa } from '../../types';
import { formatarISO } from '../data';
import {
  baldesDoIntervalo,
  dentro,
  duracaoEmDias,
  indiceDoBalde,
  intervaloAnterior,
  intervaloDoPeriodo,
  somarDiasISO,
  type Balde,
  type Intervalo,
} from './periodo';
import type { ContratoBI, DadosBI, EtapaBI, FaturamentoBI, FiltrosBI, MedicaoBI } from './tipos';

/**
 * Os números do painel de indicadores — funções puras sobre as linhas de
 * `tipos.ts`. Nenhuma fórmula aqui é nova: cada uma reproduz a conta que o
 * banco já faz em outro lugar, e o comentário de cada bloco diz qual.
 *
 *   valor medido ......... Σ medicao_item_orcamento (v_medicao_recente.valor_medido)
 *   faturado / recebido .. Receita "Faturamento Obra" (fn_resultado_obra)
 *   a faturar ............ medido − faturado, nunca negativo (fn_resultado_obra)
 *   avanço físico ........ média ponderada pelo orçado, ou simples sem peso (v_resumo_obra)
 *   etapa atrasada ....... folha, < 100% e fim < hoje (v_etapa_atrasada)
 *
 * Duas famílias de número, e confundi-las é o erro a evitar:
 *
 *   FLUXO   — o que aconteceu DENTRO do período (medido, faturado, boletins,
 *             tarefas concluídas). Responde ao filtro de período e tem variação.
 *   POSIÇÃO — o estado de hoje (contratado, saldo, avanço, atrasos). Não tem
 *             período, e o rótulo diz isso.
 */

// ------------------------------------------------------------------
// Escopo: o que os filtros deixam passar
// ------------------------------------------------------------------

export interface Escopo {
  intervalo: Intervalo;
  anterior: Intervalo;
  /** Obras que passam por obra, contrato, responsável e situação. */
  obras: Set<string>;
  /** Contratos das obras do escopo (ou o contrato escolhido). */
  contratos: ContratoBI[];
  /**
   * Algum filtro de obra está ligado. Sem nenhum, registro SEM obra (tarefa da
   * empresa, faturamento sem vínculo) conta; com algum, não — ele não pertence
   * a obra nenhuma, então não pertence ao recorte.
   */
  recortado: boolean;
}

export function montarEscopo(projetos: Projeto[], contratos: ContratoBI[], f: FiltrosBI, hoje: string, inicio?: string): Escopo {
  const intervalo = intervaloDoPeriodo(f.periodo, hoje, f.personalizado, inicio);
  const contrato = f.contratoId ? contratos.find((c) => c.id === f.contratoId) : undefined;
  const obras = new Set(
    projetos
      .filter((p) =>
        (!f.obraId || p.id === f.obraId) &&
        (!f.situacao || p.situacao === f.situacao) &&
        (!f.responsavelId || p.responsavelInternoId === f.responsavelId) &&
        // Contrato escolhido: a obra é a DELE. Contrato sem obra não deixa
        // passar obra nenhuma — e o valor dele continua aparecendo, porque o
        // contrato em si entra em `contratos` abaixo.
        (!f.contratoId || (contrato?.projetoId !== undefined && p.id === contrato.projetoId))
      )
      .map((p) => p.id)
  );
  const recortado = Boolean(f.obraId || f.situacao || f.responsavelId || f.contratoId);
  const recortePorObra = Boolean(f.obraId || f.situacao || f.responsavelId);
  // Contrato sem obra só sobrevive a um recorte que não fale de obra.
  const contratosDoEscopo = contratos.filter((c) =>
    (!f.contratoId || c.id === f.contratoId) &&
    (c.projetoId ? obras.has(c.projetoId) : f.contratoId ? !recortePorObra : !recortado)
  );
  return { intervalo, anterior: intervaloAnterior(f.periodo, intervalo), obras, contratos: contratosDoEscopo, recortado };
}

export function noEscopo(e: Escopo, projetoId: string | undefined | null): boolean {
  return projetoId ? e.obras.has(projetoId) : !e.recortado;
}

/** Conta "nenhum filtro ligado" — o botão de limpar só aparece fora disso. */
export function filtrosAtivos(f: FiltrosBI): number {
  return [f.obraId, f.contratoId, f.responsavelId, f.situacao].filter(Boolean).length;
}

// ------------------------------------------------------------------
// Variação
// ------------------------------------------------------------------

/**
 * Variação percentual sobre o período anterior. `null` quando não há base: de
 * zero para qualquer coisa não é "+∞%", é "não dá para comparar", e a tela diz
 * isso em vez de inventar um número.
 */
export function variacao(atual: number, anterior: number): number | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior) || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export interface Comparado {
  atual: number;
  anterior: number;
  variacao: number | null;
}

export function comparar(atual: number, anterior: number): Comparado {
  return { atual, anterior, variacao: variacao(atual, anterior) };
}

const soma = <T>(lista: T[], valor: (x: T) => number) => lista.reduce((t, x) => t + valor(x), 0);

// ------------------------------------------------------------------
// Financeiro
// ------------------------------------------------------------------

/** Contrato em vigor: minuta ainda não é compromisso de ninguém. */
export const contratoVigente = (c: ContratoBI) => c.status !== 'Minuta';

export interface LinhaFinanceiraObra {
  projetoId: string;
  contratado: number;
  medido: number;
  faturado: number;
  recebido: number;
  aFaturar: number;
  aReceber: number;
  /** `null` sem contrato vigente: saldo de um contrato que não existe é ruído. */
  saldo: number | null;
}

export interface QuadroFinanceiro {
  contratado: number;
  /** Medido acumulado (posição) — a base do saldo. */
  medidoAcumulado: number;
  saldoContratual: number;
  aReceber: number;
  vencido: number;
  aFaturar: number;
  medido: Comparado;
  faturado: Comparado;
  recebido: Comparado;
  mensal: { balde: Balde; medido: number; recebido: number }[];
  porObra: LinhaFinanceiraObra[];
  porContrato: { contrato: ContratoBI; medido: number; saldo: number }[];
  faturamentosDoPeriodo: FaturamentoBI[];
}

export function quadroFinanceiro(dados: DadosBI, e: Escopo, hoje: string): QuadroFinanceiro {
  const aprovadas = dados.medicoes.filter((m) => m.status === 'Aprovada' && noEscopo(e, m.projetoId));
  const faturamentos = dados.faturamentos.filter((l) => noEscopo(e, l.projetoId));
  const vigentes = e.contratos.filter(contratoVigente);

  const medidoPorObra = new Map<string, number>();
  for (const m of aprovadas) medidoPorObra.set(m.projetoId, (medidoPorObra.get(m.projetoId) ?? 0) + m.valor);

  const noPeriodo = (i: Intervalo) => ({
    medido: soma(aprovadas.filter((m) => dentro(m.data, i)), (m) => m.valor),
    faturado: soma(faturamentos.filter((l) => dentro(l.data, i)), (l) => l.valor),
    recebido: soma(faturamentos.filter((l) => l.pago && dentro(l.data, i)), (l) => l.valor),
  });
  const atual = noPeriodo(e.intervalo);
  const antes = noPeriodo(e.anterior);

  const baldes = baldesDoIntervalo(e.intervalo);
  const mensal = baldes.map((balde) => ({ balde, medido: 0, recebido: 0 }));
  for (const m of aprovadas) {
    const i = indiceDoBalde(baldes, m.data);
    if (i >= 0) mensal[i].medido += m.valor;
  }
  for (const l of faturamentos) {
    if (!l.pago) continue;
    const i = indiceDoBalde(baldes, l.data);
    if (i >= 0) mensal[i].recebido += l.valor;
  }

  // Por obra: toda obra do escopo que tenha QUALQUER movimento ou contrato.
  const linhas = new Map<string, LinhaFinanceiraObra>();
  const linha = (projetoId: string) => {
    let l = linhas.get(projetoId);
    if (!l) {
      l = { projetoId, contratado: 0, medido: 0, faturado: 0, recebido: 0, aFaturar: 0, aReceber: 0, saldo: null };
      linhas.set(projetoId, l);
    }
    return l;
  };
  for (const c of vigentes) if (c.projetoId) linha(c.projetoId).contratado += c.valorTotal;
  for (const [projetoId, medido] of medidoPorObra) linha(projetoId).medido = medido;
  for (const f of faturamentos) {
    if (!f.projetoId) continue;
    const l = linha(f.projetoId);
    l.faturado += f.valor;
    if (f.pago) l.recebido += f.valor;
  }
  for (const l of linhas.values()) {
    l.aFaturar = Math.max(l.medido - l.faturado, 0);
    l.aReceber = l.faturado - l.recebido;
    l.saldo = vigentes.some((c) => c.projetoId === l.projetoId) ? l.contratado - l.medido : null;
  }

  // Duas obras no mesmo contrato não existem (contratos.projeto_id é 1:1 com a
  // obra gerada), mas dois contratos na mesma obra podem: o medido da obra é
  // então dividido entre eles na proporção do valor, para a soma das linhas
  // continuar fechando com o saldo total.
  const contratadoPorObra = new Map<string, number>();
  for (const c of vigentes) if (c.projetoId) contratadoPorObra.set(c.projetoId, (contratadoPorObra.get(c.projetoId) ?? 0) + c.valorTotal);
  const porContrato = vigentes.map((c) => {
    const totalDaObra = c.projetoId ? contratadoPorObra.get(c.projetoId) ?? 0 : 0;
    const medidoDaObra = c.projetoId ? medidoPorObra.get(c.projetoId) ?? 0 : 0;
    const medido = totalDaObra > 0 ? medidoDaObra * (c.valorTotal / totalDaObra) : 0;
    return { contrato: c, medido, saldo: c.valorTotal - medido };
  });

  const contratado = soma(vigentes, (c) => c.valorTotal);
  const pendentes = faturamentos.filter((l) => !l.pago);
  return {
    contratado,
    medidoAcumulado: soma(aprovadas, (m) => m.valor),
    saldoContratual: soma(porContrato, (c) => c.saldo),
    aReceber: soma(pendentes, (l) => l.valor),
    vencido: soma(pendentes.filter((l) => l.vencimento < hoje), (l) => l.valor),
    aFaturar: soma([...linhas.values()], (l) => l.aFaturar),
    medido: comparar(atual.medido, antes.medido),
    faturado: comparar(atual.faturado, antes.faturado),
    recebido: comparar(atual.recebido, antes.recebido),
    mensal,
    porObra: [...linhas.values()],
    porContrato,
    faturamentosDoPeriodo: faturamentos.filter((l) => dentro(l.data, e.intervalo)),
  };
}

// ------------------------------------------------------------------
// Medições
// ------------------------------------------------------------------

export interface QuadroMedicoes {
  total: Comparado;
  aprovadas: Comparado;
  pendentes: number;
  rejeitadas: number;
  valorAprovado: Comparado;
  /** aprovadas ÷ (aprovadas + rejeitadas). `null` sem nenhum boletim decidido. */
  taxaAprovacao: number | null;
  /** Pendentes de QUALQUER data — o que espera alguém agora. */
  aguardandoAprovacao: number;
  evolucao: { balde: Balde; Aprovada: number; Pendente: number; Rejeitada: number }[];
  valorPorObra: { projetoId: string; valor: number; boletins: number }[];
  boletins: MedicaoBI[];
}

export function quadroMedicoes(dados: DadosBI, e: Escopo): QuadroMedicoes {
  const doEscopo = dados.medicoes.filter((m) => noEscopo(e, m.projetoId));
  const de = (i: Intervalo) => doEscopo.filter((m) => dentro(m.data, i));
  const atual = de(e.intervalo);
  const antes = de(e.anterior);
  const conta = (lista: MedicaoBI[], s: MedicaoBI['status']) => lista.filter((m) => m.status === s).length;
  const valor = (lista: MedicaoBI[]) => soma(lista.filter((m) => m.status === 'Aprovada'), (m) => m.valor);

  const baldes = baldesDoIntervalo(e.intervalo);
  const evolucao = baldes.map((balde) => ({ balde, Aprovada: 0, Pendente: 0, Rejeitada: 0 }));
  for (const m of atual) {
    const i = indiceDoBalde(baldes, m.data);
    if (i >= 0) evolucao[i][m.status] += 1;
  }

  const porObra = new Map<string, { projetoId: string; valor: number; boletins: number }>();
  for (const m of atual) {
    const l = porObra.get(m.projetoId) ?? { projetoId: m.projetoId, valor: 0, boletins: 0 };
    l.boletins += 1;
    if (m.status === 'Aprovada') l.valor += m.valor;
    porObra.set(m.projetoId, l);
  }

  const aprovadas = conta(atual, 'Aprovada');
  const rejeitadas = conta(atual, 'Rejeitada');
  return {
    total: comparar(atual.length, antes.length),
    aprovadas: comparar(aprovadas, conta(antes, 'Aprovada')),
    pendentes: conta(atual, 'Pendente'),
    rejeitadas,
    valorAprovado: comparar(valor(atual), valor(antes)),
    taxaAprovacao: aprovadas + rejeitadas > 0 ? (aprovadas / (aprovadas + rejeitadas)) * 100 : null,
    aguardandoAprovacao: conta(doEscopo, 'Pendente'),
    evolucao,
    valorPorObra: [...porObra.values()].sort((a, b) => b.valor - a.valor || b.boletins - a.boletins),
    boletins: [...atual].sort((a, b) => b.data.localeCompare(a.data) || a.id.localeCompare(b.id)),
  };
}

// ------------------------------------------------------------------
// Obras
// ------------------------------------------------------------------

export interface QuadroObras {
  obras: Projeto[];
  emExecucao: number;
  /** Média do avanço das obras COM cronograma; `null` se nenhuma tem. */
  avancoMedio: number | null;
  obrasComCronograma: number;
  etapasTotal: number;
  etapasConcluidas: number;
  obrasComAtraso: number;
  porSituacao: { situacao: Projeto['situacao']; obras: number }[];
}

export const SITUACOES: Projeto['situacao'][] = ['Em Execução', 'Planejamento', 'Pausado', 'Finalizado'];

export function quadroObras(projetos: Projeto[], resumos: ResumoObra[], e: Escopo): QuadroObras {
  const obras = projetos.filter((p) => e.obras.has(p.id));
  const porId = new Map(resumos.map((r) => [r.projetoId, r]));
  const resumosDoEscopo = obras.map((o) => porId.get(o.id)).filter((r): r is ResumoObra => Boolean(r));
  const comCronograma = resumosDoEscopo.filter((r) => r.etapasTotal > 0);
  return {
    obras,
    emExecucao: obras.filter((o) => o.situacao === 'Em Execução').length,
    avancoMedio: comCronograma.length > 0 ? soma(comCronograma, (r) => r.avancoFisico) / comCronograma.length : null,
    obrasComCronograma: comCronograma.length,
    etapasTotal: soma(resumosDoEscopo, (r) => r.etapasTotal),
    etapasConcluidas: soma(resumosDoEscopo, (r) => r.etapasConcluidas),
    obrasComAtraso: resumosDoEscopo.filter((r) => r.etapasAtrasadas > 0).length,
    porSituacao: SITUACOES.map((situacao) => ({ situacao, obras: obras.filter((o) => o.situacao === situacao).length })),
  };
}

// ------------------------------------------------------------------
// Prazos e evolução física
// ------------------------------------------------------------------

/** Percentual previsto de uma etapa no dia `d`: linear entre início e fim. */
export function previstoDaEtapa(etapa: Pick<EtapaBI, 'dataInicio' | 'dataFim'>, d: string): number | null {
  if (!etapa.dataInicio || !etapa.dataFim) return null;
  if (d < etapa.dataInicio) return 0;
  if (d >= etapa.dataFim) return 100;
  const total = duracaoEmDias({ de: etapa.dataInicio, ate: etapa.dataFim });
  const corridos = duracaoEmDias({ de: etapa.dataInicio, ate: d });
  return (corridos / total) * 100;
}

/**
 * Avanço de UMA obra num dia, pela regra de `v_resumo_obra`: média das folhas
 * ponderada pelo orçado vinculado, ou média simples quando nenhuma folha tem
 * peso. `valorDaEtapa` dá o percentual daquela etapa naquele dia.
 */
function mediaDaObra(etapas: EtapaBI[], valorDaEtapa: (e: EtapaBI) => number | null): number | null {
  const validas = etapas
    .map((e) => ({ e, v: valorDaEtapa(e) }))
    .filter((x): x is { e: EtapaBI; v: number } => x.v !== null);
  if (validas.length === 0) return null;
  const pesoTotal = soma(validas, (x) => x.e.peso);
  return pesoTotal > 0
    ? soma(validas, (x) => x.v * x.e.peso) / pesoTotal
    : soma(validas, (x) => x.v) / validas.length;
}

/**
 * Executado acumulado de cada etapa até cada dia, a partir dos boletins
 * aprovados. É `least(100, Σ percentual_medido)` de `v_etapas_cronograma`,
 * só que cortado na data — no dia de hoje os dois dão o mesmo número.
 */
function executadoAte(medicoes: MedicaoBI[]): (etapaId: string, d: string) => number {
  const porEtapa = new Map<string, MedicaoBI[]>();
  for (const m of medicoes) {
    if (m.status !== 'Aprovada') continue;
    const lista = porEtapa.get(m.etapaId) ?? [];
    lista.push(m);
    porEtapa.set(m.etapaId, lista);
  }
  return (etapaId, d) => Math.min(100, soma((porEtapa.get(etapaId) ?? []).filter((m) => m.data <= d), (m) => m.percentual));
}

export interface EtapaComPrazo {
  etapa: EtapaBI;
  dias: number;
}

export interface QuadroPrazos {
  atrasadas: EtapaComPrazo[];
  vencendo: EtapaComPrazo[];
  reprogramadas: EtapaComPrazo[];
  maiorAtraso: number;
  atrasoMedio: number | null;
  /** Realizado − previsto hoje, em pontos percentuais. `null` sem previsão. */
  desvioHoje: number | null;
  previstoHoje: number | null;
  realizadoHoje: number | null;
  curva: { balde: Balde; previsto: number | null; realizado: number | null }[];
  atrasosPorObra: { projetoId: string; etapas: number; maiorAtraso: number }[];
}

/** Janela de "vence logo" — duas semanas é o horizonte de uma reunião de obra. */
export const JANELA_VENCIMENTO = 15;

export function quadroPrazos(dados: DadosBI, e: Escopo, hoje: string): QuadroPrazos {
  const etapas = dados.etapas.filter((x) => e.obras.has(x.projetoId));
  const atrasadas = etapas
    .filter((x) => x.percentualExecutado < 100 && x.dataFim && x.dataFim < hoje)
    .map((etapa) => ({ etapa, dias: duracaoEmDias({ de: etapa.dataFim!, ate: hoje }) - 1 }))
    .sort((a, b) => b.dias - a.dias);
  const limite = somarDiasISO(hoje, JANELA_VENCIMENTO);
  const vencendo = etapas
    .filter((x) => x.percentualExecutado < 100 && x.dataFim && x.dataFim >= hoje && x.dataFim <= limite)
    .map((etapa) => ({ etapa, dias: duracaoEmDias({ de: hoje, ate: etapa.dataFim! }) - 1 }))
    .sort((a, b) => a.dias - b.dias);
  const reprogramadas = etapas
    .filter((x) => x.baselineFim && x.dataFim && x.dataFim > x.baselineFim)
    .map((etapa) => ({ etapa, dias: duracaoEmDias({ de: etapa.baselineFim!, ate: etapa.dataFim! }) - 1 }))
    .sort((a, b) => b.dias - a.dias);

  // A curva: média entre obras da média de cada obra — a mesma forma do
  // "avanço médio", que é média simples entre obras do avanço ponderado de cada.
  const porObra = new Map<string, EtapaBI[]>();
  for (const x of etapas) porObra.set(x.projetoId, [...(porObra.get(x.projetoId) ?? []), x]);
  const executado = executadoAte(dados.medicoes.filter((m) => e.obras.has(m.projetoId)));
  const mediaEntreObras = (porEtapa: (x: EtapaBI) => number | null) => {
    const valores = [...porObra.values()].map((lista) => mediaDaObra(lista, porEtapa)).filter((v): v is number => v !== null);
    return valores.length > 0 ? soma(valores, (v) => v) / valores.length : null;
  };
  const previstoEm = (d: string) => mediaEntreObras((x) => previstoDaEtapa(x, d));
  const realizadoEm = (d: string) => mediaEntreObras((x) => executado(x.id, d));

  const baldes = baldesDoIntervalo(e.intervalo);
  const curva = baldes.map((balde) => ({
    balde,
    previsto: previstoEm(balde.ate),
    // Dia ainda não vivido não tem realizado — a linha para em hoje.
    realizado: balde.de > hoje ? null : realizadoEm(balde.ate < hoje ? balde.ate : hoje),
  }));

  const previstoHoje = previstoEm(hoje);
  const realizadoHoje = realizadoEm(hoje);
  const atrasosPorObra = new Map<string, { projetoId: string; etapas: number; maiorAtraso: number }>();
  for (const a of atrasadas) {
    const l = atrasosPorObra.get(a.etapa.projetoId) ?? { projetoId: a.etapa.projetoId, etapas: 0, maiorAtraso: 0 };
    l.etapas += 1;
    l.maiorAtraso = Math.max(l.maiorAtraso, a.dias);
    atrasosPorObra.set(a.etapa.projetoId, l);
  }

  return {
    atrasadas,
    vencendo,
    reprogramadas,
    maiorAtraso: atrasadas[0]?.dias ?? 0,
    atrasoMedio: atrasadas.length > 0 ? soma(atrasadas, (a) => a.dias) / atrasadas.length : null,
    desvioHoje: previstoHoje !== null && realizadoHoje !== null ? realizadoHoje - previstoHoje : null,
    previstoHoje,
    realizadoHoje,
    curva,
    atrasosPorObra: [...atrasosPorObra.values()].sort((a, b) => b.etapas - a.etapas || b.maiorAtraso - a.maiorAtraso),
  };
}

// ------------------------------------------------------------------
// Produtividade
// ------------------------------------------------------------------

export interface MetaDaEtapa {
  etapa: EtapaBI;
  /** 0–100+ (a quantidade executada não tem teto — overrun aparece). */
  percentual: number;
  noPeriodo: number;
  /** Quantidade por dia corrido do período. */
  ritmo: number;
}

export interface QuadroProdutividade {
  boletinsAprovados: Comparado;
  /** Média do percentual de execução das metas quantitativas. */
  execucaoMetas: number | null;
  metas: MetaDaEtapa[];
  unidades: string[];
  /** Produção aprovada por fatia de tempo, por unidade — nunca somadas entre si. */
  producao: Record<string, { balde: Balde; quantidade: number }[]>;
  tarefasConcluidas: Comparado;
  /** Concluídas até o prazo ÷ concluídas com prazo. */
  tarefasNoPrazo: number | null;
  tarefasPorBalde: { balde: Balde; concluidas: number }[];
}

/** O dia LOCAL de um `timestamptz` — o contrário da coluna `date`. */
const diaLocal = (instante: string) => formatarISO(new Date(instante));

export function quadroProdutividade(dados: DadosBI, tarefas: Tarefa[], e: Escopo): QuadroProdutividade {
  const aprovadas = dados.medicoes.filter((m) => m.status === 'Aprovada' && noEscopo(e, m.projetoId));
  const noIntervalo = (i: Intervalo) => aprovadas.filter((m) => dentro(m.data, i));
  const atuais = noIntervalo(e.intervalo);
  const dias = duracaoEmDias(e.intervalo);

  const porEtapaNoPeriodo = new Map<string, number>();
  for (const m of atuais) if (m.quantidade !== undefined) porEtapaNoPeriodo.set(m.etapaId, (porEtapaNoPeriodo.get(m.etapaId) ?? 0) + m.quantidade);
  const metas = dados.etapas
    .filter((x) => e.obras.has(x.projetoId) && (x.quantidadePrevista ?? 0) > 0)
    .map((etapa) => {
      const noPeriodo = porEtapaNoPeriodo.get(etapa.id) ?? 0;
      return { etapa, percentual: (etapa.quantidadeExecutada / etapa.quantidadePrevista!) * 100, noPeriodo, ritmo: noPeriodo / dias };
    })
    .sort((a, b) => b.noPeriodo - a.noPeriodo || a.percentual - b.percentual);

  const baldes = baldesDoIntervalo(e.intervalo);
  const producao: Record<string, { balde: Balde; quantidade: number }[]> = {};
  for (const m of atuais) {
    if (m.quantidade === undefined || !m.unidade) continue;
    const serie = (producao[m.unidade] ??= baldes.map((balde) => ({ balde, quantidade: 0 })));
    const i = indiceDoBalde(baldes, m.data);
    if (i >= 0) serie[i].quantidade += m.quantidade;
  }
  const unidades = Object.keys(producao).sort((a, b) =>
    soma(producao[b], (x) => x.quantidade) - soma(producao[a], (x) => x.quantidade) || a.localeCompare(b));

  const concluidas = tarefas.filter((t) => t.status === 'Concluída' && t.concluidaEm && noEscopo(e, t.projetoId));
  const concluidasEm = (i: Intervalo) => concluidas.filter((t) => dentro(diaLocal(t.concluidaEm!), i));
  const atuaisT = concluidasEm(e.intervalo);
  const comPrazo = atuaisT.filter((t) => t.prazo);
  const tarefasPorBalde = baldes.map((balde) => ({ balde, concluidas: 0 }));
  for (const t of atuaisT) {
    const i = indiceDoBalde(baldes, diaLocal(t.concluidaEm!));
    if (i >= 0) tarefasPorBalde[i].concluidas += 1;
  }

  return {
    boletinsAprovados: comparar(atuais.length, noIntervalo(e.anterior).length),
    execucaoMetas: metas.length > 0 ? soma(metas, (m) => Math.min(100, m.percentual)) / metas.length : null,
    metas,
    unidades,
    producao,
    tarefasConcluidas: comparar(atuaisT.length, concluidasEm(e.anterior).length),
    tarefasNoPrazo: comPrazo.length > 0 ? (comPrazo.filter((t) => diaLocal(t.concluidaEm!) <= t.prazo!).length / comPrazo.length) * 100 : null,
    tarefasPorBalde,
  };
}

// ------------------------------------------------------------------
// Qualidade — o único sinal que o banco guarda hoje
// ------------------------------------------------------------------

export interface QuadroQualidade {
  rejeitadas: Comparado;
  /** rejeitadas ÷ (aprovadas + rejeitadas) no período. */
  taxaRejeicao: number | null;
  obrasAfetadas: number;
  boletins: (MedicaoBI & { motivo?: string })[];
}

export function quadroQualidade(dados: DadosBI, e: Escopo): QuadroQualidade {
  const motivos = new Map(dados.rejeicoes.map((r) => [r.medicaoId, r.motivo]));
  const doEscopo = dados.medicoes.filter((m) => noEscopo(e, m.projetoId));
  const de = (i: Intervalo) => doEscopo.filter((m) => dentro(m.data, i));
  const atuais = de(e.intervalo);
  const rejeitadas = atuais.filter((m) => m.status === 'Rejeitada');
  const decididas = atuais.filter((m) => m.status !== 'Pendente').length;
  return {
    rejeitadas: comparar(rejeitadas.length, de(e.anterior).filter((m) => m.status === 'Rejeitada').length),
    taxaRejeicao: decididas > 0 ? (rejeitadas.length / decididas) * 100 : null,
    obrasAfetadas: new Set(rejeitadas.map((m) => m.projetoId)).size,
    boletins: rejeitadas
      .map((m) => ({ ...m, motivo: motivos.get(m.id) }))
      .sort((a, b) => b.data.localeCompare(a.data) || a.id.localeCompare(b.id)),
  };
}

// ------------------------------------------------------------------
// Opções dos filtros
// ------------------------------------------------------------------

export interface OpcoesFiltros {
  obras: Projeto[];
  contratos: ContratoBI[];
  responsaveis: { id: string; nome: string }[];
}

/**
 * As opções de cada filtro, recortadas pelos OUTROS — "respeitar as relações":
 * com "Pausado" escolhido, o select de obra só lista obras pausadas; com a obra
 * escolhida, o de contrato só lista os contratos dela. A opção já escolhida
 * fica sempre na lista, mesmo que outro filtro a exclua, para o select não
 * mostrar um valor que não existe nele.
 */
export function opcoesDosFiltros(projetos: Projeto[], contratos: ContratoBI[], f: FiltrosBI): OpcoesFiltros {
  const passa = (p: Projeto, ignorar: 'obra' | 'responsavel' | 'contrato') =>
    (ignorar === 'obra' || !f.obraId || p.id === f.obraId) &&
    (!f.situacao || p.situacao === f.situacao) &&
    (ignorar === 'responsavel' || !f.responsavelId || p.responsavelInternoId === f.responsavelId);

  const porNome = (a: Projeto, b: Projeto) => a.nome.localeCompare(b.nome, 'pt-BR');
  const obras = projetos.filter((p) => passa(p, 'obra') || p.id === f.obraId).sort(porNome);

  const obrasDoContrato = new Set(projetos.filter((p) => passa(p, 'contrato')).map((p) => p.id));
  const recortePorObra = Boolean(f.obraId || f.situacao || f.responsavelId);
  const contratosOp = contratos.filter((c) =>
    c.id === f.contratoId || (c.projetoId ? obrasDoContrato.has(c.projetoId) : !recortePorObra));

  const responsaveis = new Map<string, string>();
  for (const p of projetos) {
    if (!p.responsavelInternoId) continue;
    if (passa(p, 'responsavel') || p.responsavelInternoId === f.responsavelId) {
      responsaveis.set(p.responsavelInternoId, p.responsavelInterno || 'Sem nome');
    }
  }
  return {
    obras,
    contratos: contratosOp,
    responsaveis: [...responsaveis].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}
