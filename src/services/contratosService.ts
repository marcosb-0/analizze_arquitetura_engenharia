import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { Contrato, EdicaoContrato, StatusContrato } from '../types';

/**
 * Contratos — o que foi assinado.
 *
 * Sem `add`: contrato não se cria por aqui. O único nascimento é
 * `gerarDaProposta`, que chama a RPC — a proposta aprovada é pré-requisito do
 * documento, não um campo dele.
 *
 * A leitura é sempre por `v_contratos`, que traz a contagem de cláusulas e o
 * número da proposta de origem. As escritas vão na tabela: view com
 * `security_invoker` até aceitaria, mas escrever pelo mesmo nome de onde se lê
 * esconderia que os dois campos derivados não são graváveis.
 */

type LinhaContrato = {
  id: string; numero: string; proposta_id: string; projeto_id: string | null;
  cliente_id: string; objeto: string; valor_total: number;
  prazo_execucao_dias: number | null; data_inicio: string | null; data_assinatura: string | null;
  forma_pagamento: string | null; reajuste: string | null; indice_reajuste: string | null;
  multa_percentual: number | null; juros_mora_percentual: number | null;
  garantia_meses: number | null; foro: string | null; observacoes: string | null;
  status: StatusContrato; qtd_clausulas?: number; proposta_numero: string;
};

function fromRow(row: LinhaContrato): Contrato {
  return {
    id: row.id,
    numero: row.numero,
    propostaId: row.proposta_id,
    projetoId: row.projeto_id ?? undefined,
    clienteId: row.cliente_id,
    objeto: row.objeto,
    valorTotal: row.valor_total,
    prazoExecucaoDias: row.prazo_execucao_dias ?? undefined,
    dataInicio: row.data_inicio ?? undefined,
    dataAssinatura: row.data_assinatura ?? undefined,
    formaPagamento: row.forma_pagamento ?? undefined,
    reajuste: row.reajuste ?? undefined,
    indiceReajuste: row.indice_reajuste ?? undefined,
    multaPercentual: row.multa_percentual ?? undefined,
    jurosMoraPercentual: row.juros_mora_percentual ?? undefined,
    garantiaMeses: row.garantia_meses ?? undefined,
    foro: row.foro ?? undefined,
    observacoes: row.observacoes ?? undefined,
    status: row.status,
    qtdClausulas: row.qtd_clausulas ?? 0,
    propostaNumero: row.proposta_numero,
  };
}

/**
 * O que vai para o banco. Vazio vira null: '' não é "sem foro", é lixo.
 *
 * Sem `cliente_id` e sem `proposta_id`: são a origem do contrato, não campos
 * dele. A mesma exclusão está no tipo `Update` de database.types.ts e na RLS.
 */
function toRow(patch: Partial<EdicaoContrato>) {
  const texto = (v?: string) => (v?.trim() ? v.trim() : null);
  return {
    ...(patch.projetoId !== undefined ? { projeto_id: patch.projetoId ?? null } : {}),
    ...(patch.objeto !== undefined ? { objeto: patch.objeto.trim() } : {}),
    ...(patch.valorTotal !== undefined ? { valor_total: patch.valorTotal } : {}),
    ...(patch.prazoExecucaoDias !== undefined
      ? { prazo_execucao_dias: patch.prazoExecucaoDias || null }
      : {}),
    ...(patch.dataInicio !== undefined ? { data_inicio: patch.dataInicio || null } : {}),
    ...(patch.dataAssinatura !== undefined ? { data_assinatura: patch.dataAssinatura || null } : {}),
    ...(patch.formaPagamento !== undefined ? { forma_pagamento: texto(patch.formaPagamento) } : {}),
    ...(patch.reajuste !== undefined ? { reajuste: texto(patch.reajuste) } : {}),
    ...(patch.indiceReajuste !== undefined ? { indice_reajuste: texto(patch.indiceReajuste) } : {}),
    ...(patch.multaPercentual !== undefined
      ? { multa_percentual: patch.multaPercentual ?? null }
      : {}),
    ...(patch.jurosMoraPercentual !== undefined
      ? { juros_mora_percentual: patch.jurosMoraPercentual ?? null }
      : {}),
    ...(patch.garantiaMeses !== undefined ? { garantia_meses: patch.garantiaMeses || null } : {}),
    ...(patch.foro !== undefined ? { foro: texto(patch.foro) } : {}),
    ...(patch.observacoes !== undefined ? { observacoes: texto(patch.observacoes) } : {}),
  };
}

export const contratosService = {
  async list(): Promise<Contrato[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('v_contratos')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(fromRow);
  },

  /** Um contrato pelo id — para trazer ao estado o que o servidor criou. */
  async get(id: string): Promise<Contrato> {
    const { data, error } = await supabase.from('v_contratos').select('*').eq('id', id).single();
    if (error) throw error;
    return fromRow(data);
  },

  async update(id: string, patch: Partial<EdicaoContrato>): Promise<Contrato> {
    const { data, error } = await supabase
      .from('contratos')
      .update(toRow(patch))
      .eq('id', id)
      .select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('editar este contrato'));
    return contratosService.get(id);
  },

  /**
   * A mudança de status carrega a data de assinatura junto, porque as duas
   * dizem a mesma coisa e discordar delas é o defeito: um contrato "Assinado"
   * sem data não prova nada, e uma data de assinatura numa minuta é ficção.
   */
  async updateStatus(
    id: string,
    status: StatusContrato,
    dataAssinatura?: string
  ): Promise<{ status: StatusContrato; dataAssinatura?: string }> {
    const patch: { status: StatusContrato; data_assinatura?: string | null } = { status };
    if (status === 'Assinado') {
      if (dataAssinatura) patch.data_assinatura = dataAssinatura;
    } else if (status === 'Minuta') {
      // Voltar para minuta apaga a assinatura: manter a data de um documento
      // que voltou para a mesa faria o papel imprimir uma assinatura que não
      // existe mais.
      patch.data_assinatura = null;
    }

    const { data, error } = await supabase
      .from('contratos')
      .update(patch)
      .eq('id', id)
      .select('status, data_assinatura');
    if (error) throw error;
    garantirEscrita(data, semPermissao('alterar a situação deste contrato'));
    return { status: data[0].status, dataAssinatura: data[0].data_assinatura ?? undefined };
  },

  async remove(id: string): Promise<void> {
    const { data, error } = await supabase.from('contratos').delete().eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('excluir contratos'));
  },

  /**
   * Gera o contrato de uma proposta aprovada. As guardas (papel, status,
   * contrato único) são da RPC — replicá-las aqui criaria uma segunda cópia da
   * regra que ninguém lembraria de atualizar junto.
   */
  async gerarDaProposta(propostaId: string, payload: Record<string, unknown> = {}): Promise<Contrato> {
    const { data, error } = await supabase.rpc('fn_gerar_contrato_from_proposta', {
      p_proposta_id: propostaId,
      p_payload: payload,
    });
    if (error) throw error;
    return contratosService.get(data as string);
  },
};
