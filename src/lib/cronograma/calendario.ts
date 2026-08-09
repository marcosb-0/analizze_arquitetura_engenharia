import { dataLocal, formatarISO } from '../data';

/**
 * Aritmética de dias úteis para o cronograma de obra.
 *
 * Duas regras governam tudo aqui, e as duas já custaram bugs neste repositório:
 *
 * 1. **Nunca `new Date(iso)` cru.** Colunas `date` chegam como 'YYYY-MM-DD', e o
 *    JS as interpreta como meia-noite UTC — em UTC-3 isso é 21h do dia anterior.
 *    Ver o cabeçalho de `src/lib/data.ts`; nove telas já erraram apesar do
 *    helper existir.
 *
 * 2. **Nunca aritmética em milissegundos.** "Somar 86.400.000" erra meio dia nos
 *    dois domingos de mudança de horário de verão, e o erro só aparece em
 *    outubro e fevereiro. Aqui os dias são somados no CALENDÁRIO local
 *    (`setDate`), que é imune a isso porque o `Date` recalcula a hora sozinho.
 *    `diasAte` em `data.ts` escapa por arredondar; este módulo não teria como.
 *
 * O calendário é um PARÂMETRO opcional em toda função. Isso é o que permite
 * testar sem feriado nenhum, e o que deixa a porta aberta para feriados
 * municipais e paradas próprias da obra virarem uma tabela mais tarde, sem
 * reescrever o motor.
 */
export interface Calendario {
  /** A data 'YYYY-MM-DD' é feriado? Fim de semana é tratado à parte. */
  ehFeriado(iso: string): boolean;
}

/** Só sábado e domingo — o comportamento anterior a 09/ago/2026. */
export const SEM_FERIADOS: Calendario = { ehFeriado: () => false };

/** Um calendário a partir de uma lista fixa — para testes e paradas próprias. */
export function calendarioDe(datas: Iterable<string>): Calendario {
  const conjunto = new Set(datas);
  return { ehFeriado: (iso) => conjunto.has(iso) };
}

/** Teto de segurança: nenhuma travessia legítima de cronograma chega perto. */
const MAX_PASSOS = 20_000;

/**
 * Domingo de Páscoa pelo algoritmo gregoriano anônimo (Meeus/Jones/Butcher).
 *
 * É a âncora dos três feriados móveis brasileiros, e vale de 1583 a 4099 — não
 * há tabela para manter nem ano em que o app pare de saber quando é Carnaval.
 */
function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function somarDiasCorridos(d: Date, n: number): Date {
  const saida = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  saida.setDate(saida.getDate() + n);
  return saida;
}

/**
 * Feriados nacionais de um ano, como 'YYYY-MM-DD'.
 *
 * **Fixos, todos por lei federal:** 01/01 Confraternização, 21/04 Tiradentes,
 * 01/05 Trabalho, 07/09 Independência, 12/10 Aparecida, 02/11 Finados, 15/11
 * Proclamação da República, 25/12 Natal. E 20/11 (Consciência Negra), que virou
 * feriado nacional pela Lei 14.759/2023 — por isso só entra a partir de 2024,
 * e não retroativamente num cronograma antigo.
 *
 * **Móveis:** Sexta-feira Santa (Páscoa − 2) é feriado legal. Carnaval
 * (segunda e terça, Páscoa − 48 e − 47) e Corpus Christi (Páscoa + 60) são
 * ponto facultativo federal, e entram assim mesmo: canteiro de obra no Brasil
 * para nesses dias, e um prazo que os conta como trabalhados nasce vencido. É
 * a decisão mais discutível deste arquivo, e está isolada aqui de propósito —
 * quem quiser o rigor legal remove as três linhas marcadas.
 */
export function feriadosNacionais(ano: number): Set<string> {
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];
  const datas = fixos.map((md) => `${ano}-${md}`);

  if (ano >= 2024) datas.push(`${ano}-11-20`); // Consciência Negra, Lei 14.759/2023

  const pascoa = domingoDePascoa(ano);
  datas.push(formatarISO(somarDiasCorridos(pascoa, -48))); // Carnaval (segunda) — facultativo
  datas.push(formatarISO(somarDiasCorridos(pascoa, -47))); // Carnaval (terça) — facultativo
  datas.push(formatarISO(somarDiasCorridos(pascoa, -2))); //  Sexta-feira Santa — legal
  datas.push(formatarISO(somarDiasCorridos(pascoa, 60))); //  Corpus Christi — facultativo

  return new Set(datas);
}

