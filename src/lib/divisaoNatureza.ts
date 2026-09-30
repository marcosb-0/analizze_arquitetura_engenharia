import type { ComponenteItemProposta, FolhaComposicao, InsumoCatalogo } from '../types';

/**
 * Divisão do valor da proposta pela NATUREZA do custo: mão de obra, material,
 * serviço terceirizado.
 *
 * Substitui a divisão pela categoria do ITEM, que respondia outra pergunta.
 * Com os serviços cadastrados como serviço próprio, quase tudo caía numa linha
 * só — "Serviços próprios" —, e o cliente não via quanto do preço era mão de
 * obra e quanto era material, que é o que ele pergunta.
 *
 * Cada item é aberto pela composição, pesada pelo CUSTO (coeficiente × preço),
 * e o valor de venda da linha é repartido nessa proporção. O BDI entra
 * proporcionalmente junto: a soma das naturezas fecha com a soma das linhas.
 *
 * "Equipamentos e outros" existe porque a betoneira do concreto e uma taxa não
 * são mão de obra nem material; somá-las a qualquer das duas falsearia o
 * número. A linha só aparece quando há valor nela.
 */
export type Natureza = 'Mão de obra' | 'Material' | 'Serviços terceirizados' | 'Equipamentos e outros';

export const ORDEM_NATUREZA: Natureza[] = ['Mão de obra', 'Material', 'Serviços terceirizados', 'Equipamentos e outros'];

/**
 * Natureza de um insumo do catálogo. Um "Serviço" próprio que chega aqui como
 * FOLHA (sem composição por baixo) é execução da própria equipe sem abertura —
 * conta como mão de obra.
 */
export function naturezaDoInsumo(categoria: InsumoCatalogo['categoria']): Natureza {
  switch (categoria) {
    case 'Material': return 'Material';
    case 'Mão de Obra':
    case 'Serviço': return 'Mão de obra';
    case 'Serviço terceirizado': return 'Serviços terceirizados';
    default: return 'Equipamentos e outros';
  }
}

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

type Pesos = Map<Natureza, number>;

const somar = (pesos: Pesos, n: Natureza, v: number) => {
  if (Number.isFinite(v) && v > 0) pesos.set(n, (pesos.get(n) ?? 0) + v);
};

/** Custo de cada natureza nas folhas de UMA composição do catálogo. */
function pesosDasFolhas(folhas: FolhaComposicao[]): Pesos {
  const pesos: Pesos = new Map();
  for (const f of folhas) somar(pesos, naturezaDoInsumo(f.categoria), f.coeficiente * f.precoUnitario);
  return pesos;
}

const totalDe = (p: Pesos) => [...p.values()].reduce((s, v) => s + v, 0);

export interface LinhaParaDividir {
  item: { id: string; categoria: string; catalogoInsumoId?: string; qtdComponentes: number };
  /** Valor da linha como vai para o papel (com BDI, se embutido). */
  total: number;
}

const cent = (n: number) => Math.round(n * 100) / 100;

export function dividirPorNatureza(
  linhas: LinhaParaDividir[],
  componentes: ComponenteItemProposta[],
  folhas: FolhaComposicao[]
): [Natureza, number][] {
  const folhasPorRaiz = new Map<string, FolhaComposicao[]>();
  for (const f of folhas) folhasPorRaiz.set(f.raizId, [...(folhasPorRaiz.get(f.raizId) ?? []), f]);
  const componentesPorItem = new Map<string, ComponenteItemProposta[]>();
  for (const c of componentes) componentesPorItem.set(c.itemPropostaId, [...(componentesPorItem.get(c.itemPropostaId) ?? []), c]);

  const resultado = new Map<Natureza, number>();

  for (const { item, total } of linhas) {
    const pesos: Pesos = new Map();
    const proprios = componentesPorItem.get(item.id) ?? [];

    if (proprios.length > 0) {
      // A composição adaptada à proposta manda — é ela que foi orçada. Um
      // componente que é composição no catálogo (a argamassa dentro do emboço)
      // é aberto pelas folhas dele, com o custo que tem NESTA proposta.
      for (const c of proprios) {
        const custo = c.coeficiente * c.precoUnitario;
        const sub = c.catalogoInsumoId ? folhasPorRaiz.get(c.catalogoInsumoId) : undefined;
        const subPesos = sub ? pesosDasFolhas(sub) : null;
        const subTotal = subPesos ? totalDe(subPesos) : 0;
        if (subPesos && subTotal > 0) {
          for (const [n, v] of subPesos) somar(pesos, n, custo * (v / subTotal));
        } else {
          somar(pesos, naturezaDoInsumo(c.categoria), custo);
        }
      }
    } else if (item.catalogoInsumoId && folhasPorRaiz.has(item.catalogoInsumoId)) {
      for (const [n, v] of pesosDasFolhas(folhasPorRaiz.get(item.catalogoInsumoId)!)) somar(pesos, n, v);
    }

    const soma = totalDe(pesos);
    if (soma <= 0) {
      somar(resultado, naturezaDoItem(item.categoria), total);
      continue;
    }

    // Reparte em centavos e joga o resíduo na maior fatia: a linha continua
    // somando exatamente o valor dela.
    const partes = [...pesos.entries()].map(([n, v]) => [n, cent(total * (v / soma))] as [Natureza, number]);
    const residuo = cent(total - partes.reduce((s, [, v]) => s + v, 0));
    if (residuo !== 0) {
      const maior = partes.reduce((a, b) => (b[1] > a[1] ? b : a));
      maior[1] = cent(maior[1] + residuo);
    }
    for (const [n, v] of partes) resultado.set(n, cent((resultado.get(n) ?? 0) + v));
  }

  return ORDEM_NATUREZA
    .filter((n) => (resultado.get(n) ?? 0) !== 0)
    .map((n) => [n, cent(resultado.get(n)!)]);
}
