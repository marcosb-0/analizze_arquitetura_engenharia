import { ItemRevisaoProposta, RevisaoProposta } from '../types';

/**
 * Diferença entre duas versões congeladas da proposta.
 *
 * O comparador antigo só sabia dizer "de R$ 120.000 para R$ 145.000" — o número
 * mudava e ninguém sabia por quê. Com o snapshot de itens dá para responder o
 * que realmente importa numa negociação: o que entrou, o que saiu, o que mudou
 * de quantidade e o que mudou de preço.
 */

export type TipoMudanca = 'adicionado' | 'removido' | 'quantidade' | 'preco' | 'quantidade-e-preco';

export interface LinhaDiff {
  chave: string;
  descricao: string;
  unidade: string;
  tipo: TipoMudanca;
  antes?: ItemRevisaoProposta;
  depois?: ItemRevisaoProposta;
  /** Impacto no total desta linha: positivo encarece, negativo barateia. */
  deltaTotal: number;
}

export interface DiffRevisoes {
  linhas: LinhaDiff[];
  inalterados: number;
  /** false quando nenhuma das versões tem composição congelada. */
  comparavel: boolean;
  /** true quando só uma das versões tem snapshot — o diff fica enviesado. */
  parcial: boolean;
  deltaValor: number;
  deltaPercentual: number;
  deltaBdi: number;
}

/**
 * Chave de pareamento. O insumo do catálogo é a identidade mais estável;
 * item avulso cai na descrição, que é o que o usuário digitou e reconhece.
 * O id da linha de `itens_proposta` não serve: o snapshot não guarda vínculo
 * com ele justamente para sobreviver à exclusão do item original.
 */
function chaveDoItem(item: ItemRevisaoProposta): string {
  return item.catalogoInsumoId ?? `avulso:${item.descricao.trim().toLowerCase()}`;
}

const centavos = (n: number) => Math.round(n * 100);

export function compararRevisoes(revA: RevisaoProposta, revB: RevisaoProposta): DiffRevisoes {
  const deltaValor = revB.valor - revA.valor;

  const mapaA = new Map(revA.itens.map((i) => [chaveDoItem(i), i]));
  const mapaB = new Map(revB.itens.map((i) => [chaveDoItem(i), i]));

  const linhas: LinhaDiff[] = [];
  let inalterados = 0;

  for (const [chave, antes] of mapaA) {
    const depois = mapaB.get(chave);
    if (!depois) {
      linhas.push({
        chave,
        descricao: antes.descricao,
        unidade: antes.unidade,
        tipo: 'removido',
        antes,
        deltaTotal: -antes.total,
      });
      continue;
    }

    // Comparar em centavos evita que 0.1 + 0.2 marque um item como alterado.
    const mudouQtd = centavos(antes.quantidade) !== centavos(depois.quantidade);
    const mudouPreco = centavos(antes.precoUnitario) !== centavos(depois.precoUnitario);

    if (!mudouQtd && !mudouPreco) {
      inalterados += 1;
      continue;
    }

    linhas.push({
      chave,
      descricao: depois.descricao,
      unidade: depois.unidade,
      tipo: mudouQtd && mudouPreco ? 'quantidade-e-preco' : mudouQtd ? 'quantidade' : 'preco',
      antes,
      depois,
      deltaTotal: depois.total - antes.total,
    });
  }

  for (const [chave, depois] of mapaB) {
    if (mapaA.has(chave)) continue;
    linhas.push({
      chave,
      descricao: depois.descricao,
      unidade: depois.unidade,
      tipo: 'adicionado',
      depois,
      deltaTotal: depois.total,
    });
  }

  // Maior impacto financeiro primeiro — é por onde se explica a diferença.
  linhas.sort((a, b) => Math.abs(b.deltaTotal) - Math.abs(a.deltaTotal));

  const temA = revA.itens.length > 0;
  const temB = revB.itens.length > 0;

  return {
    linhas,
    inalterados,
    comparavel: temA || temB,
    parcial: temA !== temB,
    deltaValor,
    deltaPercentual: revA.valor > 0 ? (deltaValor / revA.valor) * 100 : 0,
    deltaBdi: revB.bdiPercentual - revA.bdiPercentual,
  };
}

export const ROTULO_MUDANCA: Record<TipoMudanca, string> = {
  adicionado: 'Incluído',
  removido: 'Removido',
  quantidade: 'Quantidade',
  preco: 'Preço',
  'quantidade-e-preco': 'Qtd. e preço',
};