/**
 * O calendário do app: fins de semana mais os feriados nacionais.
 *
 * Os anos são calculados sob demanda e memoizados — uma obra atravessa dois ou
 * três, e recalcular a Páscoa a cada comparação de data dentro de um laço de
 * arraste seria desperdício puro.
 */
const cacheDeAnos = new Map<number, Set<string>>();

function feriadosDoAno(ano: number): Set<string> {
  let doAno = cacheDeAnos.get(ano);
  if (!doAno) {
    doAno = feriadosNacionais(ano);
    cacheDeAnos.set(ano, doAno);
  }
  return doAno;
}

export const CALENDARIO_BR: Calendario = {
  ehFeriado: (iso) => feriadosDoAno(Number(iso.slice(0, 4))).has(iso),
};

/** Sábado, domingo ou feriado não contam. */
export function ehDiaUtil(iso: string, cal: Calendario = CALENDARIO_BR): boolean {
  const d = dataLocal(iso);
  if (!d) return false;
  const dia = d.getDay();
  if (dia === 0 || dia === 6) return false;
  return !cal.ehFeriado(formatarISO(d));
}

/** O próprio dia, se já for útil; senão o próximo que for. */
export function proximoDiaUtil(iso: string, cal: Calendario = CALENDARIO_BR): string {
  const d = dataLocal(iso);
  if (!d) return iso;
  let atual = d;
  for (let passos = 0; passos < MAX_PASSOS; passos += 1) {
    const texto = formatarISO(atual);
    if (ehDiaUtil(texto, cal)) return texto;
    atual = somarDiasCorridos(atual, 1);
  }
  return iso;
}

/** O próprio dia, se já for útil; senão o último útil antes dele. */
export function diaUtilAnterior(iso: string, cal: Calendario = CALENDARIO_BR): string {
  const d = dataLocal(iso);
  if (!d) return iso;
  let atual = d;
  for (let passos = 0; passos < MAX_PASSOS; passos += 1) {
    const texto = formatarISO(atual);
    if (ehDiaUtil(texto, cal)) return texto;
    atual = somarDiasCorridos(atual, -1);
  }
  return iso;
}

/**
 * `n` dias ÚTEIS à frente (negativo anda para trás).
 *
 * Somar 1 a uma sexta-feira devolve a segunda seguinte.
 *
 * `n === 0` devolve a data como está, mesmo se cair num sábado — quem quer
 * "empurre para o próximo útil" chama `proximoDiaUtil`, que diz isso no nome.
 * Fundir as duas coisas faria uma etapa de duração 1 mudar de lugar sozinha ao
 * ser apenas recalculada.
 */
export function somarDiasUteis(iso: string, n: number, cal: Calendario = CALENDARIO_BR): string {
  const d = dataLocal(iso);
  if (!d || n === 0) return iso;

  const passo = n > 0 ? 1 : -1;
  let restantes = Math.abs(n);
  let atual = d;

  for (let passos = 0; passos < MAX_PASSOS && restantes > 0; passos += 1) {
    atual = somarDiasCorridos(atual, passo);
    if (ehDiaUtil(formatarISO(atual), cal)) restantes -= 1;
  }
  return formatarISO(atual);
}

/**
 * Dias úteis entre duas datas, contando as DUAS pontas.
 *
 * Mesmo contrato de `getWorkingDays`, que hoje delega para cá: uma etapa que
 * começa e termina na mesma segunda-feira dura 1 dia útil, não 0. Fora de
 * ordem, ou com data inválida, devolve 0 — o cronograma prefere um zero visível
 * a um número negativo que atravessa a conta inteira.
 */
export function duracaoDiasUteis(
  inicio: string,
  fim: string,
  cal: Calendario = CALENDARIO_BR
): number {
  const de = dataLocal(inicio);
  const ate = dataLocal(fim);
  if (!de || !ate || de > ate) return 0;

  let total = 0;
  let atual = de;
  for (let passos = 0; passos < MAX_PASSOS && atual <= ate; passos += 1) {
    if (ehDiaUtil(formatarISO(atual), cal)) total += 1;
    atual = somarDiasCorridos(atual, 1);
  }
  return total;
}
