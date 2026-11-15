import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import type { AcessoBI, ContratoBI, DadosBI, EtapaBI, FaturamentoBI, MedicaoBI, RejeicaoBI } from '../lib/indicadores/tipos';

/**
 * As leituras do painel de indicadores.
 *
 * ## Por que aqui, e não nos hooks que já existem
 *
 * `useMedicoes` e `useCronograma` são RECORTADOS pela obra aberta (§4.2, item
 * 23) — o painel precisa das duas coisas atravessando obras, e reabrir aqueles
 * hooks para "todas" desfaria o recorte do console. `useFinanceiro` traz o razão
 * inteiro, e `useContratos` traz o texto do contrato; o painel quer cinco
 * colunas de cada. Então cada leitura daqui é a projeção estreita da tabela, com
 * a lista de colunas escrita — nada de `select('*')`.
 *
 * ## O que fica no servidor e o que vem para o cliente
 *
 * O filtro de PERÍODO não vai para a consulta, de propósito: a comparação com o
 * período anterior, a curva acumulada de avanço e o saldo contratual precisam do
 * histórico, e trocar de "Mês" para "Ano" refaria a ida ao servidor a cada
 * clique. O volume é de BOLETINS e ETAPAS (não de itens × medições × vínculos,
 * que foi o problema do §4.2), e o recorte por obra/contrato/período acontece
 * em memória sobre estas linhas, que é o que permite os filtros mudarem o
 * painel inteiro no mesmo quadro.
 *
 * ## Uma leitura por policy
 *
 * Cada consulta só sai para o papel que tem policy na tabela. A RLS não recusa:
 * ela devolve vazio, e vazio somado é ZERO — `gestao` veria "R$ 0 recebido",
 * que é falso. O `AcessoBI` decide antes, e a tela diz "sem acesso" no lugar do
 * número.
 */

async function listarMedicoes(): Promise<MedicaoBI[]> {
  const linhas = await buscarTudo((de, ate) =>
    supabase
      .from('v_medicao_recente')
      .select('id, projeto_id, etapa_id, etapa_nome, data_medicao, percentual_medido, quantidade_medida, unidade, status, valor_medido')
      .order('data_medicao', { ascending: true })
      .order('id', { ascending: true })
      .range(de, ate)
  );
  return linhas.map((m) => ({
    id: m.id,
    projetoId: m.projeto_id,
    etapaId: m.etapa_id,
    etapaNome: m.etapa_nome ?? undefined,
    data: m.data_medicao,
    percentual: Number(m.percentual_medido),
    quantidade: m.quantidade_medida === null ? undefined : Number(m.quantidade_medida),
    unidade: m.unidade ?? undefined,
    status: m.status,
    valor: Number(m.valor_medido),
  }));
}

/**
 * O peso de cada etapa no avanço da obra — a conta de `v_resumo_obra`:
 * Σ (peso_percentual / 100 × valor_orçado) dos itens vinculados.
 *
 * São duas leituras estreitas (vínculo + valor do item) e não uma view nova:
 * a regra já mora em `v_resumo_obra`, e uma segunda view com a mesma soma seria
 * a "duas cópias da mesma média ponderada" que `v_etapas_cronograma` evita.
 */
async function listarPesos(): Promise<Map<string, number>> {
  const [vinculos, itens] = await Promise.all([
    buscarTudo((de, ate) =>
      supabase.from('etapa_orcamento_vinculo').select('id, etapa_id, item_orcamento_id, peso_percentual')
        .order('id', { ascending: true }).range(de, ate)
    ),
    buscarTudo((de, ate) =>
      supabase.from('itens_orcamento').select('id, valor_orcado').order('id', { ascending: true }).range(de, ate)
    ),
  ]);
  const valorDoItem = new Map(itens.map((i) => [i.id, Number(i.valor_orcado)]));
  const pesos = new Map<string, number>();
  for (const v of vinculos) {
    const valor = valorDoItem.get(v.item_orcamento_id);
    if (valor === undefined) continue;
    pesos.set(v.etapa_id, (pesos.get(v.etapa_id) ?? 0) + (Number(v.peso_percentual) / 100) * valor);
  }
  return pesos;
}

