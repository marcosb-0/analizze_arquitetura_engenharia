import { supabase } from '../lib/supabaseClient';
import { HHDaEtapa } from '../types';

/**
 * HH previsto de uma etapa do cronograma.
 *
 * `origem` não é decoração: `direto` significa que existe insumo amarrado à
 * etapa e a quantidade é dela; `ponderado` significa que o número saiu do rateio
 * pelo peso do vínculo com o orçamento — e o peso reparte VALOR, não hora. A
 * tela tem de dizer qual dos dois, senão passa uma aproximação como medida.
 */
export const etapaHHService = {
  async daEtapa(etapaId: string): Promise<HHDaEtapa | null> {
    const { data, error } = await supabase.rpc('etapa_hh', { p_etapa_id: etapaId });
    if (error) throw error;
    const r = data?.[0];
    if (!r) return null;
    return {
      hhTotal: r.hh_total,
      custoMaoDeObra: r.custo_mao_de_obra,
      custoTotal: r.custo_total,
      origem: r.origem,
      insumosComHH: r.insumos_com_hh,
      insumosSemHH: r.insumos_sem_hh,
      hhPorCargo: (r.hh_por_cargo ?? []).map((c) => ({
        insumoId: c.insumo_id,
        descricao: c.descricao,
        unidade: c.unidade,
        horas: c.horas,
        custo: c.custo,
      })),
    };
  },
};
