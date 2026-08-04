import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import type { DesvioCategoria, EtapaAtrasada, MedicaoRecente, ResumoObra } from '../types';

/**
 * As quatro leituras agregadas do §4.2 (migração 20260804110000).
 *
 * O que este arquivo substitui: o painel e a lista de obras baixavam
 * `v_itens_orcamento`, `v_etapas_cronograma`, `etapa_orcamento_vinculo`,
 * `medicoes_obra` e `medicao_item_orcamento` INTEIRAS — todas as obras — para
 * somar no cliente. Aqui o volume passa a ser proporcional ao número de OBRAS, e
 * não ao número de itens de orçamento × medições × vínculos.
 *
 * `buscarTudo` continua nas três primeiras porque continuam sendo listas: uma
 * linha por obra, por categoria estourada e por etapa vencida. São ordens de
 * grandeza menores, mas "menor" não é "menor que 1000" — a lição do §4.2 é
 * justamente que teto arbitrário volta a morder (ver o `.limit(10000)` que saiu
 * de `documentosService`).
 */
export const resumoService = {
  async listResumos(): Promise<ResumoObra[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('v_resumo_obra')
        .select('*')
        .order('projeto_id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map((r) => ({
      projetoId: r.projeto_id,
      itensTotal: r.itens_total,
      valorOrcado: r.valor_orcado,
      valorContratado: r.valor_contratado,
      valorExecutado: r.valor_executado,
      etapasTotal: r.etapas_total,
      etapasAtrasadas: r.etapas_atrasadas,
      etapasConcluidas: r.etapas_concluidas,
      avancoFisico: r.avanco_fisico,
      medicoesTotal: r.medicoes_total,
      medicoesPendentes: r.medicoes_pendentes,
    }));
  },

  async listDesvios(): Promise<DesvioCategoria[]> {
    // `excesso` desc: o cartão mostra os maiores primeiro, e ordenar aqui evita
    // que cada tela invente a sua ordem. `categoria` é o desempate estável.
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('v_desvio_categoria_obra')
        .select('*')
        .order('excesso', { ascending: false })
        .order('projeto_id', { ascending: true })
        .order('categoria', { ascending: true })
        .range(de, ate)
    );
    return linhas.map((d) => ({
      projetoId: d.projeto_id,
      categoria: d.categoria,
      planejado: d.planejado,
      executado: d.executado,
      excesso: d.excesso,
    }));
  },

  async listAtrasos(): Promise<EtapaAtrasada[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('v_etapa_atrasada')
        .select('*')
        .order('dias_atraso', { ascending: false })
        .order('etapa_id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map((e) => ({
      etapaId: e.etapa_id,
      projetoId: e.projeto_id,
      etapaNome: e.etapa_nome,
      dataFim: e.data_fim,
      diasAtraso: e.dias_atraso,
    }));
  },

  /**
   * O feed do painel, e a única leitura daqui que NÃO é `buscarTudo`.
   *
   * O limite é o ponto: a tela mostra 3 boletins. `buscarTudo` aqui seria
   * exatamente o problema que este arquivo veio resolver.
   */
  async listMedicoesRecentes(limite: number): Promise<MedicaoRecente[]> {
    const { data, error } = await supabase
      .from('v_medicao_recente')
      .select('*')
      .order('data_medicao', { ascending: false })
      .order('id', { ascending: true })
      .limit(limite);
    if (error) throw error;
    return (data ?? []).map((m) => ({
      id: m.id,
      projetoId: m.projeto_id,
      etapaId: m.etapa_id,
      etapaNome: m.etapa_nome ?? undefined,
      dataMedicao: m.data_medicao,
      percentualMedido: m.percentual_medido,
      valorMedido: m.valor_medido,
      observacoes: m.observacoes ?? '',
      status: m.status,
    }));
  },
};
