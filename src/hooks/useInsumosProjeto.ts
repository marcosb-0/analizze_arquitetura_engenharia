import { useEffect, useState } from 'react';
import { InsumoProjeto, AjustePreco } from '../types';
import { insumosProjetoService, NovoInsumoProjeto } from '../services/insumosProjetoService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

/**
 * Quantitativo de insumos por obra. Alterações de quantidade ou de ajuste
 * recalculam `itens_orcamento.valor_orcado` por trigger no banco — por isso
 * todo handler devolve um sinal para quem precisa reler o orçamento
 * (`refreshOrcamentos` no App).
 */
export function useInsumosProjeto() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [insumosProjeto, setInsumosProjeto] = useState<InsumoProjeto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setInsumosProjeto([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    insumosProjetoService
      .list()
      .then(setInsumosProjeto)
      .catch((err) => toast.error('Falha ao carregar insumos das obras.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const substituir = (item: InsumoProjeto) =>
    setInsumosProjeto((prev) => prev.map((i) => (i.id === item.id ? item : i)));

  const handleAddInsumoProjeto = async (novo: NovoInsumoProjeto) => {
    try {
      const criado = await insumosProjetoService.add(novo);
      setInsumosProjeto((prev) => [...prev, criado]);
      return criado;
    } catch (err: any) {
      toast.error('Falha ao registrar insumo na obra.', err.message);
      return null;
    }
  };

  /**
   * Acréscimo ou desconto neste orçamento. O preço de referência do catálogo
   * permanece exatamente como está — só a linha desta obra muda.
   */
  const handleAjustarPrecoInsumo = async (id: string, ajuste: AjustePreco) => {
    try {
      const atualizado = await insumosProjetoService.atualizarAjuste(id, ajuste);
      substituir(atualizado);
      return atualizado;
    } catch (err: any) {
      toast.error('Falha ao ajustar o preço do insumo.', err.message);
      return null;
    }
  };

  const handleAjustarQuantidadeInsumo = async (id: string, quantidade: number) => {
    try {
      const atualizado = await insumosProjetoService.atualizarQuantidade(id, quantidade);
      substituir(atualizado);
      return atualizado;
    } catch (err: any) {
      toast.error('Falha ao alterar a quantidade.', err.message);
      return null;
    }
  };

  const handleRessincronizarBase = async (id: string, novaBase: number) => {
    try {
      const atualizado = await insumosProjetoService.ressincronizarBase(id, novaBase);
      substituir(atualizado);
      toast.success('Preço base atualizado com o catálogo.', 'O ajuste desta obra foi mantido.');
      return atualizado;
    } catch (err: any) {
      toast.error('Falha ao ressincronizar o preço base.', err.message);
      return null;
    }
  };

  const handleRemoveInsumoProjeto = async (id: string) => {
    const previous = insumosProjeto;
    setInsumosProjeto((prev) => prev.filter((i) => i.id !== id));
    try {
      await insumosProjetoService.remove(id);
      return true;
    } catch (err: any) {
      setInsumosProjeto(previous);
      toast.error('Falha ao remover o insumo da obra.', err.message);
      return false;
    }
  };

  const refreshInsumosProjeto = () =>
    insumosProjetoService.list().then(setInsumosProjeto).catch(() => {});

  return {
    insumosProjeto,
    loading,
    handleAddInsumoProjeto,
    handleAjustarPrecoInsumo,
    handleAjustarQuantidadeInsumo,
    handleRessincronizarBase,
    handleRemoveInsumoProjeto,
    refreshInsumosProjeto,
  };
}
