/**
 * O recorte de tempo do painel de indicadores.
 *
 * Tudo aqui opera sobre a STRING `YYYY-MM-DD` e aritmética em UTC. As colunas
 * de data do banco são `date`, e `new Date('2026-11-15')` no fuso do Brasil
 * volta um dia — o erro que nove telas já cometeram (ver `lib/data.ts`). Ao
 * montar o `Date` com `Date.UTC` e ler com `getUTC*`, nenhum fuso entra na conta.
 *
 * ## "Até hoje", e não o período cheio
 *
 * "Este mês" vai do dia 1 até HOJE, e o período anterior tem o MESMO número de
 * dias corridos (1º a 15 de outubro contra 1º a 15 de novembro). Comparar meio
 * mês com o mês anterior inteiro mostraria uma queda de 50% que é só calendário.
 */

export type PresetPeriodo = 'hoje' | 'semana' | 'mes' | 'trimestre' | 'ano' | 'tudo' | 'personalizado';

/** Intervalo fechado nas duas pontas, em `YYYY-MM-DD`. */
export interface Intervalo {
  de: string;
  ate: string;
}

export const ROTULO_PERIODO: Record<PresetPeriodo, string> = {
  hoje: 'Hoje',
  semana: 'Semana',
  mes: 'Mês',
  trimestre: 'Trimestre',
  ano: 'Ano',
  tudo: 'Tudo',
  personalizado: 'Personalizado',
};

/** Como o período anterior é chamado na legenda da variação. */
export const ROTULO_ANTERIOR: Record<PresetPeriodo, string> = {
  hoje: 'ontem',
  semana: 'a semana anterior',
  mes: 'o mesmo trecho do mês anterior',
  trimestre: 'o mesmo trecho do trimestre anterior',
  ano: 'o mesmo trecho do ano anterior',
  tudo: 'nada — todo o histórico não tem período anterior',
  personalizado: 'o intervalo anterior de mesma duração',
};

const DIA_MS = 86_400_000;

function paraUTC(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function somarDiasISO(iso: string, dias: number): string {
  return paraISO(new Date(paraUTC(iso).getTime() + dias * DIA_MS));
}

/** Dias corridos de `de` a `ate`, contando as duas pontas. */
export function duracaoEmDias({ de, ate }: Intervalo): number {
  return Math.round((paraUTC(ate).getTime() - paraUTC(de).getTime()) / DIA_MS) + 1;
}

function ultimoDiaDoMes(ano: number, mes0: number): number {
  return new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
}

/**
 * Recua `meses` meses mantendo o dia, preso ao último dia do mês de destino
 * (31/mar − 1 mês = 28 ou 29/fev, e não 3/mar).
 */
function recuarMeses(iso: string, meses: number): string {
  const d = paraUTC(iso);
  const alvo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - meses, 1));
  const dia = Math.min(d.getUTCDate(), ultimoDiaDoMes(alvo.getUTCFullYear(), alvo.getUTCMonth()));
  return paraISO(new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), dia)));
}

/**
 * `inicio` é a data do primeiro registro da tela e só vale para "Tudo": sem um
 * começo real, o eixo mensal desenharia décadas de barras vazias. Sem registro
 * nenhum, "Tudo" cai no começo do ano corrente.
 */
export function intervaloDoPeriodo(preset: PresetPeriodo, hoje: string, personalizado?: Intervalo, inicio?: string): Intervalo {
  const d = paraUTC(hoje);
  const ano = d.getUTCFullYear();
  const mes0 = d.getUTCMonth();
  switch (preset) {
    case 'hoje':
      return { de: hoje, ate: hoje };
    case 'semana': {
      // Semana de segunda a domingo — a mesma da chamada diária e do calendário.
      const desdeSegunda = (d.getUTCDay() + 6) % 7;
      return { de: somarDiasISO(hoje, -desdeSegunda), ate: hoje };
    }
    case 'mes':
      return { de: paraISO(new Date(Date.UTC(ano, mes0, 1))), ate: hoje };
    case 'trimestre':
      return { de: paraISO(new Date(Date.UTC(ano, mes0 - (mes0 % 3), 1))), ate: hoje };
    case 'ano':
      return { de: `${ano}-01-01`, ate: hoje };
    case 'tudo':
      return { de: inicio && inicio.slice(0, 10) < hoje ? inicio.slice(0, 10) : `${ano}-01-01`, ate: hoje };
    case 'personalizado':
      return personalizado && intervaloValido(personalizado) ? personalizado : { de: hoje, ate: hoje };
  }
}

