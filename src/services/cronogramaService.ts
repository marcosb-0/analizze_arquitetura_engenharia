import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import {
  EdicaoEtapa,
  EtapaCronograma,
  EtapaOrcamentoVinculo,
  Dependencia,
  MudancasCronograma,
} from '../types';

/** O que `v_etapas_cronograma` devolve, com a árvore da EAP já resolvida. */
interface LinhaEtapa {
  id: string;
  projeto_id: string;
  nome: string;
  data_inicio: string | null;
  data_fim: string | null;
  responsavel_id: string | null;
  parent_id: string | null;
  ordem: number;
  eh_marco: boolean;
  agendamento: 'manual' | 'automatico';
  baseline_inicio: string | null;
  baseline_fim: string | null;
  baseline_em: string | null;
  updated_at: string;
  nivel: number;
  wbs_codigo: string;
  eh_folha: boolean;
  inicio_efetivo: string | null;
  fim_efetivo: string | null;
  percentual_executado: number;
  status: EtapaCronograma['status'];
}

function fromRow(row: LinhaEtapa): EtapaCronograma {
  return {
    id: row.id,
    projetoId: row.projeto_id,
    nome: row.nome,
    dataInicio: row.data_inicio ?? '',
    dataFim: row.data_fim ?? '',
    responsavelId: row.responsavel_id ?? '',
    percentualExecutado: row.percentual_executado,
    status: row.status,
    parentId: row.parent_id ?? '',
    ordem: row.ordem,
    ehMarco: row.eh_marco,
    agendamento: row.agendamento,
    baselineInicio: row.baseline_inicio ?? '',
    baselineFim: row.baseline_fim ?? '',
    baselineEm: row.baseline_em ?? '',
    nivel: row.nivel,
    wbsCodigo: row.wbs_codigo,
    ehFolha: row.eh_folha,
    inicioEfetivo: row.inicio_efetivo ?? '',
    fimEfetivo: row.fim_efetivo ?? '',
    updatedAt: row.updated_at,
  };
}

/**
 * O token de concorrência que `fn_aplicar_cronograma` confere: o carimbo mais
 * recente entre as etapas da obra.
 *
 * Sai das linhas que a tela já tem — nenhuma consulta a mais. `null` numa obra
 * sem etapas, que é o caso em que não há nada com que conflitar.
 */
export function versaoDoCronograma(etapas: EtapaCronograma[]): string | null {
  let maior: string | null = null;
  for (const e of etapas) {
    if (e.updatedAt && (maior === null || e.updatedAt > maior)) maior = e.updatedAt;
  }
  return maior;
}

