import { memo, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, FolderTree, Plus, Sigma } from 'lucide-react';
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
import { Abas, Aviso, Button, CabecalhoPagina, FaixaKpis, Input, PaginaAba, PainelAba } from './ui';
import { useGruposCatalogo } from '../hooks/useGruposCatalogo';
import { mensagemDeErro } from '../lib/erros';
import { DIAS_PRECO_ANTIGO, resumoCatalogo, type LinhaResumoCatalogo } from '../lib/catalogo/resumo';
import { inteiro, percentual, plural } from '../lib/indicadores/formato';
import { rotuloCategoriaInsumo } from '../constants/categorias';
import { rotuloProcedencia } from './catalogo/acoesInsumo';
import { CATEGORIAS } from './catalogo/categorias';
import BlocoGrafico from './indicadores/BlocoGrafico';
import KpiBI from './indicadores/KpiBI';
import TabelaBI, { type ColunaBI } from './indicadores/TabelaBI';
import { GraficoBarras } from './indicadores/graficos';
import { SERIE } from './indicadores/cores';
import { GRADE_GRAFICOS, rolarPara } from './indicadores/contexto';

type SubAba = 'geral' | 'composicoes' | 'grupos';

/** A procedência na ordem da cadeia de preço — do mais firme ao só-cadastro. */
const NIVEIS = [
  { nivel: 1, rotulo: `${rotuloProcedencia(1, 'Cotação')} / folha` },
  { nivel: 2, rotulo: rotuloProcedencia(2, '') },
  { nivel: 3, rotulo: rotuloProcedencia(3, '') },
  { nivel: 4, rotulo: rotuloProcedencia(4, '') },
] as const;

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
  buscarCandidatosComponente: (termo: string, excluirId: string, grupoId?: string) => Promise<InsumoCatalogo[]>;
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
  /** O banco inteiro em colunas mínimas — KPIs, gráficos e contagem por grupo. `null` = falhou. */
  carregarResumo: () => Promise<LinhaResumoCatalogo[] | null>;
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
  carregarResumo,
}: CatalogoTabProps) {
  const { toast } = useFeedback();
  const { grupos, criarGrupo } = useGruposCatalogo();
  const [subAba, setSubAba] = useState<SubAba>('geral');

  /**
   * O resumo é refeito quando a lista recarrega: toda escrita (cadastro,
   * cotação, ativar) termina recarregando a página, então é o sinal de que os
   * números do topo podem ter mudado. `undefined` = carregando, `null` = falhou.
   */
  const [linhasResumo, setLinhasResumo] = useState<LinhaResumoCatalogo[] | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    void carregarResumo().then((linhas) => { if (vivo) setLinhasResumo(linhas); });
    return () => { vivo = false; };
  }, [carregarResumo, catalogo]);
  const resumo = useMemo(() => (linhasResumo ? resumoCatalogo(linhasResumo) : null), [linhasResumo]);

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
  // Na sub-aba Composições o tipo é a própria aba, não um filtro: não conta e não se limpa.
  const tipoTravado = subAba === 'composicoes';
  const filtrado = Boolean(filtro.busca || filtro.categoria || (!tipoTravado && filtro.tipoItem) || filtro.grupoId) || filtro.ativo !== true;
  const limparFiltros = () =>
    aplicarFiltro({ busca: undefined, categoria: undefined, tipoItem: tipoTravado ? 'Composicao' : undefined, grupoId: undefined, ativo: true, pagina: 0 });

  /** "Composições" é a lista com o tipo travado; sair dela devolve os dois tipos. */
  const trocarSubAba = (nova: SubAba) => {
    if (nova === 'composicoes') aplicarFiltro({ tipoItem: 'Composicao' });
    else if (subAba === 'composicoes') aplicarFiltro({ tipoItem: undefined });
    setSubAba(nova);
  };

  const irParaLista = (patch: Partial<FiltroCatalogo>) => {
    aplicarFiltro(subAba === 'composicoes' ? patch : { tipoItem: undefined, ...patch });
    setSubAba('geral');
    rolarPara('catalogo-main-container');
  };

  const [nomeGrupo, setNomeGrupo] = useState('');
  const [criandoGrupo, setCriandoGrupo] = useState(false);
  const novoGrupo = async () => {
    if (!nomeGrupo.trim()) return;
    setCriandoGrupo(true);
    try {
      await criarGrupo(nomeGrupo);
      toast.success(`Grupo "${nomeGrupo.trim()}" criado.`);
      setNomeGrupo('');
    } catch (err) {
      toast.error('Não foi possível criar o grupo.', mensagemDeErro(err));
    } finally {
      setCriandoGrupo(false);
    }
  };

  const linhasGrupo = useMemo(() => {
    const porGrupo = resumo?.porGrupo;
    return [
      ...grupos.map((g) => ({ id: g.id, nome: g.nome, itens: porGrupo?.get(g.id) ?? 0 })),
      { id: '', nome: 'Sem grupo', itens: porGrupo?.get(null) ?? 0 },
    ];
  }, [grupos, resumo]);
  const colunasGrupo: ColunaBI<(typeof linhasGrupo)[number]>[] = [
    { id: 'nome', titulo: 'Grupo de serviço', render: (g) => g.nome, ordenar: (g) => g.nome, csv: (g) => g.nome },
    { id: 'itens', titulo: 'Itens ativos', align: 'right', render: (g) => inteiro(g.itens), ordenar: (g) => g.itens, csv: (g) => g.itens },
  ];

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
          de onde vem o preço na mesma frase. */}
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

      <Abas
        abas={[
          { id: 'geral', rotulo: 'Visão geral', icone: <Database size={14} /> },
          { id: 'composicoes', rotulo: 'Composições', icone: <Sigma size={14} />, contagem: resumo?.composicoes },
          { id: 'grupos', rotulo: 'Grupos de serviço', icone: <FolderTree size={14} />, contagem: grupos.length },
        ]}
        ativa={subAba}
        onTrocar={trocarSubAba}
        rotulo="Seções do banco de custos"
        prefixo="catalogo"
      />

      <PainelAba prefixo="catalogo" ativa={subAba} className="space-y-6">
        {subAba === 'geral' && (linhasResumo === null ? (
          <Aviso tom="negativo" icone={<AlertTriangle size={16} />}>
            O resumo do banco de custos não carregou. A lista abaixo continua valendo.
          </Aviso>
        ) : (
          <>
            <FaixaKpis colunas={3}>
              <KpiBI
                rotulo="Itens ativos"
                valor={resumo ? inteiro(resumo.ativos) : '…'}
                detalhe={resumo ? `${plural(resumo.insumos, 'insumo', 'insumos')} · ${plural(resumo.composicoes, 'composição', 'composições')}` : undefined}
                onClick={() => irParaLista({ ativo: true })}
              />
              <KpiBI
                rotulo="Com preço firme"
                valor={resumo ? percentual(resumo.ativos ? (resumo.firmes / resumo.ativos) * 100 : null) : '…'}
                detalhe={resumo ? `${plural(resumo.firmes, 'item', 'itens')} com cotação firme ou custo da folha` : undefined}
              />
              <KpiBI
                rotulo="Só preço de referência"
                valor={resumo ? inteiro(resumo.soReferencia) : '…'}
                detalhe="Sem cotação, preço praticado nem estimativa"
              />
              <KpiBI
                rotulo="Preço antigo"
                valor={resumo ? inteiro(resumo.antigos) : '…'}
                detalhe={`Cotação ou praticado com mais de ${DIAS_PRECO_ANTIGO} dias`}
              />
              <KpiBI
                rotulo="Em uso em obras"
                valor={resumo ? inteiro(resumo.emUso) : '…'}
                detalhe="Itens no orçamento de ao menos uma obra"
              />
              <KpiBI
                rotulo="Inativos"
                valor={resumo ? inteiro(resumo.inativos) : '…'}
                detalhe="Fora dos seletores, com o histórico preservado"
                onClick={() => irParaLista({ ativo: false })}
              />
            </FaixaKpis>

            {resumo && (
              <div className={GRADE_GRAFICOS}>
                <BlocoGrafico
                  titulo="Itens por categoria"
                  descricao="Itens ativos. Clique numa barra para filtrar a lista."
                  vazio={resumo.ativos > 0 ? null : 'Nenhum item ativo no banco de custos.'}
                  tabela={{ colunas: ['Categoria', 'Itens'], linhas: CATEGORIAS.map((c) => [rotuloCategoriaInsumo(c), inteiro(resumo.porCategoria.get(c) ?? 0)]) }}
                >
                  {(tamanho) => (
                    <GraficoBarras
                      dados={CATEGORIAS.map((c) => ({ categoria: c, rotulo: rotuloCategoriaInsumo(c), itens: resumo.porCategoria.get(c) ?? 0 }))}
                      categoria="rotulo"
                      deitado
                      contagem
                      tamanho={tamanho}
                      formatar={inteiro}
                      onClicar={(l) => irParaLista({ categoria: l.categoria })}
                      series={[{ chave: 'itens', rotulo: 'Itens', cor: SERIE.primaria }]}
                    />
                  )}
                </BlocoGrafico>

                <BlocoGrafico
                  titulo="Procedência do preço"
                  descricao="De onde vem o preço vigente de cada item ativo — do mais firme ao só-cadastro."
                  vazio={resumo.ativos > 0 ? null : 'Nenhum item ativo no banco de custos.'}
                  tabela={{ colunas: ['Procedência', 'Itens'], linhas: NIVEIS.map((n) => [n.rotulo, inteiro(resumo.porNivel[n.nivel - 1])]) }}
                >
                  {(tamanho) => (
                    <GraficoBarras
                      dados={NIVEIS.map((n) => ({ rotulo: n.rotulo, itens: resumo.porNivel[n.nivel - 1] }))}
                      categoria="rotulo"
                      deitado
                      contagem
                      tamanho={tamanho}
                      formatar={inteiro}
                      series={[{ chave: 'itens', rotulo: 'Itens', cor: SERIE.primaria }]}
                    />
                  )}
                </BlocoGrafico>
              </div>
            )}
          </>
        ))}

        {subAba === 'grupos' ? (
          <TabelaBI
            titulo="Grupos de serviço"
            descricao="O grupo junta insumos e composições do mesmo serviço (ex.: revestimento cerâmico). Clique num grupo para ver os itens dele."
            linhas={linhasGrupo}
            colunas={colunasGrupo}
            chave={(g) => g.id || 'sem-grupo'}
            onAbrir={(g) => irParaLista({ grupoId: g.id || undefined })}
            rotuloAbrir={(g) => `Ver os itens de ${g.nome}`}
            arquivo="grupos-de-servico"
            vazio="Nenhum grupo cadastrado."
            recortes={
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => { e.preventDefault(); void novoGrupo(); }}
              >
                <div className="w-full max-w-xs">
                  <Input
                    aria-label="Nome do novo grupo"
                    placeholder="Novo grupo (ex.: Impermeabilização)"
                    value={nomeGrupo}
                    onChange={(e) => setNomeGrupo(e.target.value)}
                  />
                </div>
                <Button type="submit" variante="secundario" carregando={criandoGrupo} disabled={!nomeGrupo.trim()}>
                  <Plus size={14} aria-hidden="true" /> Criar grupo
                </Button>
              </form>
            }
          />
        ) : (
        <section id="catalogo-main-container" className="scroll-mt-24 space-y-4" aria-labelledby="catalogo-lista-titulo">
          <h2 id="catalogo-lista-titulo" className="text-sm font-semibold text-slate-900">
            {subAba === 'composicoes' ? 'Composições' : 'Itens do banco de custos'}
          </h2>
          <BarraCatalogo
            semTipo={subAba === 'composicoes'}
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
            <p aria-live="polite" aria-atomic="true" className="flex items-center gap-2 text-xs text-slate-500">
              <span>
                <strong className="font-mono font-semibold text-slate-900">{total}</strong>{' '}
                {total === 1 ? 'item' : 'itens'}
                {filtrado ? ' no filtro atual' : ' ativos no banco de custos'}
              </span>
              {filtrado && (
                <Button variante="fantasma" tamanho="sm" onClick={limparFiltros}>
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
        </section>
        )}
      </PainelAba>

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
