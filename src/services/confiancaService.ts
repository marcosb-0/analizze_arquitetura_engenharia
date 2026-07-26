import { supabase } from '../lib/supabaseClient';
import { FatiaConfiancaPreco } from '../types';

/**
 * Composição de um orçamento por firmeza de preço.
 *
 * O agrupamento é feito no banco (v_confianca_orcamento_obra /
 * v_confianca_proposta, 20260726234500): somar isso no cliente exigiria baixar
 * todos os insumos da obra só para agregar, e o número tem que bater com o que
 * a planilha mostra — `preco_unitario` é GENERATED, então a soma tem de sair da
 * mesma coluna.
 */
type LinhaConfianca = {
  nivel: number;
  fonte: string;
  itens: number;
  valor: number | null;
  idade_media_dias: number | null;
};

function fromRow(r: LinhaConfianca): FatiaConfiancaPreco {
  return {
    nivel: r.nivel as FatiaConfiancaPreco['nivel'],
    fonte: r.fonte as FatiaConfiancaPreco['fonte'],
    itens: r.itens,
    valor: r.valor ?? 0,
    idadeMediaDias: r.idade_media_dias ?? undefined,
  };
}

export const confiancaService = {
  async doProjeto(projetoId: string): Promise<FatiaConfiancaPreco[]> {
    const { data, error } = await supabase
      .from('v_confianca_orcamento_obra')
      .select('nivel, fonte, itens, valor, idade_media_dias')
      .eq('projeto_id', projetoId)
      .order('nivel', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(fromRow);
  },

  async daProposta(propostaId: string): Promise<FatiaConfiancaPreco[]> {
    const { data, error } = await supabase
      .from('v_confianca_proposta')
      .select('nivel, fonte, itens, valor, idade_media_dias')
      .eq('proposta_id', propostaId)
      .order('nivel', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(fromRow);
  },
};
