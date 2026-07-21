import { CategoriaCusto, ItemOrcamento } from '../types';

/**
 * Fonte única para criar um item de orçamento — usada tanto pelo modal manual
 * do console da obra quanto pela vinculação a partir do catálogo. Garante ID
 * consistente (crypto.randomUUID, nunca `orc-item-${Date.now()}`) e defaults
 * previsíveis: `valorContratado` NÃO é igualado a `valorOrcado` automaticamente
 * (contratação é uma decisão explícita) e `valorExecutado` começa em 0 (é
 * sempre derivado das medições no servidor).
 */
export function buildOrcamentoItem(input: {
  projetoId: string;
  categoria: CategoriaCusto;
  descricao: string;
  valorOrcado: number;
  valorContratado?: number;
  fornecedorId?: string;
  catalogoInsumoId?: string;
}): ItemOrcamento {
  return {
    id: crypto.randomUUID(),
    projetoId: input.projetoId,
    categoria: input.categoria,
    descricao: input.descricao,
    valorOrcado: input.valorOrcado,
    valorContratado: input.valorContratado ?? 0,
    valorExecutado: 0,
    fornecedorId: input.fornecedorId,
    catalogoInsumoId: input.catalogoInsumoId,
  };
}
