import { supabase } from '../lib/supabaseClient';

export const controleObraService = {
  async carregar(projetoId: string) {
    const [compromissos, revisoes] = await Promise.all([
      supabase.from('compromissos_custo').select('*').eq('projeto_id', projetoId).order('criado_em', { ascending: false }),
      supabase.from('revisoes_plano_obra').select('*').eq('projeto_id', projetoId).order('numero', { ascending: false }),
    ]);
    if (compromissos.error) throw compromissos.error;
    if (revisoes.error) throw revisoes.error;
    return { compromissos: compromissos.data, revisoes: revisoes.data };
  },
  async comprometer(projetoId: string, etapaId: string, descricao: string, valor: number) {
    const { error } = await supabase.from('compromissos_custo').insert({
      projeto_id: projetoId, etapa_id: etapaId, descricao: descricao.trim(), valor,
    });
    if (error) throw error;
  },
  async cancelar(id: string, motivo: string) {
    const { data: usuario } = await supabase.auth.getUser();
    if (!usuario.user) throw new Error('Sessão expirada. Entre novamente.');
    const { data, error } = await supabase.from('compromissos_custo').update({
      situacao: 'Cancelado', cancelado_por: usuario.user.id,
      cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo.trim(),
    }).eq('id', id).eq('situacao', 'Ativo').select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Compromisso não encontrado ou já cancelado.');
  },
  async aprovarPlano(projetoId: string, motivo: string) {
    const { data, error } = await supabase.rpc('fn_aprovar_plano_obra', {
      p_projeto_id: projetoId, p_motivo: motivo.trim(),
    });
    if (error) throw error;
    return data;
  },
};
