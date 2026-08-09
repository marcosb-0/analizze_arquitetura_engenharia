import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { EscopoModelo, ModeloTexto, NovoModeloTexto, PosicaoSecao } from '../types';

/**
 * A biblioteca de textos da empresa.
 *
 * MODELO, e não texto emitido: o que entra numa proposta é uma CÓPIA
 * (`proposta_secoes`). Editar um modelo aqui não altera nenhum documento já
 * emitido — exatamente o oposto do que acontecia quando o texto vivia em
 * `empresa_config.texto_escopo` e era lido na hora de imprimir, fazendo uma
 * proposta de junho reimprimir diferente do que o cliente tinha recebido.
 *
 * Excluir não existe de propósito: `aposentar` desliga o `ativo`. As seções já
 * copiadas guardam `modelo_id` como procedência, e um delete faria essa
 * referência virar nula em silêncio.
 */

type LinhaModelo = {
  id: string; titulo: string; corpo: string; categoria: string;
  escopo: EscopoModelo; posicao: PosicaoSecao; ordem: number;
  padrao: boolean; ativo: boolean;
};

function fromRow(row: LinhaModelo): ModeloTexto {
  return {
    id: row.id,
    titulo: row.titulo,
    corpo: row.corpo,
    categoria: row.categoria,
    escopo: row.escopo,
    posicao: row.posicao,
    ordem: row.ordem,
    padrao: row.padrao,
    ativo: row.ativo,
  };
}

export const modelosTextoService = {
  /**
   * Traz os aposentados também. A tela filtra o que oferece para inserção, mas
   * o modo de gerenciamento precisa mostrar o que foi desligado — senão
   * aposentar um modelo por engano vira uma perda sem caminho de volta.
   */
  async list(): Promise<ModeloTexto[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('modelos_texto')
        .select('id, titulo, corpo, categoria, escopo, posicao, ordem, padrao, ativo')
        .order('escopo', { ascending: true })
        .order('categoria', { ascending: true })
        .order('ordem', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(fromRow);
  },

  async add(novo: NovoModeloTexto): Promise<ModeloTexto> {
    const { data, error } = await supabase
      .from('modelos_texto')
      .insert({
        titulo: novo.titulo.trim(),
        corpo: novo.corpo,
        categoria: novo.categoria.trim() || 'Geral',
        escopo: novo.escopo,
        posicao: novo.posicao,
        ordem: novo.ordem,
        padrao: novo.padrao,
      })
      .select('id, titulo, corpo, categoria, escopo, posicao, ordem, padrao, ativo')
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async update(id: string, patch: Partial<NovoModeloTexto>): Promise<ModeloTexto> {
    const { data, error } = await supabase
      .from('modelos_texto')
      .update({
        ...(patch.titulo !== undefined ? { titulo: patch.titulo.trim() } : {}),
        ...(patch.corpo !== undefined ? { corpo: patch.corpo } : {}),
        ...(patch.categoria !== undefined ? { categoria: patch.categoria.trim() || 'Geral' } : {}),
        ...(patch.escopo !== undefined ? { escopo: patch.escopo } : {}),
        ...(patch.posicao !== undefined ? { posicao: patch.posicao } : {}),
        ...(patch.ordem !== undefined ? { ordem: patch.ordem } : {}),
        ...(patch.padrao !== undefined ? { padrao: patch.padrao } : {}),
      })
      .eq('id', id)
      .select('id, titulo, corpo, categoria, escopo, posicao, ordem, padrao, ativo');
    if (error) throw error;
    garantirEscrita(data, semPermissao('editar a biblioteca de modelos'));
    return fromRow(data[0]);
  },

  /** Soft delete. Deixa de ser oferecido, mas segue nomeando a procedência. */
  async aposentar(id: string, ativo: boolean): Promise<ModeloTexto> {
    const { data, error } = await supabase
      .from('modelos_texto')
      .update({ ativo })
      .eq('id', id)
      .select('id, titulo, corpo, categoria, escopo, posicao, ordem, padrao, ativo');
    if (error) throw error;
    garantirEscrita(data, semPermissao('aposentar um modelo da biblioteca'));
    return fromRow(data[0]);
  },
};
