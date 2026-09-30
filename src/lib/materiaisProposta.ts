import type { ComponenteItemProposta, FolhaComposicao, ItemProposta, SecaoProposta } from '../types';

export const TITULO_MODALIDADE = 'Modalidade de contratação';
export const MODALIDADES = {
  mao_de_obra: {
    rotulo: 'Só mão de obra',
    texto: 'Execução de mão de obra. Os materiais são fornecidos pelo cliente e não integram o fornecimento da contratada.',
  },
  mao_de_obra_material: {
    rotulo: 'Mão de obra e material',
    texto: 'Execução de mão de obra e fornecimento dos materiais previstos no orçamento e nas composições desta proposta.',
  },
} as const;
export type ModalidadeProposta = keyof typeof MODALIDADES;

export function modalidadeDaProposta(secoes: SecaoProposta[]): ModalidadeProposta | '' {
  const secao = secoes.find(s => s.titulo === TITULO_MODALIDADE);
  return (Object.keys(MODALIDADES) as ModalidadeProposta[]).find(m => MODALIDADES[m].texto === secao?.corpo) ?? '';
}

export interface MaterialProposta {
  chave: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  origens: string[];
}

/**
 * Quantidade da atividade × coeficiente, descendo a composição até os insumos
 * finais.
 *
 * Duas fontes, nesta ordem de precedência:
 *  1. A composição ADAPTADA à proposta (`componentes`), quando o item tem uma —
 *     é ela que foi orçada, com os coeficientes ajustados para esta obra.
 *  2. A composição do CATÁLOGO (`folhas`), para o item que veio do catálogo sem
 *     cópia e para o componente que é ele próprio uma composição (a argamassa
 *     dentro do emboço). Sem isto, a PROP-2026-001 listava a demolição — só mão
 *     de obra — como "material" de 52 m², e cimento, areia e cal, que moram no
 *     2º nível, não apareciam nunca.
 *
 * Unidades diferentes não são convertidas e o arredondamento ocorre apenas na
 * apresentação.
 */
export function calcularMateriaisProposta(
  itens: ItemProposta[],
  componentes: ComponenteItemProposta[],
  folhas: FolhaComposicao[] = []
) {
  const materiais = new Map<string, MaterialProposta>();
  const pendencias: string[] = [];
  const folhasPorRaiz = new Map<string, FolhaComposicao[]>();
  for (const f of folhas) folhasPorRaiz.set(f.raizId, [...(folhasPorRaiz.get(f.raizId) ?? []), f]);
  const normalizar = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
  const adicionar = (descricao: string, unidade: string, quantidade: number, origem: string, id?: string) => {
    if (!Number.isFinite(quantidade) || quantidade < 0 || !unidade.trim()) {
      pendencias.push(`${origem}: quantidade ou unidade inválida`);
      return;
    }
    if (quantidade === 0) return;
    const chave = JSON.stringify([id ?? normalizar(descricao), normalizar(unidade)]);
    const anterior = materiais.get(chave);
    if (anterior) {
      anterior.quantidade += quantidade;
      if (!anterior.origens.includes(origem)) anterior.origens.push(origem);
    } else materiais.set(chave, { chave, descricao, unidade, quantidade, origens: [origem] });
  };
  /** Explode uma composição do catálogo. Devolve false se ela não é composição. */
  const explodir = (catalogoId: string | undefined, quantidade: number, origem: string) => {
    const lista = catalogoId ? folhasPorRaiz.get(catalogoId) : undefined;
    if (!lista) return false;
    for (const f of lista) {
      if (f.categoria === 'Material') adicionar(f.descricao, f.unidade, quantidade * f.coeficiente, origem, f.insumoId);
    }
    return true;
  };
  for (const item of itens) {
    const linhas = componentes.filter(c => c.itemPropostaId === item.id);
    if (item.qtdComponentes > 0) {
      if (linhas.length !== item.qtdComponentes) pendencias.push(`${item.descricao}: composição incompleta`);
      for (const c of linhas) {
        const quantidade = item.quantidade * c.coeficiente;
        // Qualquer componente pode ser composição no catálogo — é o caso da
        // argamassa, cadastrada como Serviço. Material simples não tem folhas.
        if (explodir(c.catalogoInsumoId, quantidade, item.descricao)) continue;
        if (c.categoria === 'Material') adicionar(c.descricao, c.unidade, quantidade, item.descricao, c.catalogoInsumoId);
        else if (c.categoria === 'Serviço') pendencias.push(`${item.descricao}: conferir materiais do serviço “${c.descricao}”`);
      }
    } else if (explodir(item.catalogoInsumoId, item.quantidade, item.descricao)) {
      // Veio do catálogo sem cópia: a composição de lá responde. Se ela não
      // tem material nenhum (demolição, só mão de obra), não há o que listar.
    } else if (item.categoria === 'Materiais') {
      // Verba não é quantidade de material: "1 vb de hidráulica" no
      // quantitativo passaria por item comprável.
      if (normalizar(item.unidade) === 'vb') pendencias.push(`${item.descricao}: material em verba, sem quantitativo`);
      else adicionar(item.descricao, item.unidade, item.quantidade, item.descricao, item.catalogoInsumoId);
    } else if (item.categoria === 'Mão de Obra' || item.categoria === 'Terceiros') {
      pendencias.push(`${item.descricao}: sem composição de materiais`);
    }
  }
  return { materiais: [...materiais.values()].sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')), pendencias: [...new Set(pendencias)] };
}
