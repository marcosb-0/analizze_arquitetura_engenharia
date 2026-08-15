import { memo, useEffect, useMemo, useState } from 'react';
import {
  Proposta,
  NovaProposta,
  Cliente,
  Funcionario,
  Projeto,
  ConversaoObraPayload,
  ItemProposta,
  InsumoCatalogo,
  Fornecedor,
  AjustePreco,
  EmpresaConfig,
  ModeloTexto,
  SecaoProposta,
  Contrato,
} from '../types';
import { NovoItemProposta } from '../services/itensPropostaService';
import { FiltroCatalogo } from '../services/catalogoService';
import { UseSinapi } from '../hooks/useSinapi';
import type { AcoesComposicaoProposta } from './PropostaItens';
import { EMPRESA_FALLBACK } from '../constants/empresa';
import { useFeedback } from './FeedbackContext';
import ConverterObraWizard from './ConverterObraWizard';
import ListaPropostas from './propostas/ListaPropostas';
import { FILTROS_INICIAIS, type FiltrosCarteira } from './propostas/filtrosCarteira';
import DetalheProposta from './propostas/DetalheProposta';
import ModalNovaProposta from './propostas/ModalNovaProposta';
import ModalEditarProposta, { EdicaoProposta } from './propostas/ModalEditarProposta';
import ModalRejeicao from './propostas/ModalRejeicao';
import ModalAprovacao from './propostas/ModalAprovacao';
import { PaginaAba } from './ui';

export type { EdicaoProposta };

interface PropostasTabProps {
  propostas: Proposta[];
  itensProposta: ItemProposta[];
  /** Descritivo das propostas já abertas; recortado por proposta na seleção. */
  secoesProposta: SecaoProposta[];
  /** A biblioteca de textos da empresa, compartilhada por todas as propostas. */
  modelos: ModeloTexto[];
  /** Só para saber quais propostas já geraram contrato. */
  contratos: Contrato[];
  loading: boolean;
  /** A proposta aberta, vinda da rota. `null` é a carteira ocupando a tela. */
  propostaAbertaId: string | null;
  onAbrirProposta: (id: string) => void;
  onVoltarParaCarteira: () => void;
  /** Como a volta acima, mas para o endereço que aponta para o que não existe. */
  onEnderecoQuebrado: () => void;
  /** Id da proposta cujo orçamento está sendo buscado, se houver. */
  carregandoDetalhe: string | null;
  carregarDetalheProposta: (propostaId: string) => void;
  clientes: Cliente[];
  funcionarios: Funcionario[];
  /** Só para saber quais propostas já viraram obra — essas ficam congeladas. */
  projetos: Projeto[];
  catalogo: InsumoCatalogo[];
  fornecedores: Fornecedor[];
  /** Papel timbrado do documento impresso. Null enquanto não carregou. */
  empresa: EmpresaConfig | null;
  aplicarFiltroCatalogo: (patch: Partial<FiltroCatalogo>) => void;
  /** Estado da busca SINAPI, montado no conector e usado no seletor de item. */
  sinapi: UseSinapi;
  /** Os sete handlers de composição, agrupados como o `descritivo`. */
  composicao: AcoesComposicaoProposta;
  onAddProposta: (prop: NovaProposta) => Promise<Proposta | null>;
  onUpdateProposta: (id: string, patch: EdicaoProposta) => Promise<boolean>;
  onDuplicarProposta: (id: string, descricao?: string) => Promise<Proposta | null>;
  onUpdateStatus: (id: string, status: Proposta['status'], motivoRejeicao?: string) => Promise<boolean>;
  /** Abre a obra gerada por esta proposta na aba de projetos. */
  onAbrirObra: (projetoId: string) => void;
  onUpdateBdi: (id: string, bdi: number) => Promise<void>;
  onUpdateBdiVisivelPdf: (id: string, visivel: boolean) => Promise<void>;
  onAddRevision: (id: string, alteracoes: string, valor?: number) => Promise<boolean>;
  onConvertToProject: (prop: Proposta, payload: ConversaoObraPayload) => Promise<string | null>;
  onDeleteProposta: (id: string) => Promise<boolean>;
  onAddItemProposta: (novo: NovoItemProposta) => Promise<ItemProposta | null>;
  onAjustarItemProposta: (id: string, ajuste: AjustePreco) => Promise<ItemProposta | null>;
  onAjustarQuantidadeItemProposta: (id: string, quantidade: number) => Promise<ItemProposta | null>;
  onRemoveItemProposta: (id: string) => Promise<void>;
  /** Os handlers do descritivo, agrupados — atravessam a aba sem serem lidos aqui. */
  descritivo: React.ComponentProps<typeof DetalheProposta>['descritivo'];
  onGerarContrato: (prop: Proposta) => Promise<string | null>;
  onAbrirContratos: () => void;
}

