import { supabase } from '../lib/supabaseClient';
import { Funcionario } from '../types';

function fromRow(row: {
  id: string; nome: string; cargo: string; cpf: string | null; telefone: string | null; email: string | null;
  data_admissao: string | null; documentos: string[]; status: 'Ativo' | 'Inativo'; observacoes: string | null;
  salario_base: number | null;
}): Funcionario {
  return {
    id: row.id,
    nome: row.nome,
    cargo: row.cargo,
    cpf: row.cpf ?? '',
    telefone: row.telefone ?? '',
    email: row.email ?? '',
    dataAdmissao: row.data_admissao ?? '',
    documentos: row.documentos,
    status: row.status,
    observacoes: row.observacoes ?? '',
    salarioBase: row.salario_base ?? undefined,
  };
}

export const funcionariosService = {
  async list(): Promise<Funcionario[]> {
    const { data, error } = await supabase.from('funcionarios').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(fromRow);
  },

  async add(func: Funcionario): Promise<Funcionario> {
    const { data, error } = await supabase
      .from('funcionarios')
      .insert({
        id: func.id,
        nome: func.nome,
        cargo: func.cargo,
        cpf: func.cpf,
        telefone: func.telefone,
        email: func.email,
        data_admissao: func.dataAdmissao || null,
        documentos: func.documentos,
        status: func.status,
        observacoes: func.observacoes,
        salario_base: func.salarioBase ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async updateStatus(id: string, status: Funcionario['status']): Promise<void> {
    const { error } = await supabase.from('funcionarios').update({ status }).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('funcionarios').delete().eq('id', id);
    if (error) throw error;
  },
};
