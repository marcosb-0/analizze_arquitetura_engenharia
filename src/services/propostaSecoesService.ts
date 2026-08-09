import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { ModeloTexto, PosicaoSecao, SecaoProposta } from '../types';

/**
 * O descritivo técnico de UMA proposta — o texto que sai no papel.
 *
 * Cada linha nasce copiada de um modelo (por trigger, no insert da proposta) ou
 * escrita à mão aqui, e a partir daí pertence à proposta. É o que torna o
 * documento específico da obra: antes, o texto vinha de duas colunas globais da
 * empresa e toda proposta imprimia o mesmo parágrafo.
 */

const COLUNAS = 'id, proposta_id, titulo, corpo, posicao, ordem, modelo_id';

/** Espaço entre ordens para inserir no meio sem renumerar a lista inteira. */
const PASSO_ORDEM = 10;

type LinhaSecao = {
  id: string; proposta_id: string; titulo: string; corpo: string;
  posicao: PosicaoSecao; ordem: number; modelo_id: string | null;
};

function fromRow(row: LinhaSecao): SecaoProposta {
  return {
    id: row.id,
    propostaId: row.proposta_id,
    titulo: row.titulo,
    corpo: row.corpo,
    posicao: row.posicao,
    ordem: row.ordem,
    modeloId: row.modelo_id ?? undefined,
  };
}

export type NovaSecaoProposta = {
  propostaId: string;
  titulo: string;
  corpo?: string;
  posicao: PosicaoSecao;
  /** Omitido = vai para o fim do bloco (maior ordem + PASSO_ORDEM). */
  ordem?: number;
  modeloId?: string;
};

export const propostaSecoesService = {
  /**
   * `created_at` como último critério de ordenação, e não `id`: sem unique em
   * (proposta_id, posicao, ordem) — escolha registrada em 20260810100001 —
   * duas seções podem empatar na ordem no meio de uma reordenação, e a ordem
   * de criação é o único desempate estável entre leituras.
   */
  async list(propostaId: string): Promise<SecaoProposta[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('proposta_secoes')
        .select(COLUNAS)
        .eq('proposta_id', propostaId)
        .order('posicao', { ascending: true })
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(fromRow);
  },

  async add(nova: NovaSecaoProposta, existentes: SecaoProposta[]): Promise<SecaoProposta> {
    const { data, error } = await supabase
      .from('proposta_secoes')
      .insert({
        proposta_id: nova.propostaId,
        titulo: nova.titulo.trim(),
        corpo: nova.corpo ?? '',
        posicao: nova.posicao,
        ordem: nova.ordem ?? proximaOrdem(existentes, nova.posicao),
        modelo_id: nova.modeloId ?? null,
      })
      .select(COLUNAS)
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  /**
   * Insere um modelo na proposta. É uma CÓPIA: o corpo passa a ser desta
   * proposta e editá-lo depois não toca na biblioteca — e vice-versa.
   */
  async apartirDoModelo(
    propostaId: string,
    modelo: ModeloTexto,
    existentes: SecaoProposta[]
  ): Promise<SecaoProposta> {
    return propostaSecoesService.add(
      {
        propostaId,
        titulo: modelo.titulo,
        corpo: modelo.corpo,
        posicao: modelo.posicao,
        modeloId: modelo.id,
      },
      existentes
    );
  },

  async update(
    id: string,
    patch: Partial<Pick<SecaoProposta, 'titulo' | 'corpo' | 'posicao' | 'ordem'>>
  ): Promise<SecaoProposta> {
    const { data, error } = await supabase
      .from('proposta_secoes')
      .update({
        ...(patch.titulo !== undefined ? { titulo: patch.titulo.trim() } : {}),
        ...(patch.corpo !== undefined ? { corpo: patch.corpo } : {}),
        ...(patch.posicao !== undefined ? { posicao: patch.posicao } : {}),
        ...(patch.ordem !== undefined ? { ordem: patch.ordem } : {}),
      })
      .eq('id', id)
      .select(COLUNAS);
    if (error) throw error;
    garantirEscrita(data, semPermissao('editar o descritivo da proposta'));
    return fromRow(data[0]);
  },

  async remove(id: string): Promise<void> {
    const { data, error } = await supabase
      .from('proposta_secoes')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('remover uma seção do descritivo'));
  },

  /**
   * Troca a posição de duas seções vizinhas.
   *
   * Duas escritas, não atômicas: o PostgREST abre uma transação por chamada.
   * O pior caso é a segunda falhar e as duas ficarem com a mesma `ordem` — e é
   * justamente por isso que não existe unique na coluna e que toda leitura
   * desempata por `created_at`. A lista continua estável; só não fica na ordem
   * pedida, o que a próxima troca resolve.
   */
  async trocarOrdem(a: SecaoProposta, b: SecaoProposta): Promise<void> {
    await propostaSecoesService.update(a.id, { ordem: b.ordem });
    await propostaSecoesService.update(b.id, { ordem: a.ordem });
  },
};

/** Fim do bloco (`antes` ou `depois`) em que a seção nova vai entrar. */
function proximaOrdem(existentes: SecaoProposta[], posicao: PosicaoSecao): number {
  const doBloco = existentes.filter((s) => s.posicao === posicao);
  if (doBloco.length === 0) return PASSO_ORDEM;
  return Math.max(...doBloco.map((s) => s.ordem)) + PASSO_ORDEM;
}
