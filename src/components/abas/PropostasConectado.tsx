import { lazy, useCallback, useMemo } from 'react';
import { useSinapi } from '../../hooks/useSinapi';
import { useAcoes } from '../../contexts/AcoesContext';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import {
  useCatalogoDados,
  useClientesDados,
  useEmpresaConfigDados,
  useFornecedoresDados,
  useModelosTextoDados,
  useContratosDados,
  useFuncionariosDados,
  useProjetosDados,
  usePropostasDados,
} from '../../contexts/DadosContext';

const PropostasTab = lazy(() => import('../PropostasTab'));

export default function PropostasConectado() {
  const {
    propostas,
    itensProposta,
    secoesProposta,
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
    handleAddItemSinapi,
    handleCarregarComposicao,
    handleCopiarComposicaoDoCatalogo,
    handleAjustarComponente,
    handleAddComponente,
    handleRemoverComponente,
    handleSalvarNoCatalogo,
    handleAjustarItemProposta,
    handleAjustarQuantidadeItemProposta,
    handleRemoveItemProposta,
    handleAddSecao,
    handleInserirModeloNaProposta,
    handleUpdateSecao,
    handleRemoveSecao,
    handleReordenarSecao,
  } = usePropostasDados();
  const {
    modelos,
    handleAddModelo,
    handleUpdateModelo,
    handleAposentarModelo,
  } = useModelosTextoDados();
  const { contratos } = useContratosDados();
  const { clientes } = useClientesDados();
  const { funcionarios } = useFuncionariosDados();
  const { projetos } = useProjetosDados();
  const { catalogo, aplicarFiltro } = useCatalogoDados();
  const { fornecedores } = useFornecedoresDados();
  const { empresa } = useEmpresaConfigDados();
  const { converterPropostaEmObra, gerarContratoDaProposta } = useAcoes();
  const { navigateTab } = useNavegacao();

  /**
   * A base SINAPI, ligada enquanto a aba de propostas estiver aberta.
   *
   * `useSinapi(true)` e não `false`: o hook adia TUDO até o primeiro `ativo`, e
   * o seletor de item é um modal — ligá-lo só na abertura faria a primeira
   * busca esperar as publicações carregarem. São 16.492 itens no servidor, mas
   * nada disso vem para cá até alguém digitar: o que o hook busca de imediato é
   * a lista de publicações, três linhas.
   */
  const sinapi = useSinapi(true);

  const abrirContratos = useCallback(() => navigateTab('contratos', null), [navigateTab]);

  const abrirObra = useCallback(
    (projetoId: string) => navigateTab('projetos', projetoId),
    [navigateTab]
  );

  /**
   * Os oito handlers do descritivo viajam agrupados porque atravessam três
   * componentes até o painel. O `useMemo` não é enfeite: `PropostasTab` é
   * `memo`, e um literal de objeto aqui teria identidade nova a cada render —
   * a aba inteira repintaria a cada tecla digitada em qualquer campo.
   */
  const descritivo = useMemo(
    () => ({
      onAdd: handleAddSecao,
      onInserirModelo: handleInserirModeloNaProposta,
      onUpdate: handleUpdateSecao,
      onRemove: handleRemoveSecao,
      onReordenar: handleReordenarSecao,
      onAddModelo: handleAddModelo,
      onUpdateModelo: handleUpdateModelo,
      onAposentarModelo: handleAposentarModelo,
    }),
    [handleAddSecao, handleInserirModeloNaProposta, handleUpdateSecao, handleRemoveSecao,
     handleReordenarSecao, handleAddModelo, handleUpdateModelo, handleAposentarModelo]
  );

  /**
   * Mesma tese do `descritivo` logo acima: os sete handlers da composição
   * atravessam três componentes até o painel, e um literal de objeto aqui teria
   * identidade nova a cada render — `PropostasTab` é `memo`, e a aba inteira
   * repintaria a cada tecla digitada em qualquer campo.
   */
  const composicao = useMemo(
    () => ({
      onAddSinapi: handleAddItemSinapi,
      onCarregar: handleCarregarComposicao,
      onCopiarDoCatalogo: handleCopiarComposicaoDoCatalogo,
      onAjustarComponente: handleAjustarComponente,
      onAddComponente: handleAddComponente,
      onRemoverComponente: handleRemoverComponente,
      onSalvarNoCatalogo: handleSalvarNoCatalogo,
    }),
    [handleAddItemSinapi, handleCarregarComposicao, handleCopiarComposicaoDoCatalogo,
     handleAjustarComponente, handleAddComponente, handleRemoverComponente,
     handleSalvarNoCatalogo]
  );

  return (
    <PropostasTab
      propostas={propostas}
      itensProposta={itensProposta}
      secoesProposta={secoesProposta}
      modelos={modelos}
      contratos={contratos}
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
      sinapi={sinapi}
      composicao={composicao}
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
      descritivo={descritivo}
      onGerarContrato={gerarContratoDaProposta}
      onAbrirContratos={abrirContratos}
    />
  );
}