async function listarEtapas(): Promise<EtapaBI[]> {
  const [linhas, pesos] = await Promise.all([
    buscarTudo((de, ate) =>
      supabase
        .from('v_etapas_cronograma')
        .select('id, projeto_id, nome, data_inicio, data_fim, baseline_fim, percentual_executado, quantidade_prevista, quantidade_executada, unidade, responsavel_id')
        // Só folha: grupo não tem medição, e é sobre a folha que o banco
        // calcula avanço e atraso.
        .eq('eh_folha', true)
        .order('projeto_id', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate)
    ),
    listarPesos(),
  ]);
  return linhas.map((e) => ({
    id: e.id,
    projetoId: e.projeto_id,
    nome: e.nome,
    dataInicio: e.data_inicio ?? undefined,
    dataFim: e.data_fim ?? undefined,
    baselineFim: e.baseline_fim ?? undefined,
    percentualExecutado: Number(e.percentual_executado),
    quantidadePrevista: e.quantidade_prevista === null ? undefined : Number(e.quantidade_prevista),
    quantidadeExecutada: Number(e.quantidade_executada),
    unidade: e.unidade ?? undefined,
    responsavelId: e.responsavel_id ?? undefined,
    peso: pesos.get(e.id) ?? 0,
  }));
}

async function listarContratos(): Promise<ContratoBI[]> {
  const linhas = await buscarTudo((de, ate) =>
    supabase
      .from('contratos')
      .select('id, numero, projeto_id, cliente_id, objeto, valor_total, status, data_assinatura')
      .order('numero', { ascending: true })
      .order('id', { ascending: true })
      .range(de, ate)
  );
  return linhas.map((c) => ({
    id: c.id,
    numero: c.numero,
    projetoId: c.projeto_id ?? undefined,
    clienteId: c.cliente_id,
    objeto: c.objeto,
    valorTotal: Number(c.valor_total),
    status: c.status,
    dataAssinatura: c.data_assinatura ?? undefined,
  }));
}

/**
 * Só a receita de FATURAMENTO DE OBRA — o mesmo corte de `fn_resultado_obra`.
 * Aporte de capital e rendimento são receita da empresa, não da obra, e
 * entrariam no "recebido" de um painel que fala de obras.
 */
async function listarFaturamentos(): Promise<FaturamentoBI[]> {
  const linhas = await buscarTudo((de, ate) =>
    supabase
      .from('lancamentos_financeiros')
      .select('id, projeto_id, medicao_id, descricao, valor, data, data_vencimento, pago')
      .eq('tipo', 'Receita')
      .eq('categoria', 'Faturamento Obra')
      .order('data', { ascending: true })
      .order('id', { ascending: true })
      .range(de, ate)
  );
  return linhas.map((l) => ({
    id: l.id,
    projetoId: l.projeto_id ?? undefined,
    medicaoId: l.medicao_id ?? undefined,
    descricao: l.descricao,
    valor: Number(l.valor),
    data: l.data,
    vencimento: l.data_vencimento,
    pago: l.pago,
  }));
}

/** O motivo da rejeição não está em `v_medicao_recente`; vem só das rejeitadas. */
async function listarRejeicoes(): Promise<RejeicaoBI[]> {
  const linhas = await buscarTudo((de, ate) =>
    supabase
      .from('medicoes_obra')
      .select('id, motivo_rejeicao')
      .eq('status', 'Rejeitada')
      .order('id', { ascending: true })
      .range(de, ate)
  );
  return linhas.map((r) => ({ medicaoId: r.id, motivo: r.motivo_rejeicao ?? undefined }));
}

export const indicadoresService = {
  async carregar(acesso: AcessoBI): Promise<DadosBI> {
    const [medicoes, etapas, contratos, faturamentos, rejeicoes] = await Promise.all([
      listarMedicoes(),
      listarEtapas(),
      acesso.contratos ? listarContratos() : Promise.resolve([]),
      acesso.razao ? listarFaturamentos() : Promise.resolve([]),
      listarRejeicoes(),
    ]);
    return { medicoes, etapas, contratos, faturamentos, rejeicoes };
  },
};
