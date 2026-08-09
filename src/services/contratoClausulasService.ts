import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { ClausulaContrato, ModeloTexto } from '../types';

/**
 * As cláusulas de um contrato.
 *
 * Espelho de `propostaSecoesService`, sem `posicao`: contrato não tem tabela de
 * valores no meio do texto, e a numeração é corrida. O resto do contrato é o
 * mesmo — inclusive a razão de não haver unique em (contrato_id, ordem) e de
 * toda leitura desempatar por `created_at`.
 */

const COLUNAS = 'id, contrato_id, titulo, corpo, ordem, modelo_id';

/** Espaço entre ordens para inserir no meio sem renumerar a lista inteira. */
const PASSO_ORDEM = 10;

type LinhaClausula = {
  id: string; contrato_id: string; titulo: string; corpo: string;
  ordem: number; modelo_id: string | null;
};

function fromRow(row: LinhaClausula): ClausulaContrato {
  return {
    id: row.id,
    contratoId: row.contrato_id,
    titulo: row.titulo,
    corpo: row.corpo,
    ordem: row.ordem,
    modeloId: row.modelo_id ?? undefined,
  };
}

export type NovaClausulaContrato = {
  contratoId: string;
  titulo: string;
  corpo?: string;
  ordem?: number;
  modeloId?: string;
};

export const contratoClausulasService = {
  async list(contratoId: string): Promise<ClausulaContrato[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('contrato_clausulas')
        .select(COLUNAS)
        .eq('contrato_id', contratoId)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(fromRow);
  },

  async add(nova: NovaClausulaContrato, existentes: ClausulaContrato[]): Promise<ClausulaContrato> {
    const { data, error } = await supabase
      .from('contrato_clausulas')
      .insert({
        contrato_id: nova.contratoId,
        titulo: nova.titulo.trim(),
        corpo: nova.corpo ?? '',
        ordem: nova.ordem ?? proximaOrdem(existentes),
        modelo_id: nova.modeloId ?? null,
      })
      .select(COLUNAS)
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  /** Cópia: o corpo passa a ser deste contrato e a biblioteca segue intocada. */
  async apartirDoModelo(
    contratoId: string,
    modelo: ModeloTexto,
    existentes: ClausulaContrato[]
  ): Promise<ClausulaContrato> {
    return contratoClausulasService.add(
      { contratoId, titulo: modelo.titulo, corpo: modelo.corpo, modeloId: modelo.id },
      existentes
    );
  },

  async update(
    id: string,
    patch: Partial<Pick<ClausulaContrato, 'titulo' | 'corpo' | 'ordem'>>
  ): Promise<ClausulaContrato> {
    const { data, error } = await supabase
      .from('contrato_clausulas')
      .update({
        ...(patch.titulo !== undefined ? { titulo: patch.titulo.trim() } : {}),
        ...(patch.corpo !== undefined ? { corpo: patch.corpo } : {}),
        ...(patch.ordem !== undefined ? { ordem: patch.ordem } : {}),
      })
      .eq('id', id)
      .select(COLUNAS);
    if (error) throw error;
    garantirEscrita(data, semPermissao('editar as cláusulas deste contrato'));
    return fromRow(data[0]);
  },

  async remove(id: string): Promise<void> {
    const { data, error } = await supabase
      .from('contrato_clausulas')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('remover uma cláusula'));
  },

  /** Duas escritas não atômicas; ver a nota em propostaSecoesService.trocarOrdem. */
  async trocarOrdem(a: ClausulaContrato, b: ClausulaContrato): Promise<void> {
    await contratoClausulasService.update(a.id, { ordem: b.ordem });
    await contratoClausulasService.update(b.id, { ordem: a.ordem });
  },
};

function proximaOrdem(existentes: ClausulaContrato[]): number {
  if (existentes.length === 0) return PASSO_ORDEM;
  return Math.max(...existentes.map((c) => c.ordem)) + PASSO_ORDEM;
}
