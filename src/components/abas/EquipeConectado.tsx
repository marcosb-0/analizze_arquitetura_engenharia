import { lazy } from 'react';
import {
  useCargaEquipeDados,
  useFuncionarioDocumentosDados,
  useFuncionariosDados,
  useProjetosDados,
} from '../../contexts/DadosContext';

const EquipeTab = lazy(() => import('../EquipeTab'));

export default function EquipeConectado() {
  const {
    funcionarios,
    loading,
    handleAddFuncionario,
    handleUpdateFuncionario,
    handleUpdateStatusFuncionario,
    handleUpdateSalarioFuncionario,
  } = useFuncionariosDados();
  const { projetos } = useProjetosDados();
  /**
   * As frentes ABERTAS de todas as obras, e não o cronograma inteiro (§4.2, item
   * 23): a tela já descartava as concluídas em memória, e `useCronograma` agora
   * carrega só a obra aberta no console.
   */
  const { etapasAtivas } = useCargaEquipeDados();
  const {
    funcionarioDocumentos,
    handleUploadFuncionarioDocumento,
    handleUpdateValidadeDocumento,
    handleDeleteFuncionarioDocumento,
    handleDownloadFuncionarioDocumento,
  } = useFuncionarioDocumentosDados();

  return (
    <EquipeTab
      funcionarios={funcionarios}
      projetos={projetos}
      cronograma={etapasAtivas}
      loading={loading}
      funcionarioDocumentos={funcionarioDocumentos}
      onAddFuncionario={handleAddFuncionario}
      onUpdateFuncionario={handleUpdateFuncionario}
      onUpdateStatusFuncionario={handleUpdateStatusFuncionario}
      onUpdateSalarioFuncionario={handleUpdateSalarioFuncionario}
      onUploadFuncionarioDocumento={handleUploadFuncionarioDocumento}
      onUpdateValidadeDocumento={handleUpdateValidadeDocumento}
      onDeleteFuncionarioDocumento={handleDeleteFuncionarioDocumento}
      onDownloadFuncionarioDocumento={handleDownloadFuncionarioDocumento}
    />
  );
}
