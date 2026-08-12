import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { Acesso, RoleAcesso } from '../types';

function fromRow(row: {
  id: string; email: string | null; full_name: string | null; role: string;
  funcionario_id: string | null; active: boolean; aprovado_em: string | null;
  created_at: string;
}): Acesso {
  return {
    id: row.id,
    email: row.email ?? '',
    fullName: row.full_name ?? '',
    role: row.role as RoleAcesso,
    funcionarioId: row.funcionario_id ?? undefined,
    active: row.active,
    aprovadoEm: row.aprovado_em ?? undefined,
    createdAt: row.created_at,
  };
}

export const acessosService = {
  async list(): Promise<Acesso[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase.from('profiles').select('*')
        .order('created_at', { ascending: false }).order('id', { ascending: true }).range(de, ate)
    );
    return linhas.map(fromRow);
  },

  async updateRole(id: string, role: RoleAcesso): Promise<void> {
    const { data, error } = await supabase.from('profiles').update({ role }).eq('id', id).select('id');
    if (error) throw error;
    // Desde 20260802100000 há também uma trigger que recusa a troca de papel por
    // não-admin; a checagem aqui cobre o caso em que a RLS barra antes dela.
    garantirEscrita(data, semPermissao('alterar o perfil de acesso'));
  },

  async updateActive(id: string, active: boolean): Promise<void> {
    const { data, error } = await supabase.from('profiles').update({ active }).eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('ativar ou desativar este acesso'));
  },

  async updateFuncionarioLink(id: string, funcionarioId: string | null): Promise<void> {
    const { data, error } = await supabase
      .from('profiles').update({ funcionario_id: funcionarioId }).eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('vincular um colaborador a este acesso'));
  },
};
