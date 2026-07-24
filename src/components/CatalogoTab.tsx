import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Plus,
  Database,
  Briefcase,
  Settings,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Layers,
  Wrench,
  Coins,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  FileCheck2,
  Calendar,
  Pencil,
  AlertTriangle,
  History,
  ArrowUpCircle,
  Info,
} from 'lucide-react';
import {
  InsumoCatalogo,
  Projeto,
  Fornecedor,
  ItemOrcamento,
  CategoriaCusto,
  CotacaoFornecedor,
  PontoHistoricoPreco,
  AjustePreco,
  TipoAjuste,
} from '../types';
import { buildOrcamentoItem } from '../lib/orcamento';
import {
  aplicarAjuste,
  deltaAjuste,
  descreveAjuste,
  ajusteParaPrecoAlvo,
  melhorPreco,
  cotacaoVencida,
  idadeCotacao,
  categoriaCustoDoInsumo,
  formatBRL,
} from '../lib/preco';
import { NovoInsumoProjeto } from '../services/insumosProjetoService';
import { FiltroCatalogo } from '../services/catalogoService';
import { useFeedback } from './FeedbackContext';
import EmptyState from './EmptyState';
import Spinner from './Spinner';

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
    insumoId: string
  ) => Promise<{ historicoPrecos: PontoHistoricoPreco[]; cotacoes: CotacaoFornecedor[] } | null>;
  onAddCatalogoItem: (item: InsumoCatalogo) => Promise<void>;
  onUpdateCatalogoItem: (item: InsumoCatalogo) => Promise<InsumoCatalogo | null>;
  onSetAtivoCatalogoItem: (id: string, ativo: boolean) => Promise<void>;
  onAddOrcamentoItem: (item: ItemOrcamento) => Promise<ItemOrcamento | null>;
  onAddInsumoProjeto: (novo: NovoInsumoProjeto) => Promise<unknown>;
  onAddCotacao: (insumoId: string, quote: CotacaoFornecedor) => Promise<CotacaoFornecedor | null>;
  onDesativarCotacao: (insumoId: string, cotacaoId: string) => Promise<void>;
  onAdotarPrecoCotacao: (insumoId: string, preco: number) => Promise<InsumoCatalogo | null>;
}

const CATEGORIAS: InsumoCatalogo['categoria'][] = ['Material', 'Mão de Obra', 'Equipamento', 'Serviço', 'Taxa'];
const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

const hoje = () => new Date().toISOString().split('T')[0];

/** Estado do formulário de insumo, compartilhado por criar e editar. */
type FormInsumo = {
  descricao: string;
  codigoSINAPI: string;
  unidade: string;
  precoRef: string;
  categoria: InsumoCatalogo['categoria'];
  tipo: InsumoCatalogo['tipo'];
  tipoItem: InsumoCatalogo['tipoItem'];
  precoFonte: InsumoCatalogo['precoFonte'];
  uf: string;
  mesReferencia: string;
  desonerado: boolean;
  fornecedorPadrao: string;
  composicao: string;
  aplicacao: string;
};

const FORM_VAZIO: FormInsumo = {
  descricao: '', codigoSINAPI: '', unidade: 'un', precoRef: '', categoria: 'Material',
  tipo: 'Proprio', tipoItem: 'Insumo', precoFonte: 'Manual', uf: '', mesReferencia: '',
  desonerado: false, fornecedorPadrao: '', composicao: '', aplicacao: '',
};

function formDoInsumo(item: InsumoCatalogo): FormInsumo {
  return {
    descricao: item.descricao,
    codigoSINAPI: item.codigoSINAPI ?? '',
    unidade: item.unidade,
    precoRef: String(item.precoReferencia),
    categoria: item.categoria,
    tipo: item.tipo,
    tipoItem: item.tipoItem,
    precoFonte: item.precoFonte,
    uf: item.uf ?? '',
    mesReferencia: item.mesReferencia ?? '',
    desonerado: item.desonerado ?? false,
    fornecedorPadrao: item.fornecedorPadraoId ?? '',
    composicao: item.composicao ?? '',
    aplicacao: item.aplicacao ?? '',
  };
}

