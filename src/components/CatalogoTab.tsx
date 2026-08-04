import { memo, useState } from 'react';
import {
  InsumoCatalogo,
  Projeto,
  Fornecedor,
  ItemOrcamento,
  CotacaoFornecedor,
  PontoHistoricoPreco,
  ComponenteComposicao,
} from '../types';
import { melhorPreco } from '../lib/preco';
import { NovoInsumoProjeto } from '../services/insumosProjetoService';
import { FiltroCatalogo, UsosInsumo, ResultadoExclusao } from '../services/catalogoService';
import { UseSinapi } from '../hooks/useSinapi';
import { useFeedback } from './FeedbackContext';
import SinapiAdocaoModal from './SinapiAdocaoModal';
import BarraCatalogo from './catalogo/BarraCatalogo';
import DetalheInsumo from './catalogo/DetalheInsumo';
import ListaInsumos from './catalogo/ListaInsumos';
import ModalInsumo from './catalogo/ModalInsumo';
import ModalVincularObra from './catalogo/ModalVincularObra';
import SidebarCatalogo from './catalogo/SidebarCatalogo';
import { useExclusaoInsumo } from './catalogo/useExclusaoInsumo';

interface CatalogoTabProps {
  catalogo: InsumoCatalogo[];
  total: number;
  loading: boolean;
  filtro: FiltroCatalogo;
  paginas: number;
  projetos: Projeto[];
  fornecedores: Fornecedor[];
  aplicarFiltro: (patch: Partial<FiltroCatalogo>) => void;
  /** Refaz a busca com o filtro atual — usado depois de adotar do SINAPI. */
  recarregar: () => Promise<void> | void;
  carregarDetalhe: (
    insumoId: string,
    incluirComponentes?: boolean
  ) => Promise<{
    historicoPrecos: PontoHistoricoPreco[];
    cotacoes: CotacaoFornecedor[];
    componentes: ComponenteComposicao[];
  } | null>;
  onAddCatalogoItem: (item: InsumoCatalogo) => Promise<void>;
  onUpdateCatalogoItem: (item: InsumoCatalogo) => Promise<InsumoCatalogo | null>;
  onSetAtivoCatalogoItem: (id: string, ativo: boolean) => Promise<void>;
  /** Onde o insumo está sendo usado — consultado antes de oferecer a exclusão. */
  carregarUsosInsumo: (id: string) => Promise<UsosInsumo | null>;
  onExcluirCatalogoItem: (id: string) => Promise<ResultadoExclusao | null>;
  onAddOrcamentoItem: (item: ItemOrcamento) => Promise<ItemOrcamento | null>;
  onAddInsumoProjeto: (novo: NovoInsumoProjeto) => Promise<unknown>;
  onAddCotacao: (insumoId: string, quote: CotacaoFornecedor) => Promise<CotacaoFornecedor | null>;
  onDesativarCotacao: (insumoId: string, cotacaoId: string) => Promise<void>;
  onAdotarPrecoCotacao: (insumoId: string, preco: number) => Promise<InsumoCatalogo | null>;
  onAddComponente: (
    composicaoId: string,
    entrada: { insumoId: string; coeficiente: number; observacao?: string }
  ) => Promise<ComponenteComposicao[] | null>;
  onUpdateComponente: (
    componenteId: string,
    composicaoId: string,
    patch: { coeficiente: number; observacao?: string }
  ) => Promise<ComponenteComposicao[] | null>;
  onRemoverComponente: (componenteId: string, composicaoId: string) => Promise<ComponenteComposicao[] | null>;
  buscarCandidatosComponente: (termo: string, excluirId: string) => Promise<InsumoCatalogo[]>;
  /**
   * Estado da base de referência SINAPI. Vem de fora porque o hook só busca
   * quando o painel abre — passar o hook inteiro evita duplicar aqui o controle
   * de "ativo" que o `App` já faz para as abas.
   */
  sinapi: UseSinapi;
}

/**
 * Banco de custos. Este arquivo é só a orquestração: guarda o que está aberto e
 * repassa os dados. A barra lateral, a listagem, o painel de detalhe e os dois
 * diálogos vivem em `./catalogo/`.
 */
