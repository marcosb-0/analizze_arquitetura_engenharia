import { supabase } from '../lib/supabaseClient';
import { ContaFinanceira, LancamentoFinanceiro, ResultadoObra } from '../types';

function contaFromRow(row: {
  id: string; nome: string; banco: string | null; tipo: ContaFinanceira['tipo'];
  saldo_inicial: number; saldo_atual: number; ativa: boolean;
}): ContaFinanceira {
  return {
    id: row.id,
    nome: row.nome,
    banco: row.banco ?? '',
    tipo: row.tipo,
    saldoInicial: row.saldo_inicial,
    saldoAtual: row.saldo_atual,
    ativa: row.ativa,
  };
}

function lancamentoFromRow(row: {
  id: string; tipo: LancamentoFinanceiro['tipo']; descricao: string; valor: number; data: string;
  categoria: LancamentoFinanceiro['categoria']; pago: boolean; conta_id: string; projeto_id: string | null;
  funcionario_id: string | null; fornecedor_id: string | null; competencia: string | null; medicao_id?: string | null;
  data_vencimento: string;
}): LancamentoFinanceiro {
  return {
    id: row.id,
    tipo: row.tipo,
    descricao: row.descricao,
    valor: row.valor,
    data: row.data,
    dataVencimento: row.data_vencimento,
    categoria: row.categoria,
    pago: row.pago,
    contaId: row.conta_id,
    projetoId: row.projeto_id ?? undefined,
    funcionarioId: row.funcionario_id ?? undefined,
    fornecedorId: row.fornecedor_id ?? undefined,
    competencia: row.competencia ?? undefined,
    medicaoId: row.medicao_id ?? undefined,
  };
}