/**
 * A aba comercial: OU a carteira inteira, OU uma proposta — nunca as duas.
 *
 * Este arquivo era um componente único de 2.137 linhas com 31 `useState`
 * (§3.2 da auditoria). Hoje ele guarda só o que é mesmo compartilhado — os
 * filtros da carteira e quais diálogos globais estão em cena. O documento
 * impresso e a revisão vivem no detalhe, e cada formulário de diálogo é um
 * componente montado apenas enquanto o diálogo está aberto.
 *
 * ## Por que o painel lateral virou tela
 *
 * A geometria mestre/detalhe dava um terço da largura para a lista e dois
 * terços para o detalhe, e cobrava dos dois: a carteira — 8 campos por proposta
 * — vivia numa coluna de ~400 px, empilhada como cartão, sem como comparar
 * valor, validade e status entre linhas; e o detalhe, que carrega o orçamento
 * inteiro com composição por item, o descritivo e o documento, trabalhava em
 * dois terços de tela. Nenhuma das duas telas é de consulta rápida, e a única
 * coisa que se ganhava era ver as duas ao mesmo tempo — o que ninguém faz,
 * porque a proposta aberta já é sempre a que a lista está destacando.
 *
 * Agora a carteira é uma TABELA de largura cheia (comparável linha a linha) e a
 * proposta é uma tela com endereço próprio. Quem escolhe entre as duas é a rota
 * (`propostaAbertaId`), não um `useState` daqui — ver `PropostasConectado`.
 */
