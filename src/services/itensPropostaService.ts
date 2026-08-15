import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import {
  ItemProposta,
  AjustePreco,
  CategoriaCusto,
  ComponenteItemProposta,
  InsumoCatalogo,
  ResultadoSalvarNoCatalogo,
} from '../types';

/**
 * Itens de proposta — o caminho que faltava para orçar ANTES de vender.
 *
 * Até então a proposta era um único número digitado e o catálogo só conseguia
 * alimentar o orçamento de uma obra já existente. Agora a proposta é montada
 * item a item a partir do catálogo, e `propostas.valor_estimado` passa a ser
 * calculado pelo banco (soma dos itens × BDI) sempre que houver itens.
 *
 * Mesmo contrato de preço de insumos_projeto: base congelada + ajuste desta
 * proposta; `preco_unitario` é GENERATED e nunca vai no payload de escrita.
 */

type LinhaItemProposta = {
  id: string; proposta_id: string; catalogo_insumo_id: string | null; descricao: string;
  unidade: string; categoria: CategoriaCusto; quantidade: number; preco_unitario_base: number;
  ajuste_tipo: AjustePreco['tipo']; ajuste_valor: number; ajuste_motivo: string | null;
  preco_unitario: number; fornecedor_id: string | null; observacoes: string | null; ordem: number;
  // Origem SINAPI e agregados da composição. Opcionais porque o retorno de um
  // `insert`/`update` traz só as colunas da TABELA — a view é quem calcula os
  // três últimos. Sem o opcional, um insert devolveria `undefined` num campo
  // declarado obrigatório e o TypeScript deixaria passar.
  codigo_sinapi?: string | null;
  preco_referencia_sinapi?: number | null;
  qtd_componentes?: number;
  custo_composicao?: number | null;
  linhas_ajustadas?: number;
};

function fromRow(row: LinhaItemProposta): ItemProposta {
  return {
    id: row.id,
    propostaId: row.proposta_id,
    catalogoInsumoId: row.catalogo_insumo_id ?? undefined,
    codigoSINAPI: row.codigo_sinapi ?? undefined,
    precoReferenciaSinapi: row.preco_referencia_sinapi ?? undefined,
    descricao: row.descricao,
    unidade: row.unidade,
    categoria: row.categoria,
    quantidade: row.quantidade,
    precoUnitarioBase: row.preco_unitario_base,
    ajuste: {
      tipo: row.ajuste_tipo,
      valor: row.ajuste_valor,
      motivo: row.ajuste_motivo ?? undefined,
    },
    precoUnitario: row.preco_unitario,
    fornecedorId: row.fornecedor_id ?? undefined,
    observacoes: row.observacoes ?? undefined,
    ordem: row.ordem,
    qtdComponentes: row.qtd_componentes ?? 0,
    custoComposicao: row.custo_composicao ?? undefined,
    linhasAjustadas: row.linhas_ajustadas ?? 0,
  };
}

type LinhaComponente = {
  id: string; item_proposta_id: string; codigo_sinapi: string | null;
  catalogo_insumo_id: string | null; descricao: string; unidade: string;
  categoria: InsumoCatalogo['categoria']; coeficiente: number;
  coeficiente_referencia: number | null; preco_unitario: number;
  preco_unitario_referencia: number | null; custo: number; ordem: number;
};

function componenteFromRow(row: LinhaComponente): ComponenteItemProposta {
  return {
    id: row.id,
    itemPropostaId: row.item_proposta_id,
    codigoSINAPI: row.codigo_sinapi ?? undefined,
    catalogoInsumoId: row.catalogo_insumo_id ?? undefined,
    descricao: row.descricao,
    unidade: row.unidade,
    categoria: row.categoria,
    coeficiente: row.coeficiente,
    coeficienteReferencia: row.coeficiente_referencia ?? undefined,
    precoUnitario: row.preco_unitario,
    precoUnitarioReferencia: row.preco_unitario_referencia ?? undefined,
    custo: row.custo,
    ordem: row.ordem,
  };
}

/** O que a tela precisa reler depois de mexer num componente. */
export type EstadoItemComposicao = {
  item: ItemProposta;
  componentes: ComponenteItemProposta[];
};

export type NovoComponenteItemProposta = {
  descricao: string;
  unidade: string;
  categoria: InsumoCatalogo['categoria'];
  coeficiente: number;
  precoUnitario: number;
  /** Preenchido quando o componente é um insumo do catálogo da empresa. */
  catalogoInsumoId?: string;
  codigoSINAPI?: string;
};

export type NovoItemProposta = {
  propostaId: string;
  catalogoInsumoId?: string;
  descricao: string;
  unidade: string;
  categoria: CategoriaCusto;
  quantidade: number;
  precoUnitarioBase: number;
  ajuste: AjustePreco;
  fornecedorId?: string;
  observacoes?: string;
  ordem?: number;
};

