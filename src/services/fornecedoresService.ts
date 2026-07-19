import { supabase } from '../lib/supabaseClient';
import { Fornecedor, CompraFornecedor, CategoriaFornecedor } from '../types';

function fromRow(row: {
  id: string; empresa: string; cnpj: string | null; contato: string | null; telefone: string | null;
  email: string | null; categoria: CategoriaFornecedor; avaliacao: number | null; documentos: string[];
}, historicoCompras: CompraFornecedor[]): Fornecedor {
  return {
    id: row.id,
    empresa: row.empresa,
    cnpj: row.cnpj ?? '',
    contato: row.contato ?? '',
    telefone: row.telefone ?? '',
    email: row.email ?? '',
    categoria: row.categoria,
    documentos: row.documentos,
    avaliacao: row.avaliacao ?? 0,
    historicoCompras,
  };
}

export const fornecedoresService = {
  async list(): Promise<Fornecedor[]> {
    const [{ data: fornecedores, error: fornError }, { data: compras, error: comprasError }] = await Promise.all([
      supabase.from('fornecedores').select('*').order('created_at', { ascending: false }),
      // v_compras_fornecedor unifies fornecedor purchase history from the single
      // lancamentos_financeiros ledger (business-rule fix #2 — no separate table).
      supabase.from('v_compras_fornecedor').select('*').order('data', { ascending: false }),
    ]);
    if (fornError) throw fornError;
    if (comprasError) throw comprasError;

    const comprasByFornecedor = new Map<string, CompraFornecedor[]>();
    for (const c of compras) {
      const list = comprasByFornecedor.get(c.fornecedor_id) ?? [];
      list.push({ id: c.id, data: c.data, item: c.item, valor: c.valor, pago: c.pago });
      comprasByFornecedor.set(c.fornecedor_id, list);
    }

    return fornecedores.map((f) => fromRow(f, comprasByFornecedor.get(f.id) ?? []));
  },

  async add(fornecedor: Fornecedor): Promise<Fornecedor> {
    const { data, error } = await supabase
      .from('fornecedores')
      .insert({
        id: fornecedor.id,
        empresa: fornecedor.empresa,
        cnpj: fornecedor.cnpj,
        contato: fornecedor.contato,
        telefone: fornecedor.telefone,
        email: fornecedor.email,
        categoria: fornecedor.categoria,
        avaliacao: fornecedor.avaliacao,
        documentos: fornecedor.documentos,
        ativo: true,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data, []);
  },

  async update(fornecedor: Fornecedor): Promise<Fornecedor> {
    const { data, error } = await supabase
      .from('fornecedores')
      .update({
        empresa: fornecedor.empresa,
        cnpj: fornecedor.cnpj,
        contato: fornecedor.contato,
        telefone: fornecedor.telefone,
        email: fornecedor.email,
        categoria: fornecedor.categoria,
        avaliacao: fornecedor.avaliacao,
        documentos: fornecedor.documentos,
      })
      .eq('id', fornecedor.id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data, fornecedor.historicoCompras);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('fornecedores').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Registers a purchase as a real lancamento_financeiro (fix #2 — single
   * ledger, no separate historico_compras table). No conta picker exists yet
   * in the Fornecedores UI, so this defaults to the oldest active conta;
   * Stage 5 (EmpresaTab/financeiro migration) will add an explicit selector.
   */
  async addCompra(fornecedorId: string, compra: CompraFornecedor): Promise<void> {
    const { data: conta, error: contaError } = await supabase
      .from('contas_financeiras')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (contaError) throw contaError;
    if (!conta) throw new Error('Nenhuma conta financeira cadastrada. Cadastre uma conta em Gestão da Empresa antes de registrar compras.');

    const { error } = await supabase.from('lancamentos_financeiros').insert({
      id: compra.id,
      tipo: 'Despesa',
      descricao: compra.item,
      valor: compra.valor,
      data: compra.data,
      categoria: 'Fornecedores',
      pago: compra.pago,
      conta_id: conta.id,
      fornecedor_id: fornecedorId,
    });
    if (error) throw error;
  },

  async togglePago(compraId: string, nextPago: boolean): Promise<void> {
    const { error } = await supabase.from('lancamentos_financeiros').update({ pago: nextPago }).eq('id', compraId);
    if (error) throw error;
  },
};
