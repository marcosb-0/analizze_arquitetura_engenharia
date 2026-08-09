import { dataLocal, formatarISO } from '../../../lib/data';

/**
 * A conversão entre data e pixel — a matemática toda do Gantt, sem React.
 *
 * O "Gantt" anterior interpolava linearmente entre a primeira e a última data da
 * obra e imprimia cinco rótulos igualmente espaçados. Não era uma escala: dois
 * meses vizinhos ocupavam larguras diferentes conforme as etapas se
 * distribuíam, e não havia como marcar "hoje" nem alinhar duas barras pelo olho.
 * Aqui um dia vale sempre o mesmo número de pixels.
 */

export type Zoom = 'dia' | 'semana' | 'mes';

/**
 * Largura de um dia em cada zoom. `mes` é fracionário de propósito: 2,4px por
 * dia dá ~73px por mês, que é o menor tamanho em que o rótulo "ago/26" ainda
 * cabe sem cortar.
 */
export const PX_POR_DIA: Record<Zoom, number> = { dia: 28, semana: 8, mes: 2.4 };

export interface Tick {
  /** Deslocamento em px a partir da origem da escala. */
  x: number;
  largura: number;
  rotulo: string;
  /** Chave estável para o React — a data de início do intervalo. */
  chave: string;
}

export interface EscalaTempo {
  zoom: Zoom;
  pxPorDia: number;
  /** Primeiro dia desenhado, 'YYYY-MM-DD'. */
  origem: string;
  /** Último dia desenhado, 'YYYY-MM-DD'. */
  fim: string;
  largura: number;
  xDeData(iso: string): number;
  dataDeX(px: number): string;
  /**
   * Os rótulos das duas faixas do cabeçalho, recortados pela janela visível.
   *
   * Recebe a janela porque uma obra de dois anos no zoom `dia` tem 730 marcas —
   * 730 nós de DOM redesenhados a cada quadro de rolagem. As barras não precisam
   * desse cuidado (são dezenas), as marcas precisam.
   */
  ticks(de: number, ate: number): { bandas: Tick[]; marcas: Tick[] };
}

/**
 * Dias inteiros entre duas datas, pela via UTC.
 *
 * `Date.UTC` é o ponto: UTC não tem horário de verão, então a diferença entre
 * dois instantes de meia-noite UTC é sempre um múltiplo exato de 86.400.000.
 * A mesma subtração feita com `Date` locais devolve 23h ou 25h nos dois
 * domingos de virada, e o `Math.round` que salvaria a conta é justamente o que
 * ninguém escreve.
 */
export function diasEntre(de: string, ate: string): number {
  const a = dataLocal(de);
  const b = dataLocal(ate);
  if (!a || !b) return 0;
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

/** `n` dias corridos depois de `iso`, no calendário local. */
export function somarDias(iso: string, n: number): string {
  const d = dataLocal(iso);
  if (!d) return iso;
  const saida = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  saida.setDate(saida.getDate() + n);
  return formatarISO(saida);
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIA_CURTO = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Segunda-feira da semana de `iso` — a semana ISO começa na segunda. */
function inicioDaSemana(iso: string): string {
  const d = dataLocal(iso);
  if (!d) return iso;
  const paraSegunda = (d.getDay() + 6) % 7;
  return somarDias(iso, -paraSegunda);
}

function inicioDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function diasNoMes(iso: string): number {
  const d = dataLocal(iso);
  if (!d) return 30;
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/**
 * A escala de uma obra.
 *
 * `inicio` e `fim` já vêm com a folga que o Gantt quer mostrar em volta das
 * barras — quem decide a folga é o componente, porque ela depende do zoom.
 */
export function criarEscala(inicio: string, fim: string, zoom: Zoom): EscalaTempo {
  const pxPorDia = PX_POR_DIA[zoom];
  const origem = inicio;
  const totalDias = Math.max(1, diasEntre(inicio, fim) + 1);
  const largura = totalDias * pxPorDia;

  const xDeData = (iso: string) => diasEntre(origem, iso) * pxPorDia;

  const dataDeX = (px: number) => somarDias(origem, Math.round(px / pxPorDia));

  const ticks = (de: number, ate: number) => {
    // Uma margem de meia tela para os dois lados: sem ela, rolar rápido mostra
    // uma faixa de cabeçalho em branco antes de o React repintar.
    const margem = Math.max(0, (ate - de) / 2);
    // O recorte é fechado nas duas pontas: `dataDeX(largura)` já é o dia
    // SEGUINTE ao último (a largura cobre `totalDias` dias a partir da origem),
    // e sem esta trava o cabeçalho ganharia um mês — ou um ano inteiro no zoom
    // `mes` — depois do fim da obra.
    const cru = {
      inicio: dataDeX(Math.max(0, de - margem)),
      fim: dataDeX(Math.min(largura, ate + margem)),
    };
    const inicioVisivel = cru.inicio < origem ? origem : cru.inicio;
    const fimVisivel = cru.fim > fim ? fim : cru.fim;

    const bandas: Tick[] = [];
    const marcas: Tick[] = [];

    // Faixa de cima: sempre o mês (com o ano), que é a âncora que a pessoa lê
    // primeiro. No zoom `mes` ela vira o ano, senão os rótulos se sobrepõem.
    if (zoom === 'mes') {
      let ano = Number(inicioVisivel.slice(0, 4));
      const ultimoAno = Number(fimVisivel.slice(0, 4));
      while (ano <= ultimoAno) {
        const primeiro = `${ano}-01-01`;
        const dias = diasEntre(primeiro, `${ano}-12-31`) + 1;
        bandas.push({
          chave: primeiro,
          x: xDeData(primeiro),
          largura: dias * pxPorDia,
          rotulo: String(ano),
        });
        ano += 1;
      }
    } else {
      let mes = inicioDoMes(inicioVisivel);
      while (mes <= fimVisivel) {
        const dias = diasNoMes(mes);
        const indice = Number(mes.slice(5, 7)) - 1;
        bandas.push({
          chave: mes,
          x: xDeData(mes),
          largura: dias * pxPorDia,
          rotulo: `${MES_CURTO[indice]}/${mes.slice(2, 4)}`,
        });
        mes = somarDias(mes, dias);
      }
    }

    // Faixa de baixo: o grão do zoom.
    if (zoom === 'dia') {
      let dia = inicioVisivel;
      while (dia <= fimVisivel) {
        const d = dataLocal(dia);
        marcas.push({
          chave: dia,
          x: xDeData(dia),
          largura: pxPorDia,
          rotulo: d ? `${DIA_CURTO[d.getDay()]}${Number(dia.slice(8, 10))}` : '',
        });
        dia = somarDias(dia, 1);
      }
    } else if (zoom === 'semana') {
      let semana = inicioDaSemana(inicioVisivel);
      while (semana <= fimVisivel) {
        marcas.push({
          chave: semana,
          x: xDeData(semana),
          largura: 7 * pxPorDia,
          rotulo: `${Number(semana.slice(8, 10))}/${Number(semana.slice(5, 7))}`,
        });
        semana = somarDias(semana, 7);
      }
    } else {
      let mes = inicioDoMes(inicioVisivel);
      while (mes <= fimVisivel) {
        const dias = diasNoMes(mes);
        marcas.push({
          chave: mes,
          x: xDeData(mes),
          largura: dias * pxPorDia,
          rotulo: MES_CURTO[Number(mes.slice(5, 7)) - 1],
        });
        mes = somarDias(mes, dias);
      }
    }

    return { bandas, marcas };
  };

  return { zoom, pxPorDia, origem, fim, largura, xDeData, dataDeX, ticks };
}
