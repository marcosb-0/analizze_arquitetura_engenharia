import { lazy } from 'react';
import {
  useClienteDocumentosDados,
  useClientesDados,
  useProjetosDados,
  usePropostasDados,
} from '../../contexts/DadosContext';

const ClientesTab = lazy(() => import('../ClientesTab'));

export default function ClientesConectado() {
  const { clientes, loading, handleAddCliente, handleUpdateCliente, handleDeleteCliente } = useClientesDados();
  const { projetos } = useProjetosDados();
  const { propostas } = usePropostasDados();
  const {
    clienteDocumentos,
    handleUploadClienteDocumento,
    handleDeleteClienteDocumento,
    handleDownloadClienteDocumento,
  } = useClienteDocumentosDados();

  return (
    <ClientesTab
      clientes={clientes}
      loading={loading}
      projetos={projetos}
      propostas={propostas}
      clienteDocumentos={clienteDocumentos}
      onAddCliente={handleAddCliente}
      onUpdateCliente={handleUpdateCliente}
      onDeleteCliente={handleDeleteCliente}
      onUploadClienteDocumento={handleUploadClienteDocumento}
      onDeleteClienteDocumento={handleDeleteClienteDocumento}
      onDownloadClienteDocumento={handleDownloadClienteDocumento}
    />
  );
}
