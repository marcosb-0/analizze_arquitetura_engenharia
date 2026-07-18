import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FolderLock, 
  Search, 
  Plus, 
  FileText, 
  Download, 
  Eye, 
  UploadCloud, 
  Filter, 
  FileCheck2,
  Trash2,
  AlertCircle,
  FolderOpen,
  LayoutGrid,
  List,
  HardDrive,
  FileCode,
  FileSpreadsheet,
  FileImage,
  ChevronRight,
  PlusCircle,
  History,
  CheckCircle2,
  Folder,
  Calendar,
  Layers,
  FileBadge
} from 'lucide-react';
import { Documento, Projeto, TipoDocumento } from '../types';
import { useFeedback } from './FeedbackContext';
import EmptyState from './EmptyState';
import Spinner from './Spinner';

interface DocumentosTabProps {
  documentos: Documento[];
  projetos: Projeto[];
  onAddDocumento: (doc: Documento) => void;
  onDeleteDocumento: (id: string) => void;
}

export default function DocumentosTab({
  documentos,
  projetos,
  onAddDocumento,
  onDeleteDocumento
}: DocumentosTabProps) {
  const { toast, confirm } = useFeedback();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // States
  const [search, setSearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('Todos'); // 'Todos' or specific TipoDocumento
  const [projectFilter, setProjectFilter] = useState<string>('Todos');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Modals & Previews
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedPreviewDoc, setSelectedPreviewDoc] = useState<Documento | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  // New Document Form State
  const [formNome, setFormNome] = useState('');
  const [formTipo, setFormTipo] = useState<TipoDocumento>('Contrato');
  const [formProjetoId, setFormProjetoId] = useState(projetos[0]?.id || '');
  const [formVersao, setFormVersao] = useState('1.0');
  const [formTamanho, setFormTamanho] = useState('1.2 MB');
  const [isDragging, setIsDragging] = useState(false);

  // Mock version histories for some files
  const [mockHistories, setMockHistories] = useState<Record<string, { versao: string; autor: string; data: string; descricao: string }[]>>({
    'doc-1': [
      { versao: '1.0', autor: 'Marcos Barreto', data: '2026-06-15', descricao: 'Envio inicial do contrato assinado' }
    ],
    'doc-2': [
      { versao: '1.1', autor: 'Paula Souza (Arq.)', data: '2026-07-02', descricao: 'Ajuste de cotas nos banheiros' },
      { versao: '1.0', autor: 'Marcos Barreto', data: '2026-06-18', descricao: 'Plantas arquitetônicas iniciais' }
    ],
    'doc-3': [
      { versao: '1.0', autor: 'Eng. Lucas Lima', data: '2026-06-20', descricao: 'Registro de ART de execução' }
    ]
  });

  const [newVersionNote, setNewVersionNote] = useState('');
  const [newVersionFile, setNewVersionFile] = useState<string>('');

  const documentTypes: TipoDocumento[] = [
    'Contrato',
    'Projeto Técnico',
    'ART/RRT',
    'Licença',
    'Foto',
    'Relatório',
    'Nota Fiscal'
  ];

  // Map icons for folders
  const getFolderIcon = (tipo: string, active: boolean) => {
    if (tipo === 'Todos') return <FolderOpen size={16} className={active ? "text-blue-600" : "text-slate-400"} />;
    switch (tipo as TipoDocumento) {
      case 'Contrato':
        return <FolderLock size={16} className={active ? "text-rose-600" : "text-rose-400/80"} />;
      case 'Projeto Técnico':
        return <Folder size={16} className={active ? "text-blue-600" : "text-blue-400/80"} />;
      case 'ART/RRT':
        return <Folder size={16} className={active ? "text-purple-600" : "text-purple-400/80"} />;
      case 'Licença':
        return <Folder size={16} className={active ? "text-emerald-600" : "text-emerald-400/80"} />;
      case 'Foto':
        return <Folder size={16} className={active ? "text-sky-600" : "text-sky-400/80"} />;
      case 'Relatório':
        return <Folder size={16} className={active ? "text-slate-600" : "text-slate-400/80"} />;
      case 'Nota Fiscal':
        return <Folder size={16} className={active ? "text-teal-600" : "text-teal-400/80"} />;
      default:
        return <Folder size={16} className="text-slate-400" />;
    }
  };

  // Helper size converter
  const parseSizeToMB = (sizeStr: string): number => {
    const num = parseFloat(sizeStr);
    if (isNaN(num)) return 0;
    if (sizeStr.toUpperCase().includes('GB')) return num * 1024;
    if (sizeStr.toUpperCase().includes('KB')) return num / 1024;
    return num; // MB
  };

  // Calculate stats
  const totalFilesCount = documentos.length;
  const totalStorageMB = documentos.reduce((sum, doc) => sum + parseSizeToMB(doc.tamanho), 0);
  const storageLimitMB = 100; // Free plan limit 100MB
  const storagePercent = Math.min((totalStorageMB / storageLimitMB) * 100, 100);

  // Filters
  const filteredDocs = documentos.filter(doc => {
    const matchesSearch = doc.nome.toLowerCase().includes(search.toLowerCase());
    const matchesProj = projectFilter === 'Todos' || doc.projetoId === projectFilter;
    const matchesFolder = selectedFolder === 'Todos' || doc.tipo === selectedFolder;
    return matchesSearch && matchesProj && matchesFolder;
  });

  const getProjectName = (projId: string) => {
    return projetos.find(p => p.id === projId)?.nome || 'Sem obra vinculada';
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      processSelectedFile(file);
    }
  };

  const processSelectedFile = (file: File) => {
    setFormNome(file.name);
    
    // Format size
    const sizeInMB = file.size / (1024 * 1024);
    if (sizeInMB < 0.1) {
      setFormTamanho(`${(file.size / 1024).toFixed(0)} KB`);
    } else {
      setFormTamanho(`${sizeInMB.toFixed(1)} MB`);
    }

    // Auto-detect category
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext) {
      if (['pdf', 'doc', 'docx'].includes(ext)) {
        if (file.name.toLowerCase().includes('contrato')) {
          setFormTipo('Contrato');
        } else if (file.name.toLowerCase().includes('art') || file.name.toLowerCase().includes('rrt')) {
          setFormTipo('ART/RRT');
        } else if (file.name.toLowerCase().includes('licenca') || file.name.toLowerCase().includes('alvara')) {
          setFormTipo('Licença');
        } else if (file.name.toLowerCase().includes('relatorio')) {
          setFormTipo('Relatório');
        } else {
          setFormTipo('Contrato');
        }
      } else if (['dwg', 'dxf', 'rvt', 'pdf'].includes(ext) && (file.name.toLowerCase().includes('projeto') || file.name.toLowerCase().includes('planta') || file.name.toLowerCase().includes('corte'))) {
        setFormTipo('Projeto Técnico');
      } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        setFormTipo('Foto');
      } else if (['xml', 'csv', 'xlsx', 'xls', 'pdf'].includes(ext) && (file.name.toLowerCase().includes('nota') || file.name.toLowerCase().includes('nf') || file.name.toLowerCase().includes('fatura'))) {
        setFormTipo('Nota Fiscal');
      }
    }
    toast.info(`Arquivo "${file.name}" importado com sucesso!`, "Preencha as informações para finalizar.");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const handleUploadDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome || !formProjetoId || !formTipo) {
      toast.error("Preencha os campos obrigatórios: Nome, Obra de destino e Categoria.");
      return;
    }

    setIsSaving(true);

    setTimeout(() => {
      const newDocId = 'doc-' + Date.now();
      const newDoc: Documento = {
        id: newDocId,
        nome: formNome,
        tipo: formTipo,
        projetoId: formProjetoId,
        dataCriacao: new Date().toISOString().split('T')[0],
        versao: formVersao || '1.0',
        tamanho: formTamanho || '500 KB'
      };

      onAddDocumento(newDoc);
      
      // Store initial version history
      setMockHistories(prev => ({
        ...prev,
        [newDocId]: [
          { 
            versao: formVersao || '1.0', 
            autor: 'Marcos Barreto', 
            data: new Date().toISOString().split('T')[0], 
            descricao: 'Arquivo inicial carregado no sistema.' 
          }
        ]
      }));

      setIsSaving(false);
      setShowUploadModal(false);
      toast.success("Documento registrado com sucesso.", `O documento ${newDoc.nome} foi anexado.`);

      // Reset Form
      setFormNome('');
      setFormVersao('1.0');
      setFormTamanho('1.5 MB');
    }, 600);
  };

  const handleSimulateDownload = (doc: Documento) => {
    setDownloadingDocId(doc.id);
    
    setTimeout(() => {
      setDownloadingDocId(null);
      toast.info(`Download concluído: ${doc.nome}`, "O arquivo foi baixado para o seu dispositivo.");
    }, 800);
  };

  const handleAddVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPreviewDoc || !newVersionNote) return;

    const currentHistory = mockHistories[selectedPreviewDoc.id] || [];
    const nextVerNum = (parseFloat(selectedPreviewDoc.versao) + 0.1).toFixed(1);
    
    const newHistItem = {
      versao: nextVerNum,
      autor: 'Marcos Barreto',
      data: new Date().toISOString().split('T')[0],
      descricao: newVersionNote
    };

    setMockHistories(prev => ({
      ...prev,
      [selectedPreviewDoc.id]: [newHistItem, ...currentHistory]
    }));

    // Update document version in visual preview
    selectedPreviewDoc.versao = nextVerNum;

    setNewVersionNote('');
    toast.success(`Nova versão v${nextVerNum} registrada!`);
  };

  // Icon based on type
  const getFileIcon = (tipo: TipoDocumento) => {
    switch (tipo) {
      case 'Contrato':
        return <FileCheck2 size={18} className="text-rose-500" />;
      case 'Projeto Técnico':
        return <FileCode size={18} className="text-blue-500" />;
      case 'ART/RRT':
        return <FileBadge size={18} className="text-purple-500" />;
      case 'Licença':
        return <FileText size={18} className="text-emerald-500" />;
      case 'Foto':
        return <FileImage size={18} className="text-sky-500" />;
      case 'Relatório':
        return <FileText size={18} className="text-slate-500" />;
      case 'Nota Fiscal':
        return <FileSpreadsheet size={18} className="text-teal-500" />;
      default:
        return <FileText size={18} className="text-slate-400" />;
    }
  };

  // Preview SVG mockups for the side panel
  const renderPreviewMock = (doc: Documento) => {
    switch (doc.tipo) {
      case 'Projeto Técnico':
        return (
          <div className="w-full h-44 rounded bg-slate-900 border border-slate-950 relative overflow-hidden flex flex-col justify-between p-3 select-none">
            {/* Grid pattern mock */}
            <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 opacity-15 pointer-events-none">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="border border-white/50 border-dashed" />
              ))}
            </div>
            {/* Architectural drawings draft */}
            <svg className="absolute inset-0 w-full h-full text-blue-400/30 stroke-current stroke-1 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              <rect x="10" y="15" width="80" height="65" fill="none" />
              <line x1="10" y1="15" x2="90" y2="80" />
              <line x1="90" y1="15" x2="10" y2="80" />
              <circle cx="50" cy="47.5" r="15" fill="none" />
              <rect x="25" y="30" width="50" height="35" fill="none" />
            </svg>
            <div className="z-10 flex justify-between items-start">
              <span className="text-[9px] bg-blue-900/80 text-blue-200 font-mono px-1.5 py-0.5 rounded border border-blue-700/50 uppercase font-bold tracking-wider">
                Blueprint DWG
              </span>
              <span className="text-[10px] text-blue-400 font-mono">v{doc.versao}</span>
            </div>
            <div className="z-10 text-left bg-slate-950/80 backdrop-blur-xs p-1.5 rounded border border-white/5">
              <p className="text-[9px] text-white font-bold truncate">{doc.nome}</p>
              <p className="text-[8px] text-slate-400 font-mono">Escala: 1:50 | Prancha A1</p>
            </div>
          </div>
        );
      case 'Contrato':
      case 'Licença':
      case 'ART/RRT':
        return (
          <div className="w-full h-44 rounded bg-slate-50 border border-slate-200/60 relative p-3 overflow-hidden flex flex-col justify-between shadow-xs select-none">
            {/* Paper design with header seal */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-blue-600" />
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-blue-100 rounded-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                  </div>
                  <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest">Documento Oficial</span>
                </div>
                <div className="w-5 h-5 border border-amber-200 bg-amber-50 rounded-full flex items-center justify-center text-[7px] text-amber-700 font-bold font-serif shadow-xs">
                  ★
                </div>
              </div>
              <div className="space-y-1 mt-2">
                <div className="h-2 bg-slate-200 rounded w-5/6" />
                <div className="h-1.5 bg-slate-100 rounded w-full" />
                <div className="h-1.5 bg-slate-100 rounded w-4/5" />
                <div className="h-1.5 bg-slate-100 rounded w-11/12" />
                <div className="h-1.5 bg-slate-100 rounded w-2/3" />
              </div>
            </div>
            <div className="border-t border-slate-150 pt-1.5 flex justify-between items-end">
              <div className="space-y-0.5">
                <p className="text-[8px] font-bold text-slate-800">Autenticado Digitalmente</p>
                <p className="text-[7px] text-slate-400 font-mono">Código: 8A2E-90BF-1C</p>
              </div>
              <div className="w-8 h-4 border border-slate-200/80 bg-white rounded flex items-center justify-center">
                <span className="text-[6px] font-mono text-slate-300 italic">Signature</span>
              </div>
            </div>
          </div>
        );
      case 'Nota Fiscal':
        return (
          <div className="w-full h-44 rounded bg-emerald-50/20 border border-emerald-100 relative p-3 overflow-hidden flex flex-col justify-between shadow-xs select-none">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <div className="space-y-2">
              <div className="flex justify-between items-center border-b border-emerald-100/50 pb-1.5">
                <span className="text-[9px] font-extrabold text-emerald-800 font-mono">DANFE / NOTA FISCAL</span>
                <span className="text-[8px] font-mono text-emerald-600 font-bold">Nº 002.349.12</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[8px] font-mono text-slate-500">
                  <span>PRODUTO/SERVIÇO</span>
                  <span>TOTAL (R$)</span>
                </div>
                <div className="flex justify-between text-[8px] font-bold text-slate-700">
                  <span className="truncate max-w-[150px]">Cimento Campeão CP-II 50kg</span>
                  <span>R$ 1.450,00</span>
                </div>
                <div className="flex justify-between text-[8px] font-bold text-slate-700">
                  <span className="truncate max-w-[150px]">Areia Lavada Fina M3</span>
                  <span>R$ 480,00</span>
                </div>
              </div>
            </div>
            <div className="bg-emerald-50/50 border border-emerald-100 rounded p-1 flex justify-between items-center text-[9px]">
              <span className="font-bold text-emerald-800">Valor Pago</span>
              <span className="font-mono font-extrabold text-emerald-900">R$ 1.930,00</span>
            </div>
          </div>
        );
      case 'Foto':
        return (
          <div className="w-full h-44 rounded bg-slate-100 border border-slate-200 relative overflow-hidden flex items-center justify-center p-2 group shadow-xs select-none">
            <div className="absolute inset-0 bg-slate-900/5 opacity-0 group-hover:opacity-100 transition duration-300 z-10" />
            
            {/* Visual camera snapshot grid */}
            <div className="absolute inset-3 border border-white/20 pointer-events-none z-10" />
            <div className="absolute top-4 left-4 w-3 h-3 border-t border-l border-white/60 pointer-events-none z-10" />
            <div className="absolute top-4 right-4 w-3 h-3 border-t border-r border-white/60 pointer-events-none z-10" />
            <div className="absolute bottom-4 left-4 w-3 h-3 border-b border-l border-white/60 pointer-events-none z-10" />
            <div className="absolute bottom-4 right-4 w-3 h-3 border-b border-r border-white/60 pointer-events-none z-10" />
            
            {/* Nice visual mockup of construction site layout */}
            <div className="w-full h-full relative bg-slate-200 flex flex-col justify-end p-2.5 rounded overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/65 via-transparent to-transparent z-10" />
              {/* Construction outline */}
              <div className="absolute bottom-4 left-4 right-4 h-16 bg-slate-300 rounded border border-slate-400 flex items-center justify-center">
                <svg className="w-full h-full text-slate-400 stroke-current opacity-60" viewBox="0 0 100 40">
                  <polyline points="0,40 20,20 40,40 60,10 80,45 100,20" fill="none" strokeWidth="1" />
                </svg>
              </div>
              <div className="z-20 text-left">
                <span className="text-[8px] bg-amber-500 text-slate-900 font-extrabold px-1.5 py-0.5 rounded tracking-wide uppercase">
                  Registro de Obra
                </span>
                <p className="text-[9px] text-white font-medium truncate mt-1">{doc.nome}</p>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="w-full h-44 rounded bg-slate-50 border border-slate-200/80 flex flex-col items-center justify-center gap-2 select-none text-slate-400">
            <FileText size={32} className="opacity-40" />
            <span className="text-[10px] font-mono">Visualização não disponível</span>
          </div>
        );
    }
  };

  return (
    <div id="documentos-tab-content" className="space-y-5 text-left flex flex-col lg:flex-row gap-5 items-stretch min-h-[calc(100vh-140px)]">
      
      {/* LEFT SIDEBAR: Category Folders & Stats */}
      <div id="docs-sidebar" className="w-full lg:w-64 shrink-0 flex flex-col gap-4 self-start">
        
        {/* Storage Stats card */}
        <div id="storage-status-card" className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs text-left space-y-3">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
            <HardDrive size={16} className="text-blue-600" />
            <span>Armazenamento em Nuvem</span>
          </div>
          
          <div className="space-y-1">
            <div className="flex justify-between items-baseline text-xs">
              <span className="font-bold text-slate-800 font-mono">{totalStorageMB.toFixed(1)} MB</span>
              <span className="text-slate-400 font-semibold text-[10px]">Limite {storageLimitMB} MB</span>
            </div>
            {/* Progress Bar */}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${storagePercent}%` }}
              />
            </div>
          </div>

          <p className="text-[10px] text-slate-400 font-medium leading-tight">
            Seu plano gratuito possui {totalFilesCount} arquivos indexados com vinculação direta a obras.
          </p>
        </div>

        {/* Categories Folders List */}
        <div id="categories-folders-card" className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs text-left">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block px-2 mb-2">Pastas de Categorias</span>
          <div className="space-y-0.5">
            <button
              onClick={() => setSelectedFolder('Todos')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-lg transition ${
                selectedFolder === 'Todos'
                  ? 'bg-blue-50/50 text-blue-600 border-l-2 border-blue-600 rounded-l-none'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {getFolderIcon('Todos', selectedFolder === 'Todos')}
                <span>Todos os Arquivos</span>
              </div>
              <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full ${
                selectedFolder === 'Todos' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
              }`}>
                {documentos.length}
              </span>
            </button>

            {documentTypes.map((tipo) => {
              const count = documentos.filter(d => d.tipo === tipo).length;
              const isActive = selectedFolder === tipo;

              return (
                <button
                  key={tipo}
                  onClick={() => setSelectedFolder(tipo)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-lg transition ${
                    isActive
                      ? 'bg-blue-50/50 text-blue-600 border-l-2 border-blue-600 rounded-l-none'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {getFolderIcon(tipo, isActive)}
                    <span>{tipo === 'ART/RRT' ? 'ARTs e RRTs' : tipo === 'Nota Fiscal' ? 'Notas Fiscais' : tipo === 'Projeto Técnico' ? 'Projetos Técnicos' : tipo + 's'}</span>
                  </div>
                  <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* MAIN DOCUMENT AREA: Filters, View Toggles, List/Grid */}
      <div id="docs-main-container" className="flex-1 space-y-4 flex flex-col justify-between">
        
        {/* Upper Action Bar */}
        <div id="docs-action-bar" className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-left">
          
          {/* Left search */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={13} />
            <input
              id="doc-search-text-input"
              type="text"
              placeholder="Pesquisar por nome do documento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200/70 rounded-lg text-xs outline-none focus:border-blue-600 text-slate-800 font-medium"
            />
          </div>

          {/* Filters, Switchers & Upload */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
            
            {/* Filter select project */}
            <div className="relative">
              <select
                id="doc-proj-filter-select"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="border border-slate-200/70 rounded-lg py-1.5 pl-2.5 pr-8 text-xs outline-none bg-white text-slate-600 font-semibold cursor-pointer appearance-none min-w-[150px]"
              >
                <option value="Todos">Todas as Obras</option>
                {projetos.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <Filter size={11} />
              </div>
            </div>

            {/* Layout switch buttons */}
            <div className="flex bg-slate-50 border border-slate-200/50 p-0.5 rounded-lg shrink-0">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-400 hover:text-slate-700'}`}
                title="Visualização em Grade"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-400 hover:text-slate-700'}`}
                title="Visualização em Lista"
              >
                <List size={14} />
              </button>
            </div>

            {/* Direct Upload button */}
            <button
              id="trigger-upload-modal-btn"
              onClick={() => setShowUploadModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm active:scale-95"
            >
              <UploadCloud size={14} />
              <span>Novo Documento</span>
            </button>
          </div>
        </div>

        {/* Content list or grid */}
        <div id="docs-content-wrapper" className="flex-1">
          {filteredDocs.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 p-8 shadow-xs">
              <EmptyState 
                icon={FolderLock}
                title="Nenhum documento encontrado"
                description={
                  selectedFolder !== 'Todos' 
                    ? `Nenhum documento registrado na pasta "${selectedFolder}".` 
                    : "Sua construtora ainda não possui documentos indexados para as obras selecionadas."
                }
                actionLabel="Anexar Primeiro Arquivo"
                onAction={() => setShowUploadModal(true)}
              />
            </div>
          ) : viewMode === 'grid' ? (
            /* GRID VIEW CARDS */
            <div id="documentos-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {filteredDocs.map((doc, index) => {
                const colors = {
                  'Contrato': 'bg-rose-50 text-rose-700 border-rose-100',
                  'Projeto Técnico': 'bg-blue-50 text-blue-700 border-blue-100',
                  'ART/RRT': 'bg-purple-50 text-purple-700 border-purple-100',
                  'Licença': 'bg-emerald-50 text-emerald-700 border-emerald-100',
                  'Foto': 'bg-sky-50 text-sky-700 border-sky-100',
                  'Relatório': 'bg-slate-50 text-slate-700 border-slate-200/50',
                  'Nota Fiscal': 'bg-teal-50 text-teal-700 border-teal-100'
                };

                const isDownloading = downloadingDocId === doc.id;

                return (
                  <motion.div 
                    key={doc.id}
                    id={`doc-card-${doc.id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.2) }}
                    onClick={() => setSelectedPreviewDoc(doc)}
                    className="bg-white p-3.5 rounded-xl border border-slate-150/70 shadow-xs hover:shadow hover:border-blue-300 cursor-pointer transition text-left flex flex-col justify-between group relative h-36"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-1">
                        <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 border rounded-full ${colors[doc.tipo] || 'bg-slate-50'}`}>
                          {doc.tipo}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold font-mono text-slate-400 bg-slate-50 border border-slate-100 px-1 py-0.2 rounded">v{doc.versao}</span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 mt-2.5">
                        <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-blue-50/50 group-hover:text-blue-600 transition shrink-0">
                          {getFileIcon(doc.tipo)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-xs text-slate-900 leading-snug group-hover:text-blue-600 truncate" title={doc.nome}>
                            {doc.nome}
                          </h4>
                          <p className="text-[10px] text-slate-400 font-bold truncate mt-0.5">
                            Obra: <span className="text-slate-600">{getProjectName(doc.projetoId)}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400">
                      <span className="font-medium">{new Date(doc.dataCriacao).toLocaleDateString('pt-BR')} • {doc.tamanho}</span>
                      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          id={`doc-download-btn-${doc.id}`}
                          disabled={isDownloading}
                          onClick={() => handleSimulateDownload(doc)}
                          className="p-1 hover:bg-slate-50 rounded text-slate-400 hover:text-slate-700 transition active:scale-95 disabled:opacity-45"
                          title="Download"
                        >
                          {isDownloading ? <Spinner size={12} /> : <Download size={12} />}
                        </button>
                        <button
                          id={`doc-delete-btn-${doc.id}`}
                          onClick={() => {
                            confirm({
                              title: 'Remover Documento',
                              message: `Deseja remover o arquivo ${doc.nome} permanentemente?`,
                              onConfirm: () => {
                                onDeleteDocumento(doc.id);
                                toast.success('Documento removido.');
                              }
                            });
                          }}
                          className="p-1 hover:bg-rose-50 rounded text-slate-350 hover:text-rose-600 transition active:scale-95"
                          title="Excluir"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* LIST COMPACT VIEW */
            <div id="documentos-list-container" className="bg-white rounded-xl border border-slate-100 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <th className="p-3 pl-4">Documento</th>
                      <th className="p-3">Categoria</th>
                      <th className="p-3">Obra Vinculada</th>
                      <th className="p-3">Data</th>
                      <th className="p-3 text-center">Versão</th>
                      <th className="p-3 text-right">Tamanho</th>
                      <th className="p-3 text-right pr-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredDocs.map((doc) => {
                      const isDownloading = downloadingDocId === doc.id;
                      
                      return (
                        <tr 
                          key={doc.id}
                          onClick={() => setSelectedPreviewDoc(doc)}
                          className="hover:bg-slate-50/50 cursor-pointer transition group"
                        >
                          <td className="p-3 pl-4 font-bold text-slate-800">
                            <div className="flex items-center gap-2.5 min-w-[200px]">
                              <div className="p-1.5 bg-slate-50 rounded group-hover:bg-blue-50/50 transition">
                                {getFileIcon(doc.tipo)}
                              </div>
                              <span className="truncate group-hover:text-blue-600" title={doc.nome}>{doc.nome}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="font-semibold text-slate-600">{doc.tipo}</span>
                          </td>
                          <td className="p-3 text-slate-500 font-semibold max-w-[160px] truncate">
                            {getProjectName(doc.projetoId)}
                          </td>
                          <td className="p-3 text-slate-400 font-mono text-[11px]">
                            {new Date(doc.dataCriacao).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-mono text-[10px] font-bold bg-slate-100/70 border border-slate-200/50 px-1.5 py-0.2 rounded text-slate-600">
                              v{doc.versao}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono text-slate-550 text-[11px] font-semibold">
                            {doc.tamanho}
                          </td>
                          <td className="p-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleSimulateDownload(doc)}
                                disabled={isDownloading}
                                className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-800 transition"
                                title="Download"
                              >
                                {isDownloading ? <Spinner size={12} /> : <Download size={12} />}
                              </button>
                              <button
                                onClick={() => {
                                  confirm({
                                    title: 'Confirmar Exclusão',
                                    message: `Excluir definitivamente o arquivo ${doc.nome}?`,
                                    onConfirm: () => {
                                      onDeleteDocumento(doc.id);
                                      toast.success('Documento excluído.');
                                    }
                                  });
                                }}
                                className="p-1.5 hover:bg-rose-50 rounded text-slate-350 hover:text-rose-600 transition"
                                title="Remover"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DETAIL & PREVIEW DRAWER (RIGHT PANEL) */}
      <AnimatePresence>
        {selectedPreviewDoc && (
          <div id="preview-drawer-wrapper" className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPreviewDoc(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="relative w-full max-w-md bg-white h-screen shadow-2xl border-l border-slate-100 flex flex-col justify-between"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-left">
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded">
                    {getFileIcon(selectedPreviewDoc.tipo)}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-950 text-xs truncate max-w-[220px]">{selectedPreviewDoc.nome}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{selectedPreviewDoc.tipo}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedPreviewDoc(null)}
                  className="w-7 h-7 rounded-full hover:bg-slate-200/60 flex items-center justify-center text-slate-500 font-bold transition text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Drawer Content Body (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-4 space-y-5 text-left">
                
                {/* Visual SVG Mockup Preview Frame */}
                <div className="space-y-1">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Pré-visualização do Documento</span>
                  {renderPreviewMock(selectedPreviewDoc)}
                </div>

                {/* Metadata Fields */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Metadados e Localização</span>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Obra Relacionada</span>
                      <p className="font-bold text-slate-800 leading-normal mt-0.5">{getProjectName(selectedPreviewDoc.projetoId)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Status / Versão</span>
                      <p className="font-bold text-slate-800 leading-normal mt-0.5">Versão v{selectedPreviewDoc.versao}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Data de Criação</span>
                      <p className="font-bold text-slate-800 leading-normal mt-0.5">{new Date(selectedPreviewDoc.dataCriacao).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Tamanho de Armazenamento</span>
                      <p className="font-bold text-slate-800 leading-normal mt-0.5">{selectedPreviewDoc.tamanho}</p>
                    </div>
                  </div>
                </div>

                {/* Interactive Version History Timeline */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1 text-slate-800 font-extrabold text-xs">
                    <History size={14} className="text-blue-600" />
                    <span>Histórico de Versões do Arquivo</span>
                  </div>

                  {/* Versions loop */}
                  <div className="border-l border-slate-200 pl-3.5 space-y-4 relative ml-1.5 mt-2">
                    {((mockHistories[selectedPreviewDoc.id]) || [
                      { versao: selectedPreviewDoc.versao, autor: 'Marcos Barreto', data: selectedPreviewDoc.dataCriacao, descricao: 'Arquivo original carregado no sistema.' }
                    ]).map((hist, hIdx) => (
                      <div key={hIdx} className="relative">
                        {/* Bullet point */}
                        <span className={`absolute -left-[20px] top-1.5 w-2.5 h-2.5 rounded-full border border-white ${
                          hIdx === 0 ? 'bg-blue-600 shadow-sm shadow-blue-500/30' : 'bg-slate-350'
                        }`} />

                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] font-bold font-mono px-1 py-0.2 rounded ${
                              hIdx === 0 ? 'bg-blue-50 text-blue-700 font-extrabold' : 'bg-slate-100 text-slate-500'
                            }`}>
                              v{hist.versao}
                            </span>
                            <span className="text-[10px] font-bold text-slate-800">{hist.autor}</span>
                            <span className="text-[9px] text-slate-400 font-mono font-semibold">{new Date(hist.data).toLocaleDateString('pt-BR')}</span>
                          </div>
                          <p className="text-[11px] text-slate-550 leading-relaxed italic">"{hist.descricao}"</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Form to submit an update/new version */}
                <form onSubmit={handleAddVersion} className="p-3 bg-blue-50/40 rounded-xl border border-blue-100/50 space-y-2">
                  <span className="text-[10px] font-bold text-blue-800 block uppercase">Substituir / Registrar Nova Versão</span>
                  
                  <div className="flex flex-col gap-1.5">
                    <input
                      type="text"
                      required
                      placeholder="Ex: Novo PDF de planta pós vistoria da prefeitura..."
                      value={newVersionNote}
                      onChange={(e) => setNewVersionNote(e.target.value)}
                      className="w-full bg-white border border-blue-200/50 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 placeholder-slate-400"
                    />
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition shadow-xs self-end cursor-pointer"
                    >
                      <PlusCircle size={12} />
                      <span>Registrar Nova Versão</span>
                    </button>
                  </div>
                </form>

              </div>

              {/* Drawer Footer Actions */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  onClick={() => handleSimulateDownload(selectedPreviewDoc)}
                  className="bg-white border border-slate-200 hover:bg-slate-50 active:scale-95 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition shadow-xs"
                >
                  <Download size={13} />
                  <span>Baixar Arquivo</span>
                </button>
                <button
                  onClick={() => {
                    confirm({
                      title: 'Remover Permanentemente',
                      message: `A exclusão do documento "${selectedPreviewDoc.nome}" é irreversível. Prosseguir?`,
                      onConfirm: () => {
                        onDeleteDocumento(selectedPreviewDoc.id);
                        setSelectedPreviewDoc(null);
                        toast.success('Documento excluído.');
                      }
                    });
                  }}
                  className="bg-rose-50 border border-rose-100 hover:bg-rose-100 active:scale-95 text-rose-700 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition shadow-xs"
                >
                  <Trash2 size={13} />
                  <span>Excluir</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* UPLOAD FILE MODAL OVERLAY */}
      <AnimatePresence>
        {showUploadModal && (
          <div id="upload-doc-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isSaving) setShowUploadModal(false); }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Modal content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.2 }}
              className="relative bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200"
            >
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <UploadCloud size={16} className="text-blue-600 animate-pulse" />
                  <span>Upload de Documento da Obra</span>
                </h3>
                <button 
                  onClick={() => setShowUploadModal(false)}
                  disabled={isSaving}
                  className="w-6 h-6 rounded-full hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 font-bold flex items-center justify-center transition text-xs"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleUploadDocument} className="p-4 space-y-4 text-left">
                
                {/* Drag n Drop Area */}
                <div 
                  onClick={triggerFileSelect}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border border-dashed rounded-xl p-5 text-center space-y-1.5 cursor-pointer transition ${
                    isDragging 
                      ? 'border-blue-500 bg-blue-50/50 text-blue-700' 
                      : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-50 hover:border-slate-350'
                  }`}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    className="hidden" 
                    id="doc-real-file-picker"
                  />
                  <UploadCloud size={28} className="mx-auto text-slate-400 animate-pulse" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">Clique para selecionar ou arraste o arquivo</p>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">PDF, DWG, PNG ou DOCX com tamanho máximo de 50MB</p>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Nome do Arquivo / Título *</label>
                  <input
                    id="add-doc-nome"
                    type="text"
                    required
                    disabled={isSaving}
                    placeholder="Ex: Projeto_Hidraulico_Revisado_Final.pdf"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 text-slate-800 font-medium disabled:bg-slate-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Categoria *</label>
                    <select
                      id="add-doc-tipo"
                      disabled={isSaving}
                      value={formTipo}
                      onChange={(e) => setFormTipo(e.target.value as TipoDocumento)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white text-slate-700 font-bold cursor-pointer disabled:bg-slate-50"
                    >
                      {documentTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Obra Destino *</label>
                    <select
                      id="add-doc-proj-select"
                      disabled={isSaving}
                      value={formProjetoId}
                      onChange={(e) => setFormProjetoId(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none bg-white text-slate-700 font-bold cursor-pointer disabled:bg-slate-50"
                    >
                      {projetos.map(p => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Versão Inicial</label>
                    <input
                      id="add-doc-versao"
                      type="text"
                      disabled={isSaving}
                      placeholder="1.0"
                      value={formVersao}
                      onChange={(e) => setFormVersao(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 font-medium disabled:bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Tamanho Estimado</label>
                    <input
                      id="add-doc-tamanho"
                      type="text"
                      disabled={isSaving}
                      placeholder="2.4 MB"
                      value={formTamanho}
                      onChange={(e) => setFormTamanho(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-600 font-medium disabled:bg-slate-50"
                    />
                  </div>
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
                  <button
                    id="submit-add-doc-btn"
                    type="submit"
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    {isSaving ? (
                      <>
                        <Spinner size={14} />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud size={14} />
                        <span>Registrar Documento</span>
                      </>
                    )}
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