export const itensPropostaService = {
  /**
   * `propostaId` é OBRIGATÓRIO (§2.3 da auditoria). O parâmetro era opcional e o
   * comentário admitia que a varredura completa só serviria a "rotinas
   * administrativas" — que não existem: a única chamada do app sempre passou a
   * proposta. Opcional, ele era uma varredura da tabela inteira a uma linha de
   * distância, do mesmo tipo que o §4.2 fechou nas quatro leituras do núcleo.
   */
  async list(propostaId: string): Promise<ItemProposta[]> {
    // Em blocos mesmo no caminho por proposta: uma proposta grande passa de 1000
    // itens sem nada de excepcional, e é a composição que vira o valor vendido.
    // `v_itens_proposta` e não a tabela: é a view que traz os agregados da
    // composição (quantos componentes, quanto custa, quantas linhas foram
    // adaptadas). Contá-los no cliente exigiria trazer a composição inteira de
    // todos os itens só para exibir um número na linha fechada.
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('v_itens_proposta')
        .select('*')
        .eq('proposta_id', propostaId)
        .order('ordem', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(fromRow);
  },

  /**
   * Relê UM item pela view. Toda escrita em composição volta por aqui em vez de
   * devolver a linha do `update`: o agregado (custo, linhas ajustadas) e o
   * `preco_unitario_base` recalculado pelo gatilho só existem depois do commit,
   * e o retorno de um `update` na tabela traria os valores de antes.
   */
  async recarregar(id: string): Promise<ItemProposta> {
    const { data, error } = await supabase
      .from('v_itens_proposta')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async add(novo: NovoItemProposta): Promise<ItemProposta> {
    const { data, error } = await supabase
      .from('itens_proposta')
      .insert({
        proposta_id: novo.propostaId,
        catalogo_insumo_id: novo.catalogoInsumoId,
        descricao: novo.descricao,
        unidade: novo.unidade,
        categoria: novo.categoria,
        quantidade: novo.quantidade,
        preco_unitario_base: novo.precoUnitarioBase,
        ajuste_tipo: novo.ajuste.tipo,
        ajuste_valor: novo.ajuste.valor,
        ajuste_motivo: novo.ajuste.motivo,
        fornecedor_id: novo.fornecedorId,
        observacoes: novo.observacoes,
        ordem: novo.ordem ?? 0,
      })
      .select('id')
      .single();
    if (error) throw error;
    // Relê pela view: o `insert` devolve as colunas da TABELA, e os agregados
    // da composição (que um item recém-criado ainda não tem, mas passa a ter
    // assim que alguém copiar uma) moram na view. Ler sempre do mesmo lugar
    // evita um item na lista com forma diferente dos vizinhos.
    return this.recarregar(data.id);
  },

  /** O ajuste desta proposta. O catálogo global não é tocado. */
  async atualizarAjuste(id: string, ajuste: AjustePreco): Promise<ItemProposta> {
    const { data, error } = await supabase
      .from('itens_proposta')
      .update({
        ajuste_tipo: ajuste.tipo,
        ajuste_valor: ajuste.valor,
        ajuste_motivo: ajuste.motivo ?? null,
      })
      .eq('id', id)
      .select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('ajustar o preço desta proposta'));
    return this.recarregar(id);
  },

  async atualizarQuantidade(id: string, quantidade: number): Promise<ItemProposta> {
    const { data, error } = await supabase
      .from('itens_proposta')
      .update({ quantidade })
      .eq('id', id)
      .select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('alterar a quantidade desta proposta'));
    return this.recarregar(id);
  },

  async remove(id: string): Promise<void> {
    const { data, error } = await supabase.from('itens_proposta').delete().eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('remover itens da proposta'));
  },

  // ==========================================================
  // SINAPI DIRETO NA PROPOSTA
  // ==========================================================

  /**
   * Traz uma atividade da base SINAPI para a proposta SEM passar pelo catálogo.
   *
   * RPC e não `insert`, pelo mesmo motivo de `sinapi_adotar`: são até 25
   * escritas (o item mais os componentes do nível 1) e, por PostgREST, uma
   * falha no meio deixaria metade da composição gravada — um item com custo
   * pela metade, que é pior do que nenhum item.
   *
   * Devolve o item já relido pela view: o `preco_unitario_base` que interessa é
   * o que o gatilho da composição calculou, não o que foi inserido.
   */
  async adicionarDoSinapi(
    propostaId: string,
    codigo: number,
    quantidade: number,
    opcoes: { uf?: string; regime?: string; publicacaoId?: number } = {}
  ): Promise<ItemProposta> {
    const { data, error } = await supabase.rpc('proposta_adicionar_sinapi', {
      p_proposta_id: propostaId,
      p_codigo: codigo,
      p_quantidade: quantidade,
      p_publicacao: opcoes.publicacaoId ?? null,
      p_uf: opcoes.uf ?? 'MG',
      p_regime: opcoes.regime ?? 'SD',
    });
    if (error) throw error;
    if (!data) throw new Error('A inclusão não devolveu o item criado.');
    return this.recarregar(data as string);
  },

  /** Os componentes da composição DESTA proposta. */
  async listarComposicao(itemId: string): Promise<ComponenteItemProposta[]> {
    const { data, error } = await supabase
      .from('itens_proposta_composicao')
      .select('*')
      .eq('item_proposta_id', itemId)
      .order('ordem', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(componenteFromRow);
  },

  /**
   * Copia para a proposta a composição do item de catálogo que a originou.
   *
   * É o outro lado do fluxo: um item que veio do catálogo e tem composição
   * própria também precisa poder ser adaptado à obra, e adaptar exige uma cópia
   * — editar a do catálogo mudaria o padrão da empresa em todas as propostas.
   */
  async copiarComposicaoDoCatalogo(itemId: string): Promise<EstadoItemComposicao> {
    const { error } = await supabase.rpc('proposta_item_copiar_composicao_catalogo', {
      p_item_id: itemId,
    });
    if (error) throw error;
    return this.estadoDaComposicao(itemId);
  },

  async addComponente(
    itemId: string,
    novo: NovoComponenteItemProposta
  ): Promise<EstadoItemComposicao> {
    const { error } = await supabase.from('itens_proposta_composicao').insert({
      item_proposta_id: itemId,
      codigo_sinapi: novo.codigoSINAPI ?? null,
      catalogo_insumo_id: novo.catalogoInsumoId ?? null,
      descricao: novo.descricao,
      unidade: novo.unidade,
      categoria: novo.categoria,
      coeficiente: novo.coeficiente,
      // Sem `*_referencia`: linha acrescentada à mão não tem de onde partir, e
      // inventar uma referência igual ao valor digitado faria a tela dizer que
      // ela está "igual ao SINAPI".
      preco_unitario: novo.precoUnitario,
    });
    if (error) throw error;
    return this.estadoDaComposicao(itemId);
  },

  /**
   * O coeficiente e o preço de UMA linha, adaptados a esta obra.
   *
   * `.select()` + contagem porque uma escrita recusada pela RLS volta como
   * sucesso com zero linhas — e aqui isso mostraria na tela um custo que não
   * foi gravado.
   */
  async atualizarComponente(
    componenteId: string,
    itemId: string,
    patch: { coeficiente: number; precoUnitario: number }
  ): Promise<EstadoItemComposicao> {
    const { data, error } = await supabase
      .from('itens_proposta_composicao')
      .update({ coeficiente: patch.coeficiente, preco_unitario: patch.precoUnitario })
      .eq('id', componenteId)
      .select();
    if (error) throw error;
    garantirEscrita(data, semPermissao('editar a composição desta proposta'));
    return this.estadoDaComposicao(itemId);
  },

  async removerComponente(componenteId: string, itemId: string): Promise<EstadoItemComposicao> {
    const { data, error } = await supabase
      .from('itens_proposta_composicao')
      .delete()
      .eq('id', componenteId)
      .select();
    if (error) throw error;
    garantirEscrita(data, semPermissao('remover linhas da composição'));
    return this.estadoDaComposicao(itemId);
  },

  /**
   * Item e componentes relidos JUNTOS.
   *
   * Mexer num coeficiente muda de uma vez a lista de componentes, o custo da
   * composição e o `preco_unitario_base` do item (por gatilho). Buscar isso em
   * pedaços deixaria a tela meio atualizada — o coeficiente novo ao lado do
   * total velho, que é pior do que não atualizar nada. Mesma tese de
   * `catalogoService.estadoDaComposicao`.
   */
  async estadoDaComposicao(itemId: string): Promise<EstadoItemComposicao> {
    const [item, componentes] = await Promise.all([
      this.recarregar(itemId),
      this.listarComposicao(itemId),
    ]);
    return { item, componentes };
  },

  /**
   * Promove a composição desta proposta a item do catálogo da empresa.
   *
   * A ação é EXPLÍCITA e nunca automática: editar a composição de uma proposta
   * não pode mudar o padrão da empresa sem alguém pedir. O que vai para o
   * catálogo é a composição AJUSTADA — é justamente por ela ter sido ajustada
   * que vale a pena guardá-la.
   */
  async salvarNoCatalogo(
    itemId: string,
    opcoes: { uf?: string; regime?: string } = {}
  ): Promise<ResultadoSalvarNoCatalogo> {
    const { data, error } = await supabase.rpc('proposta_item_salvar_no_catalogo', {
      p_item_id: itemId,
      p_uf: opcoes.uf ?? 'MG',
      p_regime: opcoes.regime ?? 'SD',
    });
    if (error) throw error;
    if (!data) throw new Error('A gravação no catálogo não devolveu resultado.');
    return {
      catalogoInsumoId: data.catalogo_insumo_id,
      jaExistia: data.ja_existia,
      componentes: data.componentes,
      itensCriados: data.itens_criados,
      itensReusados: data.itens_reusados,
      custoProposta: Number(data.custo_proposta ?? 0),
      custoCatalogo: Number(data.custo_catalogo ?? 0),
      precosDivergentes: (data.precos_divergentes ?? []).map((d: any) => ({
        descricao: d.descricao,
        precoProposta: Number(d.preco_proposta),
        precoCatalogo: Number(d.preco_catalogo),
      })),
    };
  },
};
