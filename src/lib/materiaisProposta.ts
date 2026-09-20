import type { ComponenteItemProposta, ItemProposta, SecaoProposta } from '../types';

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

/** Quantidade da atividade × coeficiente da composição adaptada à proposta.
 * Não infere materiais de custos ou do catálogo vivo. Unidades diferentes não
 * são convertidas e o arredondamento ocorre apenas na apresentação.
 */
export function calcularMateriaisProposta(itens: ItemProposta[], componentes: ComponenteItemProposta[]) {
  const materiais = new Map<string, MaterialProposta>();
  const pendencias: string[] = [];
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
  for (const item of itens) {
    const linhas = componentes.filter(c => c.itemPropostaId === item.id);
    if (item.qtdComponentes > 0) {
      if (linhas.length !== item.qtdComponentes) pendencias.push(`${item.descricao}: composição incompleta`);
      for (const c of linhas) {
        if (c.categoria === 'Material') adicionar(c.descricao, c.unidade, item.quantidade * c.coeficiente, item.descricao, c.catalogoInsumoId);
        if (c.categoria === 'Serviço') pendencias.push(`${item.descricao}: conferir materiais do serviço “${c.descricao}”`);
      }
    } else if (item.categoria === 'Materiais') {
      adicionar(item.descricao, item.unidade, item.quantidade, item.descricao, item.catalogoInsumoId);
    } else if (item.categoria === 'Mão de Obra' || item.categoria === 'Terceiros') {
      pendencias.push(`${item.descricao}: sem composição de materiais`);
    }
  }
  return { materiais: [...materiais.values()].sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')), pendencias: [...new Set(pendencias)] };
}
