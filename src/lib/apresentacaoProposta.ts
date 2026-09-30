/**
 * Como o documento impresso da proposta mostra o orçamento.
 *
 * Só apresentação: nenhuma opção muda valor. O total impresso é sempre
 * `valorCalculado`, e esconder o preço unitário ou o detalhamento não tira
 * nada da soma — só deixa de mostrar como ela foi formada.
 *
 * Grava em `propostas.apresentacao_documento` (jsonb). Chave ausente cai no
 * padrão, então uma proposta anterior a 20260930000051 (`{}`) imprime o mesmo
 * documento de sempre: planilha item a item, resumo por categoria e
 * quantitativo de materiais.
 */

/** Quanto do orçamento o cliente vê. */
export type NivelDetalhe = 'global' | 'categoria' | 'itens';

export interface ApresentacaoDocumento {
  nivel: NivelDetalhe;
  /** No nível `itens`: preço unitário e total por linha. Sem ele, só as quantidades. */
  precoUnitario: boolean;
  /** No nível `itens`: os insumos de cada serviço, com a quantidade — nunca o custo. */
  composicao: boolean;
  /** O quantitativo consolidado de materiais. */
  materiais: boolean;
  /** No nível `itens`: o bloco "Composição por categoria" abaixo da planilha. */
  resumoCategoria: boolean;
}

export const APRESENTACAO_PADRAO: ApresentacaoDocumento = {
  nivel: 'itens',
  precoUnitario: true,
  composicao: false,
  materiais: true,
  resumoCategoria: true,
};

export const NIVEIS_DETALHE: readonly { valor: NivelDetalhe; rotulo: string; dica: string }[] = [
  { valor: 'global', rotulo: 'Preço global', dica: 'Só o valor total, sem abrir o orçamento' },
  { valor: 'categoria', rotulo: 'Por categoria', dica: 'Um valor por categoria de serviço' },
  { valor: 'itens', rotulo: 'Serviço a serviço', dica: 'A planilha com cada serviço' },
];

/**
 * Lê o jsonb do banco sem confiar nele: chave de tipo errado ou desconhecida
 * vira o padrão, em vez de derrubar a prévia de uma proposta.
 */
export function lerApresentacao(bruto: unknown): ApresentacaoDocumento {
  const o = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : {};
  const bool = (k: keyof ApresentacaoDocumento) =>
    typeof o[k] === 'boolean' ? (o[k] as boolean) : (APRESENTACAO_PADRAO[k] as boolean);
  const nivel = NIVEIS_DETALHE.some((n) => n.valor === o.nivel) ? (o.nivel as NivelDetalhe) : APRESENTACAO_PADRAO.nivel;
  return {
    nivel,
    precoUnitario: bool('precoUnitario'),
    composicao: bool('composicao'),
    materiais: bool('materiais'),
    resumoCategoria: bool('resumoCategoria'),
  };
}

/**
 * O BDI como linha própria só tem onde aparecer quando há valores parciais
 * somando até o total — por categoria ou linha a linha com preço. No preço
 * global, ou na planilha só de quantidades, não existe subtotal para ele
 * separar, e o total já o contém.
 */
export function bdiPodeSerLinha(a: ApresentacaoDocumento): boolean {
  return a.nivel === 'categoria' || (a.nivel === 'itens' && a.precoUnitario);
}

/**
 * Os componentes das composições só precisam ser buscados se alguma parte do
 * documento os mostrar. Sem isso, a prévia do preço global ficava esperando
 * uma consulta cujo resultado não ia para o papel.
 */
export function precisaDeComposicoes(a: ApresentacaoDocumento): boolean {
  return a.materiais || (a.nivel === 'itens' && a.composicao);
}
