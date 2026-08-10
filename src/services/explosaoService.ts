import { supabase } from '../lib/supabaseClient';
import { LinhaExplosaoInsumo } from '../types';

/**
 * Consumo real de insumos de uma obra.
 *
 * A curva ABC que já existe roda sobre `insumos_projeto`, que é o que foi
 * CONTRATADO — para uma composição isso é uma linha só ("alvenaria, 300 m²").
 * Esta consulta expande as composições até os insumos finais e agrega, que é a
 * pergunta de compras: quantos tijolos, quantos sacos, quantas horas.
 *
 * Tudo no banco (`obra_explosao_insumos`), e não por preferência: a expansão é
 * recursiva e a precificação usa `fn_preco_vigente`, que é `SECURITY DEFINER` e
 * o cliente não consegue reproduzir. Uma soma daqui seria uma segunda conta
 * incapaz de bater com a primeira por construção.
 */
export const explosaoService = {
  async daObra(projetoId: string): Promise<LinhaExplosaoInsumo[]> {
    const { data, error } = await supabase.rpc('obra_explosao_insumos', { p_projeto_id: projetoId });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      insumoId: r.insumo_id,
      descricao: r.descricao,
      unidade: r.unidade,
      categoria: r.categoria,
      quantidade: r.quantidade,
      precoUnitario: r.preco_unitario,
      precoFonte: r.preco_fonte,
      custo: r.custo,
      hh: r.hh,
      participacao: r.participacao,
      custoAcumulado: r.custo_acumulado,
      classeAbc: r.classe_abc,
      origens: r.origens,
    }));
  },
};
