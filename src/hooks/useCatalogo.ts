import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InsumoCatalogo, CotacaoFornecedor } from '../types';
import { catalogoService, FiltroCatalogo, EstadoComposicao, CATALOGO_PAGINA } from '../services/catalogoService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { comRollback } from './comRollback';

/**
 * O catálogo passou a ser paginado e filtrado NO SERVIDOR — antes a tela puxava
 * a base inteira (mais todo o histórico de preços e todas as cotações) a cada
 * montagem e filtrava em memória, o que truncava silenciosamente no limite de
 * 1000 linhas do PostgREST.
 */
/**
 * `ativo` adia a busca até a aba que precisa destes dados ser aberta.
 *
 * Os 20 hooks disparavam juntos no login, independentemente do papel e da aba:
 * um usuário de `campo`, que só enxerga Indicadores e Obras, buscava catálogo,
 * financeiro, propostas e acessos — a maioria voltando vazia pela RLS. Eram ~20
 * idas ao servidor antes do primeiro pixel útil.
 *
 * Uma vez ativo, continua ativo (ver App.tsx): voltar a uma aba já visitada não
 * refaz a busca.
 */
export function useCatalogo(ativo = true) {
  const { toast } = useFeedback();
  const { session, role } = useAuth();
  const [catalogo, setCatalogo] = useState<InsumoCatalogo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroCatalogo>({ ativo: true, pagina: 0 });

  const userId = session?.user.id;

  /**
   * §3.4 do diagnóstico do catálogo: a aba Obras declara `catalogo` entre seus
   * dados, e `financeiro` tem acesso a Obras — mas `catalogo_insumos` só tem
   * policy para admin e gestão. O resultado era uma ida ao servidor
   * garantidamente vazia, em silêncio, e um seletor de insumos sem explicação.
   *
   * O diagnóstico propunha tirar `catalogo` da lista da aba, mas isso quebraria
   * o seletor para quem PODE usá-lo. O critério certo é o papel, e aqui vale
   * para todas as abas que declaram este domínio de uma vez.
   */
  const podeLerCatalogo = role === 'admin' || role === 'gestao';

  // `userId` e não `session`: o objeto de sessão é recriado a cada renovação de
  // token (~1h) e refaria a busca sem nada ter mudado. Ver a nota nos outros hooks.
  /**
   * Contador de gerações — descarta resposta obsoleta.
   *
   * `carregar` não é uma busca de efeito com `cleanup`: é chamada a cada tecla no
   * filtro e a cada troca de página. Duas em voo, a mais LENTA vencendo, é o caso
   * comum de campo de busca — o usuário digita "cim", depois "cimento", e a
   * resposta de "cim" chega depois e repõe o resultado errado na tela.
   *
   * `comCancelamento` não serve aqui porque não há efeito de onde devolver a
   * limpeza; o equivalente para callback é comparar a geração no retorno.
   */
  const geracao = useRef(0);

  const carregar = useCallback(
    async (f: FiltroCatalogo) => {
      if (!userId) return;
      const minhaGeracao = ++geracao.current;
      setLoading(true);
      try {
        const { itens, total: qtd } = await catalogoService.list(f);
        if (minhaGeracao !== geracao.current) return; // uma busca mais nova já assumiu
        setCatalogo(itens);
        setTotal(qtd);
      } catch (err: any) {
        if (minhaGeracao !== geracao.current) return;
        toast.error('Falha ao carregar catálogo.', err.message);
      } finally {
        if (minhaGeracao === geracao.current) setLoading(false);
      }
    },
    [userId, toast]
  );

  useEffect(() => {
    if (!userId || !ativo || !podeLerCatalogo) {
      setCatalogo([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    carregar(filtro);
    // `carregar` é `useCallback` estável (depende só de `userId` e `toast`), então
    // pode entrar na lista — antes ficava de fora atrás de um disable.
  }, [userId, filtro, ativo, podeLerCatalogo, carregar]);

  const aplicarFiltro = useCallback((patch: Partial<FiltroCatalogo>) => {
    // Qualquer mudança de critério volta para a primeira página — senão a
    // busca cai numa página que não existe mais no resultado novo.
    setFiltro((prev) => ({ ...prev, ...patch, pagina: patch.pagina ?? 0 }));
  }, []);

  const recarregar = useCallback(() => carregar(filtro), [carregar, filtro]);

  const substituir = useCallback(
    (item: InsumoCatalogo) => setCatalogo((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...item } : i))),
    []
  );

  const handleAddCatalogoItem = useCallback(async (item: InsumoCatalogo) => {
    try {
      await catalogoService.add(item);
      await recarregar();
    } catch (err: any) {
      toast.error('Falha ao salvar insumo.', err.message);
    }
  }, [recarregar, toast]);

  /**
   * Edição completa. Quando o preço muda, o ponto no histórico e a nova
   * `data_atualizacao_preco` vêm do servidor (trigger) — por isso relemos o
   * insumo em vez de confiar no objeto local.
   */
  const handleUpdateCatalogoItem = useCallback(async (item: InsumoCatalogo) => {
    // `substituir` é um atalho para `setCatalogo(prev => ...)`; aqui a captura
    // precisa acontecer na mesma aplicação, então a forma funcional vem explícita.
    const { aplicar, desfazer } = comRollback(setCatalogo);
    aplicar((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...item } : i)));
    try {
      const atualizado = await catalogoService.update(item);
      substituir({ ...item, ...atualizado });
      return atualizado;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar insumo.', err.message);
      return null;
    }
  }, [substituir, toast]);

  /** Soft-delete: DELETE está revogado no banco para não destruir procedência. */
  const handleSetAtivoCatalogoItem = useCallback(async (id: string, ativo: boolean) => {
    const { aplicar, desfazer } = comRollback(setCatalogo);
    aplicar((prev) =>
      // Com o filtro "apenas ativos" ligado, o item some da lista ao ser desativado.
      filtro.ativo !== undefined && filtro.ativo !== ativo
        ? prev.filter((i) => i.id !== id)
        : prev.map((i) => (i.id === id ? { ...i, ativo } : i))
    );
    try {
      await catalogoService.setAtivo(id, ativo);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar situação do insumo.', err.message);
    }
  }, [filtro, toast]);

  /** Consulta de apoio para a confirmação de exclusão. */
  const carregarUsos = useCallback(async (id: string) => {
    try {
      return await catalogoService.usos(id);
    } catch (err: any) {
      toast.error('Falha ao verificar os usos do insumo.', err.message);
      return null;
    }
  }, [toast]);

  /**
   * Exclusão definitiva — só passa para item sem nenhum uso; o banco é quem
   * decide e devolve a mensagem quando recusa. Como o total muda e a página
   * atual pode ficar com um item a menos, recarregamos em vez de só tirar da
   * lista local.
   */
  const handleExcluirCatalogoItem = useCallback(async (id: string) => {
    try {
      const resultado = await catalogoService.excluir(id);
      await recarregar();
      return resultado;
    } catch (err: any) {
      toast.error('Não foi possível excluir o insumo.', err.message);
      return null;
    }
  }, [recarregar, toast]);

  const handleAddCotacao = useCallback(async (insumoId: string, quote: CotacaoFornecedor) => {
    try {
      const criada = await catalogoService.addCotacao(insumoId, quote);
      setCatalogo((prev) =>
        prev.map((i) =>
          i.id === insumoId
            ? {
                ...i,
                // v_cotacoes_atuais só devolve a mais recente por fornecedor —
                // o espelho local segue a mesma regra.
                cotacoesFornecedores: [
                  ...(i.cotacoesFornecedores ?? []).filter((q) => q.fornecedorId !== criada.fornecedorId),
                  criada,
                ],
              }
            : i
        )
      );
      return criada;
    } catch (err: any) {
      toast.error('Falha ao registrar cotação.', err.message);
      return null;
    }
  }, [toast]);

  const handleDesativarCotacao = useCallback(async (insumoId: string, cotacaoId: string) => {
    const { aplicar, desfazer } = comRollback(setCatalogo);
    aplicar((prev) =>
      prev.map((i) =>
        i.id === insumoId
          ? { ...i, cotacoesFornecedores: (i.cotacoesFornecedores ?? []).filter((q) => q.id !== cotacaoId) }
          : i
      )
    );
    try {
      await catalogoService.desativarCotacao(cotacaoId);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao desativar cotação.', err.message);
    }
  }, [toast]);

  /** Promove o preço de uma cotação a referência global — registra no histórico. */
  const handleAdotarPrecoCotacao = useCallback(async (insumoId: string, preco: number) => {
    try {
      const atualizado = await catalogoService.adotarPrecoDaCotacao(insumoId, preco);
      substituir(atualizado);
      toast.success('Preço de referência atualizado.', 'O ponto foi registrado no histórico do insumo.');
      return atualizado;
    } catch (err: any) {
      toast.error('Falha ao atualizar preço de referência.', err.message);
      return null;
    }
  }, [substituir, toast]);

  const carregarDetalhe = useCallback(async (insumoId: string, incluirComponentes = false) => {
    try {
      return await catalogoService.carregarDetalhe(insumoId, incluirComponentes);
    } catch (err: any) {
      toast.error('Falha ao carregar histórico do insumo.', err.message);
      return null;
    }
  }, [toast]);

  /**
   * Mexer em componente muda o preço da composição — e o preço é calculado por
   * trigger no banco. Por isso cada handler aplica no card da listagem a
   * composição RELIDA do servidor, não um cálculo local: manter uma segunda
   * conta no cliente é convidar as duas a divergirem.
   */
  const aplicarEstado = useCallback(
    (estado: EstadoComposicao) => {
      // `composicao` já vem com os agregados grudados pelo serviço, então o
      // card da listagem atualiza preço, HH e quebra por categoria na mesma
      // troca — não há janela em que um esteja novo e o outro velho.
      substituir(estado.composicao);
      return estado;
    },
    [substituir]
  );

  /**
   * Tudo o que a área de trabalho da composição precisa, numa abertura só.
   * Separado de `carregarDetalhe` porque o drawer não precisa da árvore nem da
   * quebra por cargo — e as duas custam recursão no banco.
   */
  const carregarComposicao = useCallback(async (composicaoId: string) => {
    try {
      return await catalogoService.carregarComposicao(composicaoId);
    } catch (err: any) {
      toast.error('Falha ao abrir a composição.', err.message);
      return null;
    }
  }, [toast]);

  const handleAddComponente = useCallback(async (
    composicaoId: string,
    entrada: { insumoId: string; coeficiente: number; observacao?: string }
  ) => {
    try {
      return aplicarEstado(await catalogoService.addComponente(composicaoId, entrada));
    } catch (err: any) {
      // Ciclo, item que não é composição e insumo repetido chegam aqui com a
      // mensagem do banco — que é específica o suficiente para virar toast.
      toast.error('Não foi possível adicionar o componente.', err.message);
      return null;
    }
  }, [aplicarEstado, toast]);

  const handleUpdateComponente = useCallback(async (
    componenteId: string,
    composicaoId: string,
    patch: { coeficiente: number; observacao?: string }
  ) => {
    try {
      return aplicarEstado(await catalogoService.updateComponente(componenteId, composicaoId, patch));
    } catch (err: any) {
      toast.error('Falha ao atualizar o componente.', err.message);
      return null;
    }
  }, [aplicarEstado, toast]);

  const handleRemoverComponente = useCallback(async (componenteId: string, composicaoId: string) => {
    try {
      return aplicarEstado(await catalogoService.removerComponente(componenteId, composicaoId));
    } catch (err: any) {
      toast.error('Falha ao remover o componente.', err.message);
      return null;
    }
  }, [aplicarEstado, toast]);

  const buscarCandidatosComponente = useCallback(async (termo: string, excluirId: string) => {
    try {
      return await catalogoService.buscarCandidatos(termo, excluirId);
    } catch (err: any) {
      toast.error('Falha ao buscar insumos.', err.message);
      return [];
    }
  }, [toast]);

  return useMemo(() => ({
    catalogo,
    total,
    loading,
    filtro,
    paginas: Math.max(1, Math.ceil(total / CATALOGO_PAGINA)),
    aplicarFiltro,
    recarregar,
    carregarDetalhe,
    carregarComposicao,
    handleAddCatalogoItem,
    handleUpdateCatalogoItem,
    handleSetAtivoCatalogoItem,
    carregarUsos,
    handleExcluirCatalogoItem,
    handleAddCotacao,
    handleDesativarCotacao,
    handleAdotarPrecoCotacao,
    handleAddComponente,
    handleUpdateComponente,
    handleRemoverComponente,
    buscarCandidatosComponente,
  }), [
    catalogo,
    total,
    loading,
    filtro,
    aplicarFiltro,
    recarregar,
    carregarDetalhe,
    carregarComposicao,
    handleAddCatalogoItem,
    handleUpdateCatalogoItem,
    handleSetAtivoCatalogoItem,
    carregarUsos,
    handleExcluirCatalogoItem,
    handleAddCotacao,
    handleDesativarCotacao,
    handleAdotarPrecoCotacao,
    handleAddComponente,
    handleUpdateComponente,
    handleRemoverComponente,
    buscarCandidatosComponente,
  ]);
}
