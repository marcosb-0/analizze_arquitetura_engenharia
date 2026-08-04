import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { EdicaoEtapa, EtapaCronograma, EtapaOrcamentoVinculo } from '../types';

function fromRow(row: {
  id: string; projeto_id: string; nome: string; data_inicio: string | null; data_fim: string | null;
  responsavel_id: string | null; percentual_executado: number; status: EtapaCronograma['status'];
}): EtapaCronograma {
  return {
    id: row.id,
    projetoId: row.projeto_id,
    nome: row.nome,
    dataInicio: row.data_inicio ?? '',
    dataFim: row.data_fim ?? '',
    responsavelId: row.responsavel_id ?? '',
    percentualExecutado: row.percentual_executado,
    status: row.status,
  };
}

function vinculoFromRow(row: { id: string; etapa_id: string; item_orcamento_id: string; peso_percentual: number }): EtapaOrcamentoVinculo {
  return { id: row.id, etapaId: row.etapa_id, itemOrcamentoId: row.item_orcamento_id, pesoPercentual: row.peso_percentual };
}

export const cronogramaService = {
  /**
   * O cronograma de UMA obra — item 23, peça 2 (§4.2). Sem caminho global: quem
   * lê etapa linha a linha é o console, e o console abre uma obra por vez.
   */
  async list(projetoId: string): Promise<EtapaCronograma[]> {
    // percentual_executado/status are always derived from medicoes_obra (fix #1)
    // — there is deliberately no direct-write path for either anymore.
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('v_etapas_cronograma')
        .select('*')
        .eq('projeto_id', projetoId)
        .order('data_inicio', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(fromRow);
  },

  /**
   * A ÚNICA leitura de etapa que atravessa obras, e ela é da aba de Equipe: a
   * carga de trabalho de um profissional é a soma das frentes que ele lidera em
   * todas as obras — a pergunta não tem recorte por obra, e escopá-la mudaria a
   * resposta em vez de baratear.
   *
   * O que a torna aceitável é o filtro: etapa concluída não é carga de ninguém,
   * e `EquipeTab` já descartava as concluídas em memória depois de baixar todas.
   * Com o tempo é a maior parte da tabela. É a "leitura explícita" que o §4.2
   * previa, e não sobra do carregamento global.
   */
  async listAtivas(): Promise<EtapaCronograma[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('v_etapas_cronograma')
        .select('*')
        .neq('status', 'Concluído')
        .order('data_inicio', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(fromRow);
  },

  async add(etapa: EtapaCronograma): Promise<EtapaCronograma> {
    const { data, error } = await supabase
      .from('etapas_cronograma')
      .insert({
        id: etapa.id,
        projeto_id: etapa.projetoId,
        nome: etapa.nome,
        data_inicio: etapa.dataInicio || null,
        data_fim: etapa.dataFim || null,
        responsavel_id: etapa.responsavelId || null,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow({ ...data, percentual_executado: 0, status: 'Não Iniciado' });
  },

  /**
   * Só os campos planejados: `percentual_executado` e `status` são derivados das
   * medições em v_etapas_cronograma e não têm caminho de escrita.
   * O `.select()` é o que revela um write recusado pela RLS — ver projetosService.
   */
  async update(id: string, patch: EdicaoEtapa): Promise<void> {
    const payload: {
      nome?: string;
      data_inicio?: string | null;
      data_fim?: string | null;
      responsavel_id?: string | null;
    } = {};
    if (patch.nome !== undefined) payload.nome = patch.nome;
    if (patch.dataInicio !== undefined) payload.data_inicio = patch.dataInicio || null;
    if (patch.dataFim !== undefined) payload.data_fim = patch.dataFim || null;
    if (patch.responsavelId !== undefined) payload.responsavel_id = patch.responsavelId || null;

    const { data, error } = await supabase.from('etapas_cronograma').update(payload).eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Nenhuma linha foi atualizada — seu perfil não tem permissão para editar o cronograma.');
    }
  },

  // Cuidado: `medicoes_obra.etapa_id` tem `on delete cascade`, então apagar uma
  // etapa apaga os boletins dela — e o valor executado das linhas de orçamento
  // cai junto (é derivado de medicao_item_orcamento). Quem chama avisa o usuário.
  async remove(id: string): Promise<void> {
    const { data, error } = await supabase.from('etapas_cronograma').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Nenhuma linha foi excluída — seu perfil não tem permissão para editar o cronograma.');
    }
  },

  /**
   * Os vínculos das etapas informadas.
   *
   * `etapa_orcamento_vinculo` não tem `projeto_id` — o vínculo pertence à etapa,
   * e a obra vem dela. Filtrar por `.in('etapa_id', …)` em vez de um join
   * embutido é escolha, não limitação: o `!inner` do PostgREST amarraria a
   * consulta ao NOME da relação, que muda quando alguém renomeia uma FK, e o
   * modo de falha é uma lista vazia — ou seja, o peso some e o avanço físico
   * cai para média simples sem erro nenhum. Ver `calcularAvancoFisico`.
   *
   * Lista vazia devolve vazio sem ir ao servidor: `.in('etapa_id', [])` é uma
   * ida garantidamente inútil, e acontece em toda obra recém-criada.
   */
  /**
   * Etapas da obra + os vínculos delas, nesta ordem porque a segunda depende dos
   * ids da primeira.
   *
   * Existe para que as duas leituras nunca sejam feitas separadas: um `Promise.all`
   * aqui devolveria vínculos de um conjunto de etapas e etapas de outro. Hoje
   * isso não teria consequência visível, mas o par alimenta `calcularAvancoFisico`
   * — vínculo órfão vira peso perdido, e peso perdido derruba o avanço para média
   * simples sem nenhum erro.
   */
  async listComVinculos(projetoId: string): Promise<[EtapaCronograma[], EtapaOrcamentoVinculo[]]> {
    const etapas = await cronogramaService.list(projetoId);
    const vinculos = await cronogramaService.listVinculos(etapas.map((e) => e.id));
    return [etapas, vinculos];
  },

  async listVinculos(etapaIds: string[]): Promise<EtapaOrcamentoVinculo[]> {
    // Um vínculo perdido silenciosamente muda o PESO do avanço físico da obra —
    // o número continua plausível e passa a estar errado.
    if (etapaIds.length === 0) return [];
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('etapa_orcamento_vinculo')
        .select('*')
        .in('etapa_id', etapaIds)
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(vinculoFromRow);
  },

  async addVinculo(vinculo: EtapaOrcamentoVinculo): Promise<EtapaOrcamentoVinculo> {
    const { data, error } = await supabase
      .from('etapa_orcamento_vinculo')
      .insert({ id: vinculo.id, etapa_id: vinculo.etapaId, item_orcamento_id: vinculo.itemOrcamentoId, peso_percentual: vinculo.pesoPercentual })
      .select()
      .single();
    if (error) throw error;
    return vinculoFromRow(data);
  },

  async removeVinculo(id: string): Promise<void> {
    const { data, error } = await supabase
      .from('etapa_orcamento_vinculo').delete().eq('id', id).select('id');
    if (error) throw error;
    // O peso do vínculo alimenta o avanço físico ponderado: um vínculo que a tela
    // remove e o banco mantém muda o número da obra sem ninguém saber.
    garantirEscrita(data, semPermissao('remover vínculos de orçamento'));
  },
};
