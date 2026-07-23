import { supabase } from '../lib/supabaseClient';
import { Cliente, TipoPessoa } from '../types';
import { composeEndereco } from '../utils/format';

function fromRow(row: {
  id: string; nome: string; tipo_pessoa: string | null; cpf_cnpj: string | null;
  telefone: string | null; email: string | null; endereco: string | null;
  logradouro: string | null; numero: string | null; bairro: string | null;
  cidade: string | null; cep: string | null; responsavel: string | null;
  observacoes: string | null; documentos: string[];
}): Cliente {
  const tipoPessoa: TipoPessoa = row.tipo_pessoa === 'CPF' ? 'CPF' : 'CNPJ';
  const logradouro = row.logradouro ?? '';
  const numero = row.numero ?? '';
  const bairro = row.bairro ?? '';
  const cidade = row.cidade ?? '';
  const cep = row.cep ?? '';
  const hasPartes = logradouro || numero || bairro || cidade || cep;
  return {
    id: row.id,
    nome: row.nome,
    tipoPessoa,
    cpfCnpj: row.cpf_cnpj ?? '',
    telefone: row.telefone ?? '',
    email: row.email ?? '',
    logradouro,
    numero,
    bairro,
    cidade,
    cep,
    // Prefer a fresh composition from the structured parts; fall back to the
    // legacy free-text value for rows saved before the split.
    endereco: hasPartes
      ? composeEndereco({ logradouro, numero, bairro, cidade, cep })
      : (row.endereco ?? ''),
    responsavel: tipoPessoa === 'CPF' ? '' : (row.responsavel ?? ''),
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
        tipo_pessoa: cliente.tipoPessoa,
        cpf_cnpj: cliente.cpfCnpj,
        telefone: cliente.telefone,
        email: cliente.email,
        endereco: cliente.endereco,
        logradouro: cliente.logradouro,
        numero: cliente.numero,
        bairro: cliente.bairro,
        cidade: cliente.cidade,
        cep: cliente.cep,
        responsavel: cliente.responsavel,
        observacoes: cliente.observacoes,
        documentos: cliente.documentos,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async update(cliente: Cliente): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .update({
        nome: cliente.nome,
        tipo_pessoa: cliente.tipoPessoa,
        cpf_cnpj: cliente.cpfCnpj,
        telefone: cliente.telefone,
        email: cliente.email,
        endereco: cliente.endereco,
        logradouro: cliente.logradouro,
        numero: cliente.numero,
        bairro: cliente.bairro,
        cidade: cliente.cidade,
        cep: cliente.cep,
        responsavel: cliente.responsavel,
        observacoes: cliente.observacoes,
        documentos: cliente.documentos,
      })
      .eq('id', cliente.id)
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
