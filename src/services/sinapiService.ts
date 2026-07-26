import { supabase } from '../lib/supabaseClient';
import {
  PublicacaoSINAPI,
  ResultadoSINAPI,
  LinhaCustoSINAPI,
  ResultadoAdocao,
  RegimeSINAPI,
  RegimeAdotavel,
} from '../types';

/**
 * Base de referência SINAPI.
 *
 * Tudo aqui é RPC, não `.from()`: as tabelas vivem no schema `referencia`, que o
 * PostgREST não expõe. Só a leitura de `v_sinapi_publicacao` é uma view, porque
 * não precisa de parâmetro.
 *
 * Três coisas que este serviço NÃO faz, de propósito:
 *
 * 1. Não calcula custo. O custo publicado pelo SINAPI é a autoridade e vem do
 *    banco. O SINAPI trunca em centavos a cada passo (medido: `0,0212 × 22,51`
 *    publica `0,47`, não `0,48`), e replicar isso em JavaScript daria duas contas
 *    para divergirem.
 * 2. Não escreve no catálogo item por item. A adoção é uma transação só no banco
 *    (`sinapi_adotar`) porque adotar uma composição expandida são até 25
 *    escritas — por PostgREST, uma falha no meio deixaria metade dos componentes.
 * 3. Não esconde item sem preço. `preco: null` significa que o SINAPI não publica
 *    preço para aquela UF/regime, o que é diferente de custar zero.
 */

/** Página da busca. O PostgREST corta em 1000 de qualquer jeito. */
export const SINAPI_PAGINA = 40;

/** UF padrão: a empresa opera em Congonhas–MG e só MG foi importada. */
export const SINAPI_UF_PADRAO = 'MG';

export type FiltroSINAPI = {
  termo?: string;
  tipo?: 'INSUMO' | 'COMPOSICAO';
  uf?: string;
  regime?: RegimeSINAPI;
  publicacaoId?: number;
  pagina?: number;
};

type LinhaBusca = {
  codigo: number;
  tipo: 'INSUMO' | 'COMPOSICAO';
  descricao: string;
  unidade: string | null;
  grupo: string | null;
  preco: number | null;
  situacao: string | null;
  qtd_componentes: number;
  ja_adotado: boolean;
  total: number;
};

function resultadoFromRow(row: LinhaBusca): ResultadoSINAPI {
  return {
    codigo: row.codigo,
    tipo: row.tipo,
    descricao: row.descricao,
    unidade: row.unidade ?? undefined,
    grupo: row.grupo ?? undefined,
    preco: row.preco,
    situacao: row.situacao ?? undefined,
    qtdComponentes: Number(row.qtd_componentes ?? 0),
    jaAdotado: Boolean(row.ja_adotado),
  };
}

export const sinapiService = {
  /**
   * Publicações importadas. Só as que fecharam a importação aparecem — a view
   * filtra por `concluida_em`, então uma importação interrompida nunca é vista
   * como base vigente.
   */
  async publicacoes(): Promise<PublicacaoSINAPI[]> {
    const { data, error } = await supabase
      .from('v_sinapi_publicacao')
      .select('id, mes_referencia, data_emissao, vigente')
      .order('mes_referencia', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((p) => ({
      id: p.id,
      mesReferencia: p.mes_referencia,
      dataEmissao: p.data_emissao,
      vigente: p.vigente,
    }));
  },

  /**
   * Busca paginada. `total` volta repetido em toda linha (janela `count(*) over
   * ()` no banco) — é lido da primeira e some da forma que o app usa.
   */
  async buscar(filtro: FiltroSINAPI): Promise<{ itens: ResultadoSINAPI[]; total: number }> {
    const pagina = filtro.pagina ?? 0;
    const { data, error } = await supabase.rpc('sinapi_buscar', {
      p_termo: filtro.termo?.trim() || null,
      p_uf: filtro.uf ?? SINAPI_UF_PADRAO,
      p_regime: filtro.regime ?? 'SD',
      p_tipo: filtro.tipo ?? null,
      p_publicacao: filtro.publicacaoId ?? null,
      p_limite: SINAPI_PAGINA,
      p_offset: pagina * SINAPI_PAGINA,
    });
    if (error) throw error;
    const linhas = (data ?? []) as LinhaBusca[];
    return {
      itens: linhas.map(resultadoFromRow),
      total: linhas.length > 0 ? Number(linhas[0].total) : 0,
    };
  },

  /**
   * Detalhamento de uma composição. Devolve TODOS os níveis; quem consome decide
   * o que mostrar. Só o nível 1 soma o custo publicado — somar níveis diferentes
   * conta o mesmo custo duas vezes.
   */
  async custoExpandido(
    codigo: number,
    opcoes: { uf?: string; regime?: RegimeSINAPI; publicacaoId?: number } = {}
  ): Promise<LinhaCustoSINAPI[]> {
    const { data, error } = await supabase.rpc('sinapi_custo_expandido', {
      p_composicao: codigo,
      p_publicacao: opcoes.publicacaoId ?? null,
      p_uf: opcoes.uf ?? SINAPI_UF_PADRAO,
      p_regime: opcoes.regime ?? 'SD',
    });
    if (error) throw error;
    return (data ?? []).map((l) => ({
      nivel: l.nivel,
      item: l.item,
      descricao: l.descricao,
      unidade: l.unidade ?? undefined,
      tipo: l.tipo,
      coeficiente: Number(l.coeficiente),
      coefAcumulado: Number(l.coef_acumulado),
      precoUnitario: l.preco_unitario === null ? null : Number(l.preco_unitario),
      custo: l.custo === null ? null : Number(l.custo),
    }));
  },

  /**
   * Copia para o catálogo da empresa.
   *
   * `modo: 'item'` guarda o custo publicado e nada mais — o número fica idêntico
   * ao oficial porque uma composição sem componentes não tem o preço reescrito
   * pelo gatilho. `modo: 'expandido'` cria também os componentes diretos, e aí o
   * preço passa a ser derivado e diverge do oficial em centavos. O retorno traz
   * os dois números justamente para a tela poder mostrar a diferença.
   */
  async adotar(
    codigo: number,
    modo: 'item' | 'expandido',
    opcoes: { uf?: string; regime?: RegimeAdotavel; publicacaoId?: number } = {}
  ): Promise<ResultadoAdocao> {
    const { data, error } = await supabase.rpc('sinapi_adotar', {
      p_codigo: codigo,
      p_modo: modo,
      p_publicacao: opcoes.publicacaoId ?? null,
      p_uf: opcoes.uf ?? SINAPI_UF_PADRAO,
      p_regime: opcoes.regime ?? 'SD',
    });
    if (error) throw error;
    if (!data) {
      throw new Error('A adoção não devolveu resultado.');
    }
    return {
      insumoId: data.insumo_id,
      codigo: data.codigo,
      descricao: data.descricao,
      modo: data.modo,
      jaExistia: data.ja_existia,
      itensCriados: data.itens_criados,
      itensReusados: data.itens_reusados,
      ignorados: data.ignorados ?? [],
      custoSinapi: data.custo_sinapi === null ? null : Number(data.custo_sinapi),
      custoCatalogo: Number(data.custo_catalogo),
      diferenca: data.diferenca === null ? null : Number(data.diferenca),
    };
  },
};