export default function CatalogoTab({
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
  onAddOrcamentoItem,
  onAddInsumoProjeto,
  onAddCotacao,
  onDesativarCotacao,
  onAdotarPrecoCotacao,
}: CatalogoTabProps) {
  const { toast, confirm } = useFeedback();

  // A busca é digitada localmente e só vira consulta depois de uma pausa — o
  // filtro roda no servidor agora, não faz sentido bater a cada tecla.
  const [buscaLocal, setBuscaLocal] = useState(filtro.busca ?? '');
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filtro.busca ?? '') !== buscaLocal) aplicarFiltro({ busca: buscaLocal });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaLocal]);

  // Modais
  const [showFormModal, setShowFormModal] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormInsumo>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const [showBindModal, setShowBindModal] = useState(false);
  const [insumoBind, setInsumoBind] = useState<InsumoCatalogo | null>(null);

  // Drawer de detalhe + o que ele carrega sob demanda
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<{ historicoPrecos: PontoHistoricoPreco[]; cotacoes: CotacaoFornecedor[] } | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const insumoDetalhe = detalheId ? catalogo.find((i) => i.id === detalheId) ?? null : null;

  useEffect(() => {
    if (!detalheId) {
      setDetalhe(null);
      return;
    }
    let cancelado = false;
    setCarregandoDetalhe(true);
    carregarDetalhe(detalheId)
      .then((d) => {
        if (!cancelado) setDetalhe(d);
      })
      .finally(() => {
        if (!cancelado) setCarregandoDetalhe(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalheId]);

  const recarregarDetalhe = async () => {
    if (!detalheId) return;
    setDetalhe(await carregarDetalhe(detalheId));
  };

  // Cotação nova (dentro do drawer)
  const [showCotacaoForm, setShowCotacaoForm] = useState(false);
  const [cotFornecedorId, setCotFornecedorId] = useState('');
  const [cotPreco, setCotPreco] = useState('');
  const [cotPrazo, setCotPrazo] = useState('');
  const [cotValidade, setCotValidade] = useState('30');
  const [cotObs, setCotObs] = useState('');

  const nomeFornecedor = (id?: string) => fornecedores.find((f) => f.id === id)?.empresa ?? 'Não especificado';

  const iconeCategoria = (cat: InsumoCatalogo['categoria']) => {
    switch (cat) {
      case 'Material': return <Layers size={13} />;
      case 'Mão de Obra': return <Wrench size={13} />;
      case 'Equipamento': return <Settings size={13} />;
      case 'Serviço': return <FileCheck2 size={13} />;
      case 'Taxa': return <Coins size={13} />;
    }
  };

  const corCategoria = (cat: InsumoCatalogo['categoria']) => {
    switch (cat) {
      case 'Material': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'Mão de Obra': return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'Equipamento': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Serviço': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'Taxa': return 'bg-rose-50 text-rose-700 border-rose-100';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  // ============================================================
  // Criar / editar insumo
  // ============================================================
  const abrirCriacao = () => {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setShowFormModal(true);
  };

  const abrirEdicao = (item: InsumoCatalogo) => {
    setEditandoId(item.id);
    setForm(formDoInsumo(item));
    setShowFormModal(true);
  };

  const submeterInsumo = async (e: React.FormEvent) => {
    e.preventDefault();
    const preco = parseFloat(form.precoRef);
    if (!form.descricao.trim() || !form.unidade.trim()) {
      toast.error('Preencha descrição e unidade.');
      return;
    }
    if (isNaN(preco) || preco <= 0) {
      toast.error('O preço de referência deve ser maior que zero.');
      return;
    }
    if (form.tipo === 'SINAPI' && !form.codigoSINAPI.trim()) {
      toast.error('Informe o código SINAPI.', 'Sem o código o item não é rastreável na tabela oficial.');
      return;
    }

    setSalvando(true);
    const anterior = editandoId ? catalogo.find((i) => i.id === editandoId) : null;

    const payload: InsumoCatalogo = {
      id: editandoId ?? crypto.randomUUID(),
      codigoSINAPI: form.tipo === 'SINAPI' ? form.codigoSINAPI.trim() : undefined,
      descricao: form.descricao.trim(),
      unidade: form.unidade.trim(),
      precoReferencia: preco,
      categoria: form.categoria,
      tipo: form.tipo,
      tipoItem: form.tipoItem,
      precoFonte: form.precoFonte,
      uf: form.tipo === 'SINAPI' && form.uf ? form.uf : undefined,
      mesReferencia: form.tipo === 'SINAPI' && form.mesReferencia ? form.mesReferencia : undefined,
      desonerado: form.tipo === 'SINAPI' ? form.desonerado : undefined,
      fornecedorPadraoId: form.fornecedorPadrao || undefined,
      composicao: form.composicao || undefined,
      aplicacao: form.aplicacao || undefined,
      ativo: anterior?.ativo ?? true,
      dataAtualizacaoPreco: anterior?.dataAtualizacaoPreco ?? hoje(),
      historicoPrecos: anterior?.historicoPrecos ?? [],
      cotacoesFornecedores: anterior?.cotacoesFornecedores ?? [],
      obrasUtilizando: anterior?.obrasUtilizando ?? 0,
      pontosHistorico: anterior?.pontosHistorico ?? 0,
    };

    if (editandoId) {
      const mudouPreco = anterior && anterior.precoReferencia !== preco;
      const salvo = await onUpdateCatalogoItem(payload);
      if (salvo) {
        toast.success(
          'Insumo atualizado.',
          mudouPreco
            ? `Novo preço registrado no histórico: ${formatBRL(anterior!.precoReferencia)} → ${formatBRL(preco)}.`
            : undefined
        );
        if (mudouPreco && detalheId === editandoId) await recarregarDetalhe();
      }
    } else {
      await onAddCatalogoItem(payload);
      toast.success('Insumo cadastrado no catálogo.', `"${payload.descricao}" já pode ser usado em orçamentos.`);
    }

    setSalvando(false);
    setShowFormModal(false);
  };

  // ============================================================
  // Cotações
  // ============================================================
  const registrarCotacao = async () => {
    if (!insumoDetalhe) return;
    const preco = parseFloat(cotPreco);
    if (!cotFornecedorId || isNaN(preco) || preco <= 0) {
      toast.error('Informe fornecedor e um preço unitário maior que zero.');
      return;
    }
    const validade = parseInt(cotValidade, 10);
    const criada = await onAddCotacao(insumoDetalhe.id, {
      fornecedorId: cotFornecedorId,
      precoUnitario: preco,
      dataCotacao: hoje(),
      prazoEntregaDias: cotPrazo ? parseInt(cotPrazo, 10) : undefined,
      observacao: cotObs || undefined,
      validadeDias: Number.isFinite(validade) && validade > 0 ? validade : 30,
      ativa: true,
    });
    if (criada) {
      await recarregarDetalhe();
      setShowCotacaoForm(false);
      setCotPreco('');
      setCotPrazo('');
      setCotObs('');
      toast.success('Cotação registrada.');
    }
  };

  const desativarCotacao = (cotacao: CotacaoFornecedor) => {
    if (!insumoDetalhe || !cotacao.id) return;
    confirm({
      title: 'Desativar cotação',
      message: `A cotação de ${formatBRL(cotacao.precoUnitario)} de "${nomeFornecedor(cotacao.fornecedorId)}" deixa de concorrer a melhor preço, mas continua no histórico de negociação. Confirmar?`,
      onConfirm: async () => {
        await onDesativarCotacao(insumoDetalhe.id, cotacao.id!);
        await recarregarDetalhe();
        toast.success('Cotação desativada.', 'O registro foi preservado no histórico.');
      },
    });
  };

  const adotarPreco = (cotacao: CotacaoFornecedor) => {
    if (!insumoDetalhe) return;
    confirm({
      title: 'Adotar como preço de referência',
      message: `O preço de referência global de "${insumoDetalhe.descricao}" passa de ${formatBRL(insumoDetalhe.precoReferencia)} para ${formatBRL(cotacao.precoUnitario)}. O ponto entra no histórico com origem "Fornecedor". Confirmar?`,
      onConfirm: async () => {
        const ok = await onAdotarPrecoCotacao(insumoDetalhe.id, cotacao.precoUnitario);
        if (ok) await recarregarDetalhe();
      },
    });
  };

  // ============================================================
  // Vinculação ao orçamento de uma obra (com ajuste de preço)
  // ============================================================
  const [bindProjetoId, setBindProjetoId] = useState('');
  const [bindQuantidade, setBindQuantidade] = useState('1');
  const [bindCategoria, setBindCategoria] = useState<CategoriaCusto>('Materiais');
  const [bindFornecedorId, setBindFornecedorId] = useState('');
  const [bindPrecoBase, setBindPrecoBase] = useState(0);
  const [bindAjusteTipo, setBindAjusteTipo] = useState<TipoAjuste>('Nenhum');
  const [bindAjusteValor, setBindAjusteValor] = useState('0');
  const [bindAjusteMotivo, setBindAjusteMotivo] = useState('');
  const [bindJaContratado, setBindJaContratado] = useState(false);

  const bindAjuste: AjustePreco = useMemo(
    () => ({
      tipo: bindAjusteTipo,
      valor: parseFloat(bindAjusteValor) || 0,
      motivo: bindAjusteMotivo || undefined,
    }),
    [bindAjusteTipo, bindAjusteValor, bindAjusteMotivo]
  );

  const bindPrecoFinal = aplicarAjuste(bindPrecoBase, bindAjuste);
  const bindTotal = (parseFloat(bindQuantidade) || 0) * bindPrecoFinal;

  const abrirBind = (item: InsumoCatalogo) => {
    const melhor = melhorPreco(item);
    setInsumoBind(item);
    setBindProjetoId(projetos[0]?.id ?? '');
    setBindQuantidade('1');
    setBindPrecoBase(melhor.preco);
    setBindFornecedorId(melhor.fornecedorId ?? '');
    setBindAjusteTipo('Nenhum');
    setBindAjusteValor('0');
    setBindAjusteMotivo('');
    setBindJaContratado(false);
    setBindCategoria(categoriaCustoDoInsumo(item.categoria));
    setShowBindModal(true);

    if (melhor.ignoradasPorVencimento > 0) {
      toast.info(
        'Há cotação mais barata vencida.',
        `${melhor.ignoradasPorVencimento} cotação(ões) fora do prazo de validade não entraram na escolha do melhor preço.`
      );
    }
  };

  /** Trocar de fornecedor recarrega a BASE, preservando o ajuste já digitado. */
  const trocarFornecedorBind = (fornecedorId: string) => {
    if (!insumoBind) return;
    setBindFornecedorId(fornecedorId);
    const cotacao = (insumoBind.cotacoesFornecedores ?? []).find((q) => q.fornecedorId === fornecedorId);
    setBindPrecoBase(cotacao ? cotacao.precoUnitario : insumoBind.precoReferencia);
  };

  /** Deixa digitar o preço final desejado e converte no ajuste equivalente. */
  const definirPrecoAlvo = (valor: string) => {
    const alvo = parseFloat(valor);
    if (isNaN(alvo)) return;
    const ajuste = ajusteParaPrecoAlvo(bindPrecoBase, alvo, 'Valor');
    setBindAjusteTipo(ajuste.tipo);
    setBindAjusteValor(String(ajuste.valor));
  };

  const submeterBind = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!insumoBind || !bindProjetoId) return;

    const qtd = parseFloat(bindQuantidade);
    if (isNaN(qtd) || qtd <= 0) {
      toast.error('A quantidade deve ser maior que zero.');
      return;
    }
    if (bindPrecoFinal <= 0) {
      toast.error('O desconto zerou o preço.', 'Reveja o ajuste — o preço final precisa ser maior que zero.');
      return;
    }

    setSalvando(true);

    // O item de orçamento nasce com o total; logo em seguida a linha de
    // insumos_projeto assume o cálculo e a trigger no banco mantém
    // valor_orcado = quantidade × preço ajustado daqui para a frente.
    const item = buildOrcamentoItem({
      projetoId: bindProjetoId,
      categoria: bindCategoria,
      descricao: `${insumoBind.descricao} (${qtd} ${insumoBind.unidade})`,
      valorOrcado: qtd * bindPrecoFinal,
      valorContratado: bindJaContratado ? qtd * bindPrecoFinal : 0,
      fornecedorId: bindFornecedorId || undefined,
      catalogoInsumoId: insumoBind.id,
    });

    const criado = await onAddOrcamentoItem(item);
    if (criado) {
      await onAddInsumoProjeto({
        projetoId: bindProjetoId,
        catalogoInsumoId: insumoBind.id,
        itemOrcamentoId: criado.id,
        quantidade: qtd,
        precoUnitarioBase: bindPrecoBase,
        ajuste: bindAjuste,
        fornecedorId: bindFornecedorId || undefined,
      });

      const obra = projetos.find((p) => p.id === bindProjetoId);
      toast.success(
        'Insumo vinculado ao orçamento.',
        `${formatBRL(qtd * bindPrecoFinal)} em "${obra?.nome}"${
          bindAjuste.tipo !== 'Nenhum' && bindAjuste.valor !== 0
            ? ` — com ${descreveAjuste(bindPrecoBase, bindAjuste)}. O preço de referência do catálogo não mudou.`
            : ''
        }`
      );
    }

    setSalvando(false);
    setShowBindModal(false);
  };

  // ============================================================
  // Gráfico do histórico
  // ============================================================
  const renderHistorico = (historico: PontoHistoricoPreco[]) => {
    if (historico.length < 2) {
      return (
        <div className="h-16 flex items-center justify-center bg-slate-50 border border-slate-100 rounded text-[10px] text-slate-400 font-medium px-3 text-center">
          {historico.length === 1
            ? 'Só há o preço inicial. O próximo ponto entra sozinho quando o preço de referência for editado.'
            : 'Nenhuma variação histórica registrada.'}
        </div>
      );
    }

    const precos = historico.map((h) => h.preco);
    const max = Math.max(...precos);
    const min = Math.min(...precos);
    const diff = max - min === 0 ? 1 : max - min;
    const width = 300;
    const height = 60;

    const pontos = historico.map((h, i) => ({
      x: (i / (historico.length - 1)) * (width - 40) + 20,
      y: height - 10 - ((h.preco - min) / diff) * (height - 20),
      ...h,
    }));

    const pathD = pontos.reduce((acc, p, i) => acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), '');
    const variacao = ((precos[precos.length - 1] - precos[0]) / precos[0]) * 100;

    return (
      <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-100 space-y-1.5 text-left">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
            <History size={11} /> Histórico de preço ({historico.length} pontos)
          </span>
          <span className={`text-[9px] font-mono font-bold ${variacao >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {variacao >= 0 ? '+' : ''}
            {variacao.toFixed(1)}% no período
          </span>
        </div>
        <svg className="w-full h-16 overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {pontos.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="3" fill="#2563eb" />
              <text x={p.x} y={p.y - 6} fill="#1e293b" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                {p.preco.toFixed(0)}
              </text>
              <text x={p.x} y={height - 2} fill="#94a3b8" fontSize="7" textAnchor="middle">
                {new Date(`${p.data}T00:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}
              </text>
            </g>
          ))}
        </svg>
        <div className="flex justify-between text-[9px] text-slate-400 font-mono">
          <span>mín {formatBRL(min)}</span>
          <span>máx {formatBRL(max)}</span>
        </div>
      </div>
    );
  };

  const paginaAtual = filtro.pagina ?? 0;

  return (
    <div id="catalogo-tab-root" className="space-y-5 text-left flex flex-col xl:flex-row items-stretch min-h-[calc(100vh-140px)]">
      {/* SIDEBAR */}
      <div id="catalogo-sidebar" className="w-full xl:w-64 shrink-0 flex flex-col gap-4 self-start">
        <div id="db-stats-card" className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs text-left space-y-3">
          <div className="flex items-center gap-2 text-slate-900 font-extrabold text-xs">
            <Database size={16} className="text-blue-600" />
            <span>Banco de Custos</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center">
            <span className="text-[10px] text-slate-400 font-bold block">Insumos no filtro atual</span>
            <p className="text-lg font-extrabold text-slate-800 font-mono">{total}</p>
          </div>
          <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
            Cada alteração de preço vira um ponto no histórico automaticamente. Cotações nunca são apagadas —
            saem de circulação e continuam disponíveis como registro de negociação.
          </p>
        </div>

        <div id="catalogo-categories-card" className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs text-left">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block px-2 mb-2">Categoria</span>
          <div className="space-y-0.5">
            <button
              onClick={() => aplicarFiltro({ categoria: undefined })}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg transition ${
                !filtro.categoria ? 'bg-blue-50/50 text-blue-600 border-l-2 border-blue-600 rounded-l-none' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Layers size={14} />
              <span>Todas</span>
            </button>
            {CATEGORIAS.map((cat) => (
              <button
                key={cat}
                onClick={() => aplicarFiltro({ categoria: cat })}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg transition ${
                  filtro.categoria === cat ? 'bg-blue-50/50 text-blue-600 border-l-2 border-blue-600 rounded-l-none' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {iconeCategoria(cat)}
                <span>{cat}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div id="catalogo-main-container" className="flex-1 space-y-4">
        <div id="catalogo-action-bar" className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={13} />
            <input
              type="text"
              placeholder="Buscar por descrição, código, aplicação..."
              value={buscaLocal}
              onChange={(e) => setBuscaLocal(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200/70 rounded-lg text-xs outline-none focus:border-blue-600 text-slate-800 font-medium"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
            <select
              value={filtro.tipo ?? ''}
              onChange={(e) => aplicarFiltro({ tipo: (e.target.value || undefined) as InsumoCatalogo['tipo'] | undefined })}
              className="border border-slate-200/70 rounded-lg py-1.5 px-2.5 text-xs outline-none bg-white text-slate-600 font-semibold cursor-pointer"
            >
              <option value="">Todas as origens</option>
              <option value="SINAPI">Tabela SINAPI</option>
              <option value="Proprio">Itens próprios</option>
            </select>

            <select
              value={filtro.ativo === undefined ? 'todos' : filtro.ativo ? 'ativos' : 'inativos'}
              onChange={(e) =>
                aplicarFiltro({ ativo: e.target.value === 'todos' ? undefined : e.target.value === 'ativos' })
              }
              className="border border-slate-200/70 rounded-lg py-1.5 px-2.5 text-xs outline-none bg-white text-slate-600 font-semibold cursor-pointer"
            >
              <option value="ativos">Apenas ativos</option>
              <option value="inativos">Apenas inativos</option>
              <option value="todos">Mostrar todos</option>
            </select>

            <button
              onClick={abrirCriacao}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm active:scale-95"
            >
              <Plus size={14} />
              <span>Novo Insumo</span>
            </button>
          </div>
        </div>

        <div id="catalogo-content-wrapper" className="flex-1">
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-100 p-12 shadow-xs flex justify-center">
              <Spinner size={20} />
            </div>
          ) : catalogo.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 p-8 shadow-xs text-center">
              <EmptyState
                icon={Database}
                title="Nenhum insumo encontrado"
                description="Não há itens correspondentes aos filtros selecionados."
                actionLabel="Cadastrar novo insumo"
                onAction={abrirCriacao}
              />
            </div>
          ) : (
            <>
              <div id="catalogo-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {catalogo.map((item, index) => {
                  const melhor = melhorPreco(item);
                  const economia = item.precoReferencia - melhor.preco;
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.2) }}
                      className={`bg-white p-4 rounded-xl border shadow-xs hover:shadow hover:border-blue-200 transition cursor-pointer flex flex-col justify-between relative ${
                        !item.ativo ? 'opacity-60 bg-slate-50' : 'border-slate-150/70'
                      }`}
                      onClick={() => setDetalheId(item.id)}
                    >
                      <div>
                        <div className="flex justify-between items-start gap-1">
                          <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 border rounded-full flex items-center gap-1 ${corCategoria(item.categoria)}`}>
                            {iconeCategoria(item.categoria)}
                            {item.categoria}
                          </span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${item.tipo === 'SINAPI' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                            {item.tipo === 'SINAPI' ? `SINAPI ${item.codigoSINAPI ?? ''}` : 'PRÓPRIO'}
                          </span>
                        </div>

                        <div className="mt-3">
                          <h4 className="font-extrabold text-xs text-slate-900 leading-snug line-clamp-2" title={item.descricao}>
                            {item.descricao}
                          </h4>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-[10px] text-slate-400 font-bold">
                              Un: <span className="text-slate-600 font-mono font-bold uppercase">{item.unidade}</span>
                            </span>
                            {item.tipo === 'SINAPI' && item.uf && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="text-[10px] text-slate-400 font-bold">
                                  <span className="text-slate-600 font-mono">{item.uf}</span>
                                  {item.mesReferencia ? ` ${item.mesReferencia}` : ''}
                                  {item.desonerado ? ' des.' : ''}
                                </span>
                              </>
                            )}
                            {item.obrasUtilizando > 0 && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="text-[10px] font-bold text-blue-600" title="Obras que já usaram este insumo">
                                  {item.obrasUtilizando} obra{item.obrasUtilizando > 1 ? 's' : ''}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-end" onClick={(e) => e.stopPropagation()}>
                        <div>
                          <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wide">
                            {melhor.origem === 'Cotação' ? 'Melhor cotação' : 'Preço referência'}
                          </span>
                          <span className="text-sm font-extrabold text-slate-900 font-mono">{formatBRL(melhor.preco)}</span>
                          {melhor.origem === 'Cotação' && economia > 0 && (
                            <span className="block text-[9px] text-emerald-600 font-bold">
                              {formatBRL(economia)} abaixo da referência
                            </span>
                          )}
                          {melhor.ignoradasPorVencimento > 0 && (
                            <span className="flex items-center gap-1 text-[9px] text-amber-600 font-bold mt-0.5">
                              <AlertTriangle size={9} /> {melhor.ignoradasPorVencimento} cotação vencida
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => abrirEdicao(item)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                            title="Editar insumo"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => abrirBind(item)}
                            disabled={projetos.length === 0}
                            className="bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed text-blue-700 font-extrabold text-[10px] px-2 py-1 rounded-md transition flex items-center gap-1"
                            title={projetos.length === 0 ? 'Nenhuma obra cadastrada' : 'Vincular ao orçamento de uma obra'}
                          >
                            <Briefcase size={11} />
                            <span>Vincular</span>
                          </button>
                          <button
                            onClick={() => onSetAtivoCatalogoItem(item.id, !item.ativo)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded transition"
                            title={item.ativo ? 'Desativar insumo' : 'Reativar insumo'}
                          >
                            {item.ativo ? <ToggleRight size={18} className="text-blue-600" /> : <ToggleLeft size={18} />}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {paginas > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => aplicarFiltro({ ...filtro, pagina: paginaAtual - 1 })}
                    disabled={paginaAtual === 0}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-50 transition"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs font-bold text-slate-500">
                    Página {paginaAtual + 1} de {paginas}
                  </span>
                  <button
                    onClick={() => aplicarFiltro({ ...filtro, pagina: paginaAtual + 1 })}
                    disabled={paginaAtual >= paginas - 1}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-50 transition"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* DRAWER DE DETALHE */}
      <AnimatePresence>
        {insumoDetalhe && (
          <div id="catalogo-detail-drawer" className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDetalheId(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="relative w-full max-w-md bg-white h-screen shadow-2xl border-l border-slate-100 flex flex-col"
            >
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">{iconeCategoria(insumoDetalhe.categoria)}</div>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-slate-950 text-xs truncate">{insumoDetalhe.descricao}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      {insumoDetalhe.categoria} · {insumoDetalhe.tipoItem === 'Composicao' ? 'Composição' : 'Insumo'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setDetalheId(null)} className="w-7 h-7 rounded-full hover:bg-slate-200/60 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0">
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Metadados</span>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Unidade</span>
                      <p className="font-extrabold text-slate-800 font-mono mt-0.5 uppercase">{insumoDetalhe.unidade}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Preço de referência</span>
                      <p className="font-extrabold text-slate-800 font-mono mt-0.5">{formatBRL(insumoDetalhe.precoReferencia)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Origem do preço</span>
                      <p className="font-bold text-slate-800 mt-0.5">{insumoDetalhe.precoFonte}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Atualizado em</span>
                      <p className="font-bold text-slate-600 mt-0.5 flex items-center gap-1">
                        <Calendar size={11} />
                        {new Date(`${insumoDetalhe.dataAtualizacaoPreco}T00:00:00`).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    {insumoDetalhe.tipo === 'SINAPI' && (
                      <div className="col-span-2">
                        <span className="text-[10px] text-slate-400 font-semibold block">Identidade SINAPI</span>
                        <p className="font-bold text-slate-800 mt-0.5 font-mono text-[11px]">
                          {insumoDetalhe.codigoSINAPI ?? '—'} · {insumoDetalhe.uf ?? 'UF?'} ·{' '}
                          {insumoDetalhe.mesReferencia ?? 'mês?'} ·{' '}
                          {insumoDetalhe.desonerado === undefined ? 'regime?' : insumoDetalhe.desonerado ? 'desonerado' : 'não desonerado'}
                        </p>
                      </div>
                    )}
                    <div className="col-span-2">
                      <span className="text-[10px] text-slate-400 font-semibold block">Uso em obras</span>
                      <p className="font-bold text-slate-800 mt-0.5">
                        {insumoDetalhe.obrasUtilizando === 0
                          ? 'Ainda não usado em nenhum orçamento'
                          : `${insumoDetalhe.obrasUtilizando} obra(s) já orçaram este insumo`}
                      </p>
                    </div>
                  </div>
                </div>

                {insumoDetalhe.composicao && (
                  <div className="space-y-1 bg-blue-50/20 p-3 rounded-lg border border-blue-50">
                    <span className="text-[10px] font-bold text-blue-800 block uppercase tracking-wide">Composição / ficha técnica</span>
                    <p className="text-xs text-slate-600 leading-relaxed italic">"{insumoDetalhe.composicao}"</p>
                  </div>
                )}

                {insumoDetalhe.aplicacao && (
                  <div className="space-y-1 bg-amber-50/20 p-3 rounded-lg border border-amber-50">
                    <span className="text-[10px] font-bold text-amber-800 block uppercase tracking-wide">Aplicações</span>
                    <p className="text-xs text-slate-600 leading-relaxed">{insumoDetalhe.aplicacao}</p>
                  </div>
                )}

                {carregandoDetalhe ? (
                  <div className="flex justify-center py-6">
                    <Spinner size={16} />
                  </div>
                ) : (
                  <>
                    {renderHistorico(detalhe?.historicoPrecos ?? [])}

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-150 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mapa de cotações</span>
                        <button
                          type="button"
                          onClick={() => {
                            setShowCotacaoForm(!showCotacaoForm);
                            setCotFornecedorId(fornecedores[0]?.id ?? '');
                            setCotPreco('');
                            setCotPrazo('');
                            setCotValidade('30');
                            setCotObs('');
                          }}
                          className="text-[10px] text-blue-600 hover:text-blue-700 font-bold"
                        >
                          {showCotacaoForm ? 'Cancelar' : '+ Nova cotação'}
                        </button>
                      </div>

                      {showCotacaoForm && (
                        <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2.5 text-xs">
                          <div className="space-y-1">
                            <label className="text-[9px] font-semibold text-slate-500">Fornecedor</label>
                            <select
                              value={cotFornecedorId}
                              onChange={(e) => setCotFornecedorId(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none"
                            >
                              {fornecedores.map((f) => (
                                <option key={f.id} value={f.id}>{f.empresa}</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <label className="text-[9px] font-semibold text-slate-500">Preço unit. (R$)</label>
                              <input type="number" step="any" min="0.01" value={cotPreco} onChange={(e) => setCotPreco(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none font-mono font-bold" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-semibold text-slate-500">Entrega (dias)</label>
                              <input type="number" min="0" value={cotPrazo} onChange={(e) => setCotPrazo(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-semibold text-slate-500" title="Depois desse prazo a cotação para de concorrer a melhor preço">Validade (dias)</label>
                              <input type="number" min="1" value={cotValidade} onChange={(e) => setCotValidade(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none" />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-semibold text-slate-500">Condição comercial</label>
                            <input type="text" placeholder="Ex: preço especial acima de 100 sacos" value={cotObs} onChange={(e) => setCotObs(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs outline-none" />
                          </div>
                          <button type="button" onClick={registrarCotacao} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 rounded text-xs transition">
                            Salvar cotação
                          </button>
                        </div>
                      )}

                      <div className="p-2.5 bg-white border border-slate-150 rounded-lg flex items-center justify-between text-xs">
                        <div>
                          <span className="text-[8px] text-slate-400 font-bold block uppercase tracking-wider">Referência do catálogo</span>
                          <p className="font-bold text-slate-800">{insumoDetalhe.precoFonte}</p>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-slate-800">{formatBRL(insumoDetalhe.precoReferencia)}</span>
                          <span className="text-[8px] text-slate-400 block">por {insumoDetalhe.unidade}</span>
                        </div>
                      </div>

                      {(detalhe?.cotacoes.length ?? 0) === 0 ? (
                        <div className="p-4 text-center border border-dashed border-slate-200 rounded-lg text-[10px] text-slate-400">
                          Nenhuma cotação registrada para este insumo.
                        </div>
                      ) : (
                        (() => {
                          const cotacoes = detalhe!.cotacoes;
                          const vigentes = cotacoes.filter((c) => c.ativa && !cotacaoVencida(c));
                          const menor = vigentes.length ? Math.min(...vigentes.map((c) => c.precoUnitario)) : null;

                          return cotacoes.map((c) => {
                            const vencida = cotacaoVencida(c);
                            const melhorAtiva = c.ativa && !vencida && c.precoUnitario === menor;
                            return (
                              <div
                                key={c.id}
                                className={`p-2.5 bg-white border rounded-lg text-xs transition ${
                                  !c.ativa ? 'border-slate-150 opacity-50'
                                  : melhorAtiva ? 'border-emerald-200 bg-emerald-50/10'
                                  : vencida ? 'border-amber-200 bg-amber-50/10'
                                  : 'border-slate-150'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 space-y-0.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-extrabold text-slate-800 truncate">{nomeFornecedor(c.fornecedorId)}</span>
                                      {melhorAtiva && (
                                        <span className="bg-emerald-50 text-emerald-700 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full border border-emerald-100 shrink-0">
                                          ★ Menor preço
                                        </span>
                                      )}
                                      {!c.ativa && (
                                        <span className="bg-slate-100 text-slate-500 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0">
                                          Desativada
                                        </span>
                                      )}
                                      {c.ativa && vencida && (
                                        <span className="bg-amber-50 text-amber-700 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full border border-amber-100 shrink-0 flex items-center gap-0.5">
                                          <AlertTriangle size={8} /> Vencida
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[9px] text-slate-400 font-medium space-x-2">
                                      <span>Entrega: {c.prazoEntregaDias !== undefined ? `${c.prazoEntregaDias}d` : 'sob consulta'}</span>
                                      <span>•</span>
                                      <span>
                                        {new Date(`${c.dataCotacao}T00:00:00`).toLocaleDateString('pt-BR')} ({idadeCotacao(c)}d atrás, vale {c.validadeDias}d)
                                      </span>
                                    </div>
                                    {c.observacao && <p className="text-[9px] text-slate-500 italic mt-0.5">"{c.observacao}"</p>}
                                  </div>

                                  <div className="text-right shrink-0">
                                    <span className={`font-mono font-extrabold block ${melhorAtiva ? 'text-emerald-600' : 'text-slate-800'}`}>
                                      {formatBRL(c.precoUnitario)}
                                    </span>
                                    <span className="text-[8px] text-slate-400 block">por {insumoDetalhe.unidade}</span>
                                  </div>
                                </div>

                                {c.ativa && (
                                  <div className="flex items-center justify-end gap-1 mt-1.5 pt-1.5 border-t border-slate-100">
                                    {c.precoUnitario !== insumoDetalhe.precoReferencia && (
                                      <button
                                        type="button"
                                        onClick={() => adotarPreco(c)}
                                        className="text-[9px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-blue-50 transition"
                                        title="Tornar este o preço de referência global (registra no histórico)"
                                      >
                                        <ArrowUpCircle size={10} /> Adotar como referência
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => desativarCotacao(c)}
                                      className="p-1 hover:bg-slate-100 text-slate-400 hover:text-rose-600 rounded transition"
                                      title="Desativar (preserva o registro)"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2.5 shrink-0">
                <button
                  onClick={() => {
                    const alvo = insumoDetalhe;
                    setDetalheId(null);
                    abrirBind(alvo);
                  }}
                  disabled={projetos.length === 0}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 active:scale-95 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
                >
                  <Briefcase size={13} />
                  <span>Vincular a obra</span>
                </button>
                <button
                  onClick={() => {
                    const alvo = insumoDetalhe;
                    setDetalheId(null);
                    abrirEdicao(alvo);
                  }}
                  className="bg-white border border-slate-200 hover:bg-slate-100 active:scale-95 text-slate-600 font-bold px-3 rounded-lg text-xs flex items-center gap-1.5 transition"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() =>
                    confirm({
                      title: insumoDetalhe.ativo ? 'Desativar insumo' : 'Reativar insumo',
                      message: insumoDetalhe.ativo
                        ? `"${insumoDetalhe.descricao}" deixa de aparecer para novos orçamentos, mas continua vinculado aos orçamentos que já o usaram. Insumos não são excluídos — isso destruiria a procedência do histórico.`
                        : `"${insumoDetalhe.descricao}" volta a ficar disponível para orçamentos.`,
                      onConfirm: async () => {
                        await onSetAtivoCatalogoItem(insumoDetalhe.id, !insumoDetalhe.ativo);
                        setDetalheId(null);
                      },
                    })
                  }
                  className="bg-rose-50 border border-rose-100 hover:bg-rose-100 active:scale-95 text-rose-700 font-bold px-3 rounded-lg text-xs flex items-center gap-1.5 transition"
                  title={insumoDetalhe.ativo ? 'Desativar' : 'Reativar'}
                >
                  {insumoDetalhe.ativo ? <ToggleLeft size={13} /> : <ToggleRight size={13} />}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE VINCULAÇÃO COM AJUSTE DE PREÇO */}
      <AnimatePresence>
        {showBindModal && insumoBind && (
          <div id="bind-insumo-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowBindModal(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200 max-h-[92vh]"
            >
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <Briefcase size={16} className="text-blue-600" />
                  <span>Vincular ao orçamento</span>
                </h3>
                <button onClick={() => setShowBindModal(false)} className="w-6 h-6 rounded-full hover:bg-slate-200/60 text-slate-400 font-bold flex items-center justify-center text-xs">✕</button>
              </div>

              <form onSubmit={submeterBind} className="p-4 space-y-4 overflow-y-auto">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Insumo</span>
                  <p className="font-extrabold text-slate-800 mt-1">{insumoBind.descricao}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Referência do catálogo: {formatBRL(insumoBind.precoReferencia)} / {insumoBind.unidade}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Obra de destino</label>
                  <select value={bindProjetoId} onChange={(e) => setBindProjetoId(e.target.value)} required className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 text-slate-800 font-medium">
                    {projetos.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Fornecedor / base de preço</label>
                  <select value={bindFornecedorId} onChange={(e) => trocarFornecedorBind(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 text-slate-800 font-medium">
                    <option value="">Preço de referência: {formatBRL(insumoBind.precoReferencia)} (sem fornecedor)</option>
                    {fornecedores.map((f) => {
                      const q = (insumoBind.cotacoesFornecedores ?? []).find((x) => x.fornecedorId === f.id);
                      return (
                        <option key={f.id} value={f.id}>
                          {f.empresa} {q ? `— cotação ${formatBRL(q.precoUnitario)}${cotacaoVencida(q) ? ' (vencida)' : ''}` : '— sem cotação, usa referência'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Quantidade ({insumoBind.unidade})</label>
                    <input type="number" required min="0.001" step="any" value={bindQuantidade} onChange={(e) => setBindQuantidade(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 font-mono font-bold" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Preço base (R$)</label>
                    <input type="number" value={bindPrecoBase} readOnly className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none text-slate-500 font-mono font-bold cursor-not-allowed" title="Vem do catálogo ou da cotação do fornecedor escolhido" />
                  </div>
                </div>

                {/* AJUSTE DESTE ORÇAMENTO */}
                <div className="bg-blue-50/30 border border-blue-100 rounded-lg p-3 space-y-2.5">
                  <div className="flex items-start gap-1.5">
                    <Info size={12} className="text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-blue-900 font-semibold leading-relaxed">
                      Acréscimo ou desconto <strong>só desta obra</strong>. O preço de referência global do catálogo
                      não é alterado — a base fica registrada para você saber de onde partiu.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Tipo de ajuste</label>
                      <select value={bindAjusteTipo} onChange={(e) => setBindAjusteTipo(e.target.value as TipoAjuste)} className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none font-medium">
                        <option value="Nenhum">Sem ajuste</option>
                        <option value="Percentual">Percentual (%)</option>
                        <option value="Valor">Valor por unidade (R$)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">
                        {bindAjusteTipo === 'Percentual' ? 'Percentual (− desconto)' : 'Valor (− desconto)'}
                      </label>
                      <input
                        type="number"
                        step="any"
                        disabled={bindAjusteTipo === 'Nenhum'}
                        value={bindAjusteValor}
                        onChange={(e) => setBindAjusteValor(e.target.value)}
                        placeholder="Ex: -10"
                        className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none font-mono font-bold disabled:bg-slate-50 disabled:text-slate-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Ou digite o preço final desejado</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder={String(bindPrecoBase)}
                      onBlur={(e) => e.target.value && definirPrecoAlvo(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none font-mono"
                      title="Convertido automaticamente no ajuste equivalente, preservando a base"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Motivo do ajuste</label>
                    <input type="text" value={bindAjusteMotivo} onChange={(e) => setBindAjusteMotivo(e.target.value)} placeholder="Ex: frete incluso, negociação por volume" className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none" />
                  </div>

                  {bindAjusteTipo !== 'Nenhum' && (
                    <div className="flex items-center justify-between bg-white rounded-md p-2 border border-slate-150 text-[11px]">
                      <span className="font-semibold text-slate-500">
                        {formatBRL(bindPrecoBase)} → <strong className="text-slate-900">{formatBRL(bindPrecoFinal)}</strong>
                      </span>
                      <span className={`font-mono font-bold ${deltaAjuste(bindPrecoBase, bindAjuste) >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {descreveAjuste(bindPrecoBase, bindAjuste)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Categoria no orçamento</label>
                  <select value={bindCategoria} onChange={(e) => setBindCategoria(e.target.value as CategoriaCusto)} className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 font-medium">
                    <option value="Materiais">Materiais</option>
                    <option value="Mão de Obra">Mão de Obra</option>
                    <option value="Equipamentos">Equipamentos</option>
                    <option value="Terceiros">Terceiros</option>
                    <option value="Deslocamentos">Deslocamentos</option>
                    <option value="Administração">Administração</option>
                    <option value="Contingências">Contingências</option>
                  </select>
                </div>

                <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 flex justify-between items-center text-xs">
                  <span className="font-bold text-blue-800 uppercase">Total orçado</span>
                  <span className="font-mono font-extrabold text-blue-900 text-sm">{formatBRL(bindTotal)}</span>
                </div>

                <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={bindJaContratado} onChange={(e) => setBindJaContratado(e.target.checked)} className="mt-0.5 rounded border-slate-300 text-blue-600" />
                  <span>
                    Já contratado com este fornecedor
                    <span className="block text-[10px] text-slate-400">Sem marcar, entra apenas como <strong>orçado</strong> (contratado = R$ 0).</span>
                  </span>
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowBindModal(false)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-2 px-4 rounded-lg text-xs transition">
                    Cancelar
                  </button>
                  <button type="submit" disabled={salvando} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-2 px-4 rounded-lg text-xs transition flex items-center gap-1.5">
                    {salvando ? <Spinner size={12} /> : <FileCheck2 size={13} />}
                    <span>Vincular</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE CRIAR / EDITAR INSUMO */}
      <AnimatePresence>
        {showFormModal && (
          <div id="form-insumo-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowFormModal(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-200 max-h-[92vh]"
            >
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  {editandoId ? <Pencil size={16} className="text-blue-600" /> : <PlusCircle size={16} className="text-blue-600" />}
                  <span>{editandoId ? 'Editar insumo' : 'Cadastrar insumo no catálogo'}</span>
                </h3>
                <button onClick={() => setShowFormModal(false)} className="w-6 h-6 rounded-full hover:bg-slate-200/60 text-slate-400 font-bold flex items-center justify-center text-xs">✕</button>
              </div>

              <form onSubmit={submeterInsumo} className="p-4 space-y-3.5 overflow-y-auto">
                {editandoId && (
                  <div className="bg-blue-50/40 border border-blue-100 rounded-lg p-2.5 flex items-start gap-2">
                    <History size={13} className="text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-blue-900 font-semibold leading-relaxed">
                      Mudar o preço de referência acrescenta um ponto ao histórico automaticamente. Os orçamentos já
                      existentes mantêm o preço que foi negociado neles.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Origem</label>
                    <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as InsumoCatalogo['tipo'], precoFonte: e.target.value === 'SINAPI' ? 'SINAPI' : 'Manual' })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 font-medium">
                      <option value="Proprio">Próprio</option>
                      <option value="SINAPI">SINAPI</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Categoria</label>
                    <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as InsumoCatalogo['categoria'] })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 font-medium">
                      {CATEGORIAS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase" title="Insumo simples ou composição de vários insumos">Tipo</label>
                    <select value={form.tipoItem} onChange={(e) => setForm({ ...form, tipoItem: e.target.value as InsumoCatalogo['tipoItem'] })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 font-medium">
                      <option value="Insumo">Insumo</option>
                      <option value="Composicao">Composição</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Descrição *</label>
                  <input type="text" required placeholder="Ex: Cimento CP-II 50kg" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-blue-600 font-medium" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className={`space-y-1 ${form.tipo !== 'SINAPI' && 'opacity-40'}`}>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Cód. SINAPI</label>
                    <input type="text" disabled={form.tipo !== 'SINAPI'} placeholder="462230" value={form.codigoSINAPI} onChange={(e) => setForm({ ...form, codigoSINAPI: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 font-mono font-bold" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Unidade *</label>
                    <input type="text" required placeholder="saco, m², h" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 font-mono" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Preço ref. (R$) *</label>
                    <input type="number" required min="0.01" step="any" value={form.precoRef} onChange={(e) => setForm({ ...form, precoRef: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 font-mono font-bold" />
                  </div>
                </div>

                {form.tipo === 'SINAPI' && (
                  <div className="bg-amber-50/30 border border-amber-100 rounded-lg p-3 space-y-2.5">
                    <div className="flex items-start gap-1.5">
                      <Info size={12} className="text-amber-700 mt-0.5 shrink-0" />
                      <p className="text-[10px] text-amber-900 font-semibold leading-relaxed">
                        Um preço SINAPI só é rastreável com UF, mês de referência e regime de desoneração — a mesma
                        composição custa valores diferentes por estado e é republicada todo mês.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase">UF</label>
                        <select value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })} className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none font-mono">
                          <option value="">—</option>
                          {UFS.map((uf) => (
                            <option key={uf} value={uf}>{uf}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase">Mês ref.</label>
                        <input type="month" value={form.mesReferencia} onChange={(e) => setForm({ ...form, mesReferencia: e.target.value })} className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase">Regime</label>
                        <select value={form.desonerado ? 'sim' : 'nao'} onChange={(e) => setForm({ ...form, desonerado: e.target.value === 'sim' })} className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none font-medium">
                          <option value="nao">Não desonerado</option>
                          <option value="sim">Desonerado</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Fornecedor recomendado</label>
                    <select value={form.fornecedorPadrao} onChange={(e) => setForm({ ...form, fornecedorPadrao: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 font-medium">
                      <option value="">Nenhum</option>
                      {fornecedores.map((f) => (
                        <option key={f.id} value={f.id}>{f.empresa}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase" title="Registrado no histórico junto com o preço">Origem do preço</label>
                    <select value={form.precoFonte} onChange={(e) => setForm({ ...form, precoFonte: e.target.value as InsumoCatalogo['precoFonte'] })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 font-medium">
                      <option value="Manual">Manual</option>
                      <option value="SINAPI">SINAPI</option>
                      <option value="Fornecedor">Fornecedor</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Composição / ficha técnica</label>
                  <textarea rows={2} placeholder="Marca preferencial, aditivos, especificação..." value={form.composicao} onChange={(e) => setForm({ ...form, composicao: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600" />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Aplicações recomendadas</label>
                  <input type="text" placeholder="Ex: assentamento de blocos, contrapiso" value={form.aplicacao} onChange={(e) => setForm({ ...form, aplicacao: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600" />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setShowFormModal(false)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-2 px-4 rounded-lg text-xs transition">
                    Cancelar
                  </button>
                  <button type="submit" disabled={salvando} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-2 px-5 rounded-lg text-xs transition flex items-center gap-1.5">
                    {salvando && <Spinner size={12} />}
                    <span>{editandoId ? 'Salvar alterações' : 'Cadastrar insumo'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