export const financeiroService = {
  async listContas(): Promise<ContaFinanceira[]> {
    // saldo_atual is always derived (fix #3) — never a value the app writes to.
    const { data, error } = await supabase.from('v_contas_financeiras').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data.map(contaFromRow);
  },

  /**
   * O razão inteiro, sempre completo.
   *
   * O `select('*')` sem `.range()` que existia aqui parecia trazer tudo, mas o
   * PostgREST corta em 1000 linhas SEM erro (a mesma armadilha que truncava a
   * série histórica do catálogo — ver catalogoService). No razão o estrago seria
   * pior que uma lista incompleta: `metrics`, o gráfico de fluxo e a lista de
   * medições já faturadas são todos calculados sobre este array em EmpresaTab.
   * A partir do lançamento 1001 o saldo, o resultado líquido e a distribuição de
   * despesas passariam a mostrar números errados sem nada indicar isso.
   *
   * Por isso a paginação aqui é interna: busca em blocos até esgotar, e devolve
   * o conjunto completo. A tela pagina a RENDERIZAÇÃO (ver CarregarMais em
   * EmpresaTab), que é o custo que realmente incomoda no DOM.
   *
   * O passo seguinte, quando o volume justificar, é mover os agregados para uma
   * view no banco e aí sim paginar a busca — enquanto os totais forem somados no
   * cliente, o cliente precisa de todas as linhas.
   */
  async listLancamentos(): Promise<LancamentoFinanceiro[]> {
    const BLOCO = 1000;
    const todos: LancamentoFinanceiro[] = [];
    for (let de = 0; ; de += BLOCO) {
      const { data, error } = await supabase
        .from('lancamentos_financeiros')
        .select('*')
        .order('data', { ascending: false })
        .order('id', { ascending: true }) // desempate estável: sem isto uma mesma data pode repetir ou pular linha entre blocos
        .range(de, de + BLOCO - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      todos.push(...data.map(lancamentoFromRow));
      if (data.length < BLOCO) break;
    }
    return todos;
  },

  // O `.select()` devolve a linha que o banco realmente gravou, em vez de a UI
  // exibir o objeto montado no cliente como se fosse fato consumado. Conta nova
  // não tem lançamento nenhum, então saldo atual = saldo inicial; o refetch de
  // `v_contas_financeiras` confirma na sequência.
  async addConta(conta: ContaFinanceira): Promise<ContaFinanceira> {
    const { data, error } = await supabase
      .from('contas_financeiras')
      .insert({
        id: conta.id,
        nome: conta.nome,
        banco: conta.banco,
        tipo: conta.tipo,
        saldo_inicial: conta.saldoInicial,
      })
      .select()
      .single();
    if (error) throw error;
    return contaFromRow({ ...data, saldo_atual: data.saldo_inicial });
  },

  async addLancamento(lan: LancamentoFinanceiro): Promise<LancamentoFinanceiro> {
    const { data, error } = await supabase
      .from('lancamentos_financeiros')
      .insert({
        id: lan.id,
        tipo: lan.tipo,
        descricao: lan.descricao,
        valor: lan.valor,
        data: lan.data,
        data_vencimento: lan.dataVencimento,
        categoria: lan.categoria,
        pago: lan.pago,
        conta_id: lan.contaId,
        projeto_id: lan.projetoId,
        funcionario_id: lan.funcionarioId,
        fornecedor_id: lan.fornecedorId,
        competencia: lan.competencia,
        medicao_id: lan.medicaoId,
      })
      .select()
      .single();
    if (error) throw error;
    return lancamentoFromRow(data);
  },

  // Faturamento de uma medição: gera a receita "Faturamento Obra" (valor somado
  // server-side a partir de medicao_item_orcamento). Ver fn_gerar_lancamento_medicao.
  async gerarLancamentoMedicao(medicaoId: string, contaId: string, pago: boolean): Promise<LancamentoFinanceiro> {
    const { data, error } = await supabase.rpc('fn_gerar_lancamento_medicao', {
      p_medicao_id: medicaoId,
      p_conta_id: contaId,
      p_pago: pago,
    });
    if (error) throw error;
    return lancamentoFromRow(data);
  },

  /**
   * Onde a conta está presa, para o diálogo explicar antes do clique. A
   * autoridade é `excluirConta`, que refaz a contagem sob `for update`.
   */
  async contaUsos(contaId: string) {
    const { data, error } = await supabase.rpc('conta_usos', { p_conta_id: contaId });
    if (error) throw error;
    return data;
  },

  async excluirConta(contaId: string): Promise<void> {
    const { error } = await supabase.rpc('conta_excluir', { p_conta_id: contaId });
    if (error) throw error;
  },

  // Contar as linhas afetadas é o que revela um write recusado pela RLS — ver
  // projetosService. `gestao` e `campo` não têm política nenhuma nestas tabelas:
  // o update/delete casa com zero linhas e o PostgREST devolve sucesso, sem
  // erro. Sem esta checagem a tela marcava o lançamento como pago, ou o removia
  // do razão, enquanto o banco seguia intacto.
  // Resultado por obra. Agregado no servidor de propósito: as somas cruzam o
  // razão com orçamento e medições, e `gestao` não lê lancamentos_financeiros —
  // uma view invoker devolveria zeros. Ver fn_resultado_obra.
  async listResultadoObra(): Promise<ResultadoObra[]> {
    const { data, error } = await supabase.rpc('fn_resultado_obra');
    if (error) throw error;
    return (data ?? []).map((row) => ({
      projetoId: row.projeto_id,
      projetoNome: row.projeto_nome,
      situacao: row.situacao,
      clienteNome: row.cliente_nome ?? undefined,
      propostaValor: row.proposta_valor ?? undefined,
      bdiPercentual: row.bdi_percentual ?? undefined,
      valorOrcado: row.valor_orcado,
      valorExecutado: row.valor_executado,
      receitaFaturada: row.receita_faturada,
      receitaRecebida: row.receita_recebida,
      despesaLancada: row.despesa_lancada,
      despesaPaga: row.despesa_paga,
      aFaturar: row.a_faturar,
      resultadoCompetencia: row.resultado_competencia,
      resultadoCaixa: row.resultado_caixa,
    }));
  },

  /**
   * Edição de lançamento. Campos de fato financeiro de um faturamento de medição
   * (valor, tipo, categoria, obra, medição) são recusados pela trigger
   * trg_lancamento_protege_faturamento — a tela desabilita, o banco garante.
   */
  async updateLancamento(id: string, patch: Partial<LancamentoFinanceiro>): Promise<LancamentoFinanceiro> {
    const payload: {
      tipo?: LancamentoFinanceiro['tipo'];
      descricao?: string;
      valor?: number;
      data?: string;
      data_vencimento?: string;
      categoria?: LancamentoFinanceiro['categoria'];
      pago?: boolean;
      conta_id?: string;
      projeto_id?: string | null;
      funcionario_id?: string | null;
      fornecedor_id?: string | null;
      competencia?: string | null;
    } = {};
    if (patch.tipo !== undefined) payload.tipo = patch.tipo;
    if (patch.descricao !== undefined) payload.descricao = patch.descricao;
    if (patch.valor !== undefined) payload.valor = patch.valor;
    if (patch.data !== undefined) payload.data = patch.data;
    if (patch.dataVencimento !== undefined) payload.data_vencimento = patch.dataVencimento;
    if (patch.categoria !== undefined) payload.categoria = patch.categoria;
    if (patch.pago !== undefined) payload.pago = patch.pago;
    if (patch.contaId !== undefined) payload.conta_id = patch.contaId;
    if (patch.projetoId !== undefined) payload.projeto_id = patch.projetoId || null;
    if (patch.funcionarioId !== undefined) payload.funcionario_id = patch.funcionarioId || null;
    if (patch.fornecedorId !== undefined) payload.fornecedor_id = patch.fornecedorId || null;
    if (patch.competencia !== undefined) payload.competencia = patch.competencia || null;

    const { data, error } = await supabase
      .from('lancamentos_financeiros')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    if (!data) {
      throw new Error('Nenhuma linha foi atualizada — seu perfil não tem permissão para editar este lançamento.');
    }
    return lancamentoFromRow(data);
  },

  async updateConta(id: string, patch: Partial<ContaFinanceira>): Promise<void> {
    const payload: {
      nome?: string;
      banco?: string | null;
      tipo?: ContaFinanceira['tipo'];
      saldo_inicial?: number;
      ativa?: boolean;
    } = {};
    if (patch.nome !== undefined) payload.nome = patch.nome;
    if (patch.banco !== undefined) payload.banco = patch.banco;
    if (patch.tipo !== undefined) payload.tipo = patch.tipo;
    if (patch.saldoInicial !== undefined) payload.saldo_inicial = patch.saldoInicial;
    if (patch.ativa !== undefined) payload.ativa = patch.ativa;

    const { data, error } = await supabase.from('contas_financeiras').update(payload).eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Nenhuma linha foi atualizada — seu perfil não tem permissão para editar esta conta.');
    }
  },

  async setPago(id: string, pago: boolean): Promise<void> {
    const { data, error } = await supabase.from('lancamentos_financeiros').update({ pago }).eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Nenhuma linha foi atualizada — seu perfil não tem permissão para alterar este lançamento.');
    }
  },

  async removeLancamento(id: string): Promise<void> {
    const { data, error } = await supabase.from('lancamentos_financeiros').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Nenhuma linha foi excluída — seu perfil não tem permissão para excluir este lançamento.');
    }
  },
};