function CatalogoTab({
  catalogo,
  total,
  loading,
  filtro,
  paginas,
  projetos,
  fornecedores,
  aplicarFiltro,
  recarregar,
  carregarDetalhe,
  onAddCatalogoItem,
  onUpdateCatalogoItem,
  onSetAtivoCatalogoItem,
  carregarUsosInsumo,
  onExcluirCatalogoItem,
  onAddOrcamentoItem,
  onAddInsumoProjeto,
  onAddCotacao,
  onDesativarCotacao,
  onAdotarPrecoCotacao,
  onAddComponente,
  onUpdateComponente,
  onRemoverComponente,
  buscarCandidatosComponente,
  sinapi,
}: CatalogoTabProps) {
  const { toast } = useFeedback();

  /**
   * As três seleções são guardadas por ID, e o insumo sai da listagem a cada
   * render: assim o painel e os diálogos acompanham o item recarregado do
   * servidor em vez de exibir a cópia congelada no instante do clique.
   */
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [vincularId, setVincularId] = useState<string | null>(null);
  const [showSinapiModal, setShowSinapiModal] = useState(false);

  /** `editandoId` é o alvo; `null` com o modal aberto significa criação. */
  const [modalInsumoAberto, setModalInsumoAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const doCatalogo = (id: string | null) => (id ? catalogo.find((i) => i.id === id) ?? null : null);

  const { verificandoUsos, pedirExclusao } = useExclusaoInsumo({
    carregarUsosInsumo,
    onExcluirCatalogoItem,
    onSetAtivoCatalogoItem,
    aoSumir: () => setDetalheId(null),
  });

  const abrirCriacao = () => {
    setEditandoId(null);
    setModalInsumoAberto(true);
  };

  const abrirEdicao = (item: InsumoCatalogo) => {
    setEditandoId(item.id);
    setModalInsumoAberto(true);
  };

  const abrirVinculo = (item: InsumoCatalogo) => {
    setVincularId(item.id);
    // O aviso é sobre a escolha da base que o diálogo acabou de fazer — cabe
    // aqui, na abertura, e não dentro do formulário a cada render.
    const melhor = melhorPreco(item);
    if (melhor.ignoradasPorVencimento > 0) {
      toast.info(
        'Há cotação mais barata vencida.',
        `${melhor.ignoradasPorVencimento} cotação(ões) fora do prazo de validade não entraram na escolha do melhor preço.`
      );
    }
  };

  return (
    <div id="catalogo-tab-root" className="space-y-5 text-left flex flex-col xl:flex-row items-stretch min-h-[calc(100vh-140px)]">
      <SidebarCatalogo
        total={total}
        categoriaAtiva={filtro.categoria}
        onCategoria={(categoria) => aplicarFiltro({ categoria })}
      />

      <div id="catalogo-main-container" className="flex-1 space-y-4">
        <BarraCatalogo
          filtro={filtro}
          aplicarFiltro={aplicarFiltro}
          onAbrirSinapi={() => setShowSinapiModal(true)}
          onNovoInsumo={abrirCriacao}
        />

        <div id="catalogo-content-wrapper" className="flex-1">
          <ListaInsumos
            catalogo={catalogo}
            loading={loading}
            paginas={paginas}
            paginaAtual={filtro.pagina ?? 0}
            temProjetos={projetos.length > 0}
            verificandoUsos={verificandoUsos}
            onAbrirDetalhe={setDetalheId}
            onEditar={abrirEdicao}
            onVincular={abrirVinculo}
            onSetAtivo={onSetAtivoCatalogoItem}
            onExcluir={pedirExclusao}
            onNovoInsumo={abrirCriacao}
            onPagina={(pagina) => aplicarFiltro({ ...filtro, pagina })}
          />
        </div>
      </div>

      <DetalheInsumo
        insumo={doCatalogo(detalheId)}
        fornecedores={fornecedores}
        temProjetos={projetos.length > 0}
        verificandoUsos={verificandoUsos}
        carregarDetalhe={carregarDetalhe}
        onClose={() => setDetalheId(null)}
        onVincular={abrirVinculo}
        onEditar={abrirEdicao}
        onSetAtivo={onSetAtivoCatalogoItem}
        onExcluir={pedirExclusao}
        onAddCotacao={onAddCotacao}
        onDesativarCotacao={onDesativarCotacao}
        onAdotarPrecoCotacao={onAdotarPrecoCotacao}
        onAddComponente={onAddComponente}
        onUpdateComponente={onUpdateComponente}
        onRemoverComponente={onRemoverComponente}
        buscarCandidatosComponente={buscarCandidatosComponente}
      />

      <ModalVincularObra
        insumo={doCatalogo(vincularId)}
        projetos={projetos}
        fornecedores={fornecedores}
        onClose={() => setVincularId(null)}
        onAddOrcamentoItem={onAddOrcamentoItem}
        onAddInsumoProjeto={onAddInsumoProjeto}
      />

      <ModalInsumo
        open={modalInsumoAberto}
        insumo={doCatalogo(editandoId)}
        fornecedores={fornecedores}
        onClose={() => setModalInsumoAberto(false)}
        onAddCatalogoItem={onAddCatalogoItem}
        onUpdateCatalogoItem={onUpdateCatalogoItem}
      />

      <SinapiAdocaoModal
        open={showSinapiModal}
        onClose={() => setShowSinapiModal(false)}
        sinapi={sinapi}
        onAdotado={() => {
          // O item novo (ou o reaproveitado) tem de aparecer na listagem, e no
          // modo expandido os componentes também entraram no catálogo — relemos
          // do servidor em vez de tentar remendar a lista local.
          //
          // O modal fica aberto de propósito: adotar normalmente vem em série
          // ("agora a argamassa, agora o bloco"), e fechar a cada adoção
          // obrigaria a refazer a busca inteira. Também não abrimos o drawer de
          // detalhe daqui — ele ficaria atrás do modal.
          recarregar();
        }}
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
export default memo(CatalogoTab);