function PropostasTab({
  propostas,
  itensProposta,
  secoesProposta,
  modelos,
  contratos,
  loading,
  propostaAbertaId,
  onAbrirProposta,
  onVoltarParaCarteira,
  onEnderecoQuebrado,
  carregandoDetalhe,
  carregarDetalheProposta,
  clientes,
  funcionarios,
  projetos,
  catalogo,
  fornecedores,
  empresa,
  aplicarFiltroCatalogo,
  sinapi,
  composicao,
  onAddProposta,
  onUpdateProposta,
  onDuplicarProposta,
  onUpdateStatus,
  onAbrirObra,
  onUpdateBdi,
  onUpdateBdiVisivelPdf,
  onAddRevision,
  onConvertToProject,
  onDeleteProposta,
  onAddItemProposta,
  onAjustarItemProposta,
  onAjustarQuantidadeItemProposta,
  onRemoveItemProposta,
  descritivo,
  onGerarContrato,
  onAbrirContratos,
}: PropostasTabProps) {
  const { toast, confirm } = useFeedback();
  // O documento precisa de um cabeçalho mesmo antes de a configuração chegar;
  // o fallback é neutro de propósito, para ninguém imprimir dados de outra
  // empresa por engano.
  const timbre = empresa ?? EMPRESA_FALLBACK;

  /**
   * A proposta aberta é derivada do ID a cada render, e não guardada.
   *
   * Guardar o objeto exigia um efeito para reapontá-lo toda vez que o servidor
   * recalculasse os totais — sem ele, a tela continuava mostrando a cópia
   * congelada no instante do clique.
   *
   * `null` agora significa A CARTEIRA, e não "ainda não escolheu": a versão
   * anterior caía na primeira proposta da lista porque o painel ao lado não
   * podia ficar vazio. Sem lista ao lado, abrir a aba direto numa proposta
   * arbitrária seria abrir a tela errada.
   */
  const selecionada = propostaAbertaId
    ? (propostas.find((p) => p.id === propostaAbertaId) ?? null)
    : null;

  /**
   * O endereço de uma proposta que não existe mais volta para a carteira.
   *
   * Acontece com link antigo, com proposta excluída em outra sessão e com o
   * papel que não alcança aquela linha pela RLS. Sem isto a tela mostraria a
   * lista com `/propostas/<id>` na barra de endereço — e o botão voltar teria de
   * ser apertado duas vezes para sair da aba. `loading` é a guarda que impede o
   * caso comum de ser tratado como erro: durante a primeira busca a lista está
   * vazia e TODO id parece inexistente.
   *
   * `onEnderecoQuebrado`, e não a volta normal: isto CORRIGE o endereço, e
   * empilhá-lo no histórico faria o botão voltar cair no link quebrado outra
   * vez — ver o comentário do handler no conector.
   */
  useEffect(() => {
    if (propostaAbertaId && !loading && !selecionada) onEnderecoQuebrado();
  }, [propostaAbertaId, loading, selecionada, onEnderecoQuebrado]);

  /**
   * Os filtros da carteira moram aqui, e não na lista, porque a lista DESMONTA
   * quando uma proposta abre. Dentro dela, voltar da proposta devolveria a
   * carteira sem busca, sem status e na ordem padrão — a cada ida e volta.
   */
  const [filtros, setFiltros] = useState<FiltrosCarteira>(FILTROS_INICIAIS);

  const [novaProposta, setNovaProposta] = useState(false);
  const [propostaEmEdicao, setPropostaEmEdicao] = useState<Proposta | null>(null);
  const [rejeitando, setRejeitando] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [propostaParaAprovar, setPropostaParaAprovar] = useState<Proposta | null>(null);
  const [propostaParaConverter, setPropostaParaConverter] = useState<Proposta | null>(null);

  /**
   * O orçamento e os snapshots das revisões chegam quando a proposta é aberta.
   *
   * A dependência é só o ID: `selecionada` é um objeto novo a cada recálculo de
   * total no servidor, e `carregarDetalheProposta` é recriada a cada render do
   * hook de dados — qualquer uma das duas no array faria a busca disparar em
   * loop. O próprio serviço já guarda os ids buscados numa ref.
   */
  const idAberto = selecionada?.id;
  useEffect(() => {
    if (idAberto) carregarDetalheProposta(idAberto);
  }, [idAberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const secoesDaProposta = useMemo(
    () => (selecionada ? secoesProposta.filter((s) => s.propostaId === selecionada.id) : []),
    [secoesProposta, selecionada]
  );

  const itensDaProposta = useMemo(
    () => (selecionada ? itensProposta.filter((i) => i.propostaId === selecionada.id) : []),
    [itensProposta, selecionada]
  );

  const obraDaProposta = useMemo(
    () => (selecionada ? projetos.find((p) => p.propostaId === selecionada.id) : undefined),
    [projetos, selecionada]
  );

  // Sem isto a proposta apareceria como "sem itens" durante a busca — e o
  // usuário poderia registrar uma revisão congelando um orçamento vazio.
  const detalheCarregando = !!selecionada && carregandoDetalhe === selecionada.id;

  const mudarStatus = async (status: Proposta['status']) => {
    if (!selecionada) return;
    if (obraDaProposta) {
      toast.error('Proposta já convertida em obra.', 'O status não pode mais ser alterado.');
      return;
    }
    if (status === 'Aprovada') {
      setPropostaParaAprovar(selecionada);
      return;
    }
    // Recusa sem motivo registrado é a informação mais cara do ciclo indo
    // embora — preço, prazo, escopo ou concorrente.
    if (status === 'Rejeitada') {
      setRejeitando(true);
      return;
    }
    const ok = await onUpdateStatus(selecionada.id, status);
    if (ok) toast.success(`Proposta atualizada para "${status}".`);
  };

  const duplicar = async () => {
    if (!selecionada) return;
    setDuplicando(true);
    const copia = await onDuplicarProposta(selecionada.id);
    setDuplicando(false);
    if (!copia) return;
    onAbrirProposta(copia.id);
    // A cópia herda escopo e orçamento da origem, mas nasce sem validade e
    // quase sempre precisa de outra descrição. Abrir a edição na sequência
    // poupa o passo de procurar onde mudar isso — antes não havia caminho
    // nenhum para editar a proposta duplicada. O diálogo recebe a CÓPIA por
    // valor, então não há corrida com a seleção que acabou de mudar.
    setPropostaEmEdicao(copia);
    toast.success(
      `Proposta ${copia.numero} criada a partir da ${selecionada.numero}.`,
      'O orçamento foi copiado. Ajuste os dados e defina a nova validade antes de enviar.'
    );
  };

  const excluir = () => {
    if (!selecionada) return;
    const alvo = selecionada;
    if (obraDaProposta) {
      toast.error(
        'Proposta já convertida em obra.',
        `A obra "${obraDaProposta.nome}" depende desta proposta e o banco recusa a exclusão.`
      );
      return;
    }
    confirm({
      title: 'Confirmar exclusão de proposta',
      message: `Tem certeza de que deseja remover a proposta ${alvo.numero}? Esta operação não pode ser desfeita e o histórico de revisões será apagado. Propostas já convertidas em obra não podem ser excluídas.`,
      onConfirm: async () => {
        const ok = await onDeleteProposta(alvo.id);
        if (!ok) return;
        // Excluir fecha a tela da proposta: a carteira é o único lugar que
        // continua existindo depois disso. Antes a seleção pulava para a
        // próxima da lista, porque o painel ao lado não podia ficar vazio.
        onVoltarParaCarteira();
        toast.success('Proposta removida.');
      },
    });
  };

  return (
    <PaginaAba
      largura="painel"
      /* `livre`: cada uma das duas telas declara o próprio ritmo vertical — a
         carteira usa o espaço de seção, a proposta usa o dela. */
      fluxo="livre"
      id="propostas-tab-container"
    >
      {selecionada ? (
          <DetalheProposta
            // Trocar de proposta remonta a tela: o documento impresso e o
            // diálogo de revisão são estado DAQUELA proposta, não da tela.
            key={selecionada.id}
            proposta={selecionada}
            onVoltar={onVoltarParaCarteira}
            itens={itensDaProposta}
            secoes={secoesDaProposta}
            modelos={modelos}
            cliente={clientes.find((c) => c.id === selecionada.clienteId)}
            catalogo={catalogo}
            fornecedores={fornecedores}
            timbre={timbre}
            obra={obraDaProposta}
            carregando={detalheCarregando}
            duplicando={duplicando}
            aplicarFiltroCatalogo={aplicarFiltroCatalogo}
            sinapi={sinapi}
            composicao={composicao}
            onMudarStatus={mudarStatus}
            onEditar={() => setPropostaEmEdicao(selecionada)}
            onDuplicar={duplicar}
            onExcluir={excluir}
            onAbrirObra={onAbrirObra}
            onIniciarConversao={() => setPropostaParaConverter(selecionada)}
            onAddRevision={onAddRevision}
            onUpdateBdi={onUpdateBdi}
            onUpdateBdiVisivelPdf={onUpdateBdiVisivelPdf}
            onAddItem={onAddItemProposta}
            onAjustarItem={onAjustarItemProposta}
            onAjustarQuantidade={onAjustarQuantidadeItemProposta}
            onRemoveItem={onRemoveItemProposta}
            descritivo={descritivo}
            contrato={contratos.find((c) => c.propostaId === selecionada.id)}
            onGerarContrato={() => void onGerarContrato(selecionada)}
            onAbrirContrato={onAbrirContratos}
          />
      ) : (
        <ListaPropostas
          propostas={propostas}
          clientes={clientes}
          loading={loading}
          filtros={filtros}
          onFiltrar={setFiltros}
          onAbrir={onAbrirProposta}
          onNova={() => setNovaProposta(true)}
        />
      )}

      <ModalNovaProposta
        aberto={novaProposta}
        onFechar={() => setNovaProposta(false)}
        clientes={clientes}
        onCriar={onAddProposta}
        // A proposta recém-criada ABRE: ela nasce sem orçamento e sem
        // descritivo, e o próximo passo de quem a criou está lá dentro.
        onCriada={(criada) => onAbrirProposta(criada.id)}
      />

      <ModalEditarProposta
        proposta={propostaEmEdicao}
        onFechar={() => setPropostaEmEdicao(null)}
        clientes={clientes}
        temItens={itensDaProposta.length > 0}
        onSalvar={onUpdateProposta}
      />

      {selecionada && (
        <ModalRejeicao
          aberto={rejeitando}
          onFechar={() => setRejeitando(false)}
          proposta={selecionada}
          onRejeitar={(id, motivo) => onUpdateStatus(id, 'Rejeitada', motivo)}
        />
      )}

      <ModalAprovacao
        proposta={propostaParaAprovar}
        onFechar={() => setPropostaParaAprovar(null)}
        onAprovar={onUpdateStatus}
        onConverter={setPropostaParaConverter}
      />

      {/* Assistente de conversão — revisa orçamento e cronograma antes de criar a obra */}
      {propostaParaConverter && (
        <ConverterObraWizard
          proposta={propostaParaConverter}
          itensProposta={itensProposta.filter((i) => i.propostaId === propostaParaConverter.id)}
          cliente={clientes.find((c) => c.id === propostaParaConverter.clienteId)}
          funcionarios={funcionarios.filter((f) => f.status === 'Ativo')}
          onCancel={() => setPropostaParaConverter(null)}
          onConfirm={async (payload) => {
            const novoId = await onConvertToProject(propostaParaConverter, payload);
            if (novoId) setPropostaParaConverter(null);
            return !!novoId;
          }}
        />
      )}
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
export default memo(PropostasTab);
