import { supabase } from '../lib/supabaseClient';
import { CorCategoriaDocumento, DocumentoCategoria } from '../types';

export const documentoCategoriasService = {
  async list(): Promise<DocumentoCategoria[]> {
    const { data, error } = await supabase.from('documento_categorias').select('*').order('nome', { ascending: true });
    if (error) throw error;
    return data.map((c) => ({ id: c.id, nome: c.nome, cor: c.cor as CorCategoriaDocumento, createdAt: c.created_at }));
  },

  async create(nome: string, cor: CorCategoriaDocumento, userId: string): Promise<DocumentoCategoria> {
    const { data, error } = await supabase
      .from('documento_categorias')
      .insert({ nome, cor, criado_por: userId })
      .select()
      .single();
    if (error) throw error;
    return { id: data.id, nome: data.nome, cor: data.cor as CorCategoriaDocumento, createdAt: data.created_at };
  },

  async update(id: string, patch: { nome?: string; cor?: CorCategoriaDocumento }): Promise<DocumentoCategoria> {
    const { data, error } = await supabase
      .from('documento_categorias')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { id: data.id, nome: data.nome, cor: data.cor as CorCategoriaDocumento, createdAt: data.created_at };
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('documento_categorias').delete().eq('id', id);
    if (error) throw error;
  },
};
