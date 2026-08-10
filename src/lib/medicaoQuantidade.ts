import { StatusMedicao } from '../types';

/**
 * A prévia da medição por unidade — "2 m² viram +1,6667% da etapa".
 *
 * **Esta é a segunda cópia da fórmula que vive em `fn_medicao_deriva_percentual`
 * (20260815100000), e é assumida como tal** — mesmo argumento que
 * `src/lib/avanco.ts` usa para a duplicação com `v_resumo_obra`. O número
 * GRAVADO sai sempre do servidor: o cliente omite `percentual_medido` no insert
 * e lê de volta o que o trigger derivou. O que mora aqui serve para a pessoa ver
 * o efeito do que digitou ANTES de mandar, e para o formulário recusar um
 * boletim sem efeito sem gastar uma ida ao banco.
 *
 * As regras estão trancadas dos dois lados: aqui por `medicaoQuantidade.test.ts`
 * e lá pelo comentário longo da migration.
 */

/** Casas decimais de `medicoes_obra.percentual_medido` — `numeric(8,4)`. */
export const CASAS_PERCENTUAL = 4;
/** Casas de `quantidade_medida`/`quantidade_prevista` — `numeric(14,3)`. */
export const CASAS_QUANTIDADE = 3;

/**
 * `round(numeric, n)` do Postgres arredonda meio PARA LONGE DO ZERO. Para os
 * valores positivos daqui isso coincide com `Math.round`, mas a igualdade se
 * apoia na representação binária do produto: num empate exato no 5º decimal
 * (0,00625 → 0,0063) a prévia pode divergir do servidor em 1 ulp. É justamente
 * por isso que o toast de sucesso mostra o percentual que VOLTOU do insert, e
 * não este.
 */
function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  const escalado = valor * fator;
  return (Math.sign(escalado) * Math.round(Math.abs(escalado))) / fator;
}

/** O que a prévia precisa saber de cada boletim já lançado na etapa. */
export interface BoletimMedido {
  percentualMedido: number;
  quantidadeMedida?: number;
  status: StatusMedicao;
}

export interface BaseDaEtapa {
  /**
   * Quantidade acumulada sobre TUDO que não foi rejeitado (Pendente ∪
   * Aprovada), que é a base sobre a qual o servidor vai derivar.
   */
  quantidade: number;
  /** Percentual acumulado sobre o MESMO conjunto de `quantidade`. */
  percentual: number;
  /** Só o aprovado — é o que `v_etapas_cronograma.percentual_executado` mostra. */
  quantidadeAprovada: number;
  percentualAprovado: number;
  /** Quanto está lançado esperando aprovação. A diferença entre os dois mundos. */
  quantidadePendente: number;
}

/**
 * A base do acumulado, sobre `status !== 'Rejeitada'`, com as duas somas no
 * MESMO conjunto.
 *
 * Boletim pendente é uma afirmação sobre serviço JÁ EXECUTADO, e o boletim
 * seguinte mede em cima dele; aprovar é decidir sobre CONTABILIZAR, não sobre
 * ter acontecido. Se a base fosse só o aprovado, três boletins de 1/3 lançados
 * na semana e aprovados na sexta leriam base 0 cada um e somariam 99,99.
 *
 * O `?? (percentualMedido / 100) * quantidadePrevista` é o que permite uma etapa
 * GANHAR uma meta depois de já ter boletins em percentual, sem migrar dado: um
 * boletim de 25% numa etapa que hoje declara 100 m² *significa* 25 m². É
 * derivação, não invenção.
 */
