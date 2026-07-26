import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Search, 
  Plus, 
  Calendar, 
  Clock, 
  DollarSign, 
  Printer, 
  Sparkles, 
  History,
  Trash2,
  AlertCircle,
  Eye,
  Copy,
  Send,
  ArrowRight,
  Pencil
} from 'lucide-react';
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
} from '../types';
import { NovoItemProposta } from '../services/itensPropostaService';
import { FiltroCatalogo } from '../services/catalogoService';
import { formatarDataBR, diasAte } from '../lib/data';
import {
  situacaoValidade,
  rotuloValidade,
  CORES_VALIDADE,
  DIAS_ALERTA_VALIDADE,
} from '../lib/validadeProposta';
import { useEscapeParaFechar } from '../hooks/useEscapeParaFechar';
import { compararRevisoes, ROTULO_MUDANCA } from '../lib/diffRevisao';
import { EMPRESA_FALLBACK } from '../constants/empresa';
import { StatusBadge } from '../constants/status';
import { Modal } from './ui';
import { useArmadilhaDeFoco } from '../hooks/useArmadilhaDeFoco';
import { formatarPrazo, formatarPrazoCurto } from '../lib/prazo';
import { formatBRL } from '../lib/preco';
import { useFeedback } from './FeedbackContext';

type FiltroValidade = 'Todas' | 'Vigentes' | 'A vencer' | 'Vencidas';
type Ordenacao = 'Recentes' | 'Maior valor' | 'Menor valor' | 'Validade' | 'Cliente';

/** O que a edição do cabeçalho comercial pode mudar. */
export type EdicaoProposta = {
  clienteId: string;
  descricao: string;
  valorManual: number;
  bdiPercentual: number;
  prazoExecucaoDias?: number;
  dataValidade: string;
};
import EmptyState from './EmptyState';
import Spinner from './Spinner';
import ConverterObraWizard from './ConverterObraWizard';
import PropostaItens from './PropostaItens';
import ConfiancaPreco from './ConfiancaPreco';

interface PropostasTabProps {
  propostas: Proposta[];
  itensProposta: ItemProposta[];
  loading: boolean;
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
}

