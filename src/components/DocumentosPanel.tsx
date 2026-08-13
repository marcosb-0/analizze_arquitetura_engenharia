import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Search,
  Plus,
  FileText,
  Download,
  UploadCloud,
  Trash2,
  FolderOpen,
  LayoutGrid,
  List,
  HardDrive,
  FileImage,
  History,
  CheckCircle2,
  Folder,
  Pencil,
  AlertTriangle,
  X,
  CalendarClock,
} from 'lucide-react';
import {
  CorCategoriaDocumento,
  CORES_CATEGORIA_DOCUMENTO,
  Documento,
  DocumentoCategoria,
  EscopoDocumento,
} from '../types';
import { NovaVersaoInput, formatBytes, TIPOS_ACEITOS } from '../services/documentosRegras';
import { rotuloValidade, situacaoValidade, resumirDocumentos } from '../lib/validadeDocumento';
import { useFeedback } from './FeedbackContext';
import EstadoDaLista from './EstadoDaLista';
import Spinner from './Spinner';
import { ALVO, Button, COLUNA_ANCORADA, CONTROLE_GRUPO, CONTROLE_GRUPO_ITEM, Card, Drawer, Field, IconButton, Input, Modal, PaginaAba, Secao, Select } from './ui';
import { useValidacao } from '../hooks/useValidacao';
import { naoEscolhido, vazio } from '../lib/validacao';
import { formatarDataBR } from '../lib/data';

// Classes fixas por cor da paleta, escritas por extenso (sem interpolação)
// para que o scanner do Tailwind enxergue cada uma delas.
const CATEGORIA_COLOR_CLASSES: Record<string, { badge: string; iconActive: string; iconInactive: string; solid: string; dot: string }> = {
  rose: { badge: 'bg-rose-50 text-rose-700 border-rose-100', iconActive: 'text-rose-600', iconInactive: 'text-rose-400/80', solid: 'text-rose-500', dot: 'bg-rose-500' },
  orange: { badge: 'bg-orange-50 text-orange-700 border-orange-100', iconActive: 'text-orange-600', iconInactive: 'text-orange-400/80', solid: 'text-orange-500', dot: 'bg-orange-500' },
  amber: { badge: 'bg-amber-50 text-amber-700 border-amber-100', iconActive: 'text-amber-600', iconInactive: 'text-amber-400/80', solid: 'text-amber-500', dot: 'bg-amber-500' },
  emerald: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', iconActive: 'text-emerald-600', iconInactive: 'text-emerald-400/80', solid: 'text-emerald-500', dot: 'bg-emerald-500' },
  teal: { badge: 'bg-teal-50 text-teal-700 border-teal-100', iconActive: 'text-teal-600', iconInactive: 'text-teal-400/80', solid: 'text-teal-500', dot: 'bg-teal-500' },
  sky: { badge: 'bg-sky-50 text-sky-700 border-sky-100', iconActive: 'text-sky-600', iconInactive: 'text-sky-400/80', solid: 'text-sky-500', dot: 'bg-sky-500' },
  blue: { badge: 'bg-blue-50 text-blue-700 border-blue-100', iconActive: 'text-blue-600', iconInactive: 'text-blue-400/80', solid: 'text-blue-500', dot: 'bg-blue-500' },
  indigo: { badge: 'bg-indigo-50 text-indigo-700 border-indigo-100', iconActive: 'text-indigo-600', iconInactive: 'text-indigo-400/80', solid: 'text-indigo-500', dot: 'bg-indigo-500' },
  purple: { badge: 'bg-purple-50 text-purple-700 border-purple-100', iconActive: 'text-purple-600', iconInactive: 'text-purple-400/80', solid: 'text-purple-500', dot: 'bg-purple-500' },
  pink: { badge: 'bg-pink-50 text-pink-700 border-pink-100', iconActive: 'text-pink-600', iconInactive: 'text-pink-400/80', solid: 'text-pink-500', dot: 'bg-pink-500' },
  slate: { badge: 'bg-slate-50 text-slate-700 border-slate-200/50', iconActive: 'text-slate-600', iconInactive: 'text-slate-500/80', solid: 'text-slate-500', dot: 'bg-slate-500' },
};
const colorClassesFor = (cor: string) => CATEGORIA_COLOR_CLASSES[cor] ?? CATEGORIA_COLOR_CLASSES.slate;

const CHIP_VALIDADE: Record<string, string> = {
  vencido: 'bg-rose-100 text-rose-700 border-rose-200',
  'a-vencer': 'bg-amber-100 text-amber-800 border-amber-200',
  vigente: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'sem-validade': 'bg-slate-100 text-slate-500 border-slate-200',
};

// Extensões de CAD/BIM entram por nome: o navegador não atribui MIME a .dwg,
// .dxf nem .rvt, então um accept só de MIME escondia esses arquivos do seletor
// justamente na aba em que planta é o documento mais comum.
const ACCEPT_ATTR = [...TIPOS_ACEITOS, '.dwg', '.dxf', '.rvt'].join(',');

function ColorSwatchPicker({ value, onChange }: { value: string; onChange: (cor: CorCategoriaDocumento) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-0.5">
      {CORES_CATEGORIA_DOCUMENTO.map((cor) => (
        <button
          key={cor}
          type="button"
          onClick={() => onChange(cor)}
          title={cor}
          aria-label={`Cor ${cor}`}
          className={`w-5 h-5 rounded-full ${colorClassesFor(cor).dot} transition ${
            value === cor ? 'ring-2 ring-offset-1 ring-slate-900' : 'hover:ring-2 hover:ring-offset-1 hover:ring-slate-300'
          }`}
        />
      ))}
    </div>
  );
}

