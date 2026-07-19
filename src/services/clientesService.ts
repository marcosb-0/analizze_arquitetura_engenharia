import { supabase } from '../lib/supabaseClient';
import { Cliente } from '../types';

function fromRow(row: {
  id: string; nome: string; cpf_cnpj: string | null; telefone: string | null; email: string | null;
  endereco: string | null; responsavel: string | null; observacoes: string | null; documentos: string[];
}): Cliente {
  return {
    id: row.id,
    nome: row.nome,
    cpfCnpj: row.cpf_cnpj ?? '',
    telefone: row.telefone ?? '',
    email: row.email ?? '',
    endereco: row.endereco ?? '',
    responsavel: row.responsavel ?? '',
    observacoes: row.observacoes ?? '',
    documentos: row.documentos,
  };
}

export const clientesService = {
  async list(): Promise<Cliente[]> {
    const { data, error } = await supabase.from('clientes').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(fromRow);
  },

  async add(cliente: Cliente): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .insert({
        id: cliente.id,
        nome: cliente.nome,
        cpf_cnpj: cliente.cpfCnpj,
        telefone: cliente.telefone,
        email: cliente.email,
        endereco: cliente.endereco,
        responsavel: cliente.responsavel,
        observacoes: cliente.observacoes,
        documentos: cliente.documentos,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) throw error;
  },
};
