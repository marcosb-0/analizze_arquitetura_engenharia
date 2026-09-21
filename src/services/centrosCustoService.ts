import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { CentroCusto, CustoPorCentro, NovoCentroCusto, PatchCentroCusto, UsosCentroCusto } from '../types';

/**
 * Centros de custo — a dimensão organizacional do razão (modelo Kostenstelle do
 * SAP), criada em 20260920015643.
 *
 * Duas leituras, com donos diferentes de propósito:
 *
 *  - a ÁRVORE sai de `v_centros_custo`, uma view `security_invoker`: quem não
 *    tem policy em `centros_custo` simplesmente não vê nada;
 *  - o CUSTO sai de `fn_custo_por_centro`, SECURITY DEFINER com guarda de papel,
 *    pelo mesmo motivo de `fn_resultado_obra` — `gestao` não lê
 *    `lancamentos_financeiros`, e uma view invoker devolveria ZERO para ela em
 *    vez de recusar.
 *
 * A EXCLUSÃO é RPC, não `.delete()`: a tabela segue sem policy de DELETE de
 * propósito (20260921004829). Centro COM uso continua saindo de circulação por
 * `ativo = false` — apagar tiraria o nome do dono de lançamentos históricos.
 * `excluir` existe só para o centro que nunca teve lançamento, filho nem
 * lotação, e é o banco que decide isso, não a tela.
 */
const toCentro = (row: {
  id: string;
  codigo: string;
  nome: string;
  pai_id: string | null;
  tipo: CentroCusto['tipo'];
  natureza: CentroCusto['natureza'];
  projeto_id: string | null;
  responsavel_id: string | null;
  ativo: boolean;
  nivel: number;
  caminho: string;
  tem_filhos: boolean;
  projeto_nome: string | null;
}): CentroCusto => ({
  id: row.id,
  codigo: row.codigo,
  nome: row.nome,
  paiId: row.pai_id ?? undefined,
  tipo: row.tipo,
  natureza: row.natureza,
  projetoId: row.projeto_id ?? undefined,
  responsavelId: row.responsavel_id ?? undefined,
  ativo: row.ativo,
  nivel: row.nivel,
  caminho: row.caminho,
  temFilhos: row.tem_filhos,
  projetoNome: row.projeto_nome ?? undefined,
});

const toCusto = (row: {
  centro_id: string;
  codigo: string;
  nome: string;
  pai_id: string | null;
  tipo: CustoPorCentro['tipo'];
  natureza: CustoPorCentro['natureza'];
  projeto_id: string | null;
  ativo: boolean;
  nivel: number;
  caminho: string;
  despesa_lancada: number;
  despesa_paga: number;
  receita_lancada: number;
  receita_recebida: number;
  despesa_lancada_arvore: number;
  despesa_paga_arvore: number;
  receita_lancada_arvore: number;
  receita_recebida_arvore: number;
}): CustoPorCentro => ({
  centroId: row.centro_id,
  codigo: row.codigo,
  nome: row.nome,
  paiId: row.pai_id ?? undefined,
  tipo: row.tipo,
  natureza: row.natureza,
  projetoId: row.projeto_id ?? undefined,
  ativo: row.ativo,
  nivel: row.nivel,
  caminho: row.caminho,
  despesaLancada: row.despesa_lancada,
  despesaPaga: row.despesa_paga,
  receitaLancada: row.receita_lancada,
  receitaRecebida: row.receita_recebida,
  despesaLancadaArvore: row.despesa_lancada_arvore,
  despesaPagaArvore: row.despesa_paga_arvore,
  receitaLancadaArvore: row.receita_lancada_arvore,
  receitaRecebidaArvore: row.receita_recebida_arvore,
});

export const centrosCustoService = {
  /**
   * A árvore inteira, já na ordem de árvore. `caminho` é o critério porque
   * ordenar por `codigo` misturaria os níveis assim que um código deixasse de
   * ser numericamente ordenado. O desempate por `id` é o que `buscarTudo`
   * exige para paginar sem pular nem repetir linha.
   */
  async list(): Promise<CentroCusto[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase.from('v_centros_custo').select('*')
        .order('caminho', { ascending: true }).order('id', { ascending: true }).range(de, ate)
    );
    return linhas.map(toCentro);
  },

  async create(centro: NovoCentroCusto): Promise<void> {
    const { error } = await supabase.from('centros_custo').insert({
      codigo: centro.codigo,
      nome: centro.nome,
      pai_id: centro.paiId,
      tipo: centro.tipo,
      natureza: centro.natureza,
      responsavel_id: centro.responsavelId ?? null,
    });
    if (error) throw error;
  },

  /**
   * Sem `.select().single()`: `financeiro` e `gestao` leem a tabela mas não a
   * escrevem, e nesse caso o update casa ZERO linhas e o PostgREST devolve 200.
   * Pedir a linha de volta com `.single()` é o que transforma a recusa
   * silenciosa da RLS num erro — o mesmo motivo de `garantirEscrita`.
   */
  async update(id: string, patch: PatchCentroCusto): Promise<void> {
    const payload: {
      codigo?: string;
      nome?: string;
      pai_id?: string;
      tipo?: CentroCusto['tipo'];
      natureza?: CentroCusto['natureza'];
      responsavel_id?: string | null;
      ativo?: boolean;
    } = {};
    if (patch.codigo !== undefined) payload.codigo = patch.codigo;
    if (patch.nome !== undefined) payload.nome = patch.nome;
    if (patch.paiId !== undefined) payload.pai_id = patch.paiId;
    if (patch.tipo !== undefined) payload.tipo = patch.tipo;
    if (patch.natureza !== undefined) payload.natureza = patch.natureza;
    if (patch.responsavelId !== undefined) payload.responsavel_id = patch.responsavelId || null;
    if (patch.ativo !== undefined) payload.ativo = patch.ativo;

    const { error } = await supabase
      .from('centros_custo').update(payload).eq('id', id).select('id').single();
    if (error) throw error;
  },

  /**
   * O que prende o centro, para a tela explicar ANTES de oferecer o botão. O
   * `motivo` já vem redigido do banco: remontar a frase aqui criaria uma segunda
   * cópia da regra, e as duas divergiriam na primeira mudança.
   */
  async usos(id: string): Promise<UsosCentroCusto> {
    const { data, error } = await supabase.rpc('centro_custo_usos', { p_centro_id: id });
    if (error) throw error;
    const row = data;
    return {
      nome: row.nome,
      filhos: row.filhos,
      lancamentos: row.lancamentos,
      funcionarios: row.funcionarios,
      podeExcluir: row.pode_excluir,
      podeDesativar: row.pode_desativar,
      motivo: row.motivo ?? undefined,
    };
  },

  /** Só o centro sem uso nenhum. A RPC recusa o resto com a mensagem pronta. */
  async excluir(id: string): Promise<void> {
    const { error } = await supabase.rpc('centro_custo_excluir', { p_centro_id: id });
    if (error) throw error;
  },

  /** Custo realizado por centro. Só `admin` e `financeiro` — a RPC recusa o resto. */
  async custoPorCentro(de?: string, ate?: string): Promise<CustoPorCentro[]> {
    const { data, error } = await supabase.rpc('fn_custo_por_centro', {
      p_de: de ?? null,
      p_ate: ate ?? null,
    });
    if (error) throw error;
    return (data ?? []).map(toCusto);
  },
};