/** Pré-visualização real do arquivo, via URL assinada de curta duração. */
function PreviewArquivo({
  doc,
  onPreviewUrl,
}: {
  doc: Documento;
  onPreviewUrl: (storagePath: string) => Promise<string | null>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando');
  const storagePath = doc.historicoVersoes?.[0]?.storagePath;

  useEffect(() => {
    let cancelado = false;
    if (!storagePath) {
      setEstado('erro');
      return;
    }
    setEstado('carregando');
    onPreviewUrl(storagePath).then((assinada) => {
      if (cancelado) return;
      setUrl(assinada);
      setEstado(assinada ? 'pronto' : 'erro');
    });
    return () => {
      cancelado = true;
    };
  }, [storagePath]);

  const moldura = 'w-full h-56 rounded border border-slate-200 bg-slate-50 overflow-hidden';

  if (estado === 'carregando') {
    return (
      <div className={`${moldura} flex items-center justify-center`}>
        <Spinner size={18} />
      </div>
    );
  }
  if (estado === 'erro' || !url) {
    return (
      <div className={`${moldura} flex flex-col items-center justify-center gap-2 text-slate-500`}>
        <FileText size={30} className="opacity-40" />
        <span className="text-2xs font-mono">Arquivo indisponível para pré-visualização</span>
      </div>
    );
  }

  const tipo = doc.contentType ?? '';
  if (tipo.startsWith('image/')) {
    return (
      <div className={`${moldura} flex items-center justify-center`}>
        <img src={url} alt={`Pré-visualização de ${doc.nome}`} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  if (tipo === 'application/pdf') {
    return <iframe src={url} title={`Pré-visualização de ${doc.nome}`} className={moldura} />;
  }
  // DOC/XLS e afins: o navegador não renderiza inline, e um visualizador
  // externo mandaria o arquivo para fora do Supabase.
  return (
    <div className={`${moldura} flex flex-col items-center justify-center gap-2 text-slate-500`}>
      <FileText size={30} className="opacity-40" />
      <span className="text-2xs font-mono px-4 text-center">
        {tipo ? 'Formato sem pré-visualização no navegador' : 'Versão anterior ao registro de formato'} — baixe para abrir.
      </span>
    </div>
  );
}

export interface DocumentosPanelProps {
  escopo: EscopoDocumento;
  /** Nulo na empresa; id da obra no console. Define o dono do que for enviado. */
  projetoId: string | null;
  /** Lista completa; o painel filtra pelo próprio escopo. */
  documentos: Documento[];
  loading: boolean;
  categorias: DocumentoCategoria[];
  onAddDocumento: (doc: Pick<Documento, 'nome' | 'tipo' | 'projetoId'>, entrada: NovaVersaoInput) => Promise<boolean>;
  onAddVersion: (documentoId: string, entrada: NovaVersaoInput) => Promise<boolean>;
  onUpdateDocumento: (id: string, patch: { nome?: string; tipo?: string }) => Promise<boolean>;
  onDeleteDocumento: (id: string) => Promise<boolean>;
  onDownloadDocumento: (doc: Documento, storagePath?: string) => void;
  onPreviewUrl: (storagePath: string) => Promise<string | null>;
  onAddCategoria: (nome: string, cor: CorCategoriaDocumento, escopo: EscopoDocumento) => void;
  onUpdateCategoria: (id: string, patch: { nome?: string; cor?: CorCategoriaDocumento }) => void;
  /** Resolve `false` quando o banco recusa (categoria em uso) — ver a nota no hook. */
  onDeleteCategoria: (id: string) => Promise<boolean>;
  /** 'full' = tela inteira (aba Documentos); 'embedded' = dentro do console da obra. */
  variante?: 'full' | 'embedded';
}

/**
 * Chip de validade do documento.
 *
 * Estava declarado DENTRO de `DocumentosPanel`, no corpo do render. Um componente
 * criado durante o render tem identidade nova a cada render, então o React
 * desmonta e remonta a subárvore em vez de atualizá-la — trabalho de DOM jogado
 * fora a cada tecla digitada num filtro, e perda de estado se o componente
 * algum dia passar a ter algum. Apontado por `react-hooks/static-components`.
 *
 * Não dependia de nada do escopo do componente (só de `situacaoValidade`,
 * `rotuloValidade` e `CHIP_VALIDADE`, todos de módulo), então subir é suficiente.
 */
function ChipValidade({ validade, mini }: { validade?: string; mini?: boolean }) {
  const situacao = situacaoValidade(validade);
  if (situacao === 'sem-validade') return null;
  return (
    <span
      className={`inline-flex items-center gap-1 border rounded-full font-bold ${CHIP_VALIDADE[situacao]} ${
        mini ? 'text-2xs px-1.5 py-0.5' : 'text-2xs px-2 py-0.5'
      }`}
    >
      <CalendarClock size={mini ? 9 : 11} />
      {rotuloValidade(validade)}
    </span>
  );
}

function DocumentosPanel({
  escopo,
  projetoId,
  documentos,
  loading,
  categorias,
  onAddDocumento,
  onAddVersion,
  onUpdateDocumento,
  onDeleteDocumento,
  onDownloadDocumento,
  onPreviewUrl,
  onAddCategoria,
  onUpdateCategoria,
  onDeleteCategoria,
  variante = 'full',
}: DocumentosPanelProps) {
  const { toast, confirm } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<'nome' | 'tipo' | 'arquivo'>();
  // Registrar nova versão é outro formulário, aberto ao mesmo tempo que o de
  // envio — dois hooks para os erros de um não aparecerem no outro. Destrinchado
  // e não guardado num objeto: `areaRef` é um ref, e ler `versao.erros` no meio
  // do JSX cai na regra `react-hooks/refs`.
  const {
    erros: errosVersao,
    validar: validarVersao,
    limparErro: limparErroVersao,
    areaRef: areaRefVersao,
  } = useValidacao<'nota' | 'arquivo'>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const embedded = variante === 'embedded';

  const meusDocumentos = useMemo(
    () => documentos.filter((d) => (escopo === 'empresa' ? d.projetoId === null : d.projetoId === projetoId)),
    [documentos, escopo, projetoId]
  );
  const minhasCategorias = useMemo(() => categorias.filter((c) => c.escopo === escopo), [categorias, escopo]);

  const [search, setSearch] = useState('');
  const [pastaSelecionada, setPastaSelecionada] = useState<string>('Todos');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [docAberto, setDocAberto] = useState<Documento | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  const [formNome, setFormNome] = useState('');
  const [formTipo, setFormTipo] = useState('');
  const [formValidade, setFormValidade] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [newVersionNote, setNewVersionNote] = useState('');
  const [newVersionFile, setNewVersionFile] = useState<File | null>(null);
  const [newVersionValidade, setNewVersionValidade] = useState('');
  const [isSavingVersion, setIsSavingVersion] = useState(false);

  const [editandoMetadados, setEditandoMetadados] = useState(false);
  const [editNome, setEditNome] = useState('');
  const [editTipo, setEditTipo] = useState('');

  // No console da obra a lista de pastas é uma faixa de chips; a edição de
  // categoria mora atrás deste toggle, senão as categorias de obra ficariam
  // sem tela nenhuma agora que a aba Documentos é só da empresa.
  const [showGerenciarCategorias, setShowGerenciarCategorias] = useState(false);
  const [showAddCategoria, setShowAddCategoria] = useState(false);
  const [newCategoriaNome, setNewCategoriaNome] = useState('');
  const [newCategoriaCor, setNewCategoriaCor] = useState<CorCategoriaDocumento>('blue');
  const [editingCategoriaId, setEditingCategoriaId] = useState<string | null>(null);
  const [editCategoriaNome, setEditCategoriaNome] = useState('');
  const [editCategoriaCor, setEditCategoriaCor] = useState<CorCategoriaDocumento>('blue');


  // A categoria só é escolhida quando existe uma lista carregada: antes o
  // default era a string 'Contrato' fixada no código, que virava erro de FK
  // assim que a categoria fosse renomeada ou removida.
  useEffect(() => {
    if (!minhasCategorias.some((c) => c.nome === formTipo)) {
      setFormTipo(minhasCategorias[0]?.nome ?? '');
    }
  }, [minhasCategorias, formTipo]);

  // O drawer segue a lista: renomear ou versionar um documento com ele aberto
  // precisa refletir na hora, e um documento excluído tem de fechá-lo.
  useEffect(() => {
    if (!docAberto) return;
    const atualizado = meusDocumentos.find((d) => d.id === docAberto.id);
    if (!atualizado) setDocAberto(null);
    else if (atualizado !== docAberto) setDocAberto(atualizado);
  }, [meusDocumentos, docAberto]);

  const corPorNome = useMemo(() => {
    const mapa: Record<string, string> = {};
    for (const c of categorias) mapa[c.nome] = c.cor;
    return mapa;
  }, [categorias]);
  const corDe = (tipo: string) => corPorNome[tipo] ?? 'slate';

  const docsFiltrados = useMemo(() => {
    const termo = search.trim().toLowerCase();
    return meusDocumentos.filter((doc) => {
      const casaBusca =
        !termo ||
        doc.nome.toLowerCase().includes(termo) ||
        doc.tipo.toLowerCase().includes(termo) ||
        (doc.historicoVersoes ?? []).some((v) => v.descricao.toLowerCase().includes(termo));
      const casaPasta = pastaSelecionada === 'Todos' || doc.tipo === pastaSelecionada;
      return casaBusca && casaPasta;
    });
  }, [meusDocumentos, search, pastaSelecionada]);

  const resumoValidade = useMemo(() => resumirDocumentos(meusDocumentos), [meusDocumentos]);
  const totalBytes = useMemo(() => meusDocumentos.reduce((soma, d) => soma + d.tamanhoBytes, 0), [meusDocumentos]);

  const rotuloEscopo = escopo === 'empresa' ? 'da empresa' : 'da obra';

  // ============================================================
  // Categorias
  // ============================================================
  const handleAddCategoriaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nome = newCategoriaNome.trim();
    if (!nome) return;
    onAddCategoria(nome, newCategoriaCor, escopo);
    setNewCategoriaNome('');
    setNewCategoriaCor('blue');
    setShowAddCategoria(false);
  };

  const startEditCategoria = (categoria: DocumentoCategoria) => {
    setShowAddCategoria(false);
    setEditingCategoriaId(categoria.id);
    setEditCategoriaNome(categoria.nome);
    setEditCategoriaCor(categoria.cor);
  };

  const handleSaveEditCategoria = () => {
    if (!editingCategoriaId) return;
    const nome = editCategoriaNome.trim();
    if (!nome) return;
    const anterior = categorias.find((c) => c.id === editingCategoriaId)?.nome;
    onUpdateCategoria(editingCategoriaId, { nome, cor: editCategoriaCor });
    if (anterior && pastaSelecionada === anterior) setPastaSelecionada(nome);
    setEditingCategoriaId(null);
  };

  const handleDeleteCategoriaClick = (categoria: DocumentoCategoria) => {
    confirm({
      title: 'Remover Categoria',
      message: `Remover a categoria "${categoria.nome}" permanentemente?`,
      onConfirm: async () => {
        const ok = await onDeleteCategoria(categoria.id);
        if (!ok) return;
        if (pastaSelecionada === categoria.nome) setPastaSelecionada('Todos');
        setEditingCategoriaId(null);
        toast.success('Categoria removida.');
      },
    });
  };

  // ============================================================
  // Upload
  // ============================================================
  const processSelectedFile = (file: File) => {
    setSelectedFile(file);
    if (!formNome.trim()) setFormNome(file.name.replace(/\.[^.]+$/, ''));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processSelectedFile(file);
  };

  const abrirUpload = () => {
    setFormNome('');
    setFormValidade('');
    setSelectedFile(null);
    setShowUploadModal(true);
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !validar([
        { campo: 'nome', invalido: vazio(formNome), erro: 'Dê um nome ao documento.' },
        { campo: 'tipo', invalido: naoEscolhido(formTipo), erro: 'Escolha a categoria.' },
        // O arquivo não é um campo de formulário: a área de soltar é um botão
        // sobre um `<input type="file">` escondido. O erro aparece ao lado dela.
        { campo: 'arquivo', invalido: !selectedFile, erro: 'Selecione o arquivo a enviar.' },
      ])
    ) return;
    // O `tsc` não acompanha a validação acima; sem esta linha ele ainda vê
    // `File | null`. O caso já foi barrado e devolvido ao usuário.
    if (!selectedFile) return;

    setIsSaving(true);
    const ok = await onAddDocumento(
      { nome: formNome.trim(), tipo: formTipo, projetoId: escopo === 'empresa' ? null : projetoId },
      { file: selectedFile, descricao: 'Arquivo inicial carregado no sistema.', validade: formValidade || undefined }
    );
    setIsSaving(false);

    // Só fecha e comemora se realmente salvou.
    if (!ok) return;
    setShowUploadModal(false);
    toast.success('Documento registrado.', `${formNome.trim()} foi anexado.`);
    setFormNome('');
    setFormValidade('');
    setSelectedFile(null);
  };

  const handleDownload = (doc: Documento, storagePath?: string) => {
    setDownloadingDocId(doc.id);
    onDownloadDocumento(doc, storagePath);
    setTimeout(() => setDownloadingDocId(null), 600);
  };

  const handleAddVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docAberto) return;
    if (
      !validarVersao([
        { campo: 'nota', invalido: vazio(newVersionNote), erro: 'Descreva o que mudou nesta versão.' },
        { campo: 'arquivo', invalido: !newVersionFile, erro: 'Escolha o arquivo da nova versão.' },
      ])
    ) return;
    if (!newVersionFile) return; // idem: a validação já barrou, o `tsc` não sabe.
    setIsSavingVersion(true);
    const ok = await onAddVersion(docAberto.id, {
      file: newVersionFile,
      descricao: newVersionNote.trim(),
      validade: newVersionValidade || undefined,
    });
    setIsSavingVersion(false);
    if (!ok) return;
    setNewVersionNote('');
    setNewVersionFile(null);
    setNewVersionValidade('');
    toast.success('Nova versão registrada.');
  };

  const startEditMetadados = () => {
    if (!docAberto) return;
    setEditNome(docAberto.nome);
    setEditTipo(docAberto.tipo);
    setEditandoMetadados(true);
  };

  const handleSaveMetadados = async () => {
    if (!docAberto) return;
    const nome = editNome.trim();
    if (!nome) return;
    const ok = await onUpdateDocumento(docAberto.id, { nome, tipo: editTipo });
    if (ok) {
      setEditandoMetadados(false);
      toast.success('Documento atualizado.');
    }
  };

  const confirmarExclusao = (doc: Documento, aoExcluir?: () => void) => {
    confirm({
      title: 'Remover Documento',
      message: `A exclusão de "${doc.nome}" e de todas as suas versões é irreversível. Prosseguir?`,
      onConfirm: async () => {
        const ok = await onDeleteDocumento(doc.id);
        if (ok) {
          aoExcluir?.();
          toast.success('Documento excluído.');
        }
      },
    });
  };

  const iconeDe = (doc: Documento) => {
    const cor = colorClassesFor(corDe(doc.tipo)).solid;
    return doc.contentType?.startsWith('image/') ? (
      <FileImage size={18} className={cor} />
    ) : (
      <FileText size={18} className={cor} />
    );
  };

  // ============================================================
  // Pastas (sidebar na aba, faixa de chips dentro do console)
  // ============================================================
  const renderListaDePastas = (modo: 'chips' | 'pastas') => (
    <>
      <button
        onClick={() => setPastaSelecionada('Todos')}
        className={
          modo === 'chips'
            ? `px-2.5 py-1 rounded-full text-2xs font-bold border transition shrink-0 ${
                pastaSelecionada === 'Todos'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`
            : `w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-lg transition ${
                pastaSelecionada === 'Todos'
                  ? 'bg-blue-50/50 text-blue-600 border-l-2 border-blue-600 rounded-l-none'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`
        }
      >
        {modo === 'chips' ? (
          `Todos (${meusDocumentos.length})`
        ) : (
          <>
            <span className="flex items-center gap-2.5">
              <FolderOpen size={16} className={pastaSelecionada === 'Todos' ? 'text-blue-600' : 'text-slate-500'} />
              <span>Todos os Arquivos</span>
            </span>
            <span
              className={`text-2xs font-bold font-mono px-1.5 py-0.5 rounded-full ${
                pastaSelecionada === 'Todos' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {meusDocumentos.length}
            </span>
          </>
        )}
      </button>

      {minhasCategorias.map((categoria) => {
        const nome = categoria.nome;
        const count = meusDocumentos.filter((d) => d.tipo === nome).length;
        const ativa = pastaSelecionada === nome;
        const editando = editingCategoriaId === categoria.id;

        if (modo === 'chips') {
          return (
            <button
              key={categoria.id}
              onClick={() => setPastaSelecionada(nome)}
              className={`px-2.5 py-1 rounded-full text-2xs font-bold border transition shrink-0 ${
                ativa ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {nome} ({count})
            </button>
          );
        }

        if (editando) {
          return (
            <div key={categoria.id} className="px-2 py-2 space-y-1.5 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-1">
                <Input
                  id={`edit-categoria-nome-input-${categoria.id}`}
                  type="text"
                  autoFocus
                  aria-label="Nome da categoria"
                  value={editCategoriaNome}
                  onChange={(e) => setEditCategoriaNome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEditCategoria();
                    if (e.key === 'Escape') setEditingCategoriaId(null);
                  }} tamanho="sm" className="flex-1 min-w-0"
                />
                <Button
                  type="button"
                  onClick={handleSaveEditCategoria} className="shrink-0"
                  aria-label="Salvar"
                  title="Salvar"
                >
                  <CheckCircle2 size={12} />
                </Button>
                <IconButton rotulo="Cancelar" onClick={() => setEditingCategoriaId(null)}>
                  <X size={12} />
                </IconButton>
              </div>
              <ColorSwatchPicker value={editCategoriaCor} onChange={setEditCategoriaCor} />
            </div>
          );
        }

        return (
          <div key={categoria.id} className="group/folder flex items-center gap-1">
            <button
              onClick={() => setPastaSelecionada(nome)}
              className={`flex-1 min-w-0 flex items-center justify-between px-3 py-2 text-xs font-bold rounded-lg transition ${
                ativa
                  ? 'bg-blue-50/50 text-blue-600 border-l-2 border-blue-600 rounded-l-none'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Folder size={16} className={ativa ? colorClassesFor(categoria.cor).iconActive : colorClassesFor(categoria.cor).iconInactive} />
                <span className="truncate">{nome}</span>
              </span>
              <span
                className={`text-2xs font-bold font-mono px-1.5 py-0.5 rounded-full shrink-0 ${
                  ativa ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {count}
              </span>
            </button>
            <IconButton
              rotulo={`Editar categoria ${nome}`}
              tom="acao"
              onClick={() => startEditCategoria(categoria)}
              className="opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100"
            >
              <Pencil size={12} />
            </IconButton>
            {/*
              A exclusão morava DENTRO do formulário de edição, então só existia
              para quem já tivesse clicado no lápis — na prática, invisível. Aqui
              ela é irmã da edição, no mesmo lugar em que o olho já procura.
              Continua desabilitada com arquivos na pasta: quem barra de fato é a
              FK no banco (23503), este `disabled` só evita o erro depois do
              clique — e a `dica` diz o motivo, que o rótulo curto não cabe.

              O revelar-no-hover é por `opacity`, não por `invisible`:
              `visibility: hidden` tira o botão da ordem de tabulação, e aí o
              teclado nunca chegaria nele para o `focus-visible` acontecer.
            */}
            <IconButton
              rotulo={`Excluir categoria ${nome}`}
              dica={
                count > 0
                  ? `Categoria em uso por ${count} arquivo${count > 1 ? 's' : ''} — mova ou exclua os documentos antes.`
                  : `Excluir categoria ${nome}`
              }
              tom="perigo"
              disabled={count > 0}
              onClick={() => handleDeleteCategoriaClick(categoria)}
              className={`opacity-0 focus-visible:opacity-100 ${
                count > 0 ? 'group-hover/folder:opacity-40' : 'group-hover/folder:opacity-100'
              }`}
            >
              <Trash2 size={12} />
            </IconButton>
          </div>
        );
      })}
    </>
  );

  const alertaValidade = (resumoValidade.vencidos > 0 || resumoValidade.aVencer > 0) && (
    <div
      className={`p-2.5 rounded-lg border flex items-center gap-2 text-xs font-semibold ${
        resumoValidade.vencidos > 0 ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-amber-50 border-amber-200 text-amber-800'
      }`}
    >
      <AlertTriangle size={14} className="shrink-0" />
      <span>
        {resumoValidade.vencidos > 0 &&
          `${resumoValidade.vencidos} ${resumoValidade.vencidos === 1 ? 'documento vencido' : 'documentos vencidos'}`}
        {resumoValidade.vencidos > 0 && resumoValidade.aVencer > 0 && ' e '}
        {resumoValidade.aVencer > 0 && `${resumoValidade.aVencer} a vencer em 30 dias`}
        {escopo === 'empresa'
          ? ' — renove antes de enviar em uma habilitação ou licitação.'
          : ' — regularize antes da próxima fiscalização.'}
      </span>
    </div>
  );

  const barraDeAcoes = (
    <Card className="p-3.5 flex flex-col md:flex-row items-center justify-between gap-3 text-left">
      <div className="relative w-full md:w-80">
        <Search className="absolute left-3 top-2.5 text-slate-500" size={13} />
        <Input
          id={`doc-search-${escopo}`}
          type="search"
          placeholder="Pesquisar por nome, categoria ou revisão..."
          value={search}
          onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-3 font-medium"
        />
      </div>

      <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
        <div className={CONTROLE_GRUPO} role="group" aria-label="Visualização dos arquivos">
          <button
            onClick={() => setViewMode('grid')}
            aria-pressed={viewMode === 'grid'}
            className={`${CONTROLE_GRUPO_ITEM.base} ${ALVO.md} ${viewMode === 'grid' ? CONTROLE_GRUPO_ITEM.ativo : CONTROLE_GRUPO_ITEM.inativo}`}
            aria-label="Visualização em grade"
            title="Visualização em grade"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            className={`${CONTROLE_GRUPO_ITEM.base} ${ALVO.md} ${viewMode === 'list' ? CONTROLE_GRUPO_ITEM.ativo : CONTROLE_GRUPO_ITEM.inativo}`}
            aria-label="Visualização em lista"
            title="Visualização em lista"
          >
            <List size={14} />
          </button>
        </div>

        <Button
          id={`trigger-upload-${escopo}`}
          onClick={abrirUpload}
        >
          <UploadCloud size={14} />
          <span>Novo Documento</span>
        </Button>
      </div>
    </Card>
  );

  const conteudo = (
    <EstadoDaLista
      loading={loading}
      total={docsFiltrados.length}
      totalSemFiltro={meusDocumentos.length}
      carregandoLabel="Carregando documentos..."
      className="py-8"
      vazio={{
        icon: FolderOpen,
        title: 'Nenhum documento anexado',
        description:
          escopo === 'empresa'
            ? 'Guarde aqui contrato social, certidões, alvarás, apólices e atestados técnicos da construtora. Cada documento aceita versões e data de validade.'
            : 'Guarde aqui as plantas, ARTs, licenças e o contrato desta obra. Cada documento aceita versões e data de validade.',
        actionLabel: 'Anexar Arquivo',
        onAction: abrirUpload,
      }}
      semResultado={{
        title: 'Nenhum documento encontrado',
        description:
          pastaSelecionada === 'Todos'
            ? 'Nenhum documento corresponde à busca.'
            : `Nenhum documento em "${pastaSelecionada}" com os filtros atuais.`,
      }}
      onLimparFiltros={() => { setSearch(''); setPastaSelecionada('Todos'); }}
    >
      {viewMode === 'grid' ? (
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-3.5 ${embedded ? '' : 'xl:grid-cols-3'}`}>
        {docsFiltrados.map((doc, index) => (
          <motion.div
            key={doc.id}
            id={`doc-card-${doc.id}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.2) }}
            onClick={() => setDocAberto(doc)}
            className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer transition text-left flex flex-col justify-between group relative min-h-36"
          >
            <div>
              <div className="flex justify-between items-start gap-1">
                <span className={`text-2xs font-extrabold uppercase tracking-wider px-2 py-0.5 border rounded-full ${colorClassesFor(corDe(doc.tipo)).badge}`}>
                  {doc.tipo}
                </span>
                <span className="text-2xs font-bold font-mono text-slate-500 bg-slate-50 border border-slate-100 px-1 rounded">v{doc.versao}</span>
              </div>

              <div className="flex items-start gap-2 mt-2.5">
                <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-blue-50/50 transition shrink-0">{iconeDe(doc)}</div>
                <div className="min-w-0">
                  <h4 className="font-extrabold text-xs text-slate-900 leading-snug group-hover:text-blue-600 truncate" title={doc.nome}>
                    {doc.nome}
                  </h4>
                  <div className="mt-1">
                    <ChipValidade validade={doc.validade} mini />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-between items-center text-2xs text-slate-500">
              <span className="font-medium">
                {formatarDataBR(doc.dataCriacao)} • {formatBytes(doc.tamanhoBytes)}
              </span>
              <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <IconButton
                  rotulo="Baixar versão atual"
                  tamanho="sm"
                  carregando={downloadingDocId === doc.id}
                  id={`doc-download-btn-${doc.id}`}
                  disabled={downloadingDocId === doc.id}
                  onClick={() => handleDownload(doc)}
                >
                  <Download size={12} />
                </IconButton>
                <IconButton
                  rotulo="Excluir"
                  tom="perigo"
                  tamanho="sm"
                  id={`doc-delete-btn-${doc.id}`}
                  onClick={() => confirmarExclusao(doc)}
                >
                  <Trash2 size={12} />
                </IconButton>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    ) : (
      <Card semPadding className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-2xs font-bold text-slate-500 uppercase tracking-widest">
                <th scope="col" className="p-3 pl-4">Documento</th>
                <th scope="col" className="p-3">Categoria</th>
                <th scope="col" className="p-3">Validade</th>
                <th scope="col" className="p-3">Data</th>
                <th scope="col" className="p-3 text-center">Versão</th>
                <th scope="col" className="p-3 text-right">Tamanho</th>
                <th scope="col" className="p-3 text-right pr-4">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {docsFiltrados.map((doc) => (
                <tr key={doc.id} onClick={() => setDocAberto(doc)} className="hover:bg-slate-50/50 cursor-pointer transition group">
                  <td className="p-3 pl-4 font-bold text-slate-800">
                    <div className="flex items-center gap-2.5 min-w-[200px]">
                      <div className="p-1.5 bg-slate-50 rounded group-hover:bg-blue-50/50 transition">{iconeDe(doc)}</div>
                      <span className="truncate group-hover:text-blue-600" title={doc.nome}>
                        {doc.nome}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 font-semibold text-slate-600">{doc.tipo}</td>
                  <td className="p-3">
                    <ChipValidade validade={doc.validade} mini />
                  </td>
                  <td className="p-3 text-slate-500 font-mono text-2xs">{formatarDataBR(doc.dataCriacao)}</td>
                  <td className="p-3 text-center">
                    <span className="font-mono text-2xs font-bold bg-slate-100/70 border border-slate-200/50 px-1.5 rounded text-slate-600">
                      v{doc.versao}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono text-slate-500 text-2xs font-semibold">{formatBytes(doc.tamanhoBytes)}</td>
                  <td className="p-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <IconButton
                        rotulo="Baixar versão atual"
                        carregando={downloadingDocId === doc.id}
                        onClick={() => handleDownload(doc)}
                        disabled={downloadingDocId === doc.id}
                      >
                        <Download size={12} />
                      </IconButton>
                      <IconButton
                        rotulo="Excluir"
                        tom="perigo"
                        onClick={() => confirmarExclusao(doc)}
                      >
                        <Trash2 size={12} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      )}
    </EstadoDaLista>
  );

  // ============================================================
  // Overlays (drawer de detalhe + modal de upload)
  // ============================================================
  const overlays = (
    <>
      <Drawer
        open={!!docAberto}
        onClose={() => setDocAberto(null)}
        title={docAberto?.nome}
        ariaLabel={docAberto ? `Detalhes de ${docAberto.nome}` : undefined}
        description={docAberto?.tipo}
        icon={docAberto ? iconeDe(docAberto) : undefined}
        size="md"
      >
        {docAberto && (
          <>
              <div className="flex-1 overflow-y-auto p-4 space-y-5 text-left">
                <div className="space-y-1">
                  <span className="text-2xs font-extrabold text-slate-500 uppercase tracking-widest">Pré-visualização</span>
                  <PreviewArquivo doc={docAberto} onPreviewUrl={onPreviewUrl} />
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Metadados</span>
                    {!editandoMetadados && (
                      <button
                        type="button"
                        onClick={startEditMetadados}
                        className="text-2xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition"
                      >
                        <Pencil size={10} />
                        <span>Editar</span>
                      </button>
                    )}
                  </div>

                  {editandoMetadados ? (
                    <div className="space-y-2">
                      <Field id="edit-doc-nome" label="Nome">
                        {(props) => (
                          <Input
                            {...props}
                            type="text"
                            autoFocus
                            value={editNome}
                            onChange={(e) => setEditNome(e.target.value)}
                          />
                        )}
                      </Field>
                      <Field id="edit-doc-tipo" label="Categoria">
                        {(props) => (
                          <Select
                            {...props}
                            value={editTipo}
                            onChange={(e) => setEditTipo(e.target.value)} className="font-bold"
                          >
                            {minhasCategorias.map((c) => (
                              <option key={c.id} value={c.nome}>
                                {c.nome}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditandoMetadados(false)}
                          className="px-3 py-1.5 text-2xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition"
                        >
                          Cancelar
                        </button>
                        <Button
                          type="button"
                          onClick={handleSaveMetadados} tamanho="sm"
                        >
                          Salvar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-2xs text-slate-500 font-semibold block">Versão Atual</span>
                        <p className="font-bold text-slate-800 mt-0.5">v{docAberto.versao}</p>
                      </div>
                      <div>
                        <span className="text-2xs text-slate-500 font-semibold block">Validade</span>
                        <div className="mt-0.5">
                          {docAberto.validade ? <ChipValidade validade={docAberto.validade} /> : <p className="font-bold text-slate-800">Não vence</p>}
                        </div>
                      </div>
                      <div>
                        <span className="text-2xs text-slate-500 font-semibold block">Registrado em</span>
                        <p className="font-bold text-slate-800 mt-0.5">{formatarDataBR(docAberto.dataCriacao)}</p>
                      </div>
                      <div>
                        <span className="text-2xs text-slate-500 font-semibold block">Ocupação no bucket</span>
                        <p className="font-bold text-slate-800 mt-0.5">
                          {formatBytes(docAberto.tamanhoBytes)}
                          <span className="font-normal text-slate-500"> ({docAberto.historicoVersoes?.length ?? 1}×)</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center gap-1 text-slate-800 font-extrabold text-xs">
                    <History size={14} className="text-blue-600" />
                    <span>Histórico de Versões</span>
                  </div>

                  <div className="border-l border-slate-200 pl-3.5 space-y-4 relative ml-1.5 mt-2">
                    {(docAberto.historicoVersoes ?? []).map((hist, hIdx) => (
                      <div key={`${hist.versao}-${hist.storagePath}`} className="relative">
                        <span
                          className={`absolute -left-[20px] top-1.5 w-2.5 h-2.5 rounded-full border border-white ${
                            hIdx === 0 ? 'bg-blue-600 shadow-sm shadow-blue-500/30' : 'bg-slate-400'
                          }`}
                        />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-2xs font-bold font-mono px-1 rounded ${
                                hIdx === 0 ? 'bg-blue-50 text-blue-700 font-extrabold' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              v{hist.versao}
                            </span>
                            <span className="text-2xs font-bold text-slate-800">{hist.autor}</span>
                            <span className="text-2xs text-slate-500 font-mono font-semibold">
                              {formatarDataBR(hist.data)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDownload(docAberto, hist.storagePath)}
                              className="text-2xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 transition"
                              title={`Baixar versão ${hist.versao}`}
                            >
                              <Download size={9} />
                              <span>baixar</span>
                            </button>
                          </div>
                          {hist.validade && (
                            <div className="pt-0.5">
                              <ChipValidade validade={hist.validade} mini />
                            </div>
                          )}
                          <p className="text-2xs text-slate-500 leading-relaxed italic">“{hist.descricao}”</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <form
                  ref={areaRefVersao as React.RefObject<HTMLFormElement>}
                  onSubmit={handleAddVersionSubmit}
                  className="p-3 bg-blue-50/40 rounded-xl border border-blue-100/50 space-y-2"
                >
                  <span className="text-2xs font-bold text-blue-800 block uppercase">Registrar nova versão</span>
                  {/* Campos crus: o azul deste bloco é próprio dele, e passá-lo
                      por `className` no primitivo cairia na disputa de
                      utilitários do §M. O `Field` entra pelo rótulo e pelo erro. */}
                  <Field label="O que mudou nesta versão" labelOculto erro={errosVersao.nota} required>
                    {(props) => (
                      <input
                        {...props}
                        type="text"
                        placeholder="O que mudou nesta versão?"
                        value={newVersionNote}
                        onChange={(e) => { setNewVersionNote(e.target.value); limparErroVersao('nota'); }}
                        className="w-full bg-white border border-blue-200/50 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 placeholder-slate-400"
                      />
                    )}
                  </Field>
                  <Field label="Arquivo da nova versão" labelOculto erro={errosVersao.arquivo} required>
                    {(props) => (
                      <input
                        {...props}
                        type="file"
                        accept={ACCEPT_ATTR}
                        onChange={(e) => { setNewVersionFile(e.target.files?.[0] ?? null); limparErroVersao('arquivo'); }}
                        className="w-full bg-white border border-blue-200/50 rounded-lg p-1.5 text-2xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800"
                      />
                    )}
                  </Field>
                  <div className="flex items-center gap-2">
                    <label className="text-2xs font-bold text-blue-800 uppercase shrink-0" htmlFor="nova-versao-validade">
                      Vence em
                    </label>
                    <input
                      id="nova-versao-validade"
                      type="date"
                      value={newVersionValidade}
                      onChange={(e) => setNewVersionValidade(e.target.value)}
                      title="Opcional — preencha se esta emissão tem prazo de validade"
                      className="flex-1 bg-white border border-blue-200/50 rounded-lg p-1.5 text-2xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-700"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isSavingVersion} bloco
                  >
                    {isSavingVersion ? <Spinner size={12} /> : <Plus size={12} />}
                    <span>{isSavingVersion ? 'Enviando...' : 'Registrar Nova Versão'}</span>
                  </Button>
                </form>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
                <Button
                  onClick={() => handleDownload(docAberto)} variante="secundario"
                >
                  <Download size={13} />
                  <span>Baixar Atual</span>
                </Button>
                <button
                  onClick={() => confirmarExclusao(docAberto, () => setDocAberto(null))}
                  className="bg-rose-50 border border-rose-100 hover:bg-rose-100 active:scale-95 text-rose-700 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition shadow-xs"
                >
                  <Trash2 size={13} />
                  <span>Excluir</span>
                </button>
              </div>
          </>
        )}
      </Drawer>

      <Modal
        id={`upload-doc-modal-${escopo}`}
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title={`Novo documento ${rotuloEscopo}`}
        size="md"
        bloqueado={isSaving}
      >
              <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={handleUploadDocument} className="p-4 space-y-4 text-left">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`border border-dashed rounded-xl p-5 text-center space-y-1.5 cursor-pointer transition ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50/50'
                      : erros.arquivo
                        ? 'border-rose-400 bg-rose-50/40'
                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-400'
                  }`}
                >
                  <input ref={fileInputRef} type="file" accept={ACCEPT_ATTR} onChange={handleFileChange} className="hidden" />
                  {selectedFile ? (
                    <>
                      <CheckCircle2 size={26} className="mx-auto text-emerald-600" />
                      <div>
                        <p className="text-xs font-bold text-slate-800 truncate">{selectedFile.name}</p>
                        <p className="text-2xs text-slate-500 font-bold mt-0.5">{formatBytes(selectedFile.size)} — clique para trocar</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={26} className="mx-auto text-slate-500" />
                      <div>
                        <p className="text-xs font-bold text-slate-800">Clique para selecionar ou arraste o arquivo</p>
                        <p className="text-2xs text-slate-500 font-bold mt-0.5">PDF, imagem, DOC/DOCX, XLS/XLSX ou DWG/DXF/RVT — até 50 MB</p>
                      </div>
                    </>
                  )}
                </div>
                {erros.arquivo && (
                  <p role="alert" className="text-2xs text-rose-600 -mt-2">{erros.arquivo}</p>
                )}

                <Field id={`add-doc-nome-${escopo}`} label="Nome do Documento" erro={erros.nome} required>
                  {(props) => (
                    <Input
                      {...props}
                      type="text"
                      disabled={isSaving}
                      placeholder={escopo === 'empresa' ? 'Ex: Certidão Negativa Federal' : 'Ex: Projeto Hidráulico — Pavimento Tipo'}
                      value={formNome}
                      onChange={(e) => { setFormNome(e.target.value); limparErro('nome'); }} className="font-medium"
                    />
                  )}
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field id={`add-doc-tipo-${escopo}`} label="Categoria" erro={erros.tipo} required>
                    {(props) => (
                      <Select
                        {...props}
                        disabled={isSaving || minhasCategorias.length === 0}
                        value={formTipo}
                        onChange={(e) => { setFormTipo(e.target.value); limparErro('tipo'); }} className="font-bold cursor-pointer"
                      >
                        {minhasCategorias.length === 0 && <option value="">Crie uma categoria primeiro</option>}
                        {minhasCategorias.map((c) => (
                          <option key={c.id} value={c.nome}>
                            {c.nome}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field id={`add-doc-validade-${escopo}`} label="Vence em">
                    {(props) => (
                      <Input
                        {...props}
                        type="date"
                        disabled={isSaving}
                        value={formValidade}
                        onChange={(e) => setFormValidade(e.target.value)}
                        title="Opcional — deixe em branco se o documento não vence" className="font-medium"
                      />
                    )}
                  </Field>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setShowUploadModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                  >
                    Cancelar
                  </button>
                  <Button
                    id={`submit-add-doc-${escopo}`}
                    type="submit"
                    disabled={isSaving}
                  >
                    {isSaving ? <Spinner size={14} /> : <UploadCloud size={14} />}
                    <span>{isSaving ? 'Enviando...' : 'Registrar Documento'}</span>
                  </Button>
                </div>
              </form>
      </Modal>
    </>
  );

  const formNovaCategoria = showAddCategoria && (
    <form onSubmit={handleAddCategoriaSubmit} className="px-2 mb-2 space-y-1.5">
      <div className="flex items-center gap-1">
        <Input
          type="text"
          autoFocus
          placeholder="Nome da categoria..."
          aria-label="Nome da nova categoria"
          value={newCategoriaNome}
          onChange={(e) => setNewCategoriaNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowAddCategoria(false);
          }} tamanho="sm" className="flex-1 min-w-0"
        />
        <Button type="submit" className="shrink-0" aria-label="Adicionar" title="Adicionar">
          <CheckCircle2 size={12} />
        </Button>
      </div>
      <ColorSwatchPicker value={newCategoriaCor} onChange={setNewCategoriaCor} />
    </form>
  );

  // ============================================================
  // Dentro do console da obra: sem sidebar e sem card de storage.
  // ============================================================
  if (embedded) {
    return (
      <div className="space-y-3 text-left">
        {alertaValidade}
        {barraDeAcoes}

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-1 min-w-0">{renderListaDePastas('chips')}</div>
          <button
            type="button"
            onClick={() => setShowGerenciarCategorias((v) => !v)}
            aria-expanded={showGerenciarCategorias}
            className={`shrink-0 px-2.5 py-1 rounded-full text-2xs font-bold border transition flex items-center gap-1 ${
              showGerenciarCategorias ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'
            }`}
            title="Criar, renomear ou excluir categorias de documento de obra"
          >
            <Pencil size={10} />
            <span>Categorias</span>
          </button>
        </div>

        {showGerenciarCategorias && (
          <Card className="p-3 max-w-sm">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-2xs font-bold text-slate-500 uppercase tracking-widest">Categorias de obra</span>
              <IconButton
                rotulo="Nova categoria"
                tom="acao"
                onClick={() => setShowAddCategoria((v) => !v)}
              >
                <Plus size={14} />
              </IconButton>
            </div>
            {formNovaCategoria}
            <div className="space-y-0.5">{renderListaDePastas('pastas')}</div>
          </Card>
        )}

        {conteudo}
        {overlays}
      </div>
    );
  }

  return (
    <PaginaAba
      largura="cheia"
      fluxo="livre"
      id="documentos-tab-content"
      /* Era `items-stretch` + `min-h-[calc(100vh-140px)]`. A coluna de pastas
         agora ancora e a grade de arquivos rola com a página. */
      className="text-left flex flex-col lg:flex-row gap-6 items-start"
    >
      <div id="docs-sidebar" className={`w-full lg:w-64 shrink-0 flex flex-col gap-6 ${COLUNA_ANCORADA}`}>
        <Secao icone={<HardDrive size={15} />} titulo="Acervo da Empresa" className="text-left">
          <div className="flex justify-between items-baseline text-xs">
            <span className="font-bold text-slate-800 font-mono">{meusDocumentos.length} documentos</span>
            <span className="text-slate-500 font-semibold text-2xs font-mono">{formatBytes(totalBytes)}</span>
          </div>
          <p className="text-2xs text-slate-500 font-medium leading-tight">
            Documentos da construtora. Os da obra ficam no console de cada obra; os de funcionário, na ficha em Equipe; os do cliente, na ficha em
            Clientes.
          </p>
        </Secao>

        <Secao
          titulo="Pastas"
          className="text-left"
          acoes={
            <IconButton
              rotulo="Nova categoria"
              tom="acao"
              onClick={() => setShowAddCategoria((v) => !v)}
            >
              <Plus size={14} />
            </IconButton>
          }
        >
          {formNovaCategoria}

          <div className="space-y-0.5">{renderListaDePastas('pastas')}</div>
        </Secao>
      </div>

      <div className="flex-1 min-w-0 space-y-4">
        {alertaValidade}
        {barraDeAcoes}
        <div>{conteudo}</div>
      </div>

      {overlays}
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
export default memo(DocumentosPanel);