function dependenciaFromRow(row: {
  id: string; projeto_id: string; predecessora_id: string; sucessora_id: string;
  tipo: Dependencia['tipo']; atraso_dias: number;
}): Dependencia {
  return {
    id: row.id,
    projetoId: row.projeto_id,
    predecessoraId: row.predecessora_id,
    sucessoraId: row.sucessora_id,
    tipo: row.tipo,
    atrasoDias: row.atraso_dias,
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
    //
    // A ordem é `ordem_path` desde 20260809100000, e a troca NÃO é cosmética:
    // com hierarquia, ordenar por `data_inicio` intercala pais e filhos entre os
    // blocos de 1000 de `buscarTudo`, e a árvore chega pela metade — sem erro
    // nenhum, porque cada bloco é uma resposta válida. `ordem_path` é a
    // pré-ordem da EAP e é total dentro de uma obra; `id` desempata.
    const linhas = await buscarTudo<LinhaEtapa>((de, ate) =>
      supabase
        .from('v_etapas_cronograma')
        .select('*')
        .eq('projeto_id', projetoId)
        .order('ordem_path', { ascending: true })
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
    // `eh_folha` desde 20260809100000: um grupo da EAP não é carga de ninguém.
    // Sem o filtro, o encarregado apareceria com "Estrutura" MAIS as quatro
    // frentes dentro dela — o mesmo trabalho contado cinco vezes.
    const linhas = await buscarTudo<LinhaEtapa>((de, ate) =>
      supabase
        .from('v_etapas_cronograma')
        .select('*')
        .eq('eh_folha', true)
        .neq('status', 'Concluído')
        .order('data_inicio', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(fromRow);
  },

  /**
   * `ordem` NÃO é enviada de propósito: `trg_etapa_ordem_padrao` coloca a etapa
   * no fim da lista de irmãos. Calcular a posição aqui exigiria que a tela
   * tivesse a lista completa e acertasse a corrida com outra aba abrindo a mesma
   * obra — e o preço do erro é uma violação de unique na cara do usuário.
   */
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
        parent_id: etapa.parentId || null,
        eh_marco: etapa.ehMarco,
      })
      .select()
      .single();
    if (error) throw error;
    // A tabela não tem as colunas derivadas da árvore — elas moram na view. Os
    // valores abaixo são o estado de uma etapa recém-criada, e o chamador relê
    // a view logo em seguida (ver useCronograma): quem manda é o refetch.
    return fromRow({
      ...data,
      nivel: 0,
      wbs_codigo: '',
      eh_folha: true,
      inicio_efetivo: data.data_inicio,
      fim_efetivo: data.data_fim,
      percentual_executado: 0,
      status: 'Não Iniciado',
    });
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
      eh_marco?: boolean;
      agendamento?: 'manual' | 'automatico';
    } = {};
    if (patch.nome !== undefined) payload.nome = patch.nome;
    if (patch.dataInicio !== undefined) payload.data_inicio = patch.dataInicio || null;
    if (patch.dataFim !== undefined) payload.data_fim = patch.dataFim || null;
    if (patch.responsavelId !== undefined) payload.responsavel_id = patch.responsavelId || null;
    if (patch.ehMarco !== undefined) payload.eh_marco = patch.ehMarco;
    if (patch.agendamento !== undefined) payload.agendamento = patch.agendamento;
    // `parent_id` e `ordem` NÃO entram aqui: mover na EAP renumera os irmãos, e
    // o unique é deferrable — as N linhas precisam da mesma transação. Ver
    // `aplicar`.

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
  async listComVinculos(
    projetoId: string
  ): Promise<[EtapaCronograma[], EtapaOrcamentoVinculo[], Dependencia[]]> {
    const etapas = await cronogramaService.list(projetoId);
    const vinculos = await cronogramaService.listVinculos(etapas.map((e) => e.id));
    // As dependências entram no mesmo par consistente pelo mesmo motivo dos
    // vínculos: uma aresta cujo nó não veio é uma seta apontando para o nada, e
    // o forward pass a descartaria em silêncio.
    const dependencias = await cronogramaService.listDependencias(projetoId);
    return [etapas, vinculos, dependencias];
  },

  /**
   * Aplica um diff de cronograma — datas e posição na EAP — numa transação só.
   *
   * Existe porque as duas escritas que o Gantt produz são intrinsecamente
   * múltiplas: reordenar renumera a lista de irmãos, e arrastar uma barra move a
   * etapa MAIS as sucessoras dela. Em chamadas separadas, uma falha no meio
   * deixa o cronograma com uma ligação que as próprias datas contradizem.
   *
   * `garantirEscrita` não se aplica aqui, e a ausência é deliberada: aquele
   * helper conta linhas de um `.update()` do PostgREST, e a contagem que importa
   * agora é por CONJUNTO e dentro da transação — mudou para o `get diagnostics`
   * da função (20260809100000). A RPC devolve erro quando a conta não fecha, e o
   * `throw` abaixo é o que o chamador trata.
   *
   * O retorno é autoritativo: traz `wbs_codigo`, `eh_folha`, `nivel` e `status`
   * recalculados pela view. O chamador troca o estado local por ele em vez de
   * manter o palpite otimista.
   */
  async aplicar(
    projetoId: string,
    mudancas: MudancasCronograma,
    versao: string | null
  ): Promise<{ etapas: EtapaCronograma[]; dependencias: Dependencia[] }> {
    const { data, error } = await supabase.rpc('fn_aplicar_cronograma', {
      p_projeto_id: projetoId,
      p_mudancas: {
        etapas: (mudancas.etapas ?? []).map((p) => ({
          id: p.id,
          data_inicio: p.dataInicio || null,
          data_fim: p.dataFim || null,
          agendamento: p.agendamento ?? null,
          eh_marco: p.ehMarco ?? null,
        })),
        ordens: (mudancas.ordens ?? []).map((p) => ({
          id: p.id,
          parent_id: p.parentId,
          ordem: p.ordem,
        })),
        // `projeto_id` não vai no payload de propósito: a RPC usa o parâmetro,
        // para um payload forjado não conseguir criar aresta em outra obra.
        dep_criadas: (mudancas.depCriadas ?? []).map((d) => ({
          id: d.id,
          predecessora_id: d.predecessoraId,
          sucessora_id: d.sucessoraId,
          tipo: d.tipo,
          atraso_dias: d.atrasoDias,
        })),
        dep_removidas: mudancas.depRemovidas ?? [],
      },
      p_versao: versao,
    });
    if (error) throw error;
    return {
      etapas: (data.etapas as LinhaEtapa[]).map(fromRow),
      dependencias: (data.dependencias ?? []).map(dependenciaFromRow),
    };
  },

  /**
   * As ligações da obra. Tabela própria com `projeto_id` denormalizado, então
   * o filtro é direto — sem o salto pela etapa que custou `fn_has_etapa_access`
   * em 20260804100000.
   */
  async listDependencias(projetoId: string): Promise<Dependencia[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('etapa_dependencia')
        .select('*')
        .eq('projeto_id', projetoId)
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(dependenciaFromRow);
  },

  /**
   * Congela o plano vigente como linha de base. Devolve quantas etapas foram
   * carimbadas — zero significa obra sem etapa, não falha silenciosa: a RPC dá
   * `raise` quando o papel não pode escrever.
   */
  async salvarBaseline(projetoId: string): Promise<number> {
    const { data, error } = await supabase.rpc('fn_salvar_baseline', {
      p_projeto_id: projetoId,
    });
    if (error) throw error;
    return data;
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
