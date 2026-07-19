import { useEffect, useState } from 'react';
import { CorCategoriaDocumento, DocumentoCategoria } from '../types';
import { documentoCategoriasService } from '../services/documentoCategoriasService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function useDocumentoCategorias() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [categorias, setCategorias] = useState<DocumentoCategoria[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setCategorias([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    documentoCategoriasService
      .list()
      .then(setCategorias)
      .catch((err) => toast.error('Falha ao carregar categorias de documentos.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const handleAddCategoria = async (nome: string, cor: CorCategoriaDocumento) => {
    if (!session) return;
    const trimmed = nome.trim();
    if (!trimmed) return;
    if (categorias.some((c) => c.nome.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Categoria já existe.', `"${trimmed}" já está cadastrada.`);
      return;
    }
    try {
      const created = await documentoCategoriasService.create(trimmed, cor, session.user.id);
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
    const previous = categorias;
    setCategorias((prev) => prev.filter((c) => c.id !== id));
    try {
      await documentoCategoriasService.remove(id);
    } catch (err: any) {
      setCategorias(previous);
      if (err.code === '23503') {
        toast.error('Categoria em uso.', 'Não é possível remover uma categoria vinculada a documentos existentes.');
      } else {
        toast.error('Falha ao remover categoria.', err.message);
      }
    }
  };

  return { categorias, loading, handleAddCategoria, handleUpdateCategoria, handleDeleteCategoria };
}
