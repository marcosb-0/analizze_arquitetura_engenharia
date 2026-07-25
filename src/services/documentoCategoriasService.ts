import { supabase } from '../lib/supabaseClient';
import { CorCategoriaDocumento, DocumentoCategoria, EscopoDocumento } from '../types';

const toCategoria = (row: {
  id: string;
  nome: string;
  cor: string;
  escopo: EscopoDocumento;
  created_at: string;
}): DocumentoCategoria => ({
  id: row.id,
  nome: row.nome,
  cor: row.cor as CorCategoriaDocumento,
  escopo: row.escopo,
  createdAt: row.created_at,
});

export const documentoCategoriasService = {
  async list(): Promise<DocumentoCategoria[]> {
    const { data, error } = await supabase.from('documento_categorias').select('*').order('nome', { ascending: true });
    if (error) throw error;
    return data.map(toCategoria);
  },

  async create(
    nome: string,
    cor: CorCategoriaDocumento,
    escopo: EscopoDocumento,
    userId: string
  ): Promise<DocumentoCategoria> {
    const { data, error } = await supabase
      .from('documento_categorias')
      .insert({ nome, cor, escopo, criado_por: userId })
      .select()
      .single();
    if (error) throw error;
    return toCategoria(data);
  },

  async update(id: string, patch: { nome?: string; cor?: CorCategoriaDocumento }): Promise<DocumentoCategoria> {
    const { data, error } = await supabase
      .from('documento_categorias')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toCategoria(data);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('documento_categorias').delete().eq('id', id);
    if (error) throw error;
  },
};
