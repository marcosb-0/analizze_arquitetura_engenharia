import { useState } from 'react';
import { CorCategoriaDocumento, DocumentoCategoria, EscopoDocumento } from '../types';
import { documentoCategoriasService } from '../services/documentoCategoriasService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function useDocumentoCategorias(ativo = true) {
  const { toast } = useFeedback();
  // `session` segue aqui por causa das escritas, que gravam o autor da categoria
  // e desistem sem sessão. A leitura não precisa mais dela.
  const { session } = useAuth();
  const [categorias, setCategorias] = useState<DocumentoCategoria[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => documentoCategoriasService.list(),
    aoChegar: setCategorias,
    aoLimpar: () => setCategorias([]),
    erro: 'Falha ao carregar categorias de documentos.',
  });

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
