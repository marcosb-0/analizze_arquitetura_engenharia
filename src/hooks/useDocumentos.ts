import { useCallback, useEffect, useState } from 'react';
import { Documento } from '../types';
import { documentosService, NovaVersaoInput, recusaDoArquivo } from '../services/documentosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { comCancelamento } from './comCancelamento';
import { comRollback } from './comRollback';

/**
 * Documentos da empresa (projetoId null) e das obras (projetoId preenchido)
 * vivem na mesma lista; quem separa é a tela. Documento de funcionário e de
 * cliente têm hooks próprios.
 *
 * Todo handler devolve boolean: antes o erro era engolido aqui num toast e a
 * tela seguia comemorando sucesso, então o usuário via o toast de erro e o de
 * "salvo com sucesso" ao mesmo tempo.
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
export function useDocumentos(ativo = true) {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);

  const userId = session?.user.id;

  /**
   * `useCallback` porque esta função é DUAS coisas: o carregamento inicial do
   * efeito e o `refetch` exposto no retorno do hook (usado por
   * `handleUpdateCategoriaAndSync` em App.tsx, já que renomear categoria cascateia
   * em `documentos.tipo` no banco).
   *
   * Sem `useCallback` ela era recriada a cada render, e por isso não podia entrar
   * nas dependências do efeito — ficava atrás de um `eslint-disable`. Estável, ela
   * entra na lista e a regra volta a valer.
   */
  const loadDocumentos = useCallback(() => {
    if (!userId || !ativo) {
      setDocumentos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return comCancelamento(
      () => documentosService.list(),
      setDocumentos,
      (err) => toast.error('Falha ao carregar documentos.', err.message),
      () => setLoading(false)
    );
  }, [userId, ativo, toast]);

  useEffect(() => {
    loadDocumentos();
  }, [loadDocumentos]);

  const handleAddDocumento = async (
    doc: Pick<Documento, 'nome' | 'tipo' | 'projetoId'>,
    entrada: NovaVersaoInput
  ): Promise<boolean> => {
    if (!session) return false;
    const recusa = recusaDoArquivo(entrada.file);
    if (recusa) {
      toast.error('Arquivo recusado.', recusa);
      return false;
    }
    try {
      const created = await documentosService.upload(doc, entrada, session.user.id);
      setDocumentos((prev) => [created, ...prev]);
      return true;
    } catch (err: any) {
      toast.error('Falha ao enviar documento.', mensagemDeErro(err));
      return false;
    }
  };

  const handleAddVersion = async (documentoId: string, entrada: NovaVersaoInput): Promise<boolean> => {
    if (!session) return false;
    const doc = documentos.find((d) => d.id === documentoId);
    if (!doc) return false;
    const recusa = recusaDoArquivo(entrada.file);
    if (recusa) {
      toast.error('Arquivo recusado.', recusa);
      return false;
    }
    try {
      const { versao, tamanho, historyEntry } = await documentosService.addVersion(
        documentoId,
        entrada,
        session.user.id,
        doc.projetoId,
        doc.versao
      );
      setDocumentos((prev) =>
        prev.map((d) =>
          d.id === documentoId
            ? {
                ...d,
                versao,
                // A versão nova soma ao que já estava no bucket; não substitui.
                tamanhoBytes: d.tamanhoBytes + tamanho,
                contentType: historyEntry.contentType,
                validade: historyEntry.validade,
                historicoVersoes: [historyEntry, ...(d.historicoVersoes ?? [])],
              }
            : d
        )
      );
      return true;
    } catch (err: any) {
      toast.error('Falha ao registrar nova versão.', mensagemDeErro(err));
      return false;
    }
  };

  const handleUpdateDocumento = async (id: string, patch: { nome?: string; tipo?: string }): Promise<boolean> => {
    if (!session) return false;
    const { aplicar, desfazer } = comRollback(setDocumentos);
    aplicar((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    try {
      await documentosService.updateMetadados(id, patch);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar documento.', mensagemDeErro(err));
      return false;
    }
  };

  const handleDeleteDocumento = async (id: string): Promise<boolean> => {
    const { aplicar, desfazer } = comRollback(setDocumentos);
    aplicar((prev) => prev.filter((d) => d.id !== id));
    try {
      await documentosService.remove(id);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao excluir documento.', err.message);
      return false;
    }
  };

  /** Abre a versão mais recente; `versao` permite baixar uma antiga do histórico. */
  const handleDownloadDocumento = async (doc: Documento, storagePath?: string) => {
    const alvo = storagePath ?? doc.historicoVersoes?.[0]?.storagePath;
    if (!alvo) {
      toast.error('Arquivo não encontrado no armazenamento.');
      return;
    }
    try {
      const url = await documentosService.getDownloadUrl(alvo);
      window.open(url, '_blank', 'noopener');
    } catch (err: any) {
      toast.error('Falha ao baixar documento.', err.message);
    }
  };

  /**
   * URL assinada para exibir o arquivo dentro da tela. Devolve null em vez de
   * lançar: pré-visualização quebrada vira um quadro com aviso, não um toast
   * de erro sobre algo que o usuário não pediu explicitamente.
   */
  const handlePreviewUrlDocumento = async (storagePath: string): Promise<string | null> => {
    try {
      return await documentosService.getDownloadUrl(storagePath);
    } catch {
      return null;
    }
  };

  return {
    documentos,
    loading,
    handlePreviewUrlDocumento,
    handleAddDocumento,
    handleAddVersion,
    handleUpdateDocumento,
    handleDeleteDocumento,
    handleDownloadDocumento,
    refetch: loadDocumentos,
  };
}

/**
 * A trava de escopo (trg_documento_categoria_escopo) chega como check_violation
 * com a mensagem crua do Postgres; vale mais que "erro ao salvar".
 */
function mensagemDeErro(err: any): string {
  if (err?.code === '23514' || err?.code === '23503') {
    return err.message ?? 'Categoria inválida para este tipo de documento.';
  }
  return err?.message ?? 'Erro desconhecido.';
}