export default function PropostasTab({
  propostas,
  itensProposta,
  loading,
  carregandoDetalhe,
  carregarDetalheProposta,
  clientes,
  funcionarios,
  projetos,
  catalogo,
  fornecedores,
  empresa,
  aplicarFiltroCatalogo,
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
  onRemoveItemProposta
}: PropostasTabProps) {
  const { toast, confirm } = useFeedback();
  // O documento precisa de um cabeçalho mesmo antes de a configuração chegar;
  // o fallback é neutro de propósito, para ninguém imprimir dados de outra
  // empresa por engano.
  const timbre = empresa ?? EMPRESA_FALLBACK;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Todas');
  const [validadeFilter, setValidadeFilter] = useState<FiltroValidade>('Todas');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('Recentes');
  const [selectedProposta, setSelectedProposta] = useState<Proposta | null>(propostas[0] || null);

  // Os totais da proposta são recalculados no servidor a cada mudança de item
  // ou de BDI. Sem este espelho, o painel de detalhe continuaria mostrando a
  // cópia congelada no momento da seleção.
  useEffect(() => {
    setSelectedProposta((atual) => {
      if (!atual) return propostas[0] ?? null;
      return propostas.find((p) => p.id === atual.id) ?? null;
    });
  }, [propostas]);

  // O orçamento e os snapshots das revisões chegam quando a proposta é aberta.
  useEffect(() => {
    if (selectedProposta) carregarDetalheProposta(selectedProposta.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProposta?.id]);

  const itensDaProposta = React.useMemo(
    () => (selectedProposta ? itensProposta.filter((i) => i.propostaId === selectedProposta.id) : []),
    [itensProposta, selectedProposta]
  );

  // Sem isto a proposta apareceria como "sem itens" durante a busca — e o
  // usuário poderia registrar uma revisão congelando um orçamento vazio.
  const detalheCarregando = !!selectedProposta && carregandoDetalhe === selectedProposta.id;

  // Uma proposta que já virou obra é o documento que originou um contrato em
  // execução: mexer nos itens, no BDI ou no status mudaria retroativamente o
  // valor de venda de uma obra em andamento. Rejeitada e aprovada também param
  // de aceitar edição — a aprovada ainda pode ser reaberta pelo status.
  const obraDaProposta = React.useMemo(
    () => (selectedProposta ? projetos.find((p) => p.propostaId === selectedProposta.id) : undefined),
    [projetos, selectedProposta]
  );
  const convertida = !!obraDaProposta;
  const propostaTemItens = itensDaProposta.length > 0;
  const situacaoSelecionada = selectedProposta ? situacaoValidade(selectedProposta) : 'sem-validade';
  const rotuloSelecionada = selectedProposta ? rotuloValidade(selectedProposta) : null;
  // Negativo porque `diasAte` mede daqui para a frente e o envio ficou atrás.
  const diasDesdeEnvio = selectedProposta?.dataEnvio ? -(diasAte(selectedProposta.dataEnvio) ?? 0) : null;

  /**
   * Números do documento impresso. Subtotal, BDI e total saem de `valorItens` e
   * `valorCalculado` — colunas que a v_propostas já entregava e que ninguém
   * consumia. Recalcular no cliente arriscaria um centavo de diferença entre o
   * papel entregue ao cliente e o valor gravado. Só a distribuição por
   * categoria é derivada aqui, porque o servidor não a expõe.
   */
  const totaisDocumento = React.useMemo(() => {
    if (!selectedProposta) return null;
    const subtotal = selectedProposta.valorItens;
    const total = selectedProposta.valorCalculado;
    const bdiEmbutido = !selectedProposta.bdiVisivelPdf;
    const cent = (n: number) => Math.round(n * 100) / 100;

    /**
     * Com o BDI embutido, cada preço unitário sobe pelo fator e o total não
     * muda. Só que arredondar linha a linha depois de multiplicar não devolve
     * exatamente o total guardado — sobra ou falta alguns centavos.
     *
     * Um documento comercial não pode ter uma coluna que não fecha com o
     * total. Então o resíduo é jogado na linha de maior valor, onde ele
     * desaparece proporcionalmente, e a soma da coluna passa a bater na
     * casa dos centavos com o valor contratado.
     */
    const fator = bdiEmbutido ? 1 + selectedProposta.bdiPercentual / 100 : 1;

    const linhas = itensDaProposta.map((i) => {
      // Mesmo arredondamento por linha que fn_sync_valor_proposta aplica.
      const totalSemBdi = cent(i.quantidade * i.precoUnitario);
      const totalLinha = bdiEmbutido ? cent(totalSemBdi * fator) : totalSemBdi;
      return {
        item: i,
        precoUnitario: bdiEmbutido && i.quantidade > 0 ? cent(totalLinha / i.quantidade) : i.precoUnitario,
        total: totalLinha,
      };
    });

    if (bdiEmbutido && linhas.length > 0) {
      const somaLinhas = cent(linhas.reduce((s, l) => s + l.total, 0));
      const residuo = cent(total - somaLinhas);
      if (residuo !== 0) {
        const maior = linhas.reduce((a, b) => (b.total > a.total ? b : a));
        maior.total = cent(maior.total + residuo);
      }
    }

    const mapa = new Map<string, number>();
    for (const l of linhas) {
      mapa.set(l.item.categoria, (mapa.get(l.item.categoria) ?? 0) + l.total);
    }

    return {
      subtotal,
      bdiValor: total - subtotal,
      total,
      bdiEmbutido,
      linhas,
      porCategoria: [...mapa.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [selectedProposta, itensDaProposta]);
  const bloqueado =
    convertida || selectedProposta?.status === 'Rejeitada' || selectedProposta?.status === 'Aprovada';
  const motivoBloqueio = convertida
    ? `Proposta já convertida na obra "${obraDaProposta!.nome}". O orçamento ficou congelado como registro do que foi vendido.`
    : selectedProposta?.status === 'Aprovada'
      ? 'Proposta aprovada pelo cliente. Para reabrir o orçamento, volte o status para Elaboração.'
      : selectedProposta?.status === 'Rejeitada'
        ? 'Proposta rejeitada. O orçamento fica preservado como histórico.'
        : undefined;

  // Modals / Overlays
  const [showAddModal, setShowAddModal] = useState(false);
  // Declarados aqui, junto dos demais diálogos, porque os `useEscapeParaFechar`
  // logo abaixo os consomem.
  const [showEditModal, setShowEditModal] = useState(false);
  const [isEditando, setIsEditando] = useState(false);
  const [showPdfOverlay, setShowPdfOverlay] = useState(false);
  // A pré-visualização de impressão não cabe no primitivo <Modal> (barra de
  // ferramentas no lugar do cabeçalho, altura fixa de que o CSS de impressão
  // depende), mas o teclado tem de funcionar igual: Esc fecha e o Tab circula.
  const armadilhaPdf = useArmadilhaDeFoco(showPdfOverlay);
  const [showRevModal, setShowRevModal] = useState(false);
  
  // Loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingRevision, setIsSavingRevision] = useState(false);
  const [isDuplicando, setIsDuplicando] = useState(false);

  // Rejeição
  const [showRejeicaoModal, setShowRejeicaoModal] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [isRejeitando, setIsRejeitando] = useState(false);

  // Os diálogos desta aba passaram para o primitivo <Modal>, que já trata Esc
  // (respeitando `bloqueado` durante uma gravação). Sobra a pré-visualização de
  // impressão, que não cabe no Modal — ver `armadilhaPdf` acima.
  useEscapeParaFechar(showPdfOverlay, () => setShowPdfOverlay(false));

  // New Proposal Form State
  const [formClienteId, setFormClienteId] = useState('');

  // Os clientes chegam por fetch, depois do primeiro render. Inicializar o
  // estado com `clientes[0]?.id` o congelava em '' — o select exibia o
  // primeiro nome enquanto o formulário não tinha cliente nenhum, e só a
  // validação no envio revelava o problema.
  useEffect(() => {
    setFormClienteId((atual) => {
      if (atual && clientes.some((c) => c.id === atual)) return atual;
      return clientes[0]?.id ?? '';
    });
  }, [clientes]);
  const [formDescricao, setFormDescricao] = useState('');

  // Edição do cabeçalho comercial. Estado separado do de criação porque os
  // dois formulários podem coexistir na tela e compartilhar campos faria a
  // edição herdar rascunhos do cadastro.
  const [editClienteId, setEditClienteId] = useState('');
  const [editDescricao, setEditDescricao] = useState('');
  const [editValor, setEditValor] = useState('');
  const [editBdi, setEditBdi] = useState('0');
  const [editPrazoDias, setEditPrazoDias] = useState('');
  const [editValidade, setEditValidade] = useState('');

  // New Revision Form State
  const [revValor, setRevValor] = useState('');
  const [revAlteracoes, setRevAlteracoes] = useState('');

  // Version Comparison State
  const [compRevAId, setCompRevAId] = useState<number | ''>('');
  const [compRevBId, setCompRevBId] = useState<number | ''>('');

  // Filter
  const filteredPropostas = React.useMemo(() => {
    const busca = search.toLowerCase();
    const lista = propostas.filter(p => {
      const cli = clientes.find(c => c.id === p.clienteId);
      const matchesSearch =
        p.numero.toLowerCase().includes(busca) ||
        p.descricao.toLowerCase().includes(busca) ||
        (cli && cli.nome.toLowerCase().includes(busca));

      const matchesStatus = statusFilter === 'Todas' || p.status === statusFilter;

      const situacao = situacaoValidade(p);
      const matchesValidade =
        validadeFilter === 'Todas' ||
        (validadeFilter === 'Vencidas' && situacao === 'vencida') ||
        (validadeFilter === 'A vencer' && (situacao === 'a-vencer' || situacao === 'vence-hoje')) ||
        (validadeFilter === 'Vigentes' && (situacao === 'vigente' || situacao === 'sem-validade'));

      return matchesSearch && matchesStatus && matchesValidade;
    });

    // `propostas` já chega ordenada por created_at desc — "Recentes" é a ordem
    // natural e não precisa reordenar.
    if (ordenacao === 'Recentes') return lista;

    const nomeCliente = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '';
    return [...lista].sort((a, b) => {
      switch (ordenacao) {
        case 'Maior valor':
          return b.valorEstimado - a.valorEstimado;
        case 'Menor valor':
          return a.valorEstimado - b.valorEstimado;
        case 'Validade':
          // Sem validade vai para o fim, não para o começo como faria a
          // comparação de strings vazias.
          if (!a.dataValidade) return 1;
          if (!b.dataValidade) return -1;
          return a.dataValidade.localeCompare(b.dataValidade);
        case 'Cliente':
          return nomeCliente(a.clienteId).localeCompare(nomeCliente(b.clienteId), 'pt-BR');
        default:
          return 0;
      }
    });
  }, [propostas, clientes, search, statusFilter, validadeFilter, ordenacao]);

  // Contagem sobre a base inteira, não sobre o filtro — é um alerta de que há
  // trabalho parado, e some justamente se o usuário já estiver olhando para ele.
  const qtdVencidas = React.useMemo(
    () => propostas.filter((p) => situacaoValidade(p) === 'vencida').length,
    [propostas]
  );

  /**
   * Taxa de conversão sobre propostas DECIDIDAS. Contar as que ainda estão em
   * elaboração ou aguardando resposta afundaria o índice sem significar nada —
   * elas ainda podem virar qualquer coisa.
   */
  const conversao = React.useMemo(() => {
    const aprovadas = propostas.filter((p) => p.status === 'Aprovada').length;
    const decididas = aprovadas + propostas.filter((p) => p.status === 'Rejeitada').length;
    return { aprovadas, decididas, taxa: decididas > 0 ? (aprovadas / decididas) * 100 : null };
  }, [propostas]);

  const getClientName = (clientId: string) => {
    return clientes.find(c => c.id === clientId)?.nome || 'Cliente não encontrado';
  };

  const getClientObj = (clientId: string) => {
    return clientes.find(c => c.id === clientId);
  };

  /**
   * Criar uma proposta pede só o mínimo que a identifica: para quem e do quê.
   *
   * Valor, BDI, prazo e validade saíram daqui porque não se sabem no instante
   * em que a proposta nasce — são o resultado de montar o orçamento. Exigi-los
   * na abertura produzia números inventados só para o formulário aceitar
   * (o "A definir" gravado como prazo era exatamente isso). Todos continuam
   * editáveis a qualquer momento pelo botão Editar do painel.
   */
  const handleCreateProposta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClienteId || !formDescricao.trim()) {
      toast.error('Informe o cliente e a descrição do escopo.');
      return;
    }

    setIsSaving(true);

    // Quem numera é o banco: contar o array em memória reaproveitava o número
    // de uma proposta excluída e batia na unique de `propostas.numero`. O
    // número real chega no retorno.
    const criada = await onAddProposta({
      id: crypto.randomUUID(),
      clienteId: formClienteId,
      descricao: formDescricao.trim(),
      // Nasce zerada: sem itens e sem valor digitado, a proposta vale zero — e
      // um zero visível é mais honesto do que um palpite pedido no cadastro.
      valorManual: 0,
      bdiPercentual: 0,
      prazoExecucaoDias: undefined,
      dataValidade: '',
      status: 'Elaboração',
    });

    setIsSaving(false);
    // O hook já mostrou o motivo da falha — sem proposta gravada não há o que
    // comemorar nem o que selecionar.
    if (!criada) return;

    setSelectedProposta(criada);
    setShowAddModal(false);
    toast.success(
      `Proposta ${criada.numero} criada.`,
      'Monte o orçamento e informe prazo e validade quando fecharem.'
    );

    // Reset — o cliente volta ao primeiro da lista, não ao último usado.
    setFormClienteId(clientes[0]?.id ?? '');
    setFormDescricao('');
  };

  /**
   * Carrega o formulário de edição com o que a proposta tem hoje.
   *
   * Recebe a proposta por parâmetro porque a duplicação abre a edição no mesmo
   * tique em que seleciona a cópia — ler `selectedProposta` ali pegaria a
   * proposta de origem, e o formulário editaria a errada.
   */
  const abrirEdicao = (alvo: Proposta | null = selectedProposta) => {
    if (!alvo) return;
    setEditClienteId(alvo.clienteId);
    setEditDescricao(alvo.descricao);
    setEditValor(String(alvo.valorManual ?? 0));
    setEditBdi(String(alvo.bdiPercentual ?? 0));
    setEditPrazoDias(alvo.prazoExecucaoDias ? String(alvo.prazoExecucaoDias) : '');
    setEditValidade(alvo.dataValidade || '');
    setShowEditModal(true);
  };

  const handleSalvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProposta) return;
    if (!editClienteId || !editDescricao.trim()) {
      toast.error('Cliente e descrição do escopo são obrigatórios.');
      return;
    }

    const prazoDias = editPrazoDias.trim() ? parseInt(editPrazoDias, 10) : undefined;
    // O banco tem check de prazo > 0; barrar aqui explica o motivo em vez de
    // devolver a mensagem crua da constraint.
    if (prazoDias !== undefined && (isNaN(prazoDias) || prazoDias <= 0)) {
      toast.error('Prazo inválido.', 'Informe o número de dias corridos, maior que zero.');
      return;
    }
    const valor = editValor.trim() ? parseFloat(editValor) : 0;
    if (isNaN(valor) || valor < 0) {
      toast.error('Valor inválido.', 'Informe um número maior ou igual a zero.');
      return;
    }
    const bdi = editBdi.trim() ? parseFloat(editBdi) : 0;
    if (isNaN(bdi) || bdi < -100 || bdi > 1000) {
      toast.error('BDI inválido.', 'Informe um percentual entre -100 e 1000.');
      return;
    }

    setIsEditando(true);
    const ok = await onUpdateProposta(selectedProposta.id, {
      clienteId: editClienteId,
      descricao: editDescricao.trim(),
      valorManual: valor,
      bdiPercentual: bdi,
      prazoExecucaoDias: prazoDias,
      dataValidade: editValidade,
    });
    setIsEditando(false);
    if (!ok) return;

    setShowEditModal(false);
    toast.success(
      'Proposta atualizada.',
      propostaTemItens
        ? 'O valor continua vindo do orçamento; o valor digitado ficou guardado.'
        : 'Os novos dados já valem para o documento.'
    );
  };

  const handleCreateRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProposta || !revAlteracoes) {
      toast.error("Descreva o que mudou nesta revisão.");
      return;
    }
    // Digitar valor só faz sentido quando não existe orçamento montado.
    if (!propostaTemItens && !revValor) {
      toast.error("Informe o novo valor proposto.");
      return;
    }

    setIsSavingRevision(true);
    // Versão, data e total são do servidor: com itens o total é o do orçamento
    // vigente, e a versão sai de max(versao) + 1 sob lock da proposta.
    const ok = await onAddRevision(
      selectedProposta.id,
      revAlteracoes,
      propostaTemItens ? undefined : parseFloat(revValor)
    );
    setIsSavingRevision(false);
    if (!ok) return;

    setShowRevModal(false);
    // `selectedProposta` se atualiza sozinha pelo efeito que espelha `propostas`.
    toast.success(
      "Nova revisão registrada.",
      propostaTemItens
        ? "O orçamento vigente foi congelado nesta versão."
        : "O novo valor passou a valer para a proposta."
    );

    setRevValor('');
    setRevAlteracoes('');
  };


  /**
   * O que ainda falta para a proposta poder ir ao cliente. Só o que impede um
   * documento completo entra aqui — o motivo pelo qual a lista pode ficar
   * vazia, e então some da tela em vez de virar decoração permanente.
   */
  const pendencias = React.useMemo(() => {
    if (!selectedProposta) return [];
    const lista: { chave: string; texto: string; acao?: () => void; rotuloAcao?: string }[] = [];

    if (!propostaTemItens && selectedProposta.valorManual <= 0) {
      lista.push({
        chave: 'valor',
        texto: 'A proposta está sem valor: monte o orçamento ou informe um valor global.',
        acao: () => abrirEdicao(),
        rotuloAcao: 'Informar valor',
      });
    }
    if (!selectedProposta.prazoExecucaoDias) {
      lista.push({
        chave: 'prazo',
        texto: 'Prazo de execução não definido.',
        acao: () => abrirEdicao(),
        rotuloAcao: 'Definir',
      });
    }
    if (!selectedProposta.dataValidade) {
      lista.push({
        chave: 'validade',
        texto: 'Sem data de validade — o cliente não sabe até quando os preços valem.',
        acao: () => abrirEdicao(),
        rotuloAcao: 'Definir',
      });
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProposta, propostaTemItens]);

  const [proposalToApprove, setProposalToApprove] = useState<Proposta | null>(null);
  // Proposta whose conversion wizard is open (banner or approval modal).
  const [proposalToConvert, setProposalToConvert] = useState<Proposta | null>(null);

  const handleDuplicarClick = async () => {
    if (!selectedProposta) return;
    setIsDuplicando(true);
    const copia = await onDuplicarProposta(selectedProposta.id);
    setIsDuplicando(false);
    if (!copia) return;
    setSelectedProposta(copia);
    // A cópia herda escopo e orçamento da origem, mas nasce sem validade e
    // quase sempre precisa de outra descrição. Abrir a edição na sequência
    // poupa o passo de procurar onde mudar isso — antes não havia caminho
    // nenhum para editar a proposta duplicada.
    abrirEdicao(copia);
    toast.success(
      `Proposta ${copia.numero} criada a partir da ${selectedProposta.numero}.`,
      'O orçamento foi copiado. Ajuste os dados e defina a nova validade antes de enviar.'
    );
  };

  const handleStatusChange = async (status: Proposta['status']) => {
    if (!selectedProposta) return;
    if (convertida) {
      toast.error('Proposta já convertida em obra.', 'O status não pode mais ser alterado.');
      return;
    }
    if (status === 'Aprovada') {
      setProposalToApprove(selectedProposta);
      return;
    }
    // Recusa sem motivo registrado é a informação mais cara do ciclo indo
    // embora — preço, prazo, escopo ou concorrente.
    if (status === 'Rejeitada') {
      setShowRejeicaoModal(true);
      return;
    }
    // O estado local vem do efeito que espelha `propostas`; só o resultado real
    // da escrita decide se houve o que anunciar.
    const ok = await onUpdateStatus(selectedProposta.id, status);
    if (ok) toast.success(`Proposta atualizada para "${status}".`);
  };

  const handleConfirmarRejeicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProposta || !motivoRejeicao.trim()) {
      toast.error('Informe o motivo da recusa.');
      return;
    }
    setIsRejeitando(true);
    const ok = await onUpdateStatus(selectedProposta.id, 'Rejeitada', motivoRejeicao.trim());
    setIsRejeitando(false);
    if (!ok) return;
    setShowRejeicaoModal(false);
    setMotivoRejeicao('');
    toast.success('Proposta marcada como rejeitada.', 'O motivo ficou registrado no histórico.');
  };

  const handleDeleteClick = () => {
    if (!selectedProposta) return;
    const target = selectedProposta;
    if (convertida) {
      toast.error(
        'Proposta já convertida em obra.',
        `A obra "${obraDaProposta!.nome}" depende desta proposta e o banco recusa a exclusão.`
      );
      return;
    }
    confirm({
      title: 'Confirmar exclusão de proposta',
      message: `Tem certeza de que deseja remover a proposta ${target.numero}? Esta operação não pode ser desfeita e o histórico de revisões será apagado. Propostas já convertidas em obra não podem ser excluídas.`,
      onConfirm: async () => {
        const ok = await onDeleteProposta(target.id);
        if (!ok) return;
        setSelectedProposta(propostas.find(p => p.id !== target.id) || null);
        toast.success('Proposta removida.');
      }
    });
  };

  return (
    <div id="propostas-tab-container" className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:h-[calc(100vh-120px)]">
      {/* Left Column: Proposals List */}
      <div id="propostas-list-col" className="lg:col-span-1 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">Propostas de Orçamento</h3>
            <button
              id="add-proposta-btn"
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition shadow-sm active:scale-95"
            >
              <Plus size={14} />
              <span>Nova Proposta</span>
            </button>
          </div>

          {/* Filters Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="relative col-span-2">
              <Search className="absolute left-2.5 top-2.5 text-slate-400" size={14} />
              <input
                id="proposta-search-input"
                type="text"
                placeholder="Buscar por descrição, número ou cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs focus:border-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-800"
              />
            </div>
            
            <div>
              <select
                id="proposta-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full border border-slate-200 rounded p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-600 bg-white"
              >
                <option value="Todas">Status: Todos</option>
                <option value="Elaboração">Elaboração</option>
                <option value="Enviada">Enviada</option>
                <option value="Aprovada">Aprovada</option>
                <option value="Rejeitada">Rejeitada</option>
              </select>
            </div>

            <div>
              <select
                id="proposta-validade-filter"
                aria-label="Filtrar por validade"
                value={validadeFilter}
                onChange={(e) => setValidadeFilter(e.target.value as FiltroValidade)}
                className="w-full border border-slate-200 rounded p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-600 bg-white"
              >
                <option value="Todas">Validade: Todas</option>
                <option value="Vigentes">Vigentes</option>
                <option value="A vencer">A vencer ({DIAS_ALERTA_VALIDADE}d)</option>
                <option value="Vencidas">Vencidas</option>
              </select>
            </div>

            <div className="col-span-2">
              <select
                id="proposta-ordenacao"
                aria-label="Ordenar propostas"
                value={ordenacao}
                onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
                className="w-full border border-slate-200 rounded p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-600 bg-white"
              >
                <option value="Recentes">Ordem: Mais recentes</option>
                <option value="Maior valor">Maior valor</option>
                <option value="Menor valor">Menor valor</option>
                <option value="Validade">Validade mais próxima</option>
                <option value="Cliente">Cliente (A–Z)</option>
              </select>
            </div>
          </div>

          {/* Taxa de conversão: o indicador que resume a saúde comercial. */}
          {conversao.taxa !== null && (
            <div className="flex items-center justify-between text-2xs bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
              <span className="font-bold text-slate-400 uppercase tracking-wider">Taxa de conversão</span>
              <span className="text-slate-500">
                <strong className="font-mono text-slate-800 text-2xs">{conversao.taxa.toFixed(0)}%</strong>
                {' '}· {conversao.aprovadas} de {conversao.decididas} decididas
              </span>
            </div>
          )}

          {qtdVencidas > 0 && validadeFilter !== 'Vencidas' && (
            <button
              onClick={() => setValidadeFilter('Vencidas')}
              className="w-full text-left text-2xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1.5 hover:bg-rose-100 transition flex items-center gap-1.5"
            >
              <AlertCircle size={12} className="shrink-0" />
              {qtdVencidas === 1
                ? '1 proposta em aberto passou da validade'
                : `${qtdVencidas} propostas em aberto passaram da validade`}
            </button>
          )}
        </div>

        {/* List scroll */}
        <div
          id="propostas-scroll-area"
          role="listbox"
          aria-label="Propostas"
          className="flex-1 overflow-y-auto divide-y divide-slate-100"
        >
          {loading ? (
            // Sem isto o carregamento exibia "Nenhuma proposta encontrada" com
            // um convite a cadastrar — errado justamente para quem já tem.
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
              <Spinner size={20} />
              <p className="text-xs">Carregando propostas...</p>
            </div>
          ) : filteredPropostas.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={FileText}
                title="Nenhuma proposta encontrada"
                description="Cadastre orçamentos comerciais para as obras de seus clientes."
                actionLabel="Nova Proposta"
                onAction={() => setShowAddModal(true)}
              />
            </div>
          ) : (
            filteredPropostas.map((prop, index) => {
              const isSelected = selectedProposta?.id === prop.id;
              const cliName = getClientName(prop.clienteId);
              const situacaoProp = situacaoValidade(prop);
              const rotuloProp = rotuloValidade(prop);

              return (
                <motion.div
                  key={prop.id}
                  id={`proposta-item-${prop.id}`}
                  // Era um div com onClick: invisível para teclado e para
                  // leitores de tela. Como a lista controla o painel ao lado,
                  // o papel correto é o de opção numa lista de seleção.
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => setSelectedProposta(prop)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedProposta(prop);
                    }
                  }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
                  className={`p-3 cursor-pointer transition text-left space-y-1.5 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                    isSelected ? 'bg-blue-50/40 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {prop.numero}
                    </span>
                    <StatusBadge type="proposta" status={prop.status} />
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 truncate">{prop.descricao}</h4>
                  <p className="text-xs text-slate-500 truncate">Cliente: {cliName}</p>
                  <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
                    {rotuloProp ? (
                      <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${CORES_VALIDADE[situacaoProp]}`}>
                        {rotuloProp}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 font-mono">Validade: {formatarDataBR(prop.dataValidade)}</span>
                    )}
                    <span className="font-mono text-xs font-bold text-slate-950">
                      {prop.valorEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Detailed Context and Features */}
      <div id="proposta-detail-col" className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {selectedProposta ? (
          <div id="proposta-detail-view" className="flex-1 overflow-y-auto p-4 space-y-4 text-left">
            
            {/* Upper Info Row */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div className="text-left">
                <span className="text-xs font-mono bg-blue-50 border border-blue-200 text-blue-800 font-bold px-2 py-0.5 rounded">
                  CÓDIGO: {selectedProposta.numero}
                </span>
                <h3 className="text-base font-bold text-slate-950 mt-1.5 leading-snug">{selectedProposta.descricao}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Cliente Solicitante: <strong className="text-slate-800">{getClientName(selectedProposta.clienteId)}</strong>
                </p>
              </div>

              {/* Status Action Buttons */}
              <div className="flex flex-col gap-1 items-end">
                <div className="flex items-center gap-1.5">
                  <select
                    id="proposta-detail-status-select"
                    value={selectedProposta.status}
                    disabled={convertida}
                    onChange={(e) => handleStatusChange(e.target.value as Proposta['status'])}
                    className="border border-slate-200 rounded p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-700 font-semibold bg-slate-50 hover:bg-slate-100 transition cursor-pointer disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    <option value="Elaboração">Status: Elaboração</option>
                    <option value="Enviada">Status: Enviada</option>
                    <option value="Aprovada">Status: Aprovada</option>
                    <option value="Rejeitada">Status: Rejeitada</option>
                  </select>
                  {/* Valor, BDI, prazo e validade deixaram de ser pedidos no
                      cadastro; é por aqui que eles entram — e é o caminho que
                      faltava para acertar os dados de uma proposta duplicada,
                      que nasce com o escopo da origem e sem validade. */}
                  <button
                    id={`editar-proposta-btn-${selectedProposta.id}`}
                    onClick={() => abrirEdicao()}
                    disabled={bloqueado}
                    aria-label="Editar dados da proposta"
                    className="text-slate-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50 transition active:scale-95 disabled:text-slate-200 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    title={bloqueado ? motivoBloqueio : 'Editar cliente, escopo, valor, BDI, prazo e validade'}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    id={`duplicar-proposta-btn-${selectedProposta.id}`}
                    onClick={handleDuplicarClick}
                    disabled={isDuplicando}
                    aria-label="Duplicar proposta"
                    className="text-slate-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50 transition active:scale-95 disabled:opacity-40"
                    title="Duplicar: cria uma nova proposta em elaboração com o mesmo orçamento"
                  >
                    {isDuplicando ? <Spinner size={16} /> : <Copy size={16} />}
                  </button>
                  {/* Separador antes da ação destrutiva: Excluir ficava
                      encostado em Duplicar, dois ícones cinza de 16px a quatro
                      pixels um do outro, com resultados opostos e irreversíveis. */}
                  <span className="w-px h-5 bg-slate-200 mx-0.5" aria-hidden="true" />
                  <button
                    id={`delete-proposta-btn-${selectedProposta.id}`}
                    onClick={handleDeleteClick}
                    disabled={convertida}
                    aria-label="Excluir proposta"
                    className="text-slate-400 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 transition active:scale-95 disabled:text-slate-200 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    title={convertida ? 'Proposta convertida em obra — não pode ser excluída' : 'Excluir Proposta'}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <span className="text-xs text-slate-400">
                  {convertida ? 'Status travado pela obra vinculada' : 'Clique para alterar status'}
                </span>
              </div>
            </div>

            {/* Quick KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-left space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Investimento Estimado</span>
                <div className="flex items-center gap-1">
                  <DollarSign size={15} className="text-emerald-500" />
                  <span className="font-mono text-xs font-bold text-slate-950">
                    {selectedProposta.valorEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
                {/* Sem isto, um valor zerado parecia defeito. Ele é o estado
                    correto de uma proposta recém-aberta: ou vem do orçamento
                    montado abaixo, ou de um valor digitado na edição. */}
                <span className="text-2xs text-slate-400 leading-tight block">
                  {propostaTemItens
                    ? `Calculado: ${itensDaProposta.length} ${itensDaProposta.length === 1 ? 'item' : 'itens'} + BDI de ${selectedProposta.bdiPercentual}%`
                    : selectedProposta.valorManual > 0
                      ? 'Valor digitado — passa a ser calculado ao montar o orçamento'
                      : 'Monte o orçamento abaixo ou digite um valor em Editar'}
                </span>
              </div>

              {/* Prazo e validade nascem vazios agora. Em vez de exibir um
                  travessão mudo, o campo em branco convida a preenchê-lo — é
                  onde o usuário vai procurar quando perceber que falta. */}
              <button
                type="button"
                onClick={() => abrirEdicao()}
                disabled={bloqueado}
                className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-left space-y-1 transition enabled:hover:border-blue-300 enabled:hover:bg-blue-50/30 disabled:cursor-default outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Prazo de Execução</span>
                <div className="flex items-center gap-1.5">
                  <Clock size={14} className="text-slate-400" />
                  {selectedProposta.prazoExecucaoDias ? (
                    <span className="text-xs font-semibold text-slate-800">
                      {formatarPrazo(selectedProposta.prazoExecucaoDias)}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400 italic">
                      {bloqueado ? 'Não informado' : 'Definir prazo em dias'}
                    </span>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={() => abrirEdicao()}
                disabled={bloqueado}
                className={`p-3 rounded-lg border text-left space-y-1 transition enabled:hover:border-blue-300 disabled:cursor-default outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  situacaoSelecionada === 'vencida'
                    ? 'bg-rose-50/60 border-rose-200'
                    : situacaoSelecionada === 'vence-hoje' || situacaoSelecionada === 'a-vencer'
                      ? 'bg-amber-50/60 border-amber-200'
                      : 'bg-slate-50 border-slate-200'
                }`}
              >
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Data Limite Validade</span>
                <div className="flex items-center gap-1.5">
                  <Calendar size={14} className={situacaoSelecionada === 'vencida' ? 'text-rose-500' : 'text-slate-400'} />
                  {selectedProposta.dataValidade ? (
                    <span className="text-xs font-semibold text-slate-800 font-mono">
                      {formatarDataBR(selectedProposta.dataValidade)}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400 italic">
                      {bloqueado ? 'Não informada' : 'Definir validade'}
                    </span>
                  )}
                  {rotuloSelecionada && (
                    <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${CORES_VALIDADE[situacaoSelecionada]}`}>
                      {rotuloSelecionada}
                    </span>
                  )}
                </div>
              </button>
            </div>

            {/* O que falta antes de enviar.
                Com valor, prazo e validade saindo do cadastro, o risco novo é
                a proposta chegar ao cliente pela metade. Em vez de voltar a
                exigir tudo na criação, a tela passa a dizer o que ainda falta —
                e some sozinha quando não falta mais nada. */}
            {selectedProposta.status === 'Elaboração' && !detalheCarregando && pendencias.length > 0 && (
              <div className="p-3 bg-blue-50/50 border border-blue-200/70 rounded-lg space-y-2 text-left">
                <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wide flex items-center gap-1.5">
                  <AlertCircle size={13} className="text-blue-500" />
                  <span>Antes de enviar ao cliente</span>
                </h4>
                <ul className="space-y-1">
                  {pendencias.map((p) => (
                    <li key={p.chave} className="flex items-center gap-2 text-2xs text-blue-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                      <span className="flex-1">{p.texto}</span>
                      {p.acao && (
                        <button
                          onClick={p.acao}
                          className="text-2xs font-bold text-blue-700 hover:text-blue-900 underline underline-offset-2 shrink-0"
                        >
                          {p.rotuloAcao}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Marcos do ciclo comercial. Antes o status era um rótulo sem
                data e sem porquê: não dava para saber há quanto tempo o
                cliente estava com a proposta nem por que recusou. */}
            {selectedProposta.dataEnvio && selectedProposta.status !== 'Rejeitada' && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <Send size={13} className="text-slate-400 shrink-0" />
                <span>
                  Enviada ao cliente em{' '}
                  <strong className="text-slate-700 font-mono">{formatarDataBR(selectedProposta.dataEnvio)}</strong>
                  {selectedProposta.status === 'Enviada' && diasDesdeEnvio !== null && (
                    <> — {diasDesdeEnvio === 0 ? 'hoje' : `há ${diasDesdeEnvio} ${diasDesdeEnvio === 1 ? 'dia' : 'dias'}`} aguardando resposta.</>
                  )}
                </span>
              </div>
            )}

            {selectedProposta.status === 'Rejeitada' && selectedProposta.motivoRejeicao && (
              <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-lg text-left space-y-0.5">
                <h4 className="text-xs font-bold text-rose-800">Motivo da recusa</h4>
                <p className="text-xs text-rose-700 leading-relaxed italic">
                  "{selectedProposta.motivoRejeicao}"
                </p>
              </div>
            )}

            {/* Vencer não bloqueia nada — prorrogar prazo é rotina comercial.
                Mas seguir para aprovação sem perceber que expirou, não. */}
            {situacaoSelecionada === 'vencida' && (
              <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-lg flex items-start gap-2.5 text-left">
                <AlertCircle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-rose-800">Proposta fora da validade</h4>
                  <p className="text-xs text-rose-700 leading-relaxed">
                    Os preços expiraram em {formatarDataBR(selectedProposta.dataValidade)}. Revise o orçamento e
                    registre uma nova validade antes de reapresentá-la ao cliente — os custos do catálogo podem ter
                    mudado desde então.
                  </p>
                </div>
              </div>
            )}

            {/* Quanto desta proposta é preço firme e quanto é estimativa. Fica
                junto do orçamento porque é aqui que se decide o BDI: mandar
                rápido, sem cotar, é legítimo — decidir a margem no escuro não. */}
            {itensDaProposta.length > 0 && (
              <ConfiancaPreco propostaId={selectedProposta.id} recarregarEm={itensDaProposta} />
            )}

            {/* Orçamento da proposta — itens vindos do catálogo + BDI */}
            <PropostaItens
              proposta={selectedProposta}
              itens={itensDaProposta}
              catalogo={catalogo}
              fornecedores={fornecedores}
              bloqueado={bloqueado}
              carregando={detalheCarregando}
              motivoBloqueio={motivoBloqueio}
              aplicarFiltroCatalogo={aplicarFiltroCatalogo}
              onAddItem={onAddItemProposta}
              onAjustarItem={onAjustarItemProposta}
              onAjustarQuantidade={onAjustarQuantidadeItemProposta}
              onRemoveItem={onRemoveItemProposta}
              onUpdateBdi={onUpdateBdi}
            />

            {/* Já convertida — o caminho acabou aqui; a RPC recusaria uma segunda obra. */}
            {convertida && (
              <div id="proposal-converted-banner" className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3 text-left">
                <div className="flex items-center gap-2.5">
                  <Sparkles size={14} className="text-slate-400 shrink-0" />
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Convertida na obra <strong className="text-slate-900">{obraDaProposta!.nome}</strong>. O orçamento
                    desta proposta ficou congelado como registro do que foi vendido — alterações de escopo passam a ser
                    feitas na obra.
                  </p>
                </div>
                {/* O banner nomeava a obra sem oferecer caminho até ela. */}
                <button
                  onClick={() => onAbrirObra(obraDaProposta!.id)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1.5 rounded transition active:scale-95 flex items-center gap-1 shrink-0"
                >
                  Abrir obra <ArrowRight size={12} />
                </button>
              </div>
            )}

            {/* Conversion Trigger Section */}
            {selectedProposta.status === 'Aprovada' && !convertida && (
              <div id="proposal-conversion-banner" className="p-3 bg-emerald-50/55 border border-emerald-200 rounded-lg flex flex-col md:flex-row justify-between items-center gap-3 text-left">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 uppercase tracking-wide">
                    <Sparkles size={14} className="text-emerald-500" />
                    <span>Pronto para Conversão</span>
                  </h4>
                  <p className="text-xs text-emerald-700 leading-relaxed max-w-lg">
                    Esta proposta foi aprovada pelo cliente. Inicie a obra revisando o orçamento e o cronograma antes de confirmar — os valores partem da proposta, mas você ajusta tudo.
                  </p>
                </div>
                <button
                  id={`convert-proposal-btn-${selectedProposta.id}`}
                  onClick={() => setProposalToConvert(selectedProposta)}
                  className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shrink-0 transition shadow-sm"
                >
                  <span>Iniciar Obra</span>
                </button>
              </div>
            )}

            {/* Print & PDF Automation Drawer */}
            <div className="p-3 bg-slate-900 text-slate-100 rounded-lg flex items-center justify-between text-left shadow-md">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Printer size={14} className="text-blue-400" />
                  <span>Emissão de Proposta Técnica</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  Monta o documento oficial para entrega ao cliente. Na janela de impressão, escolha
                  "Salvar como PDF" para gerar o arquivo.
                </p>
              </div>
              <button
                id="generate-proposal-pdf-btn"
                onClick={() => setShowPdfOverlay(true)}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition shrink-0"
              >
                <FileText size={13} />
                <span>Visualizar proposta</span>
              </button>
            </div>

            {/* Revision History Section */}
            <div className="space-y-3.5 border-t border-slate-200 pt-4 text-left">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <History size={15} className="text-slate-500" />
                  <span>Histórico de Revisões ({selectedProposta.revisoes.length})</span>
                </h4>
                {/* Uma revisão congela o orçamento vigente — o mesmo motivo que
                    trava os itens vale aqui. E enquanto o orçamento não chegou,
                    o modal ofereceria o caminho de valor digitado por engano. */}
                {!bloqueado && !detalheCarregando ? (
                  <button
                    id="add-revision-btn"
                    onClick={() => setShowRevModal(true)}
                    title="Congela o orçamento e os valores atuais como uma nova versão do histórico"
                    className="text-xs text-blue-600 font-bold hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded transition active:scale-95"
                  >
                    + Nova Revisão
                  </button>
                ) : bloqueado ? (
                  // O botão simplesmente sumia. Sem rastro, não dá para saber
                  // se a função não existe ou se está indisponível agora.
                  <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider">
                    Histórico encerrado
                  </span>
                ) : null}
              </div>

              {/* Comparison side-by-side tool */}
              {selectedProposta.revisoes.length >= 2 && (
                <div id="revisoes-comparison-widget" className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-left">
                  <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Comparador de Versões Lado a Lado</span>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-2xs font-bold text-slate-400 uppercase mb-1">Revisão Base (A)</label>
                      <select
                        value={compRevAId}
                        onChange={(e) => setCompRevAId(e.target.value ? parseInt(e.target.value) : '')}
                        className="w-full border border-slate-200 bg-white p-1.5 rounded text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 font-medium text-slate-700 cursor-pointer"
                      >
                        <option value="">Selecione...</option>
                        {selectedProposta.revisoes.map(r => (
                          <option key={r.versao} value={r.versao}>Versão v{r.versao}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-2xs font-bold text-slate-400 uppercase mb-1">Revisão Comparada (B)</label>
                      <select
                        value={compRevBId}
                        onChange={(e) => setCompRevBId(e.target.value ? parseInt(e.target.value) : '')}
                        className="w-full border border-slate-200 bg-white p-1.5 rounded text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 font-medium text-slate-700 cursor-pointer"
                      >
                        <option value="">Selecione...</option>
                        {selectedProposta.revisoes.map(r => (
                          <option key={r.versao} value={r.versao}>Versão v{r.versao}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {(() => {
                    if (compRevAId === '' || compRevBId === '') return null;
                    if (compRevAId === compRevBId) {
                      return <p className="text-2xs text-slate-400 italic">Selecione duas revisões diferentes para ver as diferenças.</p>;
                    }

                    const revA = selectedProposta.revisoes.find(r => r.versao === compRevAId);
                    const revB = selectedProposta.revisoes.find(r => r.versao === compRevBId);

                    if (!revA || !revB) return null;

                    const diff = compararRevisoes(revA, revB);
                    const deltaVal = diff.deltaValor;
                    const deltaPct = diff.deltaPercentual;

                    return (
                      <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5 shadow-xs">
                        <div className="grid grid-cols-2 gap-3 divide-x divide-slate-100">
                          {/* Rev A info */}
                          <div className="space-y-1">
                            <span className="text-2xs font-bold text-slate-400 uppercase block">Versão v{revA.versao}</span>
                            <p className="font-mono text-xs font-bold text-slate-800">
                              {revA.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                            <p className="text-2xs text-slate-500 font-mono">Em: {formatarDataBR(revA.data)}</p>
                            <p className="text-2xs text-slate-600 italic mt-1 leading-relaxed">"{revA.alteracoes}"</p>
                          </div>

                          {/* Rev B info */}
                          <div className="pl-3 space-y-1">
                            <span className="text-2xs font-bold text-slate-400 uppercase block">Versão v{revB.versao}</span>
                            <p className="font-mono text-xs font-bold text-slate-800">
                              {revB.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                            <p className="text-2xs text-slate-500 font-mono">Em: {formatarDataBR(revB.data)}</p>
                            <p className="text-2xs text-slate-600 italic mt-1 leading-relaxed">"{revB.alteracoes}"</p>
                          </div>
                        </div>

                        {/* O que mudou, item a item */}
                        {diff.comparavel && (
                          <div className="border-t border-slate-100 pt-2 space-y-1.5">
                            <div className="flex justify-between items-center">
                              <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider">
                                O que mudou na composição
                              </span>
                              {diff.inalterados > 0 && (
                                <span className="text-2xs text-slate-400">
                                  {diff.inalterados} {diff.inalterados === 1 ? 'item inalterado' : 'itens inalterados'}
                                </span>
                              )}
                            </div>

                            {diff.parcial && (
                              <p className="text-2xs text-amber-700 bg-amber-50 border border-amber-100 rounded p-1.5 leading-relaxed">
                                Uma das versões não tem composição congelada, então a comparação mostra o orçamento
                                inteiro como novidade.
                              </p>
                            )}

                            {diff.linhas.length === 0 ? (
                              <p className="text-2xs text-slate-400 italic">
                                Os itens são idênticos nas duas versões
                                {diff.deltaBdi !== 0 ? ' — a diferença veio só do BDI.' : '.'}
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {diff.linhas.map((linha) => (
                                  <div key={linha.chave} className="flex items-start justify-between gap-2 bg-slate-50/70 rounded px-1.5 py-1">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-2xs font-extrabold uppercase px-1 py-0.5 rounded shrink-0 ${
                                          linha.tipo === 'adicionado' ? 'bg-emerald-100 text-emerald-700'
                                          : linha.tipo === 'removido' ? 'bg-rose-100 text-rose-700'
                                          : 'bg-sky-100 text-sky-700'
                                        }`}>
                                          {ROTULO_MUDANCA[linha.tipo]}
                                        </span>
                                        <span className="text-2xs font-bold text-slate-700 truncate">{linha.descricao}</span>
                                      </div>
                                      {linha.antes && linha.depois && (
                                        <div className="text-2xs text-slate-500 font-mono mt-0.5 pl-1">
                                          {linha.antes.quantidade !== linha.depois.quantidade && (
                                            <span className="mr-2">
                                              {linha.antes.quantidade} → {linha.depois.quantidade} {linha.unidade}
                                            </span>
                                          )}
                                          {linha.antes.precoUnitario !== linha.depois.precoUnitario && (
                                            <span>
                                              {formatBRL(linha.antes.precoUnitario)} → {formatBRL(linha.depois.precoUnitario)}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {!linha.antes && linha.depois && (
                                        <div className="text-2xs text-slate-500 font-mono mt-0.5 pl-1">
                                          {linha.depois.quantidade} {linha.unidade} × {formatBRL(linha.depois.precoUnitario)}
                                        </div>
                                      )}
                                      {linha.antes && !linha.depois && (
                                        <div className="text-2xs text-slate-500 font-mono mt-0.5 pl-1">
                                          {linha.antes.quantidade} {linha.unidade} × {formatBRL(linha.antes.precoUnitario)}
                                        </div>
                                      )}
                                    </div>
                                    <span className={`text-2xs font-mono font-bold shrink-0 ${
                                      linha.deltaTotal > 0 ? 'text-rose-600' : linha.deltaTotal < 0 ? 'text-emerald-600' : 'text-slate-400'
                                    }`}>
                                      {linha.deltaTotal > 0 ? '+' : linha.deltaTotal < 0 ? '−' : ''}
                                      {formatBRL(Math.abs(linha.deltaTotal))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {diff.deltaBdi !== 0 && (
                              <div className="flex justify-between text-2xs px-1.5">
                                <span className="text-slate-600 font-semibold">BDI</span>
                                <span className="font-mono font-bold text-slate-700">
                                  {revA.bdiPercentual}% → {revB.bdiPercentual}%
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Comparativo de diferença */}
                        <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-xs">
                          <span className="font-semibold text-slate-600">Diferença Financeira:</span>
                          <div className="text-right">
                            <span className={`font-mono font-bold ${deltaVal >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {deltaVal >= 0 ? '+' : ''}{deltaVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                            <span className={`text-2xs font-bold font-mono ml-1.5 px-1 rounded ${
                              deltaVal >= 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {deltaVal >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {selectedProposta.revisoes.length === 0 ? (
                <p className="text-xs text-slate-400 italic pl-1">Esta proposta de obra ainda está em sua versão de partida original.</p>
              ) : (
                <div className="space-y-3 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
                  {selectedProposta.revisoes.map((rev, index) => (
                    <div key={index} className="flex gap-3 relative">
                      <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center font-bold text-xs text-slate-500 shrink-0 z-10 shadow-sm">
                        v{rev.versao}
                      </div>
                      <div className="flex-1 bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs space-y-1">
                        <div className="flex justify-between items-center text-slate-500">
                          <span className="font-mono">Revisado em: {formatarDataBR(rev.data)}</span>
                          <span className="font-mono font-bold text-slate-800">
                            {rev.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>
                        <p className="text-slate-600 leading-relaxed italic">
                          " {rev.alteracoes} "
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <FileText size={48} className="stroke-1 mb-2 animate-pulse" />
            <p className="text-xs">Selecione uma proposta para visualizar as opções.</p>
          </div>
        )}
      </div>

      {/* PDF PRINT LAYOUT OVERLAY (MODAL) */}
      <AnimatePresence>
        {showPdfOverlay && selectedProposta && (
          <div id="pdf-print-overlay" role="dialog" aria-modal="true" aria-label="Visualização de impressão da proposta" className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div
              ref={armadilhaPdf}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-lg shadow-2xl w-full max-w-4xl flex flex-col h-[90vh]"
            >
              {/* Header toolbar — some no papel via .no-print */}
              <div className="no-print p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Printer size={18} className="text-blue-600" />
                    <h3 className="font-bold text-slate-800 text-sm">Visualização de Impressão Comercial</h3>
                  </div>

                  {/* Fica aqui, e não no cadastro, porque o efeito é visível no
                      documento ao lado no instante em que se marca. */}
                  {itensDaProposta.length > 0 && selectedProposta.bdiPercentual !== 0 && (
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none border-l border-slate-200 pl-3">
                      <input
                        type="checkbox"
                        checked={selectedProposta.bdiVisivelPdf}
                        onChange={(e) => onUpdateBdiVisivelPdf(selectedProposta.id, e.target.checked)}
                        className="accent-blue-600 cursor-pointer"
                      />
                      <span>
                        Mostrar BDI como linha
                        <span className="block text-2xs text-slate-400 leading-tight">
                          {selectedProposta.bdiVisivelPdf
                            ? 'A margem aparece separada do custo'
                            : 'Embutido nos preços unitários'}
                        </span>
                      </span>
                    </label>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* O cabeçalho não é editável aqui de propósito: ele é o
                      mesmo em todo documento emitido. Sem esta pista o usuário
                      procurava a edição dentro da proposta e não achava. */}
                  <span className="text-2xs text-slate-400 leading-tight max-w-[190px] text-right hidden sm:block">
                    Cabeçalho, logo e condições vêm de <strong className="text-slate-500">Empresa › Dados da Empresa</strong>
                  </span>
                  <button
                    id="print-proposal-action-btn"
                    onClick={() => window.print()}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition active:scale-95"
                  >
                    <Printer size={12} />
                    <span>Imprimir</span>
                  </button>
                  <button
                    id="close-pdf-btn"
                    onClick={() => setShowPdfOverlay(false)}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-3 py-1.5 rounded text-xs transition active:scale-95"
                  >
                    Fechar
                  </button>
                </div>
              </div>

              {/* Document body simulating technical print layout */}
              <div id="pdf-document-body" className="flex-1 p-10 bg-white overflow-y-auto font-sans text-slate-800 print:p-0">
                <div className="max-w-3xl mx-auto space-y-6 text-left">
                  {/* Cabeçalho: tudo vem de empresa_config, editável na aba
                      Empresa. Antes era constante de código — trocar um
                      telefone no papel entregue ao cliente exigia deploy. */}
                  <div className="flex justify-between items-start border-b-2 border-blue-600 pb-4">
                    <div className="flex items-start gap-3 min-w-0">
                      {timbre.logoUrl && (
                        <img
                          src={timbre.logoUrl}
                          alt={`Logotipo de ${timbre.razaoSocial}`}
                          className="h-14 w-auto max-w-[160px] object-contain shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{timbre.razaoSocial}</h1>
                        {(timbre.cnpj || timbre.crea) && (
                          <p className="text-xs text-slate-500 font-mono">
                            {[timbre.cnpj && `CNPJ: ${timbre.cnpj}`, timbre.crea && `CREA: ${timbre.crea}`]
                              .filter(Boolean)
                              .join(' | ')}
                          </p>
                        )}
                        {timbre.endereco && <p className="text-xs text-slate-500">{timbre.endereco}</p>}
                        {(timbre.telefone || timbre.email || timbre.site) && (
                          <p className="text-xs text-slate-500">
                            {[timbre.telefone, timbre.email, timbre.site].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">PROPOSTA DE ORÇAMENTO</h2>
                      <span className="text-xs font-mono font-bold text-blue-600 block">{selectedProposta.numero}</span>
                      <p className="text-xs text-slate-400 mt-1 font-mono">Emissão: {new Date().toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>

                  {/* Client Box */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dados do Cliente Solicitante</h4>
                    <p className="text-xs font-bold text-slate-900">{getClientName(selectedProposta.clienteId)}</p>
                    {getClientObj(selectedProposta.clienteId) && (
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mt-2">
                        <p>CNPJ/CPF: <strong className="text-slate-800 font-mono">{getClientObj(selectedProposta.clienteId)?.cpfCnpj}</strong></p>
                        <p>Contato: <strong className="text-slate-800">{getClientObj(selectedProposta.clienteId)?.responsavel}</strong></p>
                        <p className="col-span-2">Endereço: <strong className="text-slate-800">{getClientObj(selectedProposta.clienteId)?.endereco}</strong></p>
                      </div>
                    )}
                  </div>

                  {/* Scope */}
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider">1. Escopo Técnico e Detalhes</h3>
                    <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                      {selectedProposta.descricao}
                    </p>
                    {timbre.textoEscopo && (
                      <p className="text-xs text-slate-500 leading-relaxed font-light">
                        {timbre.textoEscopo}
                      </p>
                    )}
                  </div>

                  {/* Commercial specs */}
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider">2. Valores e Prazos</h3>

                    {itensDaProposta.length > 0 && totaisDocumento ? (
                      /* A planilha de composição. Antes o documento entregue ao
                         cliente resumia todo o orçamento a uma linha só, mesmo
                         quando a proposta tinha sido montada item a item. */
                      <>
                        <table className="w-full text-xs text-left border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                          <thead className="bg-slate-50 text-slate-800 uppercase font-bold text-xs">
                            <tr>
                              <th className="p-2 border-b border-slate-200 w-8">#</th>
                              <th className="p-2 border-b border-slate-200">Descrição</th>
                              <th className="p-2 border-b border-slate-200 w-14">Un.</th>
                              <th className="p-2 border-b border-slate-200 text-right w-16">Qtd.</th>
                              <th className="p-2 border-b border-slate-200 text-right w-24">Preço unit.</th>
                              <th className="p-2 border-b border-slate-200 text-right w-28">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {totaisDocumento.linhas.map((linha, i) => (
                              <tr key={linha.item.id}>
                                <td className="p-2 font-mono text-slate-400">{i + 1}</td>
                                <td className="p-2 font-medium">{linha.item.descricao}</td>
                                <td className="p-2 font-mono text-slate-500">{linha.item.unidade}</td>
                                <td className="p-2 font-mono text-right">{linha.item.quantidade}</td>
                                <td className="p-2 font-mono text-right">{formatBRL(linha.precoUnitario)}</td>
                                <td className="p-2 font-mono font-bold text-right">{formatBRL(linha.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="quebra-evitar">
                            {/* Com o BDI embutido não há subtotal a mostrar: os
                                preços unitários já são os de venda, e uma linha
                                de "subtotal" igual ao total só confundiria. */}
                            {!totaisDocumento.bdiEmbutido && (
                              <>
                                <tr className="bg-slate-50 border-t border-slate-200">
                                  <td colSpan={5} className="p-2 text-right font-semibold">Subtotal dos serviços</td>
                                  <td className="p-2 font-mono font-bold text-right">{formatBRL(totaisDocumento.subtotal)}</td>
                                </tr>
                                {selectedProposta.bdiPercentual !== 0 && (
                                  <tr className="bg-slate-50">
                                    <td colSpan={5} className="p-2 text-right font-semibold">
                                      BDI ({selectedProposta.bdiPercentual}%)
                                    </td>
                                    <td className="p-2 font-mono font-bold text-right">{formatBRL(totaisDocumento.bdiValor)}</td>
                                  </tr>
                                )}
                              </>
                            )}
                            <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                              <td colSpan={5} className="p-2.5 text-right uppercase">Investimento Global Totalizador</td>
                              <td className="p-2.5 font-mono text-right text-emerald-700">{formatBRL(totaisDocumento.total)}</td>
                            </tr>
                          </tfoot>
                        </table>

                        <div className="grid grid-cols-2 gap-4 pt-2 quebra-evitar">
                          <div className="space-y-1">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Composição por categoria</h4>
                            {totaisDocumento.porCategoria.map(([cat, valor]) => (
                              <div key={cat} className="flex justify-between text-xs border-b border-slate-100 py-0.5">
                                <span className="text-slate-600">{cat}</span>
                                <span className="font-mono font-semibold text-slate-800">{formatBRL(valor)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prazo de execução</h4>
                            <p className="text-xs font-semibold text-slate-800">
                              {formatarPrazoCurto(selectedProposta.prazoExecucaoDias)}
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      /* Proposta ainda sem itens: o valor digitado é tudo o que
                         existe, então o resumo de uma linha continua honesto. */
                      <table className="w-full text-xs text-left border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                        <thead className="bg-slate-50 text-slate-800 uppercase font-bold text-xs">
                          <tr>
                            <th className="p-2.5 border-b border-slate-200">Descrição do Escopo do Serviço</th>
                            <th className="p-2.5 border-b border-slate-200">Prazo Estimado</th>
                            <th className="p-2.5 border-b border-slate-200 text-right">Valor Global</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          <tr>
                            <td className="p-2.5 font-medium">{selectedProposta.descricao}</td>
                            <td className="p-2.5">{formatarPrazoCurto(selectedProposta.prazoExecucaoDias)}</td>
                            <td className="p-2.5 font-mono font-bold text-right">
                              {formatBRL(selectedProposta.valorEstimado)}
                            </td>
                          </tr>
                          <tr className="bg-slate-50 font-bold text-xs">
                            <td colSpan={2} className="p-2.5 text-right uppercase">Investimento Global Totalizador:</td>
                            <td className="p-2.5 font-mono text-right text-emerald-700">
                              {formatBRL(selectedProposta.valorEstimado)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* General clauses */}
                  <div className="space-y-1 text-slate-500 text-xs leading-relaxed quebra-evitar">
                    <h3 className="text-xs font-bold text-slate-800 uppercase">Observações Legais e Condições</h3>
                    {selectedProposta.dataValidade && (
                      <p>• Validade dos preços expressos: <strong>Esta proposta expira impreterivelmente em {formatarDataBR(selectedProposta.dataValidade)}</strong>.</p>
                    )}
                    {timbre.condicoes.map((condicao) => (
                      <p key={condicao}>• {condicao}</p>
                    ))}
                  </div>

                  {/* Signature blocks */}
                  <div className="grid grid-cols-2 gap-10 pt-10 quebra-evitar">
                    <div className="text-center space-y-1.5 border-t border-slate-300 pt-2.5">
                      <p className="text-xs font-bold text-slate-800 uppercase">{timbre.razaoSocial}</p>
                      {timbre.responsavelTecnico && (
                        <p className="text-xs text-slate-500">{timbre.responsavelTecnico}</p>
                      )}
                    </div>
                    <div className="text-center space-y-1.5 border-t border-slate-300 pt-2.5">
                      <p className="text-xs font-bold text-slate-800">CLIENTE SOLICITANTE</p>
                      <p className="text-xs text-slate-500">Assinatura de Aceite e Aprovação</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Proposta Modal Overlay */}
      <Modal
        id="add-proposta-modal"
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Adicionar Nova Proposta"
        size="md"
        bloqueado={isSaving}
      >
              <form onSubmit={handleCreateProposta} className="p-4 space-y-4 text-left">
                <div>
                  <label htmlFor="add-prop-cliente-select" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cliente Solicitante *</label>
                  {clientes.length === 0 ? (
                    // Sem cliente não existe proposta. Antes o combo abria vazio
                    // e o erro só aparecia ao tentar salvar.
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded flex items-start gap-2">
                      <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-2xs text-amber-800 leading-relaxed">
                        Nenhum cliente cadastrado. Cadastre o cliente na aba <strong>Clientes</strong> antes de
                        abrir a proposta.
                      </p>
                    </div>
                  ) : (
                    <select
                      id="add-prop-cliente-select"
                      required
                      disabled={isSaving}
                      value={formClienteId}
                      onChange={(e) => setFormClienteId(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white text-slate-700 disabled:bg-slate-50"
                    >
                      {clientes.map(c => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Descrição Técnico / Escopo da Obra *</label>
                  <textarea
                    id="add-prop-desc"
                    required
                    disabled={isSaving}
                    placeholder="Ex: Execução de drywall acústico, fiação de 220V e pintura geral"
                    value={formDescricao}
                    onChange={(e) => setFormDescricao(e.target.value)}
                    rows={3}
                    className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <p className="text-2xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-2.5 leading-relaxed">
                  Valor, BDI, prazo e validade são definidos depois, quando o orçamento fechar — pelo botão{' '}
                  <strong className="text-slate-700">Editar</strong> no painel da proposta.
                </p>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-add-proposta-btn"
                    type="submit"
                    disabled={isSaving || clientes.length === 0}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <>
                        <Spinner size={14} />
                        <span>Criando...</span>
                      </>
                    ) : (
                      <>
                        <FileText size={14} />
                        <span>Salvar Proposta</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
      </Modal>

      {/* Edição do cabeçalho comercial */}
      <Modal
        id="edit-proposta-modal"
        open={showEditModal && !!selectedProposta}
        onClose={() => setShowEditModal(false)}
        title="Editar proposta"
        description={selectedProposta?.numero}
        size="md"
        bloqueado={isEditando}
      >
        {selectedProposta && (
              <form onSubmit={handleSalvarEdicao} className="p-4 space-y-4 text-left overflow-y-auto">
                <div>
                  <label htmlFor="edit-prop-cliente" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cliente Solicitante *</label>
                  <select
                    id="edit-prop-cliente"
                    required
                    disabled={isEditando}
                    value={editClienteId}
                    onChange={(e) => setEditClienteId(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white text-slate-700 disabled:bg-slate-50"
                  >
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-prop-desc" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Descrição Técnica / Escopo *</label>
                  <textarea
                    id="edit-prop-desc"
                    required
                    disabled={isEditando}
                    value={editDescricao}
                    onChange={(e) => setEditDescricao(e.target.value)}
                    rows={3}
                    className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-prop-valor" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Valor Digitado (R$)</label>
                    <input
                      id="edit-prop-valor"
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={isEditando || propostaTemItens}
                      value={editValor}
                      onChange={(e) => setEditValor(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400 font-mono"
                    />
                    {/* Com itens, quem manda em valor_estimado é o banco. Deixar
                        o campo editável aqui daria a impressão de que o número
                        digitado prevaleceria — e ele seria ignorado. */}
                    <p className="text-2xs text-slate-400 mt-1 leading-tight">
                      {propostaTemItens
                        ? 'Bloqueado: o valor vem do orçamento montado. Remova os itens para voltar a digitá-lo.'
                        : 'Vale enquanto a proposta não tiver itens de orçamento.'}
                    </p>
                  </div>
                  <div>
                    <label htmlFor="edit-prop-bdi" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">BDI (%)</label>
                    <input
                      id="edit-prop-bdi"
                      type="number"
                      step="any"
                      disabled={isEditando}
                      placeholder="Ex: 25"
                      value={editBdi}
                      onChange={(e) => setEditBdi(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 disabled:bg-slate-50 font-mono"
                    />
                    <p className="text-2xs text-slate-400 mt-1 leading-tight">Aplicado sobre a soma dos itens.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-prop-prazo" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Prazo de Execução</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id="edit-prop-prazo"
                        type="number"
                        min="1"
                        step="1"
                        disabled={isEditando}
                        placeholder="Ex: 90"
                        value={editPrazoDias}
                        onChange={(e) => setEditPrazoDias(e.target.value)}
                        className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 disabled:bg-slate-50 font-mono"
                      />
                      <span className="text-xs font-semibold text-slate-500 shrink-0">dias</span>
                    </div>
                    <p className="text-2xs text-slate-400 mt-1 leading-tight">
                      Dias corridos. Deixe vazio enquanto não estiver definido.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="edit-prop-validade" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Validade da Proposta</label>
                    <input
                      id="edit-prop-validade"
                      type="date"
                      disabled={isEditando}
                      value={editValidade}
                      onChange={(e) => setEditValidade(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 disabled:bg-slate-50"
                    />
                    <p className="text-2xs text-slate-400 mt-1 leading-tight">
                      Até quando os preços valem para o cliente.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isEditando}
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-edit-proposta-btn"
                    type="submit"
                    disabled={isEditando}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isEditando ? <><Spinner size={14} /><span>Salvando...</span></> : <span>Salvar alterações</span>}
                  </button>
                </div>
              </form>
        )}
      </Modal>

      {/* Add Revision Modal Overlay */}
      <Modal
        id="add-revision-modal"
        open={showRevModal && !!selectedProposta}
        onClose={() => setShowRevModal(false)}
        title="Registrar nova revisão"
        size="sm"
        bloqueado={isSavingRevision}
      >
        {selectedProposta && (
              <form onSubmit={handleCreateRevision} className="p-4 space-y-4 text-left">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Proposta Alvo</label>
                  <p className="text-xs font-semibold text-slate-900">{selectedProposta.numero} - {selectedProposta.descricao}</p>
                </div>

                {propostaTemItens ? (
                  /* Com orçamento montado, digitar um valor era exatamente o
                     que descolava a revisão dos itens. O total vem do que está
                     na tela e a revisão o congela junto com a composição. */
                  <div className="p-3 bg-blue-50 border border-blue-200/60 rounded-lg space-y-1.5">
                    <p className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                      <History size={13} className="text-blue-600" />
                      <span>Congela o orçamento atual</span>
                    </p>
                    <p className="text-2xs text-blue-800 leading-relaxed">
                      Serão guardados {itensDaProposta.length}{' '}
                      {itensDaProposta.length === 1 ? 'item' : 'itens'} com quantidade e preço, o BDI de{' '}
                      {selectedProposta.bdiPercentual}% e o total de{' '}
                      <strong className="font-mono">{formatBRL(selectedProposta.valorEstimado)}</strong>. Ajuste o
                      orçamento antes, se ainda houver o que mudar.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Novo Valor Proposto (R$) *</label>
                    <input
                      id="add-rev-valor"
                      type="number"
                      step="0.01"
                      required
                      disabled={isSavingRevision}
                      placeholder="Ex: 145000"
                      value={revValor}
                      onChange={(e) => setRevValor(e.target.value)}
                      className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 disabled:bg-slate-50"
                    />
                    <p className="text-2xs text-slate-400 mt-1 leading-tight">
                      Esta proposta não tem itens, então o valor continua sendo digitado.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Descrição das Modificações *</label>
                  <textarea
                    id="add-rev-alteracoes"
                    required
                    disabled={isSavingRevision}
                    placeholder="Ex: Negociamos substituição do revestimento cerâmico e reduzimos mão de obra civil."
                    value={revAlteracoes}
                    onChange={(e) => setRevAlteracoes(e.target.value)}
                    rows={3}
                    className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-800 disabled:bg-slate-50"
                  />
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSavingRevision}
                    onClick={() => setShowRevModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-add-rev-btn"
                    type="submit"
                    disabled={isSavingRevision}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"
                  >
                    {isSavingRevision ? (
                      <>
                        <Spinner size={14} />
                        <span>Reajustando...</span>
                      </>
                    ) : (
                      <>
                        <History size={14} />
                        {/* A versão é atribuída pelo banco sob lock; prometer um
                            número aqui seria chute quando há outra sessão. */}
                        <span>Registrar revisão</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
        )}
      </Modal>

      {/* Motivo da recusa */}
      <Modal
        id="rejeicao-modal"
        open={showRejeicaoModal && !!selectedProposta}
        onClose={() => setShowRejeicaoModal(false)}
        title="Registrar recusa"
        size="sm"
        bloqueado={isRejeitando}
      >
        {selectedProposta && (
              <form onSubmit={handleConfirmarRejeicao} className="p-4 space-y-4 text-left">
                <p className="text-xs text-slate-600 leading-relaxed">
                  A proposta <strong className="font-mono text-slate-900">{selectedProposta.numero}</strong> será
                  marcada como rejeitada. O orçamento fica preservado como histórico.
                </p>
                <div>
                  <label htmlFor="motivo-rejeicao" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Motivo da recusa *
                  </label>
                  <textarea
                    id="motivo-rejeicao"
                    required
                    autoFocus
                    disabled={isRejeitando}
                    rows={3}
                    placeholder="Ex: preço acima do concorrente; prazo de execução incompatível; obra adiada pelo cliente."
                    value={motivoRejeicao}
                    onChange={(e) => setMotivoRejeicao(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-800 disabled:bg-slate-50"
                  />
                  <p className="text-2xs text-slate-400 mt-1 leading-tight">
                    É o dado que explica a taxa de conversão — sem ele, só se sabe que perdeu.
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isRejeitando}
                    onClick={() => setShowRejeicaoModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isRejeitando}
                    className="bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isRejeitando ? <><Spinner size={14} /><span>Registrando...</span></> : <span>Marcar como rejeitada</span>}
                  </button>
                </div>
              </form>
        )}
      </Modal>

      {/* Conversion Proposal Approval Suggestions Modal */}
      <Modal
        id="proposal-conversion-modal"
        open={!!proposalToApprove}
        onClose={() => setProposalToApprove(null)}
        title="Criação Automática de Obra"
        size="md"
      >
        {proposalToApprove && (
            <>
              <div className="p-4 space-y-3 text-left">
                <p className="text-xs text-slate-600 leading-relaxed">
                  A proposta <strong className="font-mono text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">{proposalToApprove.numero}</strong> foi marcada como <strong>Aprovada</strong>! 
                </p>
                <div className="p-3 bg-blue-50 border border-blue-200/50 rounded-lg space-y-1.5">
                  <p className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <FileText size={14} className="text-blue-600" />
                    <span>Deseja inicializar o Projeto/Obra automaticamente?</span>
                  </p>
                  <p className="text-2xs text-blue-800 leading-normal">
                    Abriremos o assistente de início de obra: você revisa o orçamento por categoria e o cronograma de etapas (pré-preenchidos a partir da proposta) antes de confirmar.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  id="btn-close-proposal-conv"
                  type="button"
                  onClick={() => setProposalToApprove(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded transition active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  id="btn-approve-only"
                  type="button"
                  onClick={async () => {
                    const ok = await onUpdateStatus(proposalToApprove.id, 'Aprovada');
                    setProposalToApprove(null);
                    if (ok) toast.success('Proposta aprovada com sucesso.');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-300 rounded transition active:scale-95"
                >
                  Apenas Aprovar
                </button>
                <button
                  id="btn-convert-fully"
                  type="button"
                  onClick={async () => {
                    // Persist the approval before opening the wizard — the RPC
                    // checks the proposta's status server-side at confirm time.
                    // Sem a aprovação gravada o wizard só levaria a uma recusa.
                    const ok = await onUpdateStatus(proposalToApprove.id, 'Aprovada');
                    if (!ok) return;
                    const approved = { ...proposalToApprove, status: 'Aprovada' as const };
                    setProposalToApprove(null);
                    setProposalToConvert(approved);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded transition shadow-sm active:scale-95"
                >
                  Iniciar Obra
                </button>
              </div>
            </>
        )}
      </Modal>

      {/* Conversion wizard — reviews orçamento/cronograma before creating the obra */}
      {proposalToConvert && (
        <ConverterObraWizard
          proposta={proposalToConvert}
          itensProposta={itensProposta.filter(i => i.propostaId === proposalToConvert.id)}
          cliente={clientes.find(c => c.id === proposalToConvert.clienteId)}
          funcionarios={funcionarios.filter(f => f.status === 'Ativo')}
          onCancel={() => setProposalToConvert(null)}
          onConfirm={async (payload) => {
            const newId = await onConvertToProject(proposalToConvert, payload);
            if (newId) setProposalToConvert(null);
            return !!newId;
          }}
        />
      )}
    </div>
  );
}
