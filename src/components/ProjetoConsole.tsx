import { memo, useEffect, useState } from 'react';
import {
  Cliente,
  Projeto,
  EdicaoObra,
  EdicaoEtapa,
  ItemOrcamento,
  AlteracaoOrcamento,
  EtapaCronograma,
  EtapaOrcamentoVinculo,
  Funcionario,
  MedicaoObra,
  Documento,
  Fornecedor,
  Acesso,
  ProjetoEquipeMembro,
  InsumoProjeto,
  InsumoCatalogo,
  AjustePreco,
  DocumentoCategoria,
  CorCategoriaDocumento,
  EscopoDocumento,
} from '../types';
import type { Role } from '../lib/database.types';
import type { NovaVersaoInput } from '../services/documentosService';
import { canAccessConsoleTab, podeGerenciarObra, podeMedirObra } from '../constants/tabAccess';
import DocumentosPanel from './DocumentosPanel';
import { useFeedback } from './FeedbackContext';
import ConsoleHeader from './projeto-console/ConsoleHeader';
import AbaGeral from './projeto-console/AbaGeral';
import AbaOrcamento from './projeto-console/AbaOrcamento';
import AbaCronograma from './projeto-console/AbaCronograma';
import AbaMedicoes from './projeto-console/AbaMedicoes';
import AbaEquipe from './projeto-console/AbaEquipe';
import ModalEditarObra from './projeto-console/ModalEditarObra';
import type { NovaMedicao } from './projeto-console/ModalMedicao';
import { useDadosDaObra } from './projeto-console/useDadosDaObra';

/**
 * O console da obra: cabeçalho, seis sub-abas e os diálogos de cada uma.
 *
 * Este arquivo era uma função de ~2.400 linhas com 40 `useState` e 22 `useMemo`
 * (§3.2 da auditoria). Hoje ele só orquestra: o recorte dos dados por obra vive
 * em `useDadosDaObra`, cada sub-aba é um componente em `projeto-console/`, e
 * **cada formulário de diálogo é um componente com estado próprio**, montado
 * apenas enquanto o diálogo está aberto. É essa última parte que resolve o §3.6
 * de forma estrutural: não há mais estado de formulário para vazar entre duas
 * aberturas, então nenhum ponto de abertura futuro pode esquecer de limpá-lo.
 */
