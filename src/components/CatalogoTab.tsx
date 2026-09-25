import { memo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  InsumoCatalogo,
  NovoInsumoCatalogo,
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
import { useFeedback } from './FeedbackContext';
import BarraCatalogo from './catalogo/BarraCatalogo';
import ListaInsumos, { VisaoCatalogo } from './catalogo/ListaInsumos';
import JanelaInsumo from './catalogo/janela/JanelaInsumo';
import ModalInsumo from './catalogo/ModalInsumo';
import ModalVincularObra from './catalogo/ModalVincularObra';
import PilulasCategoria from './catalogo/PilulasCategoria';
import { useExclusaoInsumo } from './catalogo/useExclusaoInsumo';
import { Button, CabecalhoPagina, PaginaAba } from './ui';

interface CatalogoTabProps {
  catalogo: InsumoCatalogo[];
  total: number;
  loading: boolean;
  filtro: FiltroCatalogo;
  paginas: number;
  projetos: Projeto[];
  fornecedores: Fornecedor[];
  aplicarFiltro: (patch: Partial<FiltroCatalogo>) => void;
  carregarDetalhe: (
    insumoId: string,
    incluirComponentes?: boolean
  ) => Promise<{
    historicoPrecos: PontoHistoricoPreco[];
    cotacoes: CotacaoFornecedor[];
    componentes: ComponenteComposicao[];
  } | null>;
  onAddCatalogoItem: (item: NovoInsumoCatalogo) => Promise<void>;
  onUpdateCatalogoItem: (item: InsumoCatalogo) => Promise<InsumoCatalogo | null>;
  onSetAtivoCatalogoItem: (id: string, ativo: boolean) => Promise<boolean>;
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
  /** Aviso de item parecido enquanto se digita o cadastro — inclui inativos. */
  procurarParecidos: (
    descricao: string,
    unidade: string,
    excluirId?: string
  ) => Promise<{ parecidos: InsumoCatalogo[]; colide: InsumoCatalogo | null }>;
  /** Cadastro que devolve o item criado — alimenta o atalho dentro da composição. */
  onCriarInsumo: (novo: NovoInsumoCatalogo) => Promise<InsumoCatalogo | null>;
  /** Árvore + agregados + quebra por cargo, para a área de trabalho. */
  carregarComposicao: (id: string) => Promise<(EstadoComposicao & { hh: LinhaHH[] }) | null>;
  /** De `empresa_config` — a ponte entre coeficiente (h/un) e produtividade (un/dia). */
  jornadaDiaria: number;
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
  procurarParecidos,
  onCriarInsumo,
  carregarComposicao,
  jornadaDiaria,
}: CatalogoTabProps) {
  const { toast } = useFeedback();

  /**
   * As seleções são guardadas por ID, e o insumo sai da listagem a cada render:
   * assim a janela e os diálogos acompanham o item recarregado do servidor em
   * vez de exibir a cópia congelada no instante do clique.
   *
   * `itemAbertoId` era DOIS estados — `detalheId` (drawer lateral) e
   * `composicaoId` (modal por cima dele). Eram duas superfícies para o mesmo
   * item, e nada impedia as duas abertas ao mesmo tempo: abrir a composição
   * pelo drawer não o fechava. Um estado só torna esse empilhamento
   * irrepresentável.
   */
  const [itemAbertoId, setItemAbertoId] = useState<string | null>(null);
  const [vincularId, setVincularId] = useState<string | null>(null);

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

  const { verificandoUsos, pedirExclusao, pedirAtivacao } = useExclusaoInsumo({
    carregarUsosInsumo,
    onExcluirCatalogoItem,
    onSetAtivoCatalogoItem,
    aoSumir: () => setItemAbertoId(null),
  });

  // `ativo: true` e `pagina` são o estado inicial, não critério do usuário:
  // contá-los faria a lista vazia de um catálogo novo oferecer "limpar
  // filtros" em vez de "cadastre o primeiro".
  const filtrado = Boolean(filtro.busca || filtro.categoria || filtro.tipoItem) || filtro.ativo !== true;
  const limparFiltros = () =>
    aplicarFiltro({ busca: undefined, categoria: undefined, tipoItem: undefined, ativo: true, pagina: 0 });

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
      /* REDESENHO 14/ago/2026 — a coluna lateral de categorias saiu (virou a
         fileira de pílulas do mockup) e a aba voltou a ser uma pilha vertical.
         O `min-w-0` que o contêiner da tabela precisava some junto: sem irmão
         de flex na horizontal, não há mais quem force a largura da tabela na
         página. */
      className="text-left flex flex-col gap-4"
    >
      {/* O mockup nomeia o catálogo pelo que ele É ("banco de custos") e diz
          de onde vem o preço na mesma frase. `CabecalhoPagina` e não um
          cabeçalho à mão: é a regra do Título Presente, e este era um dos
          últimos destinos que ainda escreviam o seu. */}
      <CabecalhoPagina
        titulo="Banco de custos"
        descricao="Cotações, preços praticados e custo-hora da folha — cada preço com procedência rastreável."
        acoes={
          <Button onClick={abrirCriacao}>
            <Plus size={14} />
            <span>Novo insumo</span>
          </Button>
        }
      />

      <div id="catalogo-main-container" className="space-y-4">
        <BarraCatalogo
          filtro={filtro}
          aplicarFiltro={aplicarFiltro}
          visao={visao}
          onVisao={setVisao}
        />

        <PilulasCategoria
          categoriaAtiva={filtro.categoria}
          onCategoria={(categoria) => aplicarFiltro({ categoria })}
        />

        {/* A legenda da lista: "o filtro pegou quanta coisa?". Região viva
            porque a busca é do servidor e troca a listagem inteira — ver a nota
            em `ControlesDeLista`. */}
        {!loading && total > 0 && (
          <p aria-live="polite" aria-atomic="true" className="flex items-center gap-2 text-xs text-slate-600">
            <span>
              <strong className="data-font font-semibold text-slate-900">{total}</strong>{' '}
              {total === 1 ? 'item' : 'itens'}
              {filtrado ? ' no filtro atual' : ' ativos no banco de custos'}
            </span>
            {filtrado && (
              <Button variante="acao" tamanho="sm" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            )}
          </p>
        )}

        <div id="catalogo-content-wrapper" className="flex-1">
          <ListaInsumos
            catalogo={catalogo}
            loading={loading}
            visao={visao}
            paginas={paginas}
            paginaAtual={filtro.pagina ?? 0}
            temProjetos={projetos.length > 0}
            filtrado={filtrado}
            onLimparFiltros={limparFiltros}
            verificandoUsos={verificandoUsos}
            onAbrirDetalhe={setItemAbertoId}
            onEditar={abrirEdicao}
            onVincular={abrirVinculo}
            onAlternarAtivo={pedirAtivacao}
            onExcluir={pedirExclusao}
            onNovoInsumo={abrirCriacao}
            onPagina={(pagina) => aplicarFiltro({ ...filtro, pagina })}
          />
        </div>
      </div>

      <JanelaInsumo
        insumo={doCatalogo(itemAbertoId)}
        fornecedores={fornecedores}
        temProjetos={projetos.length > 0}
        verificandoUsos={verificandoUsos}
        jornadaDiaria={jornadaDiaria}
        carregarDetalhe={carregarDetalhe}
        carregarComposicao={carregarComposicao}
        buscarCandidatos={buscarCandidatosComponente}
        onCriarInsumo={onCriarInsumo}
        onFechar={() => setItemAbertoId(null)}
        onVincular={abrirVinculo}
        onEditar={abrirEdicao}
        onAlternarAtivo={pedirAtivacao}
        onExcluir={pedirExclusao}
        onAddCotacao={onAddCotacao}
        onDesativarCotacao={onDesativarCotacao}
        onAdotarPrecoCotacao={onAdotarPrecoCotacao}
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
        procurarParecidos={procurarParecidos}
        onAddCatalogoItem={onAddCatalogoItem}
        onUpdateCatalogoItem={onUpdateCatalogoItem}
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
