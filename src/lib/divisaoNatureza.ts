import type { ItemProposta } from '../types';
import type { ModalidadeProposta } from './materiaisProposta';

/**
 * Divisão do valor da proposta pela NATUREZA do custo: mão de obra, material,
 * serviço terceirizado.
 *
 * Substitui a divisão pela categoria do ITEM, que respondia outra pergunta.
 * Com os serviços cadastrados como serviço próprio, quase tudo caía numa linha
 * só — "Serviços próprios" —, e o cliente não via quanto do preço era mão de
 * obra e quanto era material, que é o que ele pergunta.
 *
 * Quem abre cada item pela composição é o BANCO (`fn_pesos_natureza_item`,
 * migration 20261027233700): ele grava em `itens_proposta.peso_*` o custo de
 * cada natureza, e é com esses pesos que soma o valor gravado da proposta
 * quando a modalidade é "só mão de obra". Aqui só se reparte o valor de cada
 * linha nessas proporções. Fazer a conta de novo no cliente — como era até
 * 27/out/2026 — deixava o PDF e o valor gravado com duas respostas.
 *
 * "Equipamentos e outros" existe porque a betoneira do concreto e uma taxa não
 * são mão de obra nem material; somá-las a qualquer das duas falsearia o
 * número. A linha só aparece quando há valor nela.
 */
export type Natureza = 'Mão de obra' | 'Material' | 'Serviços terceirizados' | 'Equipamentos e outros';

export const ORDEM_NATUREZA: Natureza[] = ['Mão de obra', 'Material', 'Serviços terceirizados', 'Equipamentos e outros'];

/** Natureza de um item SEM composição nenhuma, pela categoria de custo dele. */
export function naturezaDoItem(categoria: string): Natureza {
  switch (categoria) {
    case 'Materiais': return 'Material';
    case 'Mão de Obra':
    case 'Serviços': return 'Mão de obra';
    case 'Terceiros': return 'Serviços terceirizados';
    default: return 'Equipamentos e outros';
  }
}

type ItemComPesos = Pick<ItemProposta, 'id' | 'categoria' | 'pesos'>;

const cent = (n: number) => Math.round(n * 100) / 100;

const somaPesos = (p: ItemProposta['pesos']) => p.maoDeObra + p.material + p.terceirizado + p.outros;

/**
 * A parte de material de uma linha. Espelho EXATO de `fn_material_da_linha`:
 * é a conta que o banco usa para tirar o material do valor gravado, e o
 * documento tem de tirar o mesmo centavo.
 */
export function materialDaLinha(item: ItemComPesos, total: number): number {
  const soma = somaPesos(item.pesos);
  if (soma <= 0) return item.categoria === 'Materiais' ? total : 0;
  return cent(total * (item.pesos.material / soma));
}

/** Valor da linha (sem BDI) que a modalidade contrata — `fn_valor_contratado_linha`. */
export function valorContratadoDaLinha(item: ItemComPesos, total: number, modalidade: ModalidadeProposta | '' | undefined): number {
  return modalidade === 'mao_de_obra' ? cent(total - materialDaLinha(item, total)) : total;
}

/**
 * O que cada modalidade de contratação tira do preço.
 *
 * "Só mão de obra" é o cliente comprando o material: a fatia de material de
 * cada serviço sai do valor. Terceirizados e equipamentos ficam — são execução
 * da contratada, não insumo que o cliente entrega. "Mão de obra e material" é
 * o orçamento inteiro.
 */
export function naturezasForaDaModalidade(modalidade: ModalidadeProposta | '' | undefined): readonly Natureza[] {
  return modalidade === 'mao_de_obra' ? FORA_SO_MAO_DE_OBRA : NADA_FORA;
}
// Referências estáveis: entram em dependência de `useMemo`.
const FORA_SO_MAO_DE_OBRA: readonly Natureza[] = ['Material'];
const NADA_FORA: readonly Natureza[] = [];

export interface LinhaParaDividir {
  item: ItemComPesos;
  /** Valor da linha como vai para o papel (com BDI, se embutido). */
  total: number;
}

/**
 * Reparte o valor de UMA linha pelos pesos, ignorando as naturezas de `fora` —
 * a linha que chega aqui já está sem elas. O resíduo do arredondamento vai
 * para a maior fatia: a linha continua somando exatamente o valor dela.
 */
function partesDaLinha(item: ItemComPesos, total: number, fora: readonly Natureza[]): [Natureza, number][] {
  const pesos: [Natureza, number][] = ([
    ['Mão de obra', item.pesos.maoDeObra],
    ['Material', item.pesos.material],
    ['Serviços terceirizados', item.pesos.terceirizado],
    ['Equipamentos e outros', item.pesos.outros],
  ] as [Natureza, number][]).filter(([n, v]) => v > 0 && !fora.includes(n));
  const soma = pesos.reduce((s, [, v]) => s + v, 0);
  if (soma <= 0) return total === 0 ? [] : [[naturezaDoItem(item.categoria), cent(total)]];

  const partes = pesos.map(([n, v]) => [n, cent(total * (v / soma))] as [Natureza, number]);
  const residuo = cent(total - partes.reduce((s, [, v]) => s + v, 0));
  if (residuo !== 0) {
    const maior = partes.reduce((a, b) => (b[1] > a[1] ? b : a));
    maior[1] = cent(maior[1] + residuo);
  }
  return partes;
}

/** Soma as fatias de todas as linhas, na ordem fixa das naturezas. */
export function dividirPorNatureza(linhas: LinhaParaDividir[], fora: readonly Natureza[] = []): [Natureza, number][] {
  const resultado = new Map<Natureza, number>();
  for (const { item, total } of linhas) {
    for (const [n, v] of partesDaLinha(item, total, fora)) resultado.set(n, cent((resultado.get(n) ?? 0) + v));
  }
  return ORDEM_NATUREZA
    .filter((n) => (resultado.get(n) ?? 0) !== 0)
    .map((n) => [n, cent(resultado.get(n)!)]);
}