interface ProjetoConsoleProps {
  projeto: Projeto;
  clientes: Cliente[];
  funcionarios: Funcionario[];
  fornecedores: Fornecedor[];
  orcamentos: ItemOrcamento[];
  alteracoesOrcamento: AlteracaoOrcamento[];
  insumosProjeto: InsumoProjeto[];
  catalogo: InsumoCatalogo[];
  cronogramas: EtapaCronograma[];
  vinculos: EtapaOrcamentoVinculo[];
  medicoes: MedicaoObra[];
  documentos: Documento[];
  documentoCategorias: DocumentoCategoria[];
  projetoEquipe: ProjetoEquipeMembro[];
  perfisCampo: Acesso[];
  role?: Role;
  onClose: () => void;
  // As escritas devolvem se chegaram ao banco — nenhum toast de sucesso é
  // disparado antes disso (RLS pode recusar sem gerar erro; ver projetosService).
  onUpdateProjeto: (id: string, patch: EdicaoObra) => Promise<boolean>;
  onUpdateProjetoSituacao: (projId: string, situacao: Projeto['situacao']) => Promise<boolean>;
  onAddEtapa: (etapa: EtapaCronograma) => Promise<boolean>;
  onUpdateEtapa: (id: string, patch: EdicaoEtapa) => Promise<boolean>;
  onRemoveEtapa: (id: string) => Promise<boolean>;
  onAddOrcamentoItem: (item: ItemOrcamento) => Promise<ItemOrcamento | null>;
  onAjustarPrecoInsumo: (id: string, ajuste: AjustePreco) => Promise<InsumoProjeto | null>;
  onAjustarQuantidadeInsumo: (id: string, quantidade: number) => Promise<InsumoProjeto | null>;
  onRessincronizarBaseInsumo: (id: string, novaBase: number) => Promise<InsumoProjeto | null>;
  onRemoveInsumoProjeto: (id: string) => Promise<boolean>;
  onAddVinculo: (vinculo: EtapaOrcamentoVinculo) => Promise<boolean>;
  onRemoveVinculo: (id: string) => void;
  onAddMedicao: (med: NovaMedicao, fotos: File[]) => Promise<boolean>;
  onAprovarMedicao: (medicaoId: string, permitirOverrun?: boolean) => Promise<'ok' | 'overrun' | 'error'>;
  onRejeitarMedicao: (medicaoId: string, motivo: string) => Promise<boolean>;
  /** URL temporária da foto do boletim — o bucket de medição é privado. */
  onFotoUrlMedicao: (storagePath: string) => Promise<string | null>;
  // Documentos da obra: o painel é o mesmo da aba Documentos, só que preso a
  // este projeto (escopo 'obra').
  onAddDocumento: (doc: Pick<Documento, 'nome' | 'tipo' | 'projetoId'>, entrada: NovaVersaoInput) => Promise<boolean>;
  onAddVersionDocumento: (documentoId: string, entrada: NovaVersaoInput) => Promise<boolean>;
  onUpdateDocumento: (id: string, patch: { nome?: string; tipo?: string }) => Promise<boolean>;
  onDeleteDocumento: (id: string) => Promise<boolean>;
  onDownloadDocumento: (doc: Documento, storagePath?: string) => void;
  onPreviewUrlDocumento: (storagePath: string) => Promise<string | null>;
  onAddCategoriaDocumento: (nome: string, cor: CorCategoriaDocumento, escopo: EscopoDocumento) => void;
  onUpdateCategoriaDocumento: (id: string, patch: { nome?: string; cor?: CorCategoriaDocumento }) => void;
  onDeleteCategoriaDocumento: (id: string) => void;
  onAddMembroEquipe: (projetoId: string, profileId: string, papel: string) => Promise<boolean>;
  onRemoveMembroEquipe: (id: string) => void;
}

type AbaDoConsole = 'geral' | 'orcamento' | 'cronograma' | 'medicoes' | 'documentos' | 'equipe';