export function intervaloValido(i: Intervalo): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(i.de) && /^\d{4}-\d{2}-\d{2}$/.test(i.ate) && i.de <= i.ate;
}

/**
 * O período com que o atual é comparado — mesmo trecho do calendário anterior
 * para os períodos de calendário, e a janela imediatamente anterior de mesma
 * duração para o intervalo personalizado.
 */
export function intervaloAnterior(preset: PresetPeriodo, atual: Intervalo): Intervalo {
  switch (preset) {
    case 'hoje':
    case 'semana':
    case 'tudo':
    case 'personalizado': {
      const dias = duracaoEmDias(atual);
      return { de: somarDiasISO(atual.de, -dias), ate: somarDiasISO(atual.de, -1) };
    }
    case 'mes':
      return { de: recuarMeses(atual.de, 1), ate: recuarMeses(atual.ate, 1) };
    case 'trimestre':
      return { de: recuarMeses(atual.de, 3), ate: recuarMeses(atual.ate, 3) };
    case 'ano':
      return { de: recuarMeses(atual.de, 12), ate: recuarMeses(atual.ate, 12) };
  }
}

/** "Tudo" não tem período anterior: a comparação some em vez de mostrar "sem base" em todo KPI. */
export function comparaPeriodo(f: { periodo: PresetPeriodo; comparar: boolean }): boolean {
  return f.comparar && f.periodo !== 'tudo';
}

/** A data mais antiga de uma lista — o `inicio` do "Tudo". */
export function primeiraData(datas: (string | null | undefined)[]): string | undefined {
  let menor: string | undefined;
  for (const d of datas) if (d && (!menor || d < menor)) menor = d.slice(0, 10);
  return menor;
}

export function dentro(iso: string | null | undefined, i: Intervalo): boolean {
  if (!iso) return false;
  const dia = iso.slice(0, 10);
  return dia >= i.de && dia <= i.ate;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export interface Balde {
  chave: string;
  rotulo: string;
  de: string;
  ate: string;
}

/**
 * As fatias do eixo de tempo dos gráficos de evolução.
 *
 * Até 31 dias, uma barra por dia; acima disso, uma por mês. Semana como fatia
 * intermediária foi descartada: "semana de 3/nov" é um rótulo que ninguém lê de
 * relance, e o trimestre (o único preset entre 31 e 366 dias) já cabe em três
 * meses legíveis.
 *
 * A primeira e a última fatia mensal são CORTADAS pelo intervalo — o "nov" de
 * um período que termina em 15/nov soma até o dia 15, não o mês inteiro.
 */
export function baldesDoIntervalo(i: Intervalo): Balde[] {
  const baldes: Balde[] = [];
  if (duracaoEmDias(i) <= 31) {
    for (let dia = i.de; dia <= i.ate; dia = somarDiasISO(dia, 1)) {
      const d = paraUTC(dia);
      baldes.push({ chave: dia, rotulo: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`, de: dia, ate: dia });
    }
    return baldes;
  }
  const inicio = paraUTC(i.de);
  let ano = inicio.getUTCFullYear();
  let mes0 = inicio.getUTCMonth();
  for (;;) {
    const primeiro = paraISO(new Date(Date.UTC(ano, mes0, 1)));
    if (primeiro > i.ate) break;
    const ultimo = paraISO(new Date(Date.UTC(ano, mes0, ultimoDiaDoMes(ano, mes0))));
    const virouAno = mes0 === 0 || baldes.length === 0;
    baldes.push({
      chave: primeiro.slice(0, 7),
      rotulo: virouAno ? `${MESES[mes0]}/${String(ano).slice(2)}` : MESES[mes0],
      de: primeiro < i.de ? i.de : primeiro,
      ate: ultimo > i.ate ? i.ate : ultimo,
    });
    mes0 += 1;
    if (mes0 === 12) {
      mes0 = 0;
      ano += 1;
    }
  }
  return baldes;
}

/** O balde de uma data, ou `undefined` se ela cai fora do intervalo. */
export function indiceDoBalde(baldes: Balde[], iso: string): number {
  const dia = iso.slice(0, 10);
  // Busca binária: as fatias estão em ordem e não se sobrepõem.
  let lo = 0;
  let hi = baldes.length - 1;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    if (dia < baldes[meio].de) hi = meio - 1;
    else if (dia > baldes[meio].ate) lo = meio + 1;
    else return meio;
  }
  return -1;
}

export function formatarIntervalo(i: Intervalo): string {
  const br = (iso: string) => {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  };
  return i.de === i.ate ? br(i.de) : `${br(i.de)} a ${br(i.ate)}`;
}
