import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { DadosPagamento, Funcionario, TipoChavePix, TipoConta } from '../types';

function fromRow(row: {
  id: string; nome: string; cargo: string; cpf: string | null; telefone: string | null; email: string | null;
  data_admissao: string | null; status: 'Ativo' | 'Inativo'; observacoes: string | null;
  salario_base: number | null;
  pix_tipo: string | null; pix_chave: string | null; banco: string | null; agencia: string | null;
  conta: string | null; tipo_conta: string | null; titular: string | null;
  catalogo_mao_de_obra_id: string | null;
}): Funcionario {
  return {
    id: row.id,
    nome: row.nome,
    cargo: row.cargo,
    cpf: row.cpf ?? '',
    telefone: row.telefone ?? '',
    email: row.email ?? '',
    dataAdmissao: row.data_admissao ?? '',
    status: row.status,
    observacoes: row.observacoes ?? '',
    salarioBase: row.salario_base ?? undefined,
    dadosPagamento: {
      // O banco já restringe os valores por check; o cast só reconcilia o
      // `text` que vem do PostgREST com a união do TypeScript.
      pixTipo: (row.pix_tipo as TipoChavePix | null) ?? undefined,
      pixChave: row.pix_chave ?? undefined,
      banco: row.banco ?? undefined,
      agencia: row.agencia ?? undefined,
      conta: row.conta ?? undefined,
      tipoConta: (row.tipo_conta as TipoConta | null) ?? undefined,
      titular: row.titular ?? undefined,
    },
    catalogoMaoDeObraId: row.catalogo_mao_de_obra_id ?? undefined,
  };
}

/**
 * Campos de pagamento no formato de escrita. String vazia vira null: um PIX
 * "apagado" pela ficha tem de sumir do banco, não virar chave em branco que
 * a folha exibiria como se existisse.
 */
function pagamentoParaLinha(dados: DadosPagamento | undefined) {
  // Genérico para preservar as uniões de pix_tipo e tipo_conta: um
  // `(v?: string) => string | null` alargaria os dois para `string` e a
  // checagem contra o tipo da coluna se perderia.
  const limpo = <T extends string>(v?: T) => (v && v.trim() ? (v.trim() as T) : null);
  return {
    pix_tipo: limpo(dados?.pixTipo),
    pix_chave: limpo(dados?.pixChave),
    banco: limpo(dados?.banco),
    agencia: limpo(dados?.agencia),
    conta: limpo(dados?.conta),
    tipo_conta: limpo(dados?.tipoConta),
    titular: limpo(dados?.titular),
  };
}

export const funcionariosService = {
  async list(): Promise<Funcionario[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('funcionarios')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(fromRow);
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
        status: func.status,
        observacoes: func.observacoes,
        salario_base: func.salarioBase ?? null,
        catalogo_mao_de_obra_id: func.catalogoMaoDeObraId || null,
        ...pagamentoParaLinha(func.dadosPagamento),
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async update(func: Funcionario): Promise<Funcionario> {
    const { data, error } = await supabase
      .from('funcionarios')
      .update({
        nome: func.nome,
        cargo: func.cargo,
        cpf: func.cpf,
        telefone: func.telefone,
        email: func.email,
        data_admissao: func.dataAdmissao || null,
        observacoes: func.observacoes,
        salario_base: func.salarioBase ?? null,
        catalogo_mao_de_obra_id: func.catalogoMaoDeObraId || null,
        ...pagamentoParaLinha(func.dadosPagamento),
      })
      .eq('id', func.id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  /**
   * Desligamento. Não existe remove(): o DELETE está revogado no banco para
   * não zerar a autoria em cronograma/projetos/lancamentos/profiles.
   */
  async updateStatus(id: string, status: Funcionario['status']): Promise<void> {
    const { data, error } = await supabase.from('funcionarios').update({ status }).eq('id', id).select('id');
    if (error) throw error;
    // Desligamento que não persiste é o pior caso desta classe de bug: a ficha
    // aparece como inativa e a pessoa segue no sistema.
    garantirEscrita(data, semPermissao('alterar a situação deste colaborador'));
  },

  async updateSalario(id: string, salarioBase: number | null): Promise<void> {
    const { data, error } = await supabase
      .from('funcionarios').update({ salario_base: salarioBase }).eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('alterar o salário deste colaborador'));
  },
};
