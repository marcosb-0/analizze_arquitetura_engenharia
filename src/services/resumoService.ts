import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import type { DesvioCategoria, EtapaAtrasada, MedicaoRecente, ResumoObra } from '../types';

function medicaoFromRow(m: {
  id: string; projeto_id: string; etapa_id: string; etapa_nome: string | null;
  data_medicao: string; percentual_medido: number; valor_medido: number;
  observacoes: string | null; status: MedicaoRecente['status'];
}): MedicaoRecente {
  return {
    id: m.id,
    projetoId: m.projeto_id,
    etapaId: m.etapa_id,
    etapaNome: m.etapa_nome ?? undefined,
    dataMedicao: m.data_medicao,
    percentualMedido: m.percentual_medido,
    valorMedido: m.valor_medido,
    observacoes: m.observacoes ?? '',
    status: m.status,
  };
}

/**
 * As leituras agregadas do §4.2 (migração 20260804110000).
 *
 * O que este arquivo substitui: o painel e a lista de obras baixavam
 * `v_itens_orcamento`, `v_etapas_cronograma`, `etapa_orcamento_vinculo`,
 * `medicoes_obra` e `medicao_item_orcamento` INTEIRAS — todas as obras — para
 * somar no cliente. Aqui o volume passa a ser proporcional ao número de OBRAS, e
 * não ao número de itens de orçamento × medições × vínculos.
 *
 * `listAFaturar` chegou depois, com a peça 2: não é agregado, é a leitura
 * estreita que sobrou para o Financeiro quando `useMedicoes` foi escopado pela
 * obra aberta. Está aqui porque lê a mesma view do feed, e não porque seja da
 * mesma natureza.
 *
 * `buscarTudo` em todas menos o feed, porque todas continuam sendo listas: uma
 * linha por obra, por categoria estourada, por etapa vencida, por boletim a
 * faturar. São ordens de grandeza menores, mas "menor" não é "menor que 1000" —
 * a lição do §4.2 é justamente que teto arbitrário volta a morder (ver o
 * `.limit(10000)` que saiu de `documentosService`).
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
   * Os boletins que ainda podem virar receita — a leitura do Financeiro.
   *
   * `valor_medido > 0` é o filtro que importa e vem do servidor: o fan-out para
   * `medicao_item_orcamento` só acontece na APROVAÇÃO, e rejeitar depois o
   * desfaz. Boletim pendente ou rejeitado tem valor zero por construção, então o
   * filtro numérico e o de status dizem a mesma coisa — os dois estão aqui
   * porque um deles é a regra e o outro é a consequência, e daqui a um ano
   * ninguém lembra qual.
   *
   * O que NÃO dá para filtrar aqui é "já faturado": isso vive em
   * `lancamentos_financeiros`, que `PainelFinanceiro` já tem carregado. Cruzar no
   * servidor exigiria uma view sobre o razão, e o razão tem matriz de acesso
   * própria (§11.8) — a view teria de escolher entre mentir para `gestao` ou
   * abrir o razão para ele. Fica no cliente, sobre uma lista já estreita.
   */
  async listAFaturar(): Promise<MedicaoRecente[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('v_medicao_recente')
        .select('*')
        .eq('status', 'Aprovada')
        .gt('valor_medido', 0)
        .order('data_medicao', { ascending: false })
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(medicaoFromRow);
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
    return (data ?? []).map(medicaoFromRow);
  },
};
