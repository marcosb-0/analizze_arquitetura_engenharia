import { memo, useState } from 'react';
import {
  InsumoCatalogo,
  Projeto,
  Fornecedor,
  ItemOrcamento,
  CotacaoFornecedor,
  PontoHistoricoPreco,
  ComponenteComposicao,
  LinhaHH,
} from '../types';
import { melhorPreco } from '../lib/preco';
import { NovoInsumoProjeto } from '../services/insumosProjetoService';
import { FiltroCatalogo, UsosInsumo, ResultadoExclusao, EstadoComposicao } from '../services/catalogoService';
import { UseSinapi } from '../hooks/useSinapi';
import { useFeedback } from './FeedbackContext';
import SinapiAdocaoModal from './SinapiAdocaoModal';
import BarraCatalogo from './catalogo/BarraCatalogo';
import DetalheInsumo from './catalogo/DetalheInsumo';
import ListaInsumos, { VisaoCatalogo } from './catalogo/ListaInsumos';
import ModalComposicao from './catalogo/ModalComposicao';
import ModalInsumo from './catalogo/ModalInsumo';
import ModalVincularObra from './catalogo/ModalVincularObra';
import SidebarCatalogo from './catalogo/SidebarCatalogo';
import { useExclusaoInsumo } from './catalogo/useExclusaoInsumo';
import { PaginaAba } from './ui';

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
  ) => Promise<EstadoComposicao | null>;
  onUpdateComponente: (
    componenteId: string,
    composicaoId: string,
    patch: { coeficiente: number; observacao?: string }
  ) => Promise<EstadoComposicao | null>;
  onRemoverComponente: (componenteId: string, composicaoId: string) => Promise<EstadoComposicao | null>;
  buscarCandidatosComponente: (termo: string, excluirId: string) => Promise<InsumoCatalogo[]>;
  /** Árvore + agregados + quebra por cargo, para a área de trabalho. */
  carregarComposicao: (id: string) => Promise<(EstadoComposicao & { hh: LinhaHH[] }) | null>;
  /** De `empresa_config` — a ponte entre coeficiente (h/un) e produtividade (un/dia). */
  jornadaDiaria: number;
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
  carregarComposicao,
  jornadaDiaria,
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
  const [composicaoId, setComposicaoId] = useState<string | null>(null);
  const [showSinapiModal, setShowSinapiModal] = useState(false);

  /**
   * Tabela é o padrão: orçar é comparar dezenas de itens, e para isso conta
   * densidade e alinhamento. Fica em estado local — não vai para a URL (as
   * rotas são aba+obra, sem terceiro eixo) nem para `localStorage`, que o app
   * não usa em lugar nenhum e não é aqui que se abre o precedente.
   */
  const [visao, setVisao] = useState<VisaoCatalogo>('tabela');

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
    <PaginaAba
      largura="cheia"
      fluxo="livre"
      id="catalogo-tab-root"
      /* Era `items-stretch` + `min-h-[calc(100vh-140px)]`: a coluna de
         categorias esticava até o pé da janela mesmo com dez botões, e a
         página não rolava como página. Agora a sidebar ancora (`items-start`
         + `COLUNA_ANCORADA` lá dentro) e a lista rola. */
      className="text-left flex flex-col xl:flex-row items-start gap-6"
    >
      <SidebarCatalogo
        total={total}
        categoriaAtiva={filtro.categoria}
        onCategoria={(categoria) => aplicarFiltro({ categoria })}
      />

      {/* `min-w-0` é o que faz a tabela rolar DENTRO do cartão em vez de
          empurrar a aba inteira para o lado.

          Item de flex nasce com `min-width: auto`, e isso o proíbe de encolher
          abaixo do próprio `min-content`. O `min-content` daqui é a tabela de
          insumos (1.340 px), então esta coluna media 1.342 px dentro de um pai
          de 996 — e o `w-full overflow-x-auto` do `TableWrap`, medido contra
          esses 1.342, nunca tinha o que rolar. Quem rolava era o `#tab-viewport`
          inteiro: **578 px de deslocamento horizontal**, levando junto a barra
          de filtros, a busca e o cabeçalho da página. */}
      <div id="catalogo-main-container" className="flex-1 min-w-0 space-y-4">
        <BarraCatalogo
          filtro={filtro}
          aplicarFiltro={aplicarFiltro}
          visao={visao}
          onVisao={setVisao}
          onAbrirSinapi={() => setShowSinapiModal(true)}
          onNovoInsumo={abrirCriacao}
        />

        <div id="catalogo-content-wrapper" className="flex-1">
          <ListaInsumos
            catalogo={catalogo}
            loading={loading}
            visao={visao}
            paginas={paginas}
            paginaAtual={filtro.pagina ?? 0}
            temProjetos={projetos.length > 0}
            // `ativo: true` e `pagina` são o estado inicial, não critério do
            // usuário: contá-los faria a lista vazia de um catálogo novo
            // oferecer "limpar filtros" em vez de "cadastre o primeiro".
            filtrado={Boolean(filtro.busca || filtro.categoria || filtro.tipo || filtro.tipoItem) || filtro.ativo !== true}
            onLimparFiltros={() =>
              aplicarFiltro({ busca: undefined, categoria: undefined, tipo: undefined, tipoItem: undefined, ativo: true, pagina: 0 })
            }
            verificandoUsos={verificandoUsos}
            onAbrirDetalhe={setDetalheId}
            onEditar={abrirEdicao}
            onVincular={abrirVinculo}
            onSetAtivo={onSetAtivoCatalogoItem}
            onExcluir={pedirExclusao}
            onAbrirComposicao={(item) => setComposicaoId(item.id)}
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
        onAbrirComposicao={() => setComposicaoId(detalheId)}
      />

      <ModalComposicao
        insumo={doCatalogo(composicaoId)}
        aberto={composicaoId !== null}
        onFechar={() => setComposicaoId(null)}
        jornadaDiaria={jornadaDiaria}
        carregarComposicao={carregarComposicao}
        buscarCandidatos={buscarCandidatosComponente}
        onAddComponente={onAddComponente}
        onUpdateComponente={onUpdateComponente}
        onRemoverComponente={onRemoverComponente}
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
    </PaginaAba>
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
