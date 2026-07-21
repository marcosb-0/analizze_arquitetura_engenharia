import { supabase } from '../lib/supabaseClient';
import { Projeto, ConversaoObraPayload } from '../types';

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
    const [{ data: projetos, error: projError }, { data: funcionarios, error: funcError }] = await Promise.all([
      supabase.from('projetos').select('*').order('created_at', { ascending: false }),
      supabase.from('funcionarios').select('id, nome'),
    ]);
    if (projError) throw projError;
    if (funcError) throw funcError;

    const nomeById = new Map(funcionarios.map((f) => [f.id, f.nome]));
    return projetos.map((p) => fromRow(p, (p.responsavel_interno_id && nomeById.get(p.responsavel_interno_id)) || 'Não atribuído'));
  },

  async add(projeto: Projeto): Promise<Projeto> {
    const { data, error } = await supabase
      .from('projetos')
      .insert({
        id: projeto.id,
        nome: projeto.nome,
        cliente_id: projeto.clienteId,
        proposta_id: projeto.propostaId,
        responsavel_interno_id: projeto.responsavelInternoId,
        endereco_obra: projeto.enderecoObra,
        data_inicio: projeto.dataInicio || null,
        data_fim: projeto.dataFim || null,
        situacao: projeto.situacao,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data, projeto.responsavelInterno);
  },

  async updateSituacao(id: string, situacao: Projeto['situacao']): Promise<void> {
    const { error } = await supabase.from('projetos').update({ situacao }).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('projetos').delete().eq('id', id);
    if (error) throw error;
  },

  // Atomic proposta -> projeto conversion (projeto + orçamento padrão + cronograma
  // padrão + vínculos, all in one DB transaction). See fn_criar_projeto_padrao.
  async convertProposta(propostaId: string): Promise<{ id: string }> {
    const { data, error } = await supabase.rpc('fn_criar_projeto_padrao', { p_proposta_id: propostaId });
    if (error) throw error;
    return { id: data.id };
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
        itens: payload.itens.map((it) => ({
          categoria: it.categoria,
          descricao: it.descricao,
          valor_orcado: it.valorOrcado,
          valor_contratado: it.valorContratado,
          etapa_ref: it.etapaRef,
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
