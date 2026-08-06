import { lazy, useCallback, useMemo } from 'react';
import type { Projeto } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useAcoes } from '../../contexts/AcoesContext';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import {
  useCatalogoDados,
  useClientesDados,
  useCronogramaDados,
  useDocumentoCategoriasDados,
  useDocumentosDados,
  useFornecedoresDados,
  useFuncionariosDados,
  useInsumosProjetoDados,
  useMedicoesDados,
  useOrcamentoDados,
  useProjetoEquipeDados,
  useProjetosDados,
  usePropostasDados,
  useResumoObrasDados,
} from '../../contexts/DadosContext';

const ProjetosTab = lazy(() => import('../ProjetosTab'));
const ProjetoConsole = lazy(() => import('../ProjetoConsole'));

/**
 * Lista de obras e console da obra são IRMÃOS, não pai e filho.
 *
 * Enquanto o console era renderizado dentro de `ProjetosTab`, a lista recebia 49
 * props só para repassar 44 (§1.2). Aqui a escolha é explícita, e cada lado
 * assina os contextos que usa: a lista não conhece catálogo, insumo, fornecedor
 * nem equipe da obra — o console é que conhece.
 */
export default function ProjetosConectado() {
  const { selectedProjectId } = useNavegacao();
  const { projetos } = useProjetosDados();

  const obraAberta = useMemo(
    () => (selectedProjectId ? projetos.find((p) => p.id === selectedProjectId) : undefined),
    [projetos, selectedProjectId]
  );

  return obraAberta ? (
    /**
     * `key` por obra: trocar de obra REMONTA o console.
     *
     * Sem ela, o React reaproveitava a instância e o estado do console
     * sobrevivia à troca — inclusive a etapa selecionada para medir e as fotos
     * já escolhidas. O banco aceitava a combinação (as duas FKs de
     * `medicoes_obra` eram independentes) e o dinheiro caía no orçamento da obra
     * errada, porque o fan-out segue o vínculo da ETAPA. Ver §3.6 e a trigger
     * `trg_medicao_etapa_do_projeto`.
     *
     * Os formulários já não dependem disto: cada diálogo do console é um
     * componente montado só enquanto está aberto (ver `projeto-console/`). A
     * `key` segue necessária pela sub-aba e pelos filtros da tela.
     */
    <ConsoleConectado key={obraAberta.id} projeto={obraAberta} />
  ) : (
    <ListaConectada />
  );
}

function ListaConectada() {
  const { profile } = useAuth();
  const { setSelectedProjectId } = useNavegacao();
  const { criarObra, excluirObra } = useAcoes();
  const { projetos, loading } = useProjetosDados();
  const { clientes } = useClientesDados();
  const { propostas } = usePropostasDados();
  const { funcionarios } = useFuncionariosDados();
  /**
   * A lista assina o resumo agregado, não os três domínios de linha (§4.2, item
   * 23). É o corte que separa de verdade a lista do console: a lista precisa de
   * quatro números por obra, o console precisa das linhas de UMA obra, e antes
   * os dois liam a mesma coisa — o núcleo inteiro.
   */
  const { resumos } = useResumoObrasDados();
  const { documentos } = useDocumentosDados();

  return (
    <ProjetosTab
      projetos={projetos}
      clientes={clientes}
      propostas={propostas}
      funcionarios={funcionarios}
      resumos={resumos}
      documentos={documentos}
      role={profile?.role}
      loading={loading}
      onSelectProject={setSelectedProjectId}
      onAddProjeto={criarObra}
      onDeleteProjeto={excluirObra}
    />
  );
}

