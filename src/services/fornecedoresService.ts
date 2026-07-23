import { supabase } from '../lib/supabaseClient';
import { Fornecedor, CompraFornecedor, CategoriaFornecedor, TipoPessoa } from '../types';
import { onlyDigits } from '../utils/format';

function fromRow(row: {
  id: string; empresa: string; tipo_pessoa: string; cpf: string | null; cnpj: string | null;
  contato: string | null; telefone: string | null; email: string | null;
  categoria: CategoriaFornecedor; cidade: string | null; observacoes: string | null;
  fornece: string[]; avaliacao: number | null; documentos: string[]; ativo: boolean;
}, historicoCompras: CompraFornecedor[]): Fornecedor {
  const tipoPessoa = (row.tipo_pessoa === 'CPF' ? 'CPF' : 'CNPJ') as TipoPessoa;
  return {
    id: row.id,
    empresa: row.empresa,
    tipoPessoa,
    cpfCnpj: (tipoPessoa === 'CPF' ? row.cpf : row.cnpj) ?? '',
    contato: row.contato ?? '',
    telefone: row.telefone ?? '',
    email: row.email ?? '',
    categoria: row.categoria,
    cidade: row.cidade ?? '',
    observacoes: row.observacoes ?? '',
    fornece: row.fornece ?? [],
    documentos: row.documentos,
    // The DB keeps avaliacao null for "não avaliado"; the UI models that as 0.
    avaliacao: row.avaliacao ?? 0,
    ativo: row.ativo,
    historicoCompras,
  };
}

/** Splits the single masked document into the dedicated cpf/cnpj columns. */
function documentoColumns(fornecedor: Fornecedor) {
  const doc = fornecedor.cpfCnpj.trim() || null;
  return {
    tipo_pessoa: fornecedor.tipoPessoa,
    cpf: fornecedor.tipoPessoa === 'CPF' ? doc : null,
    cnpj: fornecedor.tipoPessoa === 'CNPJ' ? doc : null,
  };
}

function writableColumns(fornecedor: Fornecedor) {
  return {
    empresa: fornecedor.empresa,
    ...documentoColumns(fornecedor),
    contato: fornecedor.contato,
    telefone: fornecedor.telefone,
    email: fornecedor.email,
    categoria: fornecedor.categoria,
    cidade: fornecedor.cidade,
    observacoes: fornecedor.observacoes,
    fornece: fornecedor.fornece,
    // 0 means "não avaliado" in the UI, but the DB check is `between 1 and 5`.
    avaliacao: fornecedor.avaliacao > 0 ? fornecedor.avaliacao : null,
    documentos: fornecedor.documentos,
  };
}

export const fornecedoresService = {
  async list(): Promise<Fornecedor[]> {
    const [{ data: fornecedores, error: fornError }, { data: compras, error: comprasError }] = await Promise.all([
      // Alphabetical: this tab is read as an address book, not as a feed.
      supabase.from('fornecedores').select('*').order('empresa', { ascending: true }),
      // v_compras_fornecedor unifies fornecedor purchase history from the single
      // lancamentos_financeiros ledger (business-rule fix #2 — no separate table).
      supabase.from('v_compras_fornecedor').select('*').order('data', { ascending: false }),
    ]);
    if (fornError) throw fornError;
    if (comprasError) throw comprasError;

    const comprasByFornecedor = new Map<string, CompraFornecedor[]>();
    for (const c of compras) {
      const list = comprasByFornecedor.get(c.fornecedor_id) ?? [];
      list.push({ id: c.id, data: c.data, item: c.item, valor: c.valor, pago: c.pago, contaId: c.conta_id });
      comprasByFornecedor.set(c.fornecedor_id, list);
    }

    return fornecedores.map((f) => fromRow(f, comprasByFornecedor.get(f.id) ?? []));
  },

  /**
   * Looks for an existing supplier holding the same document, comparing digits
   * only so mask differences don't hide a duplicate. Backs the friendly error
   * shown before the DB's fornecedores_documento_unico index would reject it.
   */
  async findByDocumento(cpfCnpj: string, ignoreId?: string): Promise<Fornecedor | null> {
    const digits = onlyDigits(cpfCnpj);
    if (!digits) return null;

    const { data, error } = await supabase.from('fornecedores').select('*');
    if (error) throw error;

    const match = data.find(
      (f) => f.id !== ignoreId && onlyDigits(f.cnpj ?? f.cpf ?? '') === digits
    );
    return match ? fromRow(match, []) : null;
  },

  async add(fornecedor: Fornecedor): Promise<Fornecedor> {
    const { data, error } = await supabase
      .from('fornecedores')
      .insert({ id: fornecedor.id, ...writableColumns(fornecedor), ativo: true })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data, []);
  },

  async update(fornecedor: Fornecedor): Promise<Fornecedor> {
    const { data, error } = await supabase
      .from('fornecedores')
      .update(writableColumns(fornecedor))
      .eq('id', fornecedor.id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data, fornecedor.historicoCompras);
  },

  /**
   * Soft delete — the normal way to retire a supplier. A hard delete would set
   * lancamentos_financeiros.fornecedor_id to null (on delete set null), silently
   * orphaning the purchase history, so the UI only offers `remove` for suppliers
   * that have none.
   */
  async setAtivo(id: string, ativo: boolean): Promise<void> {
    const { error } = await supabase.from('fornecedores').update({ ativo }).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('fornecedores').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Registers a purchase as a real lancamento_financeiro (fix #2 — single
   * ledger, no separate historico_compras table). Caller supplies which conta
   * pays for it via compra.contaId (explicit selector in the Fornecedores UI).
   */
  async addCompra(fornecedorId: string, compra: CompraFornecedor): Promise<void> {
    const { error } = await supabase.from('lancamentos_financeiros').insert({
      id: compra.id,
      tipo: 'Despesa',
      descricao: compra.item,
      valor: compra.valor,
      data: compra.data,
      categoria: 'Fornecedores',
      pago: compra.pago,
      conta_id: compra.contaId,
      fornecedor_id: fornecedorId,
    });
    if (error) throw error;
  },

  async togglePago(compraId: string, nextPago: boolean): Promise<void> {
    const { error } = await supabase.from('lancamentos_financeiros').update({ pago: nextPago }).eq('id', compraId);
    if (error) throw error;
  },
};
