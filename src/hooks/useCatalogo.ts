import { useCallback, useEffect, useState } from 'react';
import { InsumoCatalogo, CotacaoFornecedor } from '../types';
import { catalogoService, FiltroCatalogo, CATALOGO_PAGINA } from '../services/catalogoService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

/**
 * O catálogo passou a ser paginado e filtrado NO SERVIDOR — antes a tela puxava
 * a base inteira (mais todo o histórico de preços e todas as cotações) a cada
 * montagem e filtrava em memória, o que truncava silenciosamente no limite de
 * 1000 linhas do PostgREST.
 */
export function useCatalogo() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [catalogo, setCatalogo] = useState<InsumoCatalogo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroCatalogo>({ ativo: true, pagina: 0 });

  const carregar = useCallback(
    async (f: FiltroCatalogo) => {
      if (!session) return;
      setLoading(true);
      try {
        const { itens, total: qtd } = await catalogoService.list(f);
        setCatalogo(itens);
        setTotal(qtd);
      } catch (err: any) {
        toast.error('Falha ao carregar catálogo.', err.message);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.user.id]
  );

  useEffect(() => {
    if (!session) {
      setCatalogo([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    carregar(filtro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, filtro]);

  const aplicarFiltro = (patch: Partial<FiltroCatalogo>) => {
    // Qualquer mudança de critério volta para a primeira página — senão a
    // busca cai numa página que não existe mais no resultado novo.
    setFiltro((prev) => ({ ...prev, ...patch, pagina: patch.pagina ?? 0 }));
  };

  const recarregar = () => carregar(filtro);

  const substituir = (item: InsumoCatalogo) =>
    setCatalogo((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...item } : i)));

  const handleAddCatalogoItem = async (item: InsumoCatalogo) => {
    try {
      await catalogoService.add(item);
      await recarregar();
    } catch (err: any) {
      toast.error('Falha ao salvar insumo.', err.message);
    }
  };

  /**
   * Edição completa. Quando o preço muda, o ponto no histórico e a nova
   * `data_atualizacao_preco` vêm do servidor (trigger) — por isso relemos o
   * insumo em vez de confiar no objeto local.
   */
  const handleUpdateCatalogoItem = async (item: InsumoCatalogo) => {
    const previous = catalogo;
    substituir(item);
    try {
      const atualizado = await catalogoService.update(item);
      substituir({ ...item, ...atualizado });
      return atualizado;
    } catch (err: any) {
      setCatalogo(previous);
      toast.error('Falha ao atualizar insumo.', err.message);
      return null;
    }
  };

  /** Soft-delete: DELETE está revogado no banco para não destruir procedência. */
  const handleSetAtivoCatalogoItem = async (id: string, ativo: boolean) => {
    const previous = catalogo;
    setCatalogo((prev) =>
      // Com o filtro "apenas ativos" ligado, o item some da lista ao ser desativado.
      filtro.ativo !== undefined && filtro.ativo !== ativo
        ? prev.filter((i) => i.id !== id)
        : prev.map((i) => (i.id === id ? { ...i, ativo } : i))
    );
    try {
      await catalogoService.setAtivo(id, ativo);
    } catch (err: any) {
      setCatalogo(previous);
      toast.error('Falha ao atualizar situação do insumo.', err.message);
    }
  };

  const handleAddCotacao = async (insumoId: string, quote: CotacaoFornecedor) => {
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
  };

  const handleDesativarCotacao = async (insumoId: string, cotacaoId: string) => {
    const previous = catalogo;
    setCatalogo((prev) =>
      prev.map((i) =>
        i.id === insumoId
          ? { ...i, cotacoesFornecedores: (i.cotacoesFornecedores ?? []).filter((q) => q.id !== cotacaoId) }
          : i
      )
    );
    try {
      await catalogoService.desativarCotacao(cotacaoId);
    } catch (err: any) {
      setCatalogo(previous);
      toast.error('Falha ao desativar cotação.', err.message);
    }
  };

  /** Promove o preço de uma cotação a referência global — registra no histórico. */
  const handleAdotarPrecoCotacao = async (insumoId: string, preco: number) => {
    try {
      const atualizado = await catalogoService.adotarPrecoDaCotacao(insumoId, preco);
      substituir(atualizado);
      toast.success('Preço de referência atualizado.', 'O ponto foi registrado no histórico do insumo.');
      return atualizado;
    } catch (err: any) {
      toast.error('Falha ao atualizar preço de referência.', err.message);
      return null;
    }
  };

  const carregarDetalhe = async (insumoId: string) => {
    try {
      return await catalogoService.carregarDetalhe(insumoId);
    } catch (err: any) {
      toast.error('Falha ao carregar histórico do insumo.', err.message);
      return null;
    }
  };

  return {
    catalogo,
    total,
    loading,
    filtro,
    paginas: Math.max(1, Math.ceil(total / CATALOGO_PAGINA)),
    aplicarFiltro,
    recarregar,
    carregarDetalhe,
    handleAddCatalogoItem,
    handleUpdateCatalogoItem,
    handleSetAtivoCatalogoItem,
    handleAddCotacao,
    handleDesativarCotacao,
    handleAdotarPrecoCotacao,
  };
}
