import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
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
    const [fornecedores, compras] = await Promise.all([
      // Alphabetical: this tab is read as an address book, not as a feed.
      buscarTudo((de, ate) =>
        supabase
          .from('fornecedores')
          .select('*')
          .order('empresa', { ascending: true })
          .order('id', { ascending: true })
          .range(de, ate)
      ),
      // v_compras_fornecedor unifies fornecedor purchase history from the single
      // lancamentos_financeiros ledger (business-rule fix #2 — no separate table).
      // É um recorte do razão, então cresce com ele: truncada, o histórico de
      // compras de um fornecedor aparece incompleto sem nada indicar.
      buscarTudo((de, ate) =>
        supabase
          .from('v_compras_fornecedor')
          .select('*')
          .order('data', { ascending: false })
          .order('id', { ascending: true })
          .range(de, ate)
      ),
    ]);

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

    /**
     * Consulta indexada, não varredura no cliente.
     *
     * Antes era `select('*')` da tabela INTEIRA a cada `add` e a cada `update`,
     * para comparar dígitos em memória. Dois problemas: O(n) por salvamento e,
     * pior, acima de 1000 fornecedores o corte silencioso do PostgREST fazia a
     * checagem FALHAR sem avisar — justamente a checagem que existe para dar uma
     * mensagem amigável antes de o índice único recusar com erro cru.
     *
     * `documento_digitos` é coluna GENERATED com a mesma normalização de
     * `onlyDigits` (ver 20260803100002), com índice próprio.
     */
    let query = supabase
      .from('fornecedores')
      .select('*')
      .eq('documento_digitos', digits)
      .limit(1);
    if (ignoreId) query = query.neq('id', ignoreId);

    const { data, error } = await query;
    if (error) throw error;
    return data && data.length > 0 ? fromRow(data[0], []) : null;
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
    const { data, error } = await supabase.from('fornecedores').update({ ativo }).eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('ativar ou inativar fornecedores'));
  },

  async remove(id: string): Promise<void> {
    const { data, error } = await supabase.from('fornecedores').delete().eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('excluir fornecedores'));
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
    const { data, error } = await supabase
      .from('lancamentos_financeiros').update({ pago: nextPago }).eq('id', compraId).select('id');
    if (error) throw error;
    // `gestao` não tem política em lancamentos_financeiros: sem esta checagem a
    // compra aparecia como paga na agenda do fornecedor e o razão seguia intacto.
    garantirEscrita(data, semPermissao('alterar o pagamento desta compra'));
  },
};
