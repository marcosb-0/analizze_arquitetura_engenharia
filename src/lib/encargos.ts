/**
 * Os encargos sociais, rubrica a rubrica.
 *
 * ESTE ARQUIVO É O ESPELHO DE `fn_encargos_totais()` (20260920150000). O banco
 * soma para orçar a mão de obra pela fonte `Folha`, e o cliente soma de novo
 * para mostrar a tabela em Configurações e o detalhamento na ficha da Equipe.
 * Divergir das duas contas significa a tela afirmar um encargo e o orçamento
 * cobrar outro — é o que `encargos.test.ts` existe para impedir.
 *
 * DUAS REGRAS QUE PARECEM DETALHE E NÃO SÃO:
 *
 * 1. **Nulo é "não respondida", nunca zero.** O total de um grupo só existe
 *    quando todas as rubricas ativas que incidem naquele regime têm percentual.
 *    Somar o que há e devolver um número menor seria um custo errado que não
 *    parece errado. Mesmo argumento de 20260810121000 para o campo escalar.
 *
 * 2. **"Não incide" (`aplica*`) é diferente de "em branco".** B1, B2 e B7 não
 *    incidem sobre mensalista — o mensalista recebe o mês inteiro independente
 *    de domingo, feriado ou chuva. Isso é resposta completa, e a tela mostra um
 *    traço; branco é pergunta em aberto, e a tela cobra.
 *
 * FÓRMULA NOVA mexe em três lugares: o CHECK de `encargos_rubricas`, o `case`
 * de `fn_encargos_totais()` e o `switch` daqui.
 */

import { FormulaEncargo, GrupoEncargo, RegimeEncargos, RubricaEncargo } from '../types';
import { arredondar } from './preco';

export type { FormulaEncargo, GrupoEncargo, RegimeEncargos, RubricaEncargo };

/** Uma rubrica com o grupo D já resolvido. `null` segue sendo "não dá para saber". */
export interface RubricaCalculada extends RubricaEncargo {
  calculada: boolean;
  valorHorista: number | null;
  valorMensalista: number | null;
}

export interface TotaisPorRegime {
  horista: number | null;
  mensalista: number | null;
}

/**
 * Os quatro grupos estruturais, os próprios que houver e o total geral, cada
 * um podendo ser desconhecido.
 */
export type TotaisEncargos = {
  A: TotaisPorRegime;
  B: TotaisPorRegime;
  C: TotaisPorRegime;
  D: TotaisPorRegime;
  total: TotaisPorRegime;
} & Record<GrupoEncargo, TotaisPorRegime>;

/** A estrutura SINAPI. Grupo próprio (E–Z) soma direto no total, como o C. */
export const GRUPOS_SISTEMA: readonly GrupoEncargo[] = ['A', 'B', 'C', 'D'];

function aplica(r: RubricaEncargo, regime: RegimeEncargos): boolean {
  return regime === 'Horista' ? r.aplicaHorista : r.aplicaMensalista;
}

function percentual(r: RubricaEncargo, regime: RegimeEncargos): number | null {
  return regime === 'Horista' ? r.percentualHorista : r.percentualMensalista;
}

/**
 * Soma as rubricas que incidem, ou devolve `null` se alguma delas está em
 * branco. É a regra 1 do cabeçalho, e é a mesma forma do `case ... when
 * count(*) filter (...) = 0` da função do banco.
 */
function somar<T extends RubricaEncargo>(
  rubricas: readonly T[],
  regime: RegimeEncargos,
  valorDe: (r: T) => number | null
): number | null {
  const incidentes = rubricas.filter((r) => r.ativo && aplica(r, regime));
  let soma = 0;
  for (const r of incidentes) {
    const v = valorDe(r);
    if (v == null || !Number.isFinite(v)) return null;
    soma += v;
  }
  return arredondar(soma, 4);
}

/**
 * As rubricas que as fórmulas do D citam pelo código. Não podem ser excluídas
 * (a política de DELETE as barra) — só desativadas.
 */
export const OPERANDOS_D = ['A1', 'A8', 'B4', 'C1', 'C2'] as const;

/** Quais operandos cada fórmula lê — para a tela marcar e explicar. */
export const OPERANDOS_DA_FORMULA: Record<FormulaEncargo, readonly string[]> = {
  'A*B': ['A', 'B'],
  'A*B-A1*B4': ['A', 'B', 'A1', 'B4'],
  'A*C2+A8*C1': ['A', 'C2', 'A8', 'C1'],
};

/**
 * Um operando do D, pelo código da rubrica.
 *
 * Desativada, excluída ou "não incide" no regime = **0** — é a resposta "não
 * pago isso", e a reincidência do que não se paga é zero (20260925190058).
 * Antes isso devolvia nulo, o D e o total viravam nulos, e o guarda do banco
 * recusava salvar dizendo que faltava percentual numa rubrica DESATIVADA.
 *
 * Ativa, incidindo e SEM percentual continua **nulo**: é pergunta em aberto.
 */
function porCodigo(
  rubricas: readonly RubricaEncargo[],
  codigo: string,
  regime: RegimeEncargos
): number | null {
  const r = rubricas.find((x) => x.codigo === codigo && x.ativo);
  if (!r || !aplica(r, regime)) return 0;
  return percentual(r, regime);
}

/**
 * Os valores que as fórmulas do D usam, num regime — o que a tela mostra para
 * explicar a conta. Nulo só onde a pergunta está em aberto.
 */