export function baseAcumulada(
  boletins: readonly BoletimMedido[],
  quantidadePrevista: number
): BaseDaEtapa {
  const base: BaseDaEtapa = {
    quantidade: 0,
    percentual: 0,
    quantidadeAprovada: 0,
    percentualAprovado: 0,
    quantidadePendente: 0,
  };

  for (const b of boletins) {
    if (b.status === 'Rejeitada') continue;
    const qtd = b.quantidadeMedida ?? (b.percentualMedido / 100) * quantidadePrevista;
    base.quantidade += qtd;
    base.percentual += b.percentualMedido;
    if (b.status === 'Aprovada') {
      base.quantidadeAprovada += qtd;
      base.percentualAprovado += b.percentualMedido;
    } else {
      base.quantidadePendente += qtd;
    }
  }

  return base;
}

export type PreviaMedicao =
  | {
      tipo: 'ok';
      /** O que o boletim vale, já arredondado como o servidor arredondaria. */
      percentual: number;
      /** Onde a etapa fica depois deste boletim. */
      acumuladoPercentual: number;
      acumuladoQuantidade: number;
      /** Passa da meta — some avisar, não bloquear: o gate é a aprovação. */
      excede: boolean;
    }
  /** O delta some no arredondamento: o servidor recusaria, então o form também. */
  | { tipo: 'sem-efeito'; acumuladoPercentual: number; acumuladoQuantidade: number }
  /** Entrada que não é número, é zero ou é negativa — ainda não há o que prever. */
  | { tipo: 'invalida' };

/**
 * Grava o que FALTA para o acumulado bater com a quantidade acumulada, em vez de
 * arredondar o incremento:
 *
 *     percentual := round(100 × (B + q) / P, 4) − S
 *
 * Arredondar cada incremento isoladamente não fecha — 1 de 3, três vezes, dá
 * 33,33 × 3 = 99,99 e a etapa nunca vira "Concluído". Assim a invariante é
 * provável numa frase, sem indução: o acumulado é SEMPRE exatamente
 * `round(100 × quantidade acumulada / prevista, 4)`, porque
 * `S_novo = S + (f(B+q) − S) = f(B+q)`.
 *
 * O efeito colateral bom: uma rejeição no meio é absorvida INTEIRA pelo boletim
 * seguinte, em vez de virar deriva perpétua.
 */
export function preverMedicao(
  base: BaseDaEtapa,
  quantidade: number,
  quantidadePrevista: number
): PreviaMedicao {
  if (!Number.isFinite(quantidade) || quantidade <= 0) return { tipo: 'invalida' };
  if (!Number.isFinite(quantidadePrevista) || quantidadePrevista <= 0) return { tipo: 'invalida' };

  // O banco guarda a quantidade em numeric(14,3): prever sobre o número cru
  // mostraria um percentual que o insert não vai reproduzir.
  const qtd = arredondar(quantidade, CASAS_QUANTIDADE);
  if (qtd <= 0) {
    return {
      tipo: 'sem-efeito',
      acumuladoPercentual: base.percentual,
      acumuladoQuantidade: base.quantidade,
    };
  }

  const acumuladoQuantidade = base.quantidade + qtd;
  const acumuladoPercentual = arredondar(
    (100 * acumuladoQuantidade) / quantidadePrevista,
    CASAS_PERCENTUAL
  );
  const percentual = arredondar(acumuladoPercentual - base.percentual, CASAS_PERCENTUAL);

  if (percentual <= 0) {
    return {
      tipo: 'sem-efeito',
      acumuladoPercentual: base.percentual,
      acumuladoQuantidade: base.quantidade,
    };
  }

  return {
    tipo: 'ok',
    percentual,
    acumuladoPercentual,
    acumuladoQuantidade,
    excede: acumuladoQuantidade > quantidadePrevista,
  };
}

/**
 * Quantidade com as 3 casas do banco e separador brasileiro, sem inventar
 * precisão: 2 vira "2", 2,5 vira "2,5" — arrastar "2,000" pela tela inteira só
 * gera ruído num campo onde a maioria dos valores é inteira.
 */
export function formatarQuantidade(valor: number, unidade?: string): string {
  const numero = valor.toLocaleString('pt-BR', { maximumFractionDigits: CASAS_QUANTIDADE });
  return unidade ? `${numero} ${unidade}` : numero;
}
