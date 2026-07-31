import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { Acesso, ProjetoEquipeMembro, RoleAcesso } from '../types';

function fromRow(row: { id: string; projeto_id: string; profile_id: string; papel: string | null }): ProjetoEquipeMembro {
  return { id: row.id, projetoId: row.projeto_id, profileId: row.profile_id, papel: row.papel ?? undefined };
}

function perfilFromRow(row: {
  id: string; email: string | null; full_name: string | null; role: string; funcionario_id: string | null; active: boolean; created_at: string;
}): Acesso {
  return {
    id: row.id,
    email: row.email ?? '',
    fullName: row.full_name ?? '',
    role: row.role as RoleAcesso,
    funcionarioId: row.funcionario_id ?? undefined,
    active: row.active,
    createdAt: row.created_at,
  };
}

export const projetoEquipeService = {
  async list(): Promise<ProjetoEquipeMembro[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase.from('projeto_equipe').select('*').order('id', { ascending: true }).range(de, ate)
    );
    return linhas.map(fromRow);
  },

  // Only the 'campo' role is actually gated by projeto_equipe (see
  // fn_has_projeto_access) — admin/gestao/financeiro always have blanket
  // access, so assigning them here would be a no-op. Scoped to keep the
  // picker meaningful.
  async listPerfisCampo(): Promise<Acesso[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase.from('profiles').select('*').eq('role', 'campo').eq('active', true)
        .order('id', { ascending: true }).range(de, ate)
    );
    return linhas.map(perfilFromRow);
  },

  async add(projetoId: string, profileId: string, papel: string): Promise<ProjetoEquipeMembro> {
    const { data, error } = await supabase
      .from('projeto_equipe')
      .insert({ projeto_id: projetoId, profile_id: profileId, papel: papel || null })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async remove(id: string): Promise<void> {
    const { data, error } = await supabase.from('projeto_equipe').delete().eq('id', id).select('id');
    if (error) throw error;
    // Revogação de acesso à obra: se não persistir, o usuário `campo` continua
    // enxergando e medindo a obra da qual foi retirado.
    garantirEscrita(data, semPermissao('remover o acesso deste membro à obra'));
  },
};