function ConsoleConectado({ projeto }: { projeto: Projeto }) {
  const { profile } = useAuth();
  const { setSelectedProjectId } = useNavegacao();
  const {
    criarEtapa,
    editarEtapa,
    removerEtapa,
    vincularItem,
    desvincularItem,
    adicionarItemOrcamento,
    ajustarPrecoInsumo,
    ajustarQuantidadeInsumo,
    removerInsumo,
    registrarMedicao,
    aprovarMedicao,
    rejeitarMedicao,
    renomearCategoriaDocumento,
  } = useAcoes();

  const { handleUpdateProjeto, handleUpdateProjetoSituacao } = useProjetosDados();
  const { clientes } = useClientesDados();
  const { funcionarios } = useFuncionariosDados();
  const { fornecedores } = useFornecedoresDados();
  const { orcamentos, alteracoesOrcamento } = useOrcamentoDados();
  const { insumosProjeto, handleRessincronizarBase } = useInsumosProjetoDados();
  const { catalogo } = useCatalogoDados();
  const { cronograma, vinculos } = useCronogramaDados();
  const { medicoes, handleFotoUrlMedicao } = useMedicoesDados();
  const {
    documentos,
    loading: loadingDocumentos,
    handleAddDocumento,
    handleAddVersion,
    handleUpdateDocumento,
    handleDeleteDocumento,
    handleDownloadDocumento,
    handlePreviewUrlDocumento,
  } = useDocumentosDados();
  const { categorias, handleAddCategoria, handleDeleteCategoria } = useDocumentoCategoriasDados();
  const { projetoEquipe, perfisCampo, handleAddMembro, handleRemoveMembro } = useProjetoEquipeDados();

  const fecharConsole = useCallback(() => setSelectedProjectId(null), [setSelectedProjectId]);
  // O console só oferece quem está na ativa para responsável e equipe.
  const ativos = useMemo(() => funcionarios.filter((f) => f.status === 'Ativo'), [funcionarios]);

  return (
    <ProjetoConsole
      projeto={projeto}
      clientes={clientes}
      funcionarios={ativos}
      fornecedores={fornecedores}
      orcamentos={orcamentos}
      alteracoesOrcamento={alteracoesOrcamento}
      insumosProjeto={insumosProjeto}
      catalogo={catalogo}
      cronogramas={cronograma}
      vinculos={vinculos}
      medicoes={medicoes}
      documentos={documentos}
      loadingDocumentos={loadingDocumentos}
      documentoCategorias={categorias}
      projetoEquipe={projetoEquipe}
      perfisCampo={perfisCampo}
      role={profile?.role}
      onClose={fecharConsole}
      onUpdateProjeto={handleUpdateProjeto}
      onUpdateProjetoSituacao={handleUpdateProjetoSituacao}
      onAddEtapa={criarEtapa}
      onUpdateEtapa={editarEtapa}
      onRemoveEtapa={removerEtapa}
      onAddOrcamentoItem={adicionarItemOrcamento}
      onAjustarPrecoInsumo={ajustarPrecoInsumo}
      onAjustarQuantidadeInsumo={ajustarQuantidadeInsumo}
      onRessincronizarBaseInsumo={handleRessincronizarBase}
      onRemoveInsumoProjeto={removerInsumo}
      onAddVinculo={vincularItem}
      onRemoveVinculo={desvincularItem}
      onAddMedicao={registrarMedicao}
      onAprovarMedicao={aprovarMedicao}
      onRejeitarMedicao={rejeitarMedicao}
      onFotoUrlMedicao={handleFotoUrlMedicao}
      onAddDocumento={handleAddDocumento}
      onAddVersionDocumento={handleAddVersion}
      onUpdateDocumento={handleUpdateDocumento}
      onDeleteDocumento={handleDeleteDocumento}
      onDownloadDocumento={handleDownloadDocumento}
      onPreviewUrlDocumento={handlePreviewUrlDocumento}
      onAddCategoriaDocumento={handleAddCategoria}
      onUpdateCategoriaDocumento={renomearCategoriaDocumento}
      onDeleteCategoriaDocumento={handleDeleteCategoria}
      onAddMembroEquipe={handleAddMembro}
      onRemoveMembroEquipe={handleRemoveMembro}
    />
  );
}
