import { supabase } from '../lib/supabaseClient';
import { centrosCustoService } from './centrosCustoService';
import { buscarTudo } from './paginacao';
import type { CustoPorCentro } from '../types';

export interface CompromissoControle {
  id: string;
  projetoId: string;
  etapaId: string;
  descricao: string;
  valor: number;
  criadoEm: string;
}

/** Leituras existentes, sem copiar custo realizado para outra tabela. */
export const controladoriaService = {
  async carregar(): Promise<{ custos: CustoPorCentro[]; compromissos: CompromissoControle[] }> {
    const [custos, linhas] = await Promise.all([
      centrosCustoService.custoPorCentro(),
      buscarTudo((de, ate) =>
        supabase.from('compromissos_custo')
          .select('id, projeto_id, etapa_id, descricao, valor, criado_em')
          .eq('situacao', 'Ativo')
          .order('criado_em', { ascending: false })
          .order('id', { ascending: true })
          .range(de, ate)
      ),
    ]);
    return {
      custos,
      compromissos: linhas.map((linha) => ({
        id: linha.id,
        projetoId: linha.projeto_id,
        etapaId: linha.etapa_id,
        descricao: linha.descricao,
        valor: linha.valor,
        criadoEm: linha.criado_em,
      })),
    };
  },
};