function ProjetoConsole({
  projeto,
  clientes,
  funcionarios,
  fornecedores,
  orcamentos,
  alteracoesOrcamento,
  insumosProjeto,
  catalogo,
  cronogramas,
  vinculos,
  medicoes,
  documentos,
  documentoCategorias,
  projetoEquipe,
  perfisCampo,
  role,
  onClose,
  onUpdateProjeto,
  onUpdateProjetoSituacao,
  onAddEtapa,
  onUpdateEtapa,
  onRemoveEtapa,
  onAddOrcamentoItem,
  onAjustarPrecoInsumo,
  onAjustarQuantidadeInsumo,
  onRessincronizarBaseInsumo,
  onRemoveInsumoProjeto,
  onAddVinculo,
  onRemoveVinculo,
  onAddMedicao,
  onAprovarMedicao,
  onRejeitarMedicao,
  onFotoUrlMedicao,
  onAddDocumento,
  onAddVersionDocumento,
  onUpdateDocumento,
  onDeleteDocumento,
  onDownloadDocumento,
  onPreviewUrlDocumento,
  onAddCategoriaDocumento,
  onUpdateCategoriaDocumento,
  onDeleteCategoriaDocumento,
  onAddMembroEquipe,
  onRemoveMembroEquipe,
}: ProjetoConsoleProps) {
  const { toast, confirm } = useFeedback();

  /**
   * Quem pode escrever nos dados da obra. Antes o console só se defendia de
   * `campo`; `financeiro`, que tem apenas SELECT em projetos/itens_orcamento,
   * enxergava todos os botões de escrita — e o write falhava sem erro.
   */
  const podeGerenciar = podeGerenciarObra(role);
  const podeMedir = podeMedirObra(role);
  const medicaoBloqueada = projeto.situacao === 'Pausado' || projeto.situacao === 'Finalizado';

  const dados = useDadosDaObra({
    projeto,
    clientes,
    funcionarios,
    orcamentos,
    alteracoesOrcamento,
    insumosProjeto,
    cronogramas,
    vinculos,
    medicoes,
    documentos,
    projetoEquipe,
    perfisCampo,
  });

  const [aba, setAba] = useState<AbaDoConsole>('geral');
  const [editandoObra, setEditandoObra] = useState(false);

  // Nenhum papel deve ficar numa aba que ele não pode ver (financeiro não tem
  // política em cronograma/medições/documentos: voltariam vazias).
  useEffect(() => {
    if (!canAccessConsoleTab(role, aba)) setAba('geral');
  }, [role, aba]);

  const mudarSituacao = (situacao: Projeto['situacao']) => {
    const aplicar = async () => {
      const ok = await onUpdateProjetoSituacao(projeto.id, situacao);
      if (!ok) return;
      toast.success('Situação do projeto alterada', `Obra agora está em status "${situacao}".`);
    };

    // "Finalizado" com avanço físico incompleto normalmente é erro de operação
    // (esqueceram de medir a última etapa) — soft-block com confirmação em vez
    // de bloquear de vez, já que administrativamente pode haver motivo real
    // para encerrar antes de 100% (obra abortada, rescisão, etc.).
    if (situacao === 'Finalizado' && dados.progressoFisico < 100) {
      confirm({
        title: 'Avanço físico incompleto',
        message: `Esta obra está com ${dados.progressoFisico}% de avanço físico medido. Marcar como "Finalizado" mesmo assim?`,
        onConfirm: aplicar,
      });
      return;
    }
    aplicar();
  };

  return (
    <div id="projeto-console-container" className="flex flex-col lg:h-[calc(100vh-120px)] space-y-4">
      <ConsoleHeader
        projeto={projeto}
        nomeCliente={dados.cliente?.nome}
        podeGerenciar={podeGerenciar}
        onVoltar={onClose}
        onEditarObra={() => setEditandoObra(true)}
        onMudarSituacao={mudarSituacao}
      />

      {/* Internal Workspace Menu Bar — cada papel vê só o que a RLS permite */}
      <div
        id="console-subnavigation"
        className="border-b border-slate-200/80 pb-px flex gap-6 overflow-x-auto select-none bg-transparent px-2"
      >
        {(
          [
            { id: 'geral', label: 'Geral' },
            { id: 'orcamento', label: `Orçamentos (${dados.itens.length})` },
            { id: 'cronograma', label: 'Cronograma' },
            { id: 'medicoes', label: `Medições (${dados.medicoes.length})` },
            { id: 'documentos', label: `Documentos (${dados.documentos.length})` },
            { id: 'equipe', label: 'Equipe' },
          ] as const
        )
          .filter((t) => canAccessConsoleTab(role, t.id))
          .map((t) => (
            <button
              key={t.id}
              id={`console-tab-${t.id}`}
              onClick={() => setAba(t.id)}
              className={`pb-2 text-xs font-bold transition shrink-0 cursor-pointer relative ${
                aba === t.id
                  ? 'text-blue-600 font-extrabold border-b-2 border-blue-600'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
      </div>

      {/* Internal Tab Content Box */}
      <div
        id="console-workspace"
        className="flex-1 overflow-y-auto bg-white rounded-lg border border-slate-200 shadow-sm p-4"
      >
        {aba === 'geral' && (
          <AbaGeral
            projeto={projeto}
            responsavelFuncionario={dados.responsavelFuncionario}
            progressoFisico={dados.progressoFisico}
            saldoDisponivel={dados.saldoDisponivel}
          />
        )}

        {aba === 'orcamento' && (
          <AbaOrcamento
            projetoId={projeto.id}
            dados={dados}
            fornecedores={fornecedores}
            catalogo={catalogo}
            podeGerenciar={podeGerenciar}
            onAddOrcamentoItem={onAddOrcamentoItem}
            onAjustarPrecoInsumo={onAjustarPrecoInsumo}
            onAjustarQuantidadeInsumo={onAjustarQuantidadeInsumo}
            onRessincronizarBaseInsumo={onRessincronizarBaseInsumo}
            onRemoveInsumoProjeto={onRemoveInsumoProjeto}
            onAddVinculo={onAddVinculo}
            onRemoveVinculo={onRemoveVinculo}
          />
        )}

        {aba === 'cronograma' && (
          <AbaCronograma
            projeto={projeto}
            dados={dados}
            funcionarios={funcionarios}
            podeGerenciar={podeGerenciar}
            podeMedir={podeMedir}
            medicaoBloqueada={medicaoBloqueada}
            onAddEtapa={onAddEtapa}
            onUpdateEtapa={onUpdateEtapa}
            onRemoveEtapa={onRemoveEtapa}
            onAddVinculo={onAddVinculo}
            onRemoveVinculo={onRemoveVinculo}
            onAddMedicao={onAddMedicao}
            onUpdateProjetoSituacao={onUpdateProjetoSituacao}
          />
        )}

        {aba === 'medicoes' && (
          <AbaMedicoes
            projeto={projeto}
            dados={dados}
            podeMedir={podeMedir}
            // Quem gerencia a obra é quem aprova o boletim (o guard real está no banco).
            podeAprovar={podeGerenciar}
            medicaoBloqueada={medicaoBloqueada}
            onAddMedicao={onAddMedicao}
            onUpdateProjetoSituacao={onUpdateProjetoSituacao}
            onAprovarMedicao={onAprovarMedicao}
            onRejeitarMedicao={onRejeitarMedicao}
            onFotoUrl={onFotoUrlMedicao}
          />
        )}

        {/* Documentos é um pass-through para o painel compartilhado com a aba
            Documentos — não tem lógica própria que justifique um componente. */}
        {aba === 'documentos' && (
          <div id="tab-pane-documentos" className="space-y-4 text-left">
            <div>
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Documentos Desta Obra
              </h4>
              <p className="text-xs text-slate-500">
                Plantas, ARTs, licenças e contrato deste canteiro — com versionamento. O que é da
                construtora fica na aba Documentos.
              </p>
            </div>

            <DocumentosPanel
              escopo="obra"
              projetoId={projeto.id}
              variante="embedded"
              documentos={documentos}
              categorias={documentoCategorias}
              onAddDocumento={onAddDocumento}
              onAddVersion={onAddVersionDocumento}
              onUpdateDocumento={onUpdateDocumento}
              onDeleteDocumento={onDeleteDocumento}
              onDownloadDocumento={onDownloadDocumento}
              onPreviewUrl={onPreviewUrlDocumento}
              onAddCategoria={onAddCategoriaDocumento}
              onUpdateCategoria={onUpdateCategoriaDocumento}
              onDeleteCategoria={onDeleteCategoriaDocumento}
            />
          </div>
        )}

        {aba === 'equipe' && (
          <AbaEquipe
            projetoId={projeto.id}
            dados={dados}
            perfisCampo={perfisCampo}
            onAddMembro={onAddMembroEquipe}
            onRemoveMembro={onRemoveMembroEquipe}
          />
        )}
      </div>

      <ModalEditarObra
        aberto={editandoObra}
        onFechar={() => setEditandoObra(false)}
        projeto={projeto}
        clientes={clientes}
        funcionarios={funcionarios}
        onSalvar={onUpdateProjeto}
      />
    </div>
  );
}

/**
 * `memo` porque o conector acima é assinante de contexto: ele re-renderiza a
 * cada mudança de navegação (abrir a gaveta do menu, selecionar uma obra) mesmo
 * quando nenhuma prop desta tela mudou. Só vale porque os handlers vêm de
 * `useCallback` nos hooks de domínio — com uma prop instável o `memo` seria
 * custo de leitura com ganho zero, que é o que a auditoria previa no item 30.
 */
export default memo(ProjetoConsole);
