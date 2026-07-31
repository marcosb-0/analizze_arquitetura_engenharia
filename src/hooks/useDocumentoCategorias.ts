import { useEffect, useState } from 'react';
import { CorCategoriaDocumento, DocumentoCategoria, EscopoDocumento } from '../types';
import { documentoCategoriasService } from '../services/documentoCategoriasService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { comCancelamento } from './comCancelamento';
import { comRollback } from './comRollback';

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
export function useDocumentoCategorias(ativo = true) {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [categorias, setCategorias] = useState<DocumentoCategoria[]>([]);
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
      setCategorias([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return comCancelamento(
      () => documentoCategoriasService.list(),
      setCategorias,
      (err) => toast.error('Falha ao carregar categorias de documentos.', err.message),
      () => setLoading(false)
    );
  }, [userId, ativo, toast]);

  const handleAddCategoria = async (nome: string, cor: CorCategoriaDocumento, escopo: EscopoDocumento) => {
    if (!session) return;
    const trimmed = nome.trim();
    if (!trimmed) return;
    // O nome é único na tabela inteira, não por escopo: uma categoria "Contrato"
    // de obra impede uma "Contrato" de empresa. Daí o aviso citar o escopo de
    // quem já ocupa o nome, em vez de dizer que já existe "aqui".
    const existente = categorias.find((c) => c.nome.toLowerCase() === trimmed.toLowerCase());
    if (existente) {
      toast.error(
        'Categoria já existe.',
        existente.escopo === escopo
          ? `"${trimmed}" já está cadastrada.`
          : `"${trimmed}" já existe como categoria de ${existente.escopo === 'obra' ? 'obra' : 'empresa'}. Use outro nome.`
      );
      return;
    }
    try {
      const created = await documentoCategoriasService.create(trimmed, cor, escopo, session.user.id);
      setCategorias((prev) => [...prev, created].sort((a, b) => a.nome.localeCompare(b.nome)));
    } catch (err: any) {
      toast.error('Falha ao criar categoria.', err.message);
    }
  };

  const handleUpdateCategoria = async (id: string, patch: { nome?: string; cor?: CorCategoriaDocumento }) => {
    if (!session) return;
    const nome = patch.nome !== undefined ? patch.nome.trim() : undefined;
    if (nome !== undefined) {
      if (!nome) return;
      if (categorias.some((c) => c.id !== id && c.nome.toLowerCase() === nome.toLowerCase())) {
        toast.error('Categoria já existe.', `"${nome}" já está cadastrada.`);
        return;
      }
    }
    try {
      const updated = await documentoCategoriasService.update(id, { cor: patch.cor, nome });
      setCategorias((prev) => prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.nome.localeCompare(b.nome)));
    } catch (err: any) {
      toast.error('Falha ao atualizar categoria.', err.message);
    }
  };

  const handleDeleteCategoria = async (id: string) => {
    if (!session) return;
    const { aplicar, desfazer } = comRollback(setCategorias);
    aplicar((prev) => prev.filter((c) => c.id !== id));
    try {
      await documentoCategoriasService.remove(id);
    } catch (err: any) {
      desfazer();
      if (err.code === '23503') {
        toast.error('Categoria em uso.', 'Não é possível remover uma categoria vinculada a documentos existentes.');
      } else {
        toast.error('Falha ao remover categoria.', err.message);
      }
    }
  };

  return { categorias, loading, handleAddCategoria, handleUpdateCategoria, handleDeleteCategoria };
}
