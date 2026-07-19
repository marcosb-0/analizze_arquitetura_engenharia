import { supabase } from '../lib/supabaseClient';
import { ContaFinanceira, LancamentoFinanceiro } from '../types';

function contaFromRow(row: {
  id: string; nome: string; banco: string | null; tipo: ContaFinanceira['tipo']; saldo_inicial: number; saldo_atual: number;
}): ContaFinanceira {
  return {
    id: row.id,
    nome: row.nome,
    banco: row.banco ?? '',
    tipo: row.tipo,
    saldoInicial: row.saldo_inicial,
    saldoAtual: row.saldo_atual,
  };
}

function lancamentoFromRow(row: {
  id: string; tipo: LancamentoFinanceiro['tipo']; descricao: string; valor: number; data: string;
  categoria: LancamentoFinanceiro['categoria']; pago: boolean; conta_id: string; projeto_id: string | null;
  funcionario_id: string | null; fornecedor_id: string | null; competencia: string | null;
}): LancamentoFinanceiro {
  return {
    id: row.id,
    tipo: row.tipo,
    descricao: row.descricao,
    valor: row.valor,
    data: row.data,
    categoria: row.categoria,
    pago: row.pago,
    contaId: row.conta_id,
    projetoId: row.projeto_id ?? undefined,
    funcionarioId: row.funcionario_id ?? undefined,
    fornecedorId: row.fornecedor_id ?? undefined,
    competencia: row.competencia ?? undefined,
  };
}

export const financeiroService = {
  async listContas(): Promise<ContaFinanceira[]> {
    // saldo_atual is always derived (fix #3) — never a value the app writes to.
    const { data, error } = await supabase.from('v_contas_financeiras').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data.map(contaFromRow);
  },

  async listLancamentos(): Promise<LancamentoFinanceiro[]> {
    const { data, error } = await supabase.from('lancamentos_financeiros').select('*').order('data', { ascending: false });
    if (error) throw error;
    return data.map(lancamentoFromRow);
  },

  async addConta(conta: ContaFinanceira): Promise<ContaFinanceira> {
    const { error } = await supabase.from('contas_financeiras').insert({
      id: conta.id,
      nome: conta.nome,
      banco: conta.banco,
      tipo: conta.tipo,
      saldo_inicial: conta.saldoInicial,
    });
    if (error) throw error;
    return { ...conta, saldoAtual: conta.saldoInicial };
  },

  async addLancamento(lan: LancamentoFinanceiro): Promise<LancamentoFinanceiro> {
    const { data, error } = await supabase
      .from('lancamentos_financeiros')
      .insert({
        id: lan.id,
        tipo: lan.tipo,
        descricao: lan.descricao,
        valor: lan.valor,
        data: lan.data,
        categoria: lan.categoria,
        pago: lan.pago,
        conta_id: lan.contaId,
        projeto_id: lan.projetoId,
        funcionario_id: lan.funcionarioId,
        fornecedor_id: lan.fornecedorId,
        competencia: lan.competencia,
      })
      .select()
      .single();
    if (error) throw error;
    return lancamentoFromRow(data);
  },

  async setPago(id: string, pago: boolean): Promise<void> {
    const { error } = await supabase.from('lancamentos_financeiros').update({ pago }).eq('id', id);
    if (error) throw error;
  },

  async removeLancamento(id: string): Promise<void> {
    const { error } = await supabase.from('lancamentos_financeiros').delete().eq('id', id);
    if (error) throw error;
  },
};
