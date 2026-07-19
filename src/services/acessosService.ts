import { supabase } from '../lib/supabaseClient';
import { Acesso, RoleAcesso } from '../types';

function fromRow(row: {
  id: string; email: string | null; full_name: string | null; role: string;
  funcionario_id: string | null; active: boolean; created_at: string;
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

export const acessosService = {
  async list(): Promise<Acesso[]> {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(fromRow);
  },

  async updateRole(id: string, role: RoleAcesso): Promise<void> {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    if (error) throw error;
  },

  async updateActive(id: string, active: boolean): Promise<void> {
    const { error } = await supabase.from('profiles').update({ active }).eq('id', id);
    if (error) throw error;
  },

  async updateFuncionarioLink(id: string, funcionarioId: string | null): Promise<void> {
    const { error } = await supabase.from('profiles').update({ funcionario_id: funcionarioId }).eq('id', id);
    if (error) throw error;
  },
};
