import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { RubricaEncargo } from '../types';

/**
 * As rubricas de encargo social (grupos A, B, C e D).
 *
 * DUAS COISAS QUE NÃO PODEM MUDAR SEM PENSAR:
 *
 * 1. **`salvar` manda UM request pela tabela inteira.** O trigger
 *    `trg_propaga_custo_rubricas` é `for each statement` e recalcula TODAS as
 *    composições do catálogo a cada disparo. Um PATCH por célula transformaria
 *    um salvamento em 26 varreduras completas, em cadeia.
 *
 * 2. **Não existe criar nem excluir.** INSERT e DELETE não são concedidos a
 *    ninguém no banco: rubrica nova entra por migration, como em
 *    `unidades_medida`. Desativar (`ativo = false`) é o que a tela oferece.
 */

type LinhaRubrica = {
  codigo: string;
  grupo: 'A' | 'B' | 'C' | 'D';
  descricao: string;
  percentual_horista: number | null;
  percentual_mensalista: number | null;
  aplica_horista: boolean;
  aplica_mensalista: boolean;
  formula: 'A*B' | 'A*B-A1*B4' | 'A*C2+A8*C1' | null;
  ordem: number;
  ativo: boolean;
};

const COLUNAS =
  'codigo, grupo, descricao, percentual_horista, percentual_mensalista, aplica_horista, aplica_mensalista, formula, ordem, ativo';

function fromRow(row: LinhaRubrica): RubricaEncargo {
  return {
    codigo: row.codigo,
    grupo: row.grupo,
    descricao: row.descricao,
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
};
