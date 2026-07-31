import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { EdicaoObra, Projeto, ConversaoObraPayload } from '../types';

function fromRow(
  row: {
    id: string; nome: string; cliente_id: string; proposta_id: string | null; responsavel_interno_id: string | null;
    endereco_obra: string | null; data_inicio: string | null; data_fim: string | null; situacao: Projeto['situacao'];
  },
  responsavelNome: string
): Projeto {
  return {
    id: row.id,
    nome: row.nome,
    clienteId: row.cliente_id,
    propostaId: row.proposta_id ?? undefined,
    responsavelInterno: responsavelNome,
    responsavelInternoId: row.responsavel_interno_id ?? undefined,
    enderecoObra: row.endereco_obra ?? '',
    dataInicio: row.data_inicio ?? '',
    dataFim: row.data_fim ?? '',
    situacao: row.situacao,
  };
}

export const projetosService = {
  async list(): Promise<Projeto[]> {
    const [projetos, funcionarios] = await Promise.all([
      buscarTudo((de, ate) =>
        supabase
          .from('projetos')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(de, ate)
      ),
      // Só para resolver o NOME do responsável. Truncada, uma obra passaria a
      // exibir "Não atribuído" para um responsável que existe — erro silencioso
      // e plausível, o pior tipo.
      buscarTudo((de, ate) =>
        supabase.from('funcionarios').select('id, nome').order('id', { ascending: true }).range(de, ate)
      ),
    ]);

    const nomeById = new Map(funcionarios.map((f) => [f.id, f.nome]));
    return projetos.map((p) => fromRow(p, (p.responsavel_interno_id && nomeById.get(p.responsavel_interno_id)) || 'Não atribuído'));
  },

  /**
   * Edição dos dados de planejamento da obra. `situacao` fica de fora de
   * propósito — ela tem seu próprio caminho (updateSituacao), com a confirmação
   * de avanço incompleto na tela.
   */
  async update(id: string, patch: EdicaoObra): Promise<void> {
    const payload: {
      nome?: string;
      cliente_id?: string;
      responsavel_interno_id?: string | null;
      endereco_obra?: string | null;
      data_inicio?: string | null;
      data_fim?: string | null;
    } = {};
    if (patch.nome !== undefined) payload.nome = patch.nome;
    if (patch.clienteId !== undefined) payload.cliente_id = patch.clienteId;
    if (patch.responsavelInternoId !== undefined) payload.responsavel_interno_id = patch.responsavelInternoId || null;
    if (patch.enderecoObra !== undefined) payload.endereco_obra = patch.enderecoObra || null;
    if (patch.dataInicio !== undefined) payload.data_inicio = patch.dataInicio || null;
    if (patch.dataFim !== undefined) payload.data_fim = patch.dataFim || null;

    const { data, error } = await supabase.from('projetos').update(payload).eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Nenhuma linha foi atualizada — seu perfil não tem permissão para editar esta obra.');
    }
  },

  // O `.select()` nos dois writes abaixo não é cosmético: sob RLS, um papel sem
  // política de escrita (financeiro e campo só têm SELECT em projetos) não
  // recebe erro nenhum — o update/delete casa com zero linhas e o PostgREST
  // devolve sucesso. Sem contar as linhas afetadas, a UI removia a obra da tela
  // e comemorava enquanto o banco seguia intacto.
  async updateSituacao(id: string, situacao: Projeto['situacao']): Promise<void> {
    const { data, error } = await supabase.from('projetos').update({ situacao }).eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Nenhuma linha foi atualizada — seu perfil não tem permissão para alterar esta obra.');
    }
  },

  async remove(id: string): Promise<void> {
    const { data, error } = await supabase.from('projetos').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Nenhuma linha foi excluída — seu perfil não tem permissão para excluir esta obra.');
    }
  },

  // Wizard-driven conversion: the projeto/itens/etapas/vínculos come from the
  // payload the user reviewed, not from fixed percentages. See
  // fn_criar_projeto_from_proposta — one atomic transaction.
  async convertPropostaWithPayload(propostaId: string, payload: ConversaoObraPayload): Promise<{ id: string }> {
    const { data, error } = await supabase.rpc('fn_criar_projeto_from_proposta', {
      p_proposta_id: propostaId,
      p_payload: {
        nome: payload.nome,
        endereco: payload.endereco || null,
        data_inicio: payload.dataInicio,
        data_fim: payload.dataFim,
        responsavel_id: payload.responsavelId ?? null,
        etapas: payload.etapas.map((e) => ({
          ref: e.ref,
          nome: e.nome,
          data_inicio: e.dataInicio,
          data_fim: e.dataFim,
          responsavel_id: e.responsavelId ?? null,
        })),
        // Quando o item traz a procedência do catálogo, a RPC cria também a
        // linha em insumos_projeto — o quantitativo (quantidade, preço base,
        // ajuste) atravessa a conversão em vez de virar só um total.
        itens: payload.itens.map((it) => ({
          categoria: it.categoria,
          descricao: it.descricao,
          valor_orcado: it.valorOrcado,
          valor_contratado: it.valorContratado,
          etapa_ref: it.etapaRef,
          catalogo_insumo_id: it.catalogoInsumoId ?? null,
          quantidade: it.quantidade ?? null,
          preco_unitario_base: it.precoUnitarioBase ?? null,
          ajuste_tipo: it.ajuste?.tipo ?? 'Nenhum',
          ajuste_valor: it.ajuste?.valor ?? 0,
          ajuste_motivo: it.ajuste?.motivo ?? null,
          fornecedor_id: it.fornecedorId ?? null,
        })),
      },
    });
    if (error) throw error;
    return { id: data.id };
  },

  // Atomic manual creation (projeto + 5 staggered etapas, no orçamento) in one
  // DB transaction. See fn_criar_projeto_manual. The DB generates the id and the
  // stage schedule, so the caller reloads projetos/cronograma afterward.
  async createManual(projeto: Projeto): Promise<{ id: string }> {
    const { data, error } = await supabase.rpc('fn_criar_projeto_manual', {
      p_nome: projeto.nome,
      p_cliente_id: projeto.clienteId,
      p_data_inicio: projeto.dataInicio,
      p_data_fim: projeto.dataFim,
      p_responsavel_id: projeto.responsavelInternoId ?? null,
      p_proposta_id: projeto.propostaId ?? null,
      p_endereco: projeto.enderecoObra || null,
    });
    if (error) throw error;
    return { id: data.id };
  },
};
