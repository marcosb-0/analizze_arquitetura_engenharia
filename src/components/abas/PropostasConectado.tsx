import { lazy, useCallback } from 'react';
import { useAcoes } from '../../contexts/AcoesContext';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import {
  useCatalogoDados,
  useClientesDados,
  useEmpresaConfigDados,
  useFornecedoresDados,
  useFuncionariosDados,
  useProjetosDados,
  usePropostasDados,
} from '../../contexts/DadosContext';

const PropostasTab = lazy(() => import('../PropostasTab'));

export default function PropostasConectado() {
  const {
    propostas,
    itensProposta,
    loading,
    carregandoDetalhe,
    carregarDetalheProposta,
    handleAddProposta,
    handleUpdateProposta,
    handleDuplicarProposta,
    handleUpdateBdiVisivelPdf,
    handleUpdateStatusProposta,
    handleUpdateBdi,
    handleAddRevision,
    handleDeleteProposta,
    handleAddItemProposta,
    handleAjustarItemProposta,
    handleAjustarQuantidadeItemProposta,
    handleRemoveItemProposta,
  } = usePropostasDados();
  const { clientes } = useClientesDados();
  const { funcionarios } = useFuncionariosDados();
  const { projetos } = useProjetosDados();
  const { catalogo, aplicarFiltro } = useCatalogoDados();
  const { fornecedores } = useFornecedoresDados();
  const { empresa } = useEmpresaConfigDados();
  const { converterPropostaEmObra } = useAcoes();
  const { navigateTab } = useNavegacao();

  const abrirObra = useCallback(
    (projetoId: string) => navigateTab('projetos', projetoId),
    [navigateTab]
  );

  return (
    <PropostasTab
      propostas={propostas}
      itensProposta={itensProposta}
      loading={loading}
      carregandoDetalhe={carregandoDetalhe}
      carregarDetalheProposta={carregarDetalheProposta}
      clientes={clientes}
      funcionarios={funcionarios}
      projetos={projetos}
      catalogo={catalogo}
      fornecedores={fornecedores}
      empresa={empresa}
      aplicarFiltroCatalogo={aplicarFiltro}
      onAddProposta={handleAddProposta}
      onUpdateProposta={handleUpdateProposta}
      onDuplicarProposta={handleDuplicarProposta}
      onUpdateStatus={handleUpdateStatusProposta}
      onAbrirObra={abrirObra}
      onUpdateBdi={handleUpdateBdi}
      onUpdateBdiVisivelPdf={handleUpdateBdiVisivelPdf}
      onAddRevision={handleAddRevision}
      onConvertToProject={converterPropostaEmObra}
      onDeleteProposta={handleDeleteProposta}
      onAddItemProposta={handleAddItemProposta}
      onAjustarItemProposta={handleAjustarItemProposta}
      onAjustarQuantidadeItemProposta={handleAjustarQuantidadeItemProposta}
      onRemoveItemProposta={handleRemoveItemProposta}
    />
  );
}
