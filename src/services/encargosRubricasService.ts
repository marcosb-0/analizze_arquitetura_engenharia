import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { GrupoEncargoDef, RubricaEncargo } from '../types';

/**
 * As rubricas de encargo social (grupos A, B, C e D, e os próprios da empresa).
 *
 * DUAS COISAS QUE NÃO PODEM MUDAR SEM PENSAR:
 *
 * 1. **`salvar` manda UM request pela tabela inteira.** O trigger
 *    `trg_propaga_custo_rubricas` é `for each statement` e recalcula TODAS as
 *    composições do catálogo a cada disparo. Um PATCH por célula transformaria
 *    um salvamento em 26 varreduras completas, em cadeia.
 *
 * 2. Admin/gestão criam e excluem rubricas; os operandos das fórmulas do D
 *    (A1, A8, B4, C1, C2) e o próprio D só se desativam.
 */

type LinhaRubrica = {
  codigo: string;
  grupo: string;
  descricao: string;
  percentual_horista: number | null;
  percentual_mensalista: number | null;
  aplica_horista: boolean;
  aplica_mensalista: boolean;
  formula: 'A*B' | 'A*B-A1*B4' | 'A*C2+A8*C1' | null;
  ordem: number;
  ativo: boolean;
  sistema: boolean;
};

const COLUNAS =
  'codigo, grupo, descricao, percentual_horista, percentual_mensalista, aplica_horista, aplica_mensalista, formula, ordem, ativo, sistema';

function fromRow(row: LinhaRubrica): RubricaEncargo {
  return {
    codigo: row.codigo,
    grupo: row.grupo,
    descricao: row.descricao,
    sistema: row.sistema,
    // `?? null` explícito pelo mesmo motivo de `empresaConfigService`: nulo é
    // "não respondida" e precisa sobreviver até a soma, que o trata como
    // "grupo sem total". Um `?? 0` aqui faria o encargo parecer menor.
    percentualHorista: row.percentual_horista ?? null,
    percentualMensalista: row.percentual_mensalista ?? null,
    aplicaHorista: row.aplica_horista,
    aplicaMensalista: row.aplica_mensalista,
    formula: row.formula,
    ordem: row.ordem,
    ativo: row.ativo,
  };
}

export const encargosRubricasService = {
  async listar(): Promise<RubricaEncargo[]> {
    // `codigo` é o desempate estável que `buscarTudo` exige — e aqui ele é a
    // própria chave primária, então não há como duas linhas empatarem.
    const linhas = await buscarTudo<LinhaRubrica>((de, ate) =>
      supabase
        .from('encargos_rubricas')
        .select(COLUNAS)
        .order('ordem', { ascending: true })
        .order('codigo', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(fromRow);
  },

  /**
   * A tabela inteira num RPC, e NÃO num `upsert`.
   *
   * O upsert era o caminho óbvio e não funciona aqui: ele é
   * `INSERT ... ON CONFLICT DO UPDATE`, e o Postgres exige privilégio de INSERT
   * para executá-lo mesmo quando toda linha do lote cai no ramo do UPDATE. Como
   * INSERT não é concedido a ninguém nesta tabela — rubrica nova entra por
   * migration —, a chamada morria com `permission denied` antes de olhar os
   * dados. Ver 20260920201048.
   *
   * `encargos_rubricas_salvar` faz um único UPDATE, que dispara o trigger de
   * propagação uma vez só, e ele mesmo recusa a escrita quando o número de
   * linhas gravadas não bate com o pedido — inclusive no caso de RLS não casar
   * linha nenhuma, que voltaria como sucesso silencioso.
   */
  async salvar(rubricas: readonly RubricaEncargo[]): Promise<RubricaEncargo[]> {
    const payload = rubricas.map((r) => ({
      codigo: r.codigo,
      descricao: r.descricao,
      percentual_horista: r.percentualHorista,
      percentual_mensalista: r.percentualMensalista,
      aplica_horista: r.aplicaHorista,
      aplica_mensalista: r.aplicaMensalista,
      ativo: r.ativo,
      formula: r.formula,
    }));

    const { data, error } = await supabase.rpc('encargos_rubricas_salvar', { p_rubricas: payload });

    if (error) throw error;
    garantirEscrita(data, semPermissao('alterar a tabela de encargos'));
    return (data as LinhaRubrica[]).map(fromRow).sort((a, b) => a.ordem - b.ordem);
  },

  async criar(nova: Pick<RubricaEncargo, 'codigo' | 'grupo' | 'descricao' | 'percentualHorista' | 'percentualMensalista' | 'aplicaHorista' | 'aplicaMensalista'>, ordem: number): Promise<RubricaEncargo> {
    const { data, error } = await supabase.from('encargos_rubricas').insert({
      codigo: nova.codigo,
      grupo: nova.grupo,
      descricao: nova.descricao.trim(),
      percentual_horista: nova.percentualHorista,
      percentual_mensalista: nova.percentualMensalista,
      aplica_horista: nova.aplicaHorista,
      aplica_mensalista: nova.aplicaMensalista,
      ordem,
      // Uma rubrica recém-criada não altera o orçamento antes da revisão.
      ativo: false,
    }).select(COLUNAS).single();
    if (error) throw error;
    return fromRow(data as LinhaRubrica);
  },

  /** Os grupos da tabela, A–D e os próprios, na ordem da tela. */
  async listarGrupos(): Promise<GrupoEncargoDef[]> {
    const linhas = await buscarTudo<{ codigo: string; titulo: string; ordem: number; sistema: boolean }>((de, ate) =>
      supabase
        .from('encargos_grupos')
        .select('codigo, titulo, ordem, sistema')
        .order('ordem', { ascending: true })
        .order('codigo', { ascending: true })
        .range(de, ate)
    );
    return linhas.map((g) => ({ codigo: g.codigo, titulo: g.titulo, ordem: g.ordem, sistema: g.sistema }));
  },

  /**
   * Grupo próprio. Soma direto no total, como o C, e não entra nas fórmulas
   * do D — ver 20260925182333. Nasce vazio, então não mexe em preço nenhum.
   */
  async criarGrupo(novo: Pick<GrupoEncargoDef, 'codigo' | 'titulo' | 'ordem'>): Promise<GrupoEncargoDef> {
    const { data, error } = await supabase
      .from('encargos_grupos')
      .insert({ codigo: novo.codigo, titulo: novo.titulo.trim(), ordem: novo.ordem })
      .select('codigo, titulo, ordem, sistema')
      .single();
    if (error) throw error;
    return data as GrupoEncargoDef;
  },

  /** Só grupo próprio e vazio: a FK `restrict` recusa o que tiver rubrica. */
  async excluirGrupo(codigo: string): Promise<void> {
    const { data, error } = await supabase.from('encargos_grupos')
      .delete().eq('codigo', codigo).eq('sistema', false).select('codigo');
    if (error) throw error;
    garantirEscrita(data, semPermissao('excluir o grupo de encargos'));
  },

  async excluir(codigo: string): Promise<void> {
    // Sem filtro de `sistema`: desde 20260925190058 a estrutural também sai,
    // menos os operandos do D (A1, A8, B4, C1, C2) e o próprio D — quem barra
    // é a política de DELETE, e o `garantirEscrita` transforma a recusa calada
    // da RLS em erro.
    const { data, error } = await supabase.from('encargos_rubricas')
      .delete().eq('codigo', codigo).select('codigo');
    if (error) throw error;
    garantirEscrita(data, semPermissao('excluir esta rubrica'));
  },
};
