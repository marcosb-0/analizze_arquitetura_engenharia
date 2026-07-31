import { useEffect, useState } from 'react';
import { InsumoProjeto, AjustePreco } from '../types';
import { insumosProjetoService, NovoInsumoProjeto } from '../services/insumosProjetoService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { comCancelamento } from './comCancelamento';
import { comRollback } from './comRollback';
import { avisoRefetch } from './avisoRefetch';

/**
 * Quantitativo de insumos por obra. Alterações de quantidade ou de ajuste
 * recalculam `itens_orcamento.valor_orcado` por trigger no banco — por isso
 * todo handler devolve um sinal para quem precisa reler o orçamento
 * (`refreshOrcamentos` no App).
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
export function useInsumosProjeto(ativo = true) {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [insumosProjeto, setInsumosProjeto] = useState<InsumoProjeto[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * `userId` em vez de `session` nas dependências, de propósito.
   *
   * O supabase-js cria um OBJETO de sessão novo a cada renovação de token (~1h) e
   * a cada `onAuthStateChange`. Depender de `session` refaria todas as buscas do
   * app de hora em hora, sem nada ter mudado. O id é o que de fato identifica de
   * quem são os dados.
   *
   * Antes isto era um `// eslint-disable-next-line react-hooks/exhaustive-deps`,
   * que calava a regra sem registrar o motivo. Agora a lista está honesta e a
   * regra volta a proteger o efeito.
   */
  useEffect(() => {
    if (!userId || !ativo) {
      setInsumosProjeto([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return comCancelamento(
      () => insumosProjetoService.list(),
      setInsumosProjeto,
      (err) => toast.error('Falha ao carregar insumos das obras.', err.message),
      () => setLoading(false)
    );
  }, [userId, ativo, toast]);

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
    const { aplicar, desfazer } = comRollback(setInsumosProjeto);
    aplicar((prev) => prev.filter((i) => i.id !== id));
    try {
      await insumosProjetoService.remove(id);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao remover o insumo da obra.', err.message);
      return false;
    }
  };

  const refreshInsumosProjeto = () =>
    insumosProjetoService.list().then(setInsumosProjeto).catch(avisoRefetch(toast, 'os insumos da obra'));

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
