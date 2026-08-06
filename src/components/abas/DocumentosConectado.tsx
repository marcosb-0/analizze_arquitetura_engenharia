import { lazy } from 'react';
import { useAcoes } from '../../contexts/AcoesContext';
import { useDocumentoCategoriasDados, useDocumentosDados } from '../../contexts/DadosContext';

const DocumentosPanel = lazy(() => import('../DocumentosPanel'));

/** O acervo da empresa — documento de obra mora no console, ver §12. */
export default function DocumentosConectado() {
  const {
    documentos,
    loading,
    handleAddDocumento,
    handleAddVersion,
    handleUpdateDocumento,
    handleDeleteDocumento,
    handleDownloadDocumento,
    handlePreviewUrlDocumento,
  } = useDocumentosDados();
  const { categorias, handleAddCategoria, handleDeleteCategoria } = useDocumentoCategoriasDados();
  const { renomearCategoriaDocumento } = useAcoes();

  return (
    <DocumentosPanel
      escopo="empresa"
      projetoId={null}
      documentos={documentos}
      loading={loading}
      categorias={categorias}
      onAddDocumento={handleAddDocumento}
      onAddVersion={handleAddVersion}
      onUpdateDocumento={handleUpdateDocumento}
      onDeleteDocumento={handleDeleteDocumento}
      onDownloadDocumento={handleDownloadDocumento}
      onPreviewUrl={handlePreviewUrlDocumento}
      onAddCategoria={handleAddCategoria}
      onUpdateCategoria={renomearCategoriaDocumento}
      onDeleteCategoria={handleDeleteCategoria}
    />
  );
}