export function operandosDoD(rubricas: readonly RubricaEncargo[], regime: RegimeEncargos): Record<string, number | null> {
  const a = somar(rubricas.filter((r) => r.grupo === 'A'), regime, (r) => percentual(r, regime));
  const b = somar(rubricas.filter((r) => r.grupo === 'B'), regime, (r) => percentual(r, regime));
  return {
    A: a,
    B: b,
    ...Object.fromEntries(OPERANDOS_D.map((c) => [c, porCodigo(rubricas, c, regime)])),
  };
}

/**
 * Resolve uma linha do grupo D. Operando em aberto (ativo sem percentual)
 * devolve `null` e o nulo sobe até o total; operando desativado vale 0.
 */
function resolverFormula(
  formula: FormulaEncargo,
  rubricas: readonly RubricaEncargo[],
  regime: RegimeEncargos
): number | null {
  const a = somar(rubricas.filter((r) => r.grupo === 'A'), regime, (r) => percentual(r, regime));
  const b = somar(rubricas.filter((r) => r.grupo === 'B'), regime, (r) => percentual(r, regime));
  const a1 = porCodigo(rubricas, 'A1', regime);
  const a8 = porCodigo(rubricas, 'A8', regime);
  const b4 = porCodigo(rubricas, 'B4', regime);
  const c1 = porCodigo(rubricas, 'C1', regime);
  const c2 = porCodigo(rubricas, 'C2', regime);

  switch (formula) {
    case 'A*B':
      return a == null || b == null ? null : arredondar((a * b) / 100, 4);
    case 'A*B-A1*B4':
      return a == null || b == null || a1 == null || b4 == null
        ? null
        : arredondar((a * b - a1 * b4) / 100, 4);
    case 'A*C2+A8*C1':
      return a == null || c2 == null || a8 == null || c1 == null
        ? null
        : arredondar((a * c2 + a8 * c1) / 100, 4);
    default:
      // Fórmula que entrou no CHECK do banco e não aqui. Falhar alto é de
      // propósito: devolver `null` a faria sumir da soma e o encargo sairia
      // menor, calado — o mesmo modo de falha de uma coluna esquecida num
      // trigger de propagação.
      throw new Error(
        `Fórmula de encargo desconhecida: ${String(formula)}. Entrou no CHECK de encargos_rubricas e não no switch de lib/encargos.ts.`
      );
  }
}

/** A tabela com o grupo D materializado, na ordem em que a tela mostra. */
export function calcularRubricas(rubricas: readonly RubricaEncargo[]): RubricaCalculada[] {
  return [...rubricas]
    .sort((a, b) => a.ordem - b.ordem)
    .map((r) => {
      const calculada = r.formula != null;
      return {
        ...r,
        calculada,
        valorHorista: calculada
          ? r.aplicaHorista
            ? resolverFormula(r.formula as FormulaEncargo, rubricas, 'Horista')
            : null
          : r.percentualHorista,
        valorMensalista: calculada
          ? r.aplicaMensalista
            ? resolverFormula(r.formula as FormulaEncargo, rubricas, 'Mensalista')
            : null
          : r.percentualMensalista,
      };
    });
}

/**
 * Subtotal por grupo e total geral, nos dois regimes.
 *
 * Um grupo desconhecido torna o TOTAL desconhecido — e é isso que impede o modo
 * 'Rubricas' de ser ligado pela metade, tanto aqui quanto no guarda do banco.
 */
export function totaisEncargos(rubricas: readonly RubricaEncargo[]): TotaisEncargos {
  const calculadas = calcularRubricas(rubricas);
  const porRegime = (regime: RegimeEncargos) => (r: RubricaCalculada) =>
    regime === 'Horista' ? r.valorHorista : r.valorMensalista;

  const doGrupo = (grupo: GrupoEncargo): TotaisPorRegime => {
    const doGrupoAtual = calculadas.filter((r) => r.grupo === grupo);
    return {
      horista: somar(doGrupoAtual, 'Horista', porRegime('Horista')),
      mensalista: somar(doGrupoAtual, 'Mensalista', porRegime('Mensalista')),
    };
  };

  // Os estruturais sempre, e os próprios que aparecem nas rubricas. Grupo
  // próprio sem rubrica soma zero dos dois lados — aqui por não estar na lista,
  // no banco pelo `left join` de `encargos_grupos` (20260925182333).
  const codigos = [...new Set([...GRUPOS_SISTEMA, ...rubricas.map((r) => r.grupo)])];
  const grupos = Object.fromEntries(codigos.map((g) => [g, doGrupo(g)])) as Record<GrupoEncargo, TotaisPorRegime>;

  const totalDe = (regime: keyof TotaisPorRegime): number | null => {
    let soma = 0;
    for (const g of codigos) {
      const v = grupos[g][regime];
      if (v == null) return null;
      soma += v;
    }
    return arredondar(soma, 4);
  };

  return { ...grupos, total: { horista: totalDe('horista'), mensalista: totalDe('mensalista') } } as TotaisEncargos;
}

/**
 * O escalar que a cadeia de preço consome, para um regime.
 *
 * `null` quando falta resposta — e aí quem chama cai no degrau seguinte da
 * herança, exatamente como o `coalesce` de `fn_custo_hora_folha`. Zero é uma
 * resposta possível e diferente: rubricas todas ativas e todas zeradas.
 */
export function totalEncargos(
  rubricas: readonly RubricaEncargo[],
  regime: RegimeEncargos
): number | null {
  const t = totaisEncargos(rubricas);
  return regime === 'Horista' ? t.total.horista : t.total.mensalista;
}
