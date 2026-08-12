import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Users,
  Search,
  Plus,
  Upload,
  Download,
  Image as ImageIcon,
  Calendar,
  Phone,
  Mail,
  Briefcase,
  ShieldCheck,
  HardHat,
  UserCheck,
  UserX,
  Trash2,
  FileText,
  AlertCircle,
  AlertTriangle,
  Pencil,
  Wallet,
  CreditCard,
  Check,
  X
} from 'lucide-react';
import { Funcionario, FuncionarioDocumento, Projeto, EtapaCronograma, TipoChavePix, TipoConta, InsumoCatalogo, EmpresaConfig } from '../types';
import { catalogoService } from '../services/catalogoService';
import { custoColaborador, parametrosDaEmpresa } from '../lib/custoHora';
import { formatBRL } from '../lib/preco';
import { onlyDigits, maskCpf, maskTelefone, isValidCpf } from '../utils/format';
import { situacaoValidade, rotuloValidade, resumirDocumentos } from '../lib/validadeDocumento';
import { useFeedback } from './FeedbackContext';
import EstadoDaLista from './EstadoDaLista';
import { ALVO, Button, CarregarMais, Field, IconButton, Input, Modal, ModalForm, Select, SeletorOrdenacao, Textarea } from './ui';
import { useListaOrdenada, compararTexto, compararData, type OpcaoOrdenacao } from '../hooks/useListaOrdenada';
import { useValidacao } from '../hooks/useValidacao';
import { Checagem, naoEhNumero, vazio } from '../lib/validacao';
import Spinner from './Spinner';

/** Mesmas opções dos checks de funcionarios.pix_tipo e tipo_conta. */
const TIPOS_CHAVE_PIX: TipoChavePix[] = ['CPF', 'CNPJ', 'E-mail', 'Telefone', 'Aleatória'];
const TIPOS_CONTA: TipoConta[] = ['Corrente', 'Poupança', 'Pagamento'];

/** Campos da ficha que a validação nomeia, na ordem em que aparecem na tela. */
type CampoFicha = 'nome' | 'cargo' | 'cpf' | 'salario' | 'encargos' | 'jornada' | 'vt' | 'va' | 'saude' | 'outros';

/**
 * Os quatro benefícios numa lista só, com o nome do campo junto do rótulo: a
 * tela e a validação percorrem a MESMA lista, então um benefício novo não pode
 * entrar num lugar e faltar no outro.
 */
const BENEFICIOS = [
  { campo: 'vt', rotulo: 'Vale-transporte' },
  { campo: 'va', rotulo: 'Vale-alimentação/refeição' },
  { campo: 'saude', rotulo: 'Plano de saúde' },
  { campo: 'outros', rotulo: 'Outros benefícios' },
] as const satisfies readonly { campo: CampoFicha; rotulo: string }[];

interface EquipeTabProps {
  funcionarios: Funcionario[];
  projetos: Projeto[];
  /** Encargos e jornada padrão; a ficha só sobrescreve o que difere. */
  empresa: EmpresaConfig | null;
  cronograma: EtapaCronograma[];
  loading: boolean;
  funcionarioDocumentos: FuncionarioDocumento[];
  onAddFuncionario: (func: Funcionario) => Promise<Funcionario | null>;
  onUpdateFuncionario: (func: Funcionario) => Promise<Funcionario | null>;
  onUpdateStatusFuncionario: (id: string, status: Funcionario['status']) => Promise<boolean>;
  onUpdateSalarioFuncionario: (id: string, salarioBase: number | null) => Promise<boolean>;
  onUploadFuncionarioDocumento: (funcionarioId: string, file: File, validade: string | null) => Promise<boolean>;
  onUpdateValidadeDocumento: (id: string, validade: string | null) => Promise<boolean>;
  onDeleteFuncionarioDocumento: (id: string) => void;
  onDownloadFuncionarioDocumento: (doc: FuncionarioDocumento) => void;
}

interface Assignment {
  projetoNome: string;
  etapaNome: string;
  progresso: number;
  status: EtapaCronograma['status'];
}

/**
 * Date-only columns come back as 'YYYY-MM-DD'. Parsing that directly yields UTC
 * midnight, which renders as the previous day in BRT — so anchor it to local
 * midnight, same convention used across the schedule screens.
 */
function formatDataAdmissao(iso: string): string {
  if (!iso) return 'Não informada';
  const parsed = new Date(`${iso}T00:00:00`);
  return isNaN(parsed.getTime()) ? 'Não informada' : parsed.toLocaleDateString('pt-BR');
}

/**
 * Campo numérico opcional do formulário, nas três respostas que ele tem:
 * `undefined` = em branco (herda a empresa, ou não recebe o benefício),
 * `null` = digitado e inválido, número = o valor. Separar as duas ausências é
 * o que permite avisar "isso não é um número" sem tratar campo vazio como erro.
 * Aceita vírgula porque o teclado brasileiro a entrega, como em `EmpresaIdentidade`.
 */
function parseOpcional(valor: string): number | undefined | null {
  const limpo = valor.trim();
  if (!limpo) return undefined;
  const n = Number(limpo.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function EquipeTab({
  funcionarios,
  projetos,
  empresa,
  cronograma,
  loading,
  funcionarioDocumentos,
  onAddFuncionario,
  onUpdateFuncionario,
  onUpdateStatusFuncionario,
  onUpdateSalarioFuncionario,
  onUploadFuncionarioDocumento,
  onUpdateValidadeDocumento,
  onDeleteFuncionarioDocumento,
  onDownloadFuncionarioDocumento
}: EquipeTabProps) {
  const { toast, confirm } = useFeedback();
  const { erros, validar, limparErro, limparTudo, areaRef } = useValidacao<CampoFicha>();
  // A edição de salário em linha, no painel do colaborador, é outro formulário
  // — e fica aberta ao mesmo tempo que a ficha pode estar.
  const salario = useValidacao<'salario'>();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Todos');
  // Only the id is held in state: the record itself is always read from the
  // list, so edits elsewhere never leave a stale copy on screen.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isEditingSalario, setIsEditingSalario] = useState(false);
  const [isSavingSalario, setIsSavingSalario] = useState(false);
  const [salarioDraft, setSalarioDraft] = useState('');
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [docValidade, setDocValidade] = useState('');
  const [editingValidadeId, setEditingValidadeId] = useState<string | null>(null);
  const [validadeDraft, setValidadeDraft] = useState('');
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // Employee Form State (shared by create and edit)
  const [formNome, setFormNome] = useState('');
  const [formCargo, setFormCargo] = useState('');
  // Qual insumo de mão de obra do catálogo este cargo representa. `cargo` é
  // texto livre e não cruza com nada; é este vínculo que liga o colaborador ao
  // coeficiente da composição (HH) e ao custo/hora derivado da folha.
  const [formMaoDeObraId, setFormMaoDeObraId] = useState('');
  const [insumosMaoDeObra, setInsumosMaoDeObra] = useState<InsumoCatalogo[]>([]);
  const [formCpf, setFormCpf] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAdmissao, setFormAdmissao] = useState('');
  const [formSalarioBase, setFormSalarioBase] = useState('');
  const [formObs, setFormObs] = useState('');

  /**
   * Custo além do salário. Todos em `string`, e não em `number | undefined`,
   * porque é o vazio que carrega a informação: campo em branco significa
   * "herda a empresa" (encargos e jornada) ou "não recebe" (benefícios), e um
   * estado numérico não distingue isso de zero. Mesma escolha de
   * `EmpresaIdentidade`, que edita os mesmos parâmetros no nível da empresa.
   */
  const [formEncargos, setFormEncargos] = useState('');
  const [formJornada, setFormJornada] = useState('');
  const [formVt, setFormVt] = useState('');
  const [formVa, setFormVa] = useState('');
  const [formSaude, setFormSaude] = useState('');
  const [formOutrosBenef, setFormOutrosBenef] = useState('');

  // Para onde o salário é transferido. A folha já calculava o valor e gerava o
  // lançamento, mas o dado que executa o pagamento vivia numa planilha à parte.
  const [formPixTipo, setFormPixTipo] = useState<TipoChavePix | ''>('');
  const [formPixChave, setFormPixChave] = useState('');
  const [formBanco, setFormBanco] = useState('');
  const [formAgencia, setFormAgencia] = useState('');
  const [formConta, setFormConta] = useState('');
  const [formTipoConta, setFormTipoConta] = useState<TipoConta | ''>('');
  const [formTitular, setFormTitular] = useState('');

  /**
   * Insumos de mão de obra do catálogo, para o seletor da ficha.
   *
   * Lista curta e estável (algumas dezenas), buscada uma vez ao montar a aba.
   * Não usa o hook paginado do catálogo de propósito: aquele filtro é estado
   * compartilhado da aba Catálogo e mexer nele daqui mudaria a outra tela.
   */
  useEffect(() => {
    let vivo = true;
    catalogoService
      .listarMaoDeObra()
      .then((itens) => { if (vivo) setInsumosMaoDeObra(itens); })
      // Falhar aqui não pode derrubar a ficha: o seletor some e o resto do
      // cadastro continua funcionando.
      .catch(() => { if (vivo) setInsumosMaoDeObra([]); });
    return () => { vivo = false; };
  }, []);

  const selectedFunc = funcionarios.find((f) => f.id === selectedId) ?? null;

  /** Padrão da empresa; `null` enquanto `empresa_config` não chegou. */
  const parametros = useMemo(() => parametrosDaEmpresa(empresa), [empresa]);
  const custoSelecionado = selectedFunc ? custoColaborador(selectedFunc, parametros) : null;
  /**
   * O custo/hora que os campos ABERTOS produzem, para o usuário ver o efeito de
   * um vale-refeição antes de salvar. Monta uma ficha de mentira com o que está
   * digitado em vez de duplicar a fórmula — a conta continua vivendo só em
   * `custoColaborador`, que é o espelho testado da função do banco.
   */
  const custoPrevisto = useMemo(() => {
    if (!showFormModal) return null;
    const numero = (v: string) => {
      const lido = parseOpcional(v);
      return lido === null ? undefined : lido;
    };
    const salario = numero(formSalarioBase);
    if (salario == null) return null;
    return custoColaborador(
      {
        ...(editingId ? funcionarios.find((f) => f.id === editingId) : undefined),
        id: editingId ?? 'previsao',
        nome: formNome,
        cargo: formCargo,
        cpf: '', telefone: '', email: '', dataAdmissao: '', observacoes: '',
        status: 'Ativo',
        dadosPagamento: {},
        salarioBase: salario,
        encargosPercentual: numero(formEncargos),
        jornadaMensalHoras: numero(formJornada),
        beneficios: {
          valeTransporte: numero(formVt),
          valeAlimentacao: numero(formVa),
          planoSaude: numero(formSaude),
          outros: numero(formOutrosBenef),
        },
      },
      parametros
    );
  }, [showFormModal, editingId, funcionarios, formNome, formCargo, formSalarioBase,
      formEncargos, formJornada, formVt, formVa, formSaude, formOutrosBenef, parametros]);

  // Single source of truth for workload: active stages only, indexed by owner.
  const assignmentsByFuncionario = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    cronograma
      .filter((c) => c.status !== 'Concluído')
      .forEach((step) => {
        const proj = projetos.find((p) => p.id === step.projetoId);
        const list = map.get(step.responsavelId) ?? [];
        list.push({
          projetoNome: proj ? proj.nome : 'Obra Desconhecida',
          etapaNome: step.nome,
          progresso: step.percentualExecutado,
          status: step.status
        });
        map.set(step.responsavelId, list);
      });
    return map;
  }, [cronograma, projetos]);

  const getAssignments = (funcId: string): Assignment[] => assignmentsByFuncionario.get(funcId) ?? [];

  const documentosByFuncionario = useMemo(() => {
    const map = new Map<string, FuncionarioDocumento[]>();
    funcionarioDocumentos.forEach((doc) => {
      const list = map.get(doc.funcionarioId) ?? [];
      list.push(doc);
      map.set(doc.funcionarioId, list);
    });
    return map;
  }, [funcionarioDocumentos]);

  const getDocumentos = (funcId: string): FuncionarioDocumento[] => documentosByFuncionario.get(funcId) ?? [];

  // Filter
  const term = search.trim().toLowerCase();
  const searchDigits = onlyDigits(search);
  const filteredFuncionarios = useMemo(() => funcionarios.filter(f => {
    const matchesSearch =
      !term ||
      f.nome.toLowerCase().includes(term) ||
      f.cargo.toLowerCase().includes(term) ||
      (searchDigits.length > 0 && onlyDigits(f.cpf).includes(searchDigits));

    const matchesStatus = statusFilter === 'Todos' || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [funcionarios, term, searchDigits, statusFilter]);

  const ORDENS_EQUIPE = useMemo<OpcaoOrdenacao<Funcionario>[]>(() => [
    { id: 'nome', label: 'Nome (A–Z)', comparar: (a, b) => compararTexto(a.nome, b.nome) },
    { id: 'cargo', label: 'Cargo (A–Z)', comparar: (a, b) => compararTexto(a.cargo, b.cargo) },
    { id: 'admissao', label: 'Admissão mais recente', comparar: (a, b) => compararData(a.dataAdmissao, b.dataAdmissao) },
  ], []);

  const lista = useListaOrdenada({ itens: filteredFuncionarios, opcoes: ORDENS_EQUIPE });

  const resetForm = () => {
    setFormNome('');
    setFormCargo('');
    setFormMaoDeObraId('');
    setFormCpf('');
    setFormTelefone('');
    setFormEmail('');
    setFormAdmissao('');
    setFormSalarioBase('');
    setFormObs('');
    setFormEncargos('');
    setFormJornada('');
    setFormVt('');
    setFormVa('');
    setFormSaude('');
    setFormOutrosBenef('');
    setFormPixTipo('');
    setFormPixChave('');
    setFormBanco('');
    setFormAgencia('');
    setFormConta('');
    setFormTipoConta('');
    setFormTitular('');
  };

  const openCreateModal = () => {
    resetForm();
    setEditingId(null);
    setShowFormModal(true);
  };

  const openEditModal = (func: Funcionario) => {
    setFormNome(func.nome);
    setFormCargo(func.cargo);
    setFormMaoDeObraId(func.catalogoMaoDeObraId ?? '');
    setFormCpf(func.cpf);
    setFormTelefone(func.telefone);
    setFormEmail(func.email);
    setFormAdmissao(func.dataAdmissao);
    setFormSalarioBase(func.salarioBase != null ? String(func.salarioBase) : '');
    setFormObs(func.observacoes);
    setFormEncargos(func.encargosPercentual != null ? String(func.encargosPercentual) : '');
    setFormJornada(func.jornadaMensalHoras != null ? String(func.jornadaMensalHoras) : '');
    setFormVt(func.beneficios?.valeTransporte != null ? String(func.beneficios.valeTransporte) : '');
    setFormVa(func.beneficios?.valeAlimentacao != null ? String(func.beneficios.valeAlimentacao) : '');
    setFormSaude(func.beneficios?.planoSaude != null ? String(func.beneficios.planoSaude) : '');
    setFormOutrosBenef(func.beneficios?.outros != null ? String(func.beneficios.outros) : '');
    setFormPixTipo(func.dadosPagamento?.pixTipo ?? '');
    setFormPixChave(func.dadosPagamento?.pixChave ?? '');
    setFormBanco(func.dadosPagamento?.banco ?? '');
    setFormAgencia(func.dadosPagamento?.agencia ?? '');
    setFormConta(func.dadosPagamento?.conta ?? '');
    setFormTipoConta(func.dadosPagamento?.tipoConta ?? '');
    setFormTitular(func.dadosPagamento?.titular ?? '');
    setEditingId(func.id);
    setShowFormModal(true);
  };

  const closeFormModal = () => {
    if (isSaving) return;
    setShowFormModal(false);
    setEditingId(null);
    limparTudo();
  };

  const handleSubmitFuncionario = async (e: React.FormEvent) => {
    e.preventDefault();
    // O índice único do banco compara só os dígitos, então a checagem local
    // precisa fazer o mesmo para avisar antes de o insert estourar.
    const cpfDigitos = onlyDigits(formCpf);
    const duplicado = funcionarios.find((f) => f.id !== editingId && onlyDigits(f.cpf) === cpfDigitos);

    const encargos = parseOpcional(formEncargos);
    const jornada = parseOpcional(formJornada);
    const valorPorCampo = { vt: formVt, va: formVa, saude: formSaude, outros: formOutrosBenef };
    const beneficios = BENEFICIOS.map(({ campo }) => parseOpcional(valorPorCampo[campo]));
    const [vt, va, saude, outrosBenef] = beneficios;

    if (
      !validar([
        { campo: 'nome', invalido: vazio(formNome), erro: 'Informe o nome completo.' },
        { campo: 'cargo', invalido: vazio(formCargo), erro: 'Informe a função ou cargo.' },
        { campo: 'cpf', invalido: vazio(formCpf), erro: 'Informe o CPF.' },
        { campo: 'cpf', invalido: !isValidCpf(formCpf), erro: 'CPF inválido — confira os dígitos.' },
        {
          campo: 'cpf',
          invalido: !!duplicado,
          erro: `CPF já cadastrado na ficha de ${duplicado?.nome ?? ''}.`,
        },
        {
          campo: 'salario',
          invalido: !vazio(formSalarioBase) && (naoEhNumero(formSalarioBase) || Number(formSalarioBase) < 0),
          erro: 'Informe um salário base válido, ou deixe em branco.',
        },
        // Mesma faixa do check de `funcionarios.encargos_percentual`: o banco
        // recusaria de qualquer forma, e recusar aqui devolve o motivo em vez de
        // um erro cru de constraint.
        {
          campo: 'encargos',
          invalido: encargos === null || (encargos !== undefined && (encargos < 0 || encargos > 300)),
          erro: 'Informe um percentual entre 0 e 300, ou deixe em branco.',
        },
        {
          campo: 'jornada',
          invalido: jornada === null || (jornada !== undefined && jornada <= 0),
          erro: 'Informe as horas por mês, ou deixe em branco.',
        },
        ...BENEFICIOS.map(({ campo }, i): Checagem<CampoFicha> => ({
          campo,
          invalido: beneficios[i] === null || (beneficios[i] !== undefined && (beneficios[i] as number) < 0),
          erro: 'Informe o valor mensal em reais, ou deixe em branco.',
        })),
      ])
    ) return;

    setIsSaving(true);
    const editing = editingId ? funcionarios.find((f) => f.id === editingId) : null;
    const func: Funcionario = {
      id: editingId ?? crypto.randomUUID(),
      nome: formNome.trim(),
      cargo: formCargo.trim(),
      catalogoMaoDeObraId: formMaoDeObraId || undefined,
      cpf: formCpf.trim(),
      telefone: formTelefone.trim(),
      email: formEmail.trim(),
      dataAdmissao: formAdmissao || new Date().toISOString().split('T')[0],
      status: editing?.status ?? 'Ativo',
      observacoes: formObs,
      salarioBase: vazio(formSalarioBase) ? undefined : parseFloat(formSalarioBase),
      // `?? undefined` só troca de nome o que a validação já barrou: `null` é o
      // "não consegui ler este número", e nenhum deles chega aqui.
      encargosPercentual: encargos ?? undefined,
      jornadaMensalHoras: jornada ?? undefined,
      beneficios: {
        valeTransporte: vt ?? undefined,
        valeAlimentacao: va ?? undefined,
        planoSaude: saude ?? undefined,
        outros: outrosBenef ?? undefined,
      },
      dadosPagamento: {
        pixTipo: formPixTipo || undefined,
        pixChave: formPixChave.trim() || undefined,
        banco: formBanco.trim() || undefined,
        agencia: formAgencia.trim() || undefined,
        conta: formConta.trim() || undefined,
        tipoConta: formTipoConta || undefined,
        titular: formTitular.trim() || undefined,
      }
    };

    const saved = editingId ? await onUpdateFuncionario(func) : await onAddFuncionario(func);
    setIsSaving(false);
    // The hook already surfaced the failure — keep the form open so nothing is lost.
    if (!saved) return;

    setSelectedId(saved.id);
    setShowFormModal(false);
    setEditingId(null);
    resetForm();
    toast.success(
      editingId ? 'Ficha atualizada com sucesso.' : 'Colaborador cadastrado com sucesso.',
      editingId ? `Os dados de ${saved.nome} foram salvos.` : `Ficha funcional criada para ${saved.nome}.`
    );
  };

  const handleStartEditSalario = () => {
    setSalarioDraft(selectedFunc?.salarioBase != null ? String(selectedFunc.salarioBase) : '');
    setIsEditingSalario(true);
  };

  const handleSaveSalario = async () => {
    if (!selectedFunc) return;
    const trimmed = salarioDraft.trim();
    const parsed = trimmed ? parseFloat(trimmed) : null;
    if (
      !salario.validar([
        {
          campo: 'salario',
          invalido: trimmed !== '' && (Number.isNaN(parsed as number) || (parsed as number) < 0),
          erro: 'Informe um valor válido, ou deixe em branco.',
        },
      ])
    ) return;
    setIsSavingSalario(true);
    const ok = await onUpdateSalarioFuncionario(selectedFunc.id, parsed);
    setIsSavingSalario(false);
    if (!ok) return;
    setIsEditingSalario(false);
    toast.success('Salário base atualizado.');
  };

  const triggerDocUpload = () => docFileInputRef.current?.click();

  const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Limpa o input já: sem isso, reenviar o mesmo arquivo não dispara change.
    e.target.value = '';
    if (!file || !selectedFunc) return;

    setIsUploadingDoc(true);
    const ok = await onUploadFuncionarioDocumento(selectedFunc.id, file, docValidade || null);
    setIsUploadingDoc(false);
    if (!ok) return;
    setDocValidade('');
    toast.success('Documento anexado à ficha.', file.name);
  };

  const handleStartEditValidade = (doc: FuncionarioDocumento) => {
    setValidadeDraft(doc.validade ?? '');
    setEditingValidadeId(doc.id);
  };

  const handleSaveValidade = async (docId: string) => {
    const ok = await onUpdateValidadeDocumento(docId, validadeDraft || null);
    if (!ok) return;
    setEditingValidadeId(null);
    toast.success('Validade atualizada.');
  };

  const handleToggleStatus = async (selected: Funcionario) => {
    setIsUpdatingStatus(true);
    const nextStatus = selected.status === 'Ativo' ? 'Inativo' : 'Ativo';
    const ok = await onUpdateStatusFuncionario(selected.id, nextStatus);
    setIsUpdatingStatus(false);
    if (ok) toast.success(`Colaborador alterado para ${nextStatus}.`);
  };

  /**
   * Desligar substitui a antiga exclusão: o DELETE está revogado no banco
   * porque apagar a ficha zerava a autoria em etapas, obras e folha.
   */
  const handleToggleStatusComAviso = (selected: Funcionario) => {
    if (selected.status === 'Inativo') {
      handleToggleStatus(selected);
      return;
    }

    const frentes = getAssignments(selected.id).length;
    const obras = projetos.filter((p) => p.responsavelInternoId === selected.id).length;
    const vinculos = [
      frentes > 0 ? `${frentes} ${frentes === 1 ? 'frente de obra ativa' : 'frentes de obra ativas'}` : null,
      obras > 0 ? `${obras} ${obras === 1 ? 'obra sob responsabilidade' : 'obras sob responsabilidade'}` : null,
    ].filter(Boolean);

    confirm({
      title: 'Confirmar desligamento de colaborador',
      message: vinculos.length
        ? `${selected.nome} tem ${vinculos.join(' e ')}. O histórico é preservado, mas a ficha sai do quadro ativo e deixa de aparecer para novas atribuições — redistribua o que estiver em aberto.`
        : `Desligar ${selected.nome}? A ficha sai do quadro ativo, com todo o histórico preservado, e pode ser reativada depois.`,
      onConfirm: () => handleToggleStatus(selected),
    });
  };

  return (
    <div id="equipe-tab-container" className="grid grid-cols-1 lg:grid-cols-[minmax(320px,380px)_1fr] gap-4 lg:h-[calc(100vh-120px)]">

      {/* Left Column: List & Filters */}
      <div id="equipe-list-col" className="lg:col-span-1 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm">
              Quadro de Colaboradores
              {!loading && <span className="ml-1.5 text-xs font-medium text-slate-500">({lista.total})</span>}
            </h3>
            <Button
              id="add-func-btn"
              onClick={openCreateModal}
            >
              <Plus size={14} />
              <span>Novo Integrante</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 text-slate-500" size={14} />
              <Input
                id="func-search-input"
                type="text"
                placeholder="Pesquisar por nome, cargo ou CPF..."
                value={search}
                onChange={(e) => setSearch(e.target.value)} className="pl-8 pr-3"
              />
            </div>

            <div>
              <Select
                id="func-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="Todos">Status: Todos</option>
                <option value="Ativo">Status: Ativos</option>
                <option value="Inativo">Status: Inativos</option>
              </Select>
            </div>
          </div>
        </div>
          {lista.total > 0 && (
            <SeletorOrdenacao
              opcoes={lista.opcoes}
              valor={lista.ordemId}
              onChange={lista.setOrdemId}
              mostrando={lista.mostrando}
              total={lista.total}
            />
          )}


        {/* List Content Scrollable */}
        <div id="equipe-scroll-area" className="flex-1 overflow-y-auto divide-y divide-slate-100">
          <EstadoDaLista
            loading={loading}
            total={lista.total}
            totalSemFiltro={funcionarios.length}
            carregandoLabel="Carregando colaboradores..."
            className="p-4"
            vazio={{
              icon: Users,
              title: 'Nenhum colaborador cadastrado',
              description: 'Cadastre profissionais de engenharia, arquitetura e campo para montar o quadro.',
              actionLabel: 'Novo Integrante',
              onAction: openCreateModal,
            }}
            semResultado={{
              title: 'Nenhum colaborador encontrado',
              description: 'Nenhuma ficha corresponde à busca ou ao filtro de status. Quem foi desligado só aparece em "Status: Inativos".',
            }}
            onLimparFiltros={() => { setSearch(''); setStatusFilter('Todos'); }}
          >
            {lista.visiveis.map((func, index) => {
              const isSelected = selectedId === func.id;
              const frentesAtivas = getAssignments(func.id).length;
              const isSobrecarregado = frentesAtivas > 2;
              const resumoDocs = resumirDocumentos(getDocumentos(func.id));

              return (
                <motion.div
                  key={func.id}
                  id={`func-item-${func.id}`}
                  role="button"
                  tabIndex={0}
                  aria-selected={isSelected}
                  onClick={() => { setSelectedId(func.id); setIsEditingSalario(false); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(func.id);
                      setIsEditingSalario(false);
                    }
                  }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
                  className={`p-3 cursor-pointer transition text-left space-y-1 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${
                    isSelected ? 'bg-blue-50/40 border-l-4 border-blue-600 font-medium' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-xs text-slate-900 truncate max-w-[160px]">{func.nome}</h4>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      func.status === 'Ativo' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {func.status}
                    </span>
                  </div>
                  <p className="text-xs text-blue-600 font-semibold truncate flex items-center gap-1">
                    <HardHat size={11} />
                    <span>{func.cargo}</span>
                  </p>
                  <div className="flex justify-between items-center text-2xs mt-1 text-slate-500 font-semibold">
                    <span>Frentes: {frentesAtivas} ativas</span>
                    {isSobrecarregado && (
                      <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 text-2xs uppercase tracking-wider font-extrabold flex items-center gap-0.5">
                        <AlertCircle size={10} className="shrink-0 text-rose-500" />
                        Sobrecarregado
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center gap-1 mt-1">
                    <p className="text-xs text-slate-500 font-mono">{func.cpf}</p>
                    {resumoDocs.vencidos > 0 ? (
                      <span className="text-rose-700 bg-rose-50 px-1.5 rounded border border-rose-200 text-2xs uppercase tracking-wider font-extrabold flex items-center gap-0.5 shrink-0">
                        <AlertTriangle size={9} className="shrink-0" />
                        Doc vencido
                      </span>
                    ) : resumoDocs.aVencer > 0 ? (
                      <span className="text-amber-700 bg-amber-50 px-1.5 rounded border border-amber-200 text-2xs uppercase tracking-wider font-extrabold flex items-center gap-0.5 shrink-0">
                        <AlertCircle size={9} className="shrink-0" />
                        Doc a vencer
                      </span>
                    ) : null}
                  </div>
                </motion.div>
              );
            })}
          </EstadoDaLista>
          <CarregarMais temMais={lista.temMais} restantes={lista.restantes} onCarregarMais={lista.carregarMais} />
        </div>
      </div>

      {/* Right Column: Detailed Employee View & Onsite Assignments */}
      <div id="equipe-detail-col" className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {selectedFunc ? (
          <div id="equipe-detail-view" className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* Header detail */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div className="text-left">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">ID Registro: {selectedFunc.id}</span>
                <h3 className="text-lg font-bold text-slate-950 mt-1 leading-tight flex items-center gap-2">
                  <HardHat size={18} className="text-slate-700 shrink-0" />
                  <span>{selectedFunc.nome}</span>
                </h3>
                <p className="text-xs text-blue-600 font-bold mt-1 uppercase tracking-wide">
                  {selectedFunc.cargo}
                </p>
              </div>

              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <div className="flex items-center gap-1.5">
                  <button
                    id={`edit-func-btn-${selectedFunc.id}`}
                    onClick={() => openEditModal(selectedFunc)}
                    className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition active:scale-95"
                    title="Editar ficha funcional"
                  >
                    <Pencil size={13} />
                    <span>Editar Ficha</span>
                  </button>
                  <button
                    id={`toggle-func-status-btn-${selectedFunc.id}`}
                    disabled={isUpdatingStatus}
                    onClick={() => handleToggleStatusComAviso(selectedFunc)}
                    className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded border transition active:scale-95 disabled:opacity-50 ${
                      selectedFunc.status === 'Ativo'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                    title={selectedFunc.status === 'Ativo' ? 'Desligar colaborador' : 'Reativar colaborador'}
                  >
                    {isUpdatingStatus ? (
                      <Spinner size={14} />
                    ) : selectedFunc.status === 'Ativo' ? (
                      <>
                        <UserCheck size={14} />
                        <span>Ativo</span>
                      </>
                    ) : (
                      <>
                        <UserX size={14} />
                        <span>Inativo</span>
                      </>
                    )}
                  </button>
                </div>
                <span className="text-2xs text-slate-500">
                  {selectedFunc.status === 'Ativo' ? 'Clique para desligar' : 'Clique para reativar'}
                </span>
              </div>
            </div>

            {/* Carga de Trabalho e Indicador de Sobrecarga */}
            {(() => {
              const frentesAtivas = getAssignments(selectedFunc.id).length;
              const isSobrecarregado = frentesAtivas > 2;

              return (
                <div className={`p-3.5 rounded-lg border flex items-center justify-between text-left ${
                  isSobrecarregado
                    ? 'bg-rose-50 border-rose-200 text-rose-950'
                    : frentesAtivas > 0
                      ? 'bg-blue-50/50 border-blue-200 text-slate-900'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}>
                  <div className="space-y-0.5">
                    <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">Distribuição de Carga de Trabalho</span>
                    <p className="text-xs">
                      Atualmente encarregado por <strong className="text-sm font-bold font-mono text-slate-900">{frentesAtivas}</strong> {frentesAtivas === 1 ? 'frente' : 'frentes'} de obra {frentesAtivas === 1 ? 'ativa' : 'ativas'}.
                    </p>
                  </div>
                  {isSobrecarregado ? (
                    <span className="bg-rose-600 text-white font-extrabold text-2xs px-2.5 py-1 rounded shadow-sm flex items-center gap-1 shrink-0">
                      <AlertTriangle size={13} />
                      <span>SOBRECARREGADO</span>
                    </span>
                  ) : (
                    <span className={`font-bold text-2xs px-2.5 py-1 rounded border shadow-xs shrink-0 ${
                      frentesAtivas > 0 ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {frentesAtivas === 0 ? 'DISPONÍVEL' : 'DISTRIBUIÇÃO SAUDÁVEL'}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Quick stats grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-left">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Canais de Contato</span>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <Phone size={13} className="text-slate-500 shrink-0" />
                  <span className="font-semibold">{selectedFunc.telefone || 'Não informado'}</span>
                </p>
                <p className="text-xs text-slate-800 flex items-center gap-2 truncate">
                  <Mail size={13} className="text-slate-500 shrink-0" />
                  <span className="font-semibold">{selectedFunc.email || 'Não informado'}</span>
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-left">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Documentos & Admissão</span>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <Calendar size={13} className="text-slate-500 shrink-0" />
                  <span>Admitido em: <strong className="text-slate-900">{formatDataAdmissao(selectedFunc.dataAdmissao)}</strong></span>
                </p>
                <p className="text-xs text-slate-800 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase shrink-0 mr-1">CPF:</span>
                  <span className="font-mono font-semibold">{selectedFunc.cpf}</span>
                </p>
              </div>
            </div>

            {/* Custo do colaborador — o salário é a entrada, o custo/hora é o
                que o orçamento consome. Os dois ficam no mesmo card porque a
                pergunta "quanto essa pessoa custa" não se responde só com o
                salário, e separá-los deixaria o número derivado sem contexto. */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-left">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet size={13} className="text-slate-500" />
                  <span>Salário Base</span>
                </span>
                {!isEditingSalario && (
                  <IconButton
                    rotulo="Editar salário base"
                    tom="acao"
                    tamanho="sm"
                    id={`edit-salario-btn-${selectedFunc.id}`}
                    onClick={handleStartEditSalario}
                  >
                    <Pencil size={13} />
                  </IconButton>
                )}
              </div>
              {isEditingSalario ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">R$</span>
                  <Field
                    className="flex-1"
                    id={`salario-input-${selectedFunc.id}`}
                    label="Salário base"
                    labelOculto
                    erro={salario.erros.salario}
                  >
                    {(props) => (
                      <Input
                        {...props}
                        type="number"
                        min="0"
                        step="0.01"
                        autoFocus
                        disabled={isSavingSalario}
                        placeholder="0,00"
                        value={salarioDraft}
                        onChange={(e) => { setSalarioDraft(e.target.value); salario.limparErro('salario'); }} mono
                      />
                    )}
                  </Field>
                  <button
                    onClick={handleSaveSalario}
                    disabled={isSavingSalario}
                    className="text-emerald-600 hover:text-emerald-700 p-1.5 rounded hover:bg-emerald-50 transition disabled:opacity-50"
                    aria-label="Salvar"
                    title="Salvar"
                  >
                    {isSavingSalario ? <Spinner size={15} /> : <Check size={15} />}
                  </button>
                  <IconButton
                    rotulo="Cancelar"
                    tom="perigo"
                    onClick={() => setIsEditingSalario(false)}
                    disabled={isSavingSalario}
                  >
                    <X size={15} />
                  </IconButton>
                </div>
              ) : selectedFunc.salarioBase != null ? (
                <p className="text-sm font-bold text-slate-900 font-mono">
                  {formatBRL(selectedFunc.salarioBase)}
                </p>
              ) : (
                <p className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                  <AlertCircle size={12} />
                  <span>Não cadastrado — necessário para liberar pagamento na Folha</span>
                </p>
              )}

              {/* O que o salário vira depois de encargos, benefícios e jornada.
                  É o mesmo número que `fn_custo_hora_folha` entrega ao catálogo
                  quando o cargo está vinculado — ver `lib/custoHora.ts`. */}
              {custoSelecionado ? (
                <div className="mt-2.5 pt-2.5 border-t border-slate-200 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-2xs text-slate-600">
                      Encargos ({custoSelecionado.encargosPercentual.toLocaleString('pt-BR')}%)
                      {custoSelecionado.encargosHerdados && (
                        <span className="text-slate-500"> · padrão da empresa</span>
                      )}
                    </span>
                    <span className="text-2xs font-mono font-semibold text-slate-700">
                      {formatBRL(custoSelecionado.encargosValor)}
                    </span>
                  </div>

                  {([
                    ['Vale-transporte', selectedFunc.beneficios?.valeTransporte],
                    ['Vale-alimentação', selectedFunc.beneficios?.valeAlimentacao],
                    ['Plano de saúde', selectedFunc.beneficios?.planoSaude],
                    ['Outros benefícios', selectedFunc.beneficios?.outros],
                  ] as const)
                    .filter(([, valor]) => valor != null)
                    .map(([rotulo, valor]) => (
                      <div key={rotulo} className="flex items-baseline justify-between gap-2">
                        <span className="text-2xs text-slate-600">{rotulo}</span>
                        <span className="text-2xs font-mono font-semibold text-slate-700">
                          {formatBRL(valor as number)}
                        </span>
                      </div>
                    ))}

                  <div className="flex items-baseline justify-between gap-2 pt-1 border-t border-slate-200">
                    <span className="text-2xs font-bold text-slate-700 uppercase tracking-wider">Custo mensal</span>
                    <span className="text-xs font-mono font-bold text-slate-900">
                      {formatBRL(custoSelecionado.custoMensal)}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2 mt-1.5">
                    <span className="text-2xs font-bold text-emerald-900 uppercase tracking-wider">
                      Custo por hora
                      <span className="block font-semibold normal-case tracking-normal text-emerald-700">
                        ÷ {custoSelecionado.jornada.toLocaleString('pt-BR')} h/mês
                        {custoSelecionado.jornadaHerdada && ' (padrão)'}
                      </span>
                    </span>
                    <span className="text-sm font-mono font-bold text-emerald-900">
                      {formatBRL(custoSelecionado.custoHora)}
                    </span>
                  </div>
                </div>
              ) : selectedFunc.salarioBase != null && parametros?.encargosPercentual == null
                && selectedFunc.encargosPercentual == null ? (
                /* Mesmo argumento do card de `EmpresaIdentidade`: sem encargos
                   não se inventa zero, porque mão de obra sem encargo parece
                   bem mais barata do que é e o número entraria em orçamento. */
                <p className="text-2xs text-amber-700 font-semibold mt-2.5 pt-2.5 border-t border-slate-200 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    Custo por hora indisponível: informe os encargos nesta ficha, ou o percentual padrão em{' '}
                    <strong>Empresa › Custo da mão de obra própria</strong>.
                  </span>
                </p>
              ) : null}

              {/* Para onde o dinheiro vai. Fica colado no salário porque é a
                  informação que a pessoa que paga procura junto com ele. */}
              {(() => {
                const pg = selectedFunc.dadosPagamento ?? {};
                const temPix = !!pg.pixChave;
                const temConta = !!(pg.banco || pg.agencia || pg.conta);
                if (!temPix && !temConta) {
                  return (
                    <p className="text-2xs text-slate-500 mt-2.5 pt-2.5 border-t border-slate-200 flex items-center gap-1">
                      <CreditCard size={12} />
                      <span>Sem PIX ou conta cadastrados — edite a ficha para informar.</span>
                    </p>
                  );
                }
                return (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-200 space-y-1.5">
                    {temPix && (
                      <div className="flex items-baseline gap-2 text-xs">
                        <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider w-14 shrink-0">PIX</span>
                        <span className="font-mono font-bold text-slate-800 break-all">{pg.pixChave}</span>
                        {pg.pixTipo && (
                          <span className="text-2xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                            {pg.pixTipo}
                          </span>
                        )}
                      </div>
                    )}
                    {temConta && (
                      <div className="flex items-baseline gap-2 text-xs">
                        <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider w-14 shrink-0">Conta</span>
                        <span className="text-slate-700">
                          {[
                            pg.banco,
                            pg.agencia && `Ag. ${pg.agencia}`,
                            pg.conta && `C/C ${pg.conta}`,
                            pg.tipoConta,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    )}
                    {pg.titular && (
                      <div className="flex items-baseline gap-2 text-xs">
                        <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider w-14 shrink-0">Titular</span>
                        <span className="text-slate-700">{pg.titular}</span>
                        <span className="text-2xs text-amber-600 font-semibold">conta de terceiro</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Onsite Active Work (Etapas Vinculadas) */}
            {(() => {
              const assignments = getAssignments(selectedFunc.id);
              return (
                <div className="space-y-2 text-left">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <Briefcase size={15} className="text-slate-500" />
                    <span>Atividades de Obra em Andamento ({assignments.length})</span>
                  </h4>

                  {assignments.length === 0 ? (
                    <p className="text-xs text-slate-500 pl-1">Este profissional não está liderando nenhuma atividade no cronograma ativo atualmente.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {assignments.map((work, idx) => (
                        <div key={idx} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition">
                          <div className="flex justify-between items-start">
                            <span className="text-xs font-bold text-slate-500 uppercase truncate max-w-[120px]">{work.projetoNome}</span>
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/50">{work.status}</span>
                          </div>
                          <h5 className="font-bold text-xs text-slate-900 mt-1 truncate">{work.etapaNome}</h5>

                          <div className="mt-3 space-y-1">
                            <div className="flex justify-between text-xs text-slate-500">
                              <span>Execução Física</span>
                              <span>{work.progresso}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded overflow-hidden">
                              <div className="bg-blue-600 h-full rounded transition-all duration-300" style={{ width: `${work.progresso}%` }}></div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Documentos reais (Storage), com validade de ASO/NR */}
            {(() => {
              const docs = getDocumentos(selectedFunc.id);
              const resumo = resumirDocumentos(docs);

              return (
                <div className="space-y-2 text-left">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <ShieldCheck size={15} className="text-emerald-600" />
                      <span>Documentações e Treinamentos ({docs.length})</span>
                    </h4>
                    <div className="flex items-center gap-2">
                      <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider" htmlFor={`doc-validade-${selectedFunc.id}`}>
                        Validade
                      </label>
                      <Input
                        id={`doc-validade-${selectedFunc.id}`}
                        type="date"
                        disabled={isUploadingDoc}
                        value={docValidade}
                        onChange={(e) => setDocValidade(e.target.value)}
                        title="Opcional — preencha antes de anexar um ASO ou treinamento de NR" tamanho="sm"
                      />
                      <button
                        id={`upload-func-doc-btn-${selectedFunc.id}`}
                        type="button"
                        disabled={isUploadingDoc}
                        onClick={triggerDocUpload}
                        className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 disabled:opacity-50 transition"
                      >
                        {isUploadingDoc ? <Spinner size={12} /> : <Upload size={12} />}
                        <span>Anexar</span>
                      </button>
                      <input
                        ref={docFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                        className="hidden"
                        onChange={handleDocFileChange}
                      />
                    </div>
                  </div>

                  {(resumo.vencidos > 0 || resumo.aVencer > 0) && (
                    <div className={`p-2.5 rounded-lg border flex items-center gap-2 text-xs font-semibold ${
                      resumo.vencidos > 0
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>
                        {resumo.vencidos > 0 && `${resumo.vencidos} ${resumo.vencidos === 1 ? 'documento vencido' : 'documentos vencidos'}`}
                        {resumo.vencidos > 0 && resumo.aVencer > 0 && ' e '}
                        {resumo.aVencer > 0 && `${resumo.aVencer} a vencer em 30 dias`}
                        {' — regularize antes de escalar este profissional para campo.'}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {docs.length === 0 ? (
                      <p className="text-xs text-slate-500 pl-1">Nenhum documento anexado. Envie ASO, treinamentos de NR e contrato em imagem ou PDF.</p>
                    ) : (
                      docs.map((doc) => {
                        const situacao = situacaoValidade(doc.validade);
                        const Icon = doc.contentType === 'application/pdf' ? FileText : ImageIcon;
                        const corValidade =
                          situacao === 'vencido' ? 'bg-rose-100 text-rose-700 border-rose-200'
                          : situacao === 'a-vencer' ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : situacao === 'vigente' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200';

                        return (
                          <div
                            key={doc.id}
                            className={`flex items-center gap-1.5 border rounded px-2 py-1 text-xs font-mono transition ${
                              situacao === 'vencido'
                                ? 'bg-rose-50 border-rose-200 text-rose-900'
                                : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                            }`}
                          >
                            <Icon size={12} className={situacao === 'vencido' ? 'text-rose-600 shrink-0' : 'text-emerald-600 shrink-0'} />
                            <span className="truncate max-w-[160px]" title={doc.nome}>{doc.nome}</span>
                            <span className="text-slate-500">({doc.tamanho})</span>

                            {editingValidadeId === doc.id ? (
                              <>
                                <Input
                                  type="date"
                                  autoFocus
                                  value={validadeDraft}
                                  onChange={(e) => setValidadeDraft(e.target.value)}
                                />
                                <button
                                  type="button"
                                  aria-label="Salvar validade"
                                  title="Salvar validade"
                                  onClick={() => handleSaveValidade(doc.id)}
                                  className={`inline-flex items-center justify-center rounded-lg text-emerald-600 hover:text-emerald-700 transition ${ALVO.md}`}
                                >
                                  <Check size={12} />
                                </button>
                                <IconButton
                                  rotulo="Cancelar"
                                  tom="perigo"
                                  onClick={() => setEditingValidadeId(null)}
                                >
                                  <X size={12} />
                                </IconButton>
                              </>
                            ) : (
                              <button
                                type="button"
                                aria-label="Definir validade (ASO, NR)"
                                title="Definir validade (ASO, NR)"
                                onClick={() => handleStartEditValidade(doc)}
                                className={`px-1.5 py-0.5 rounded border text-2xs font-bold uppercase tracking-wider transition hover:brightness-95 ${corValidade}`}
                              >
                                {rotuloValidade(doc.validade)}
                              </button>
                            )}

                            <IconButton
                              rotulo="Baixar"
                              tom="acao"
                              onClick={() => onDownloadFuncionarioDocumento(doc)}
                            >
                              <Download size={12} />
                            </IconButton>
                            <IconButton
                              rotulo="Excluir"
                              tom="perigo"
                              onClick={() => {
                                confirm({
                                  title: 'Confirmar exclusão de documento',
                                  message: `Remover o documento "${doc.nome}"? Esta operação não pode ser desfeita.`,
                                  onConfirm: () => onDeleteFuncionarioDocumento(doc.id),
                                });
                              }}
                            >
                              <Trash2 size={12} />
                            </IconButton>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Observations / Technical Memo */}
            <div className="p-3 bg-blue-50/20 rounded-lg border border-blue-100 text-left">
              <span className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 font-mono">
                <FileText size={13} />
                <span>Observações de Ficha Funcional</span>
              </span>
              <p className="text-xs text-slate-700 italic font-medium leading-relaxed">
                {selectedFunc.observacoes || 'Sem observações ou advertências anotadas.'}
              </p>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
            {loading ? (
              <>
                <Spinner size={24} />
                <p className="text-xs mt-2">Carregando colaboradores...</p>
              </>
            ) : (
              <>
                <Users size={48} className="stroke-1 mb-2" />
                <p className="text-xs">Selecione um profissional para ver a ficha.</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Employee Modal Overlay */}
      <Modal
        id="employee-form-modal"
        open={showFormModal}
        onClose={closeFormModal}
        title={editingId ? 'Editar Ficha Funcional' : 'Adicionar Novo Integrante'}
        size="md"
        bloqueado={isSaving}
      >
              <ModalForm
                ref={areaRef as React.RefObject<HTMLFormElement>}
                onSubmit={handleSubmitFuncionario}
                className="space-y-4"
                footer={
                  <>
                    <Button variante="fantasma" disabled={isSaving} onClick={closeFormModal}>
                      Cancelar
                    </Button>
                    <Button id="submit-add-employee-btn" type="submit" carregando={isSaving}>
                      {!isSaving && <UserCheck size={14} />}
                      {isSaving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Salvar Colaborador'}
                    </Button>
                  </>
                }
              >
                <Field id="add-func-nome" label="Nome Completo" erro={erros.nome} required>
                  {(props) => (
                    <Input
                      {...props}
                      type="text"
                      disabled={isSaving}
                      placeholder="Ex: Carlos Roberto Albuquerque"
                      value={formNome}
                      onChange={(e) => { setFormNome(e.target.value); limparErro('nome'); }}
                    />
                  )}
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Field id="add-func-cargo" label="Função / Cargo" erro={erros.cargo} required>
                      {(props) => (
                        <Input
                          {...props}
                          type="text"
                          disabled={isSaving}
                          list="func-cargo-options"
                          placeholder="Ex: Engenheiro Júnior"
                          value={formCargo}
                          onChange={(e) => { setFormCargo(e.target.value); limparErro('cargo'); }}
                        />
                      )}
                    </Field>
                    <datalist id="func-cargo-options">
                      {Array.from(new Set(funcionarios.map((f) => f.cargo).filter(Boolean))).map((cargo) => (
                        <option key={cargo} value={cargo} />
                      ))}
                    </datalist>
                  </div>
                  {/* Some quando não há insumo de mão de obra no catálogo: sem
                      base adotada o seletor seria uma caixa vazia sem explicação. */}
                  {insumosMaoDeObra.length > 0 && (
                    <Field
                      className="col-span-2"
                      id="add-func-mao-de-obra"
                      label="Cargo no catálogo"
                      hint="Liga este colaborador ao insumo de mão de obra do catálogo. É o que permite comparar as horas apontadas com o coeficiente da composição e derivar o custo/hora a partir da folha. Deixe em branco para administrativo e engenharia."
                    >
                      {(props) => (
                        <Select
                          {...props}
                          disabled={isSaving}
                          value={formMaoDeObraId}
                          onChange={(e) => setFormMaoDeObraId(e.target.value)}
                        >
                          <option value="">Não é mão de obra direta</option>
                          {insumosMaoDeObra.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.descricao} ({i.unidade})
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  )}
                  <Field id="add-func-cpf" label="CPF" erro={erros.cpf} required>
                    {(props) => (
                      <Input
                        {...props}
                        type="text"
                        disabled={isSaving}
                        placeholder="000.000.000-00"
                        value={formCpf}
                        onChange={(e) => { setFormCpf(maskCpf(e.target.value)); limparErro('cpf'); }}
                      />
                    )}
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field id="add-func-tel" label="Telefone">
                    {(props) => (
                      <Input
                        {...props}
                        type="text"
                        disabled={isSaving}
                        placeholder="(11) 90000-0000"
                        value={formTelefone}
                        onChange={(e) => setFormTelefone(maskTelefone(e.target.value))}
                      />
                    )}
                  </Field>
                  <Field id="add-func-email" label="E-mail">
                    {(props) => (
                      <Input
                        {...props}
                        type="email"
                        disabled={isSaving}
                        placeholder="email@empresa.com"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                      />
                    )}
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field id="add-func-admissao" label="Data de Admissão">
                    {(props) => (
                      <Input
                        {...props}
                        type="date"
                        disabled={isSaving}
                        value={formAdmissao}
                        onChange={(e) => setFormAdmissao(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field id="add-func-salario" label="Salário Base (R$)" erro={erros.salario}>
                    {(props) => (
                      <Input
                        {...props}
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={isSaving}
                        placeholder="Ex: 3500.00"
                        value={formSalarioBase}
                        onChange={(e) => { setFormSalarioBase(e.target.value); limparErro('salario'); }} mono
                      />
                    )}
                  </Field>
                </div>

                {/* Custo além do salário. Vive na ficha porque varia por pessoa
                    — meio período, PJ, quem recebe vale e quem não recebe. O
                    padrão da empresa continua em Empresa › Custo da mão de obra
                    própria; aqui só se escreve o que difere dele. */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Wallet size={13} className="text-slate-500" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Custo e benefícios
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Encargos sociais"
                      erro={erros.encargos}
                      hint={
                        parametros?.encargosPercentual != null
                          ? `Em branco usa ${parametros.encargosPercentual.toLocaleString('pt-BR')}% da empresa.`
                          : 'A empresa ainda não definiu um padrão.'
                      }
                    >
                      {(campo) => (
                        <Input
                          {...campo}
                          type="text"
                          inputMode="decimal"
                          disabled={isSaving}
                          placeholder={
                            parametros?.encargosPercentual != null
                              ? String(parametros.encargosPercentual)
                              : 'ex.: 80'
                          }
                          sufixo="%"
                          mono
                          value={formEncargos}
                          onChange={(e) => { setFormEncargos(e.target.value); limparErro('encargos'); }}
                        />
                      )}
                    </Field>
                    <Field
                      label="Jornada mensal"
                      erro={erros.jornada}
                      hint={`Em branco usa ${(parametros?.jornadaMensalHoras ?? 220).toLocaleString('pt-BR')} h da empresa.`}
                    >
                      {(campo) => (
                        <Input
                          {...campo}
                          type="text"
                          inputMode="decimal"
                          disabled={isSaving}
                          placeholder={String(parametros?.jornadaMensalHoras ?? 220)}
                          sufixo="h"
                          mono
                          value={formJornada}
                          onChange={(e) => { setFormJornada(e.target.value); limparErro('jornada'); }}
                        />
                      )}
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {BENEFICIOS.map(({ campo, rotulo }) => {
                      const [valor, setValor] = {
                        vt: [formVt, setFormVt],
                        va: [formVa, setFormVa],
                        saude: [formSaude, setFormSaude],
                        outros: [formOutrosBenef, setFormOutrosBenef],
                      }[campo] as [string, (v: string) => void];
                      return (
                      <Field key={campo} label={rotulo} erro={erros[campo]}>
                        {(props) => (
                          <Input
                            {...props}
                            type="text"
                            inputMode="decimal"
                            disabled={isSaving}
                            placeholder="0,00"
                            icone={<span className="text-2xs font-bold">R$</span>}
                            mono
                            value={valor}
                            onChange={(e) => { setValor(e.target.value); limparErro(campo); }}
                          />
                        )}
                      </Field>
                      );
                    })}
                  </div>

                  {/* Prévia, não campo: mostra o efeito do que está digitado
                      antes de salvar, para o vale-refeição não virar surpresa
                      no orçamento. */}
                  {custoPrevisto && (
                    <p className="text-2xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
                      Custo mensal <strong className="font-mono text-slate-800">{formatBRL(custoPrevisto.custoMensal)}</strong>
                      {' — '}
                      <strong className="font-mono text-emerald-700">{formatBRL(custoPrevisto.custoHora)}</strong> por hora
                      {' '}em {custoPrevisto.jornada.toLocaleString('pt-BR')} h/mês.
                    </p>
                  )}
                </div>

                {/* Dados de pagamento. Ficam na ficha, e não na folha, porque
                    são cadastro do colaborador: a folha só os consome na hora
                    de transferir. Tudo opcional — quem é pago em espécie ou
                    ainda não informou a conta não fica travado no cadastro. */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <CreditCard size={13} className="text-slate-500" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Dados para pagamento
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="add-func-pix-tipo" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tipo da chave PIX</label>
                      <Select
                        id="add-func-pix-tipo"
                        disabled={isSaving}
                        value={formPixTipo}
                        onChange={(e) => setFormPixTipo(e.target.value as TipoChavePix | '')}
                      >
                        <option value="">Não informado</option>
                        {TIPOS_CHAVE_PIX.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="add-func-pix-chave" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Chave PIX</label>
                      <Input
                        id="add-func-pix-chave"
                        type="text"
                        disabled={isSaving}
                        placeholder={
                          formPixTipo === 'CPF' ? '000.000.000-00'
                          : formPixTipo === 'CNPJ' ? '00.000.000/0001-00'
                          : formPixTipo === 'Telefone' ? '(11) 90000-0000'
                          : formPixTipo === 'E-mail' ? 'nome@email.com'
                          : formPixTipo === 'Aleatória' ? 'Chave gerada pelo banco'
                          : 'Selecione o tipo ao lado'
                        }
                        value={formPixChave}
                        onChange={(e) => setFormPixChave(e.target.value)} mono
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-2">
                      <label htmlFor="add-func-banco" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Banco</label>
                      <Input
                        id="add-func-banco"
                        type="text"
                        disabled={isSaving}
                        placeholder="Ex: 341 - Itaú"
                        value={formBanco}
                        onChange={(e) => setFormBanco(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="add-func-agencia" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Agência</label>
                      <Input
                        id="add-func-agencia"
                        type="text"
                        disabled={isSaving}
                        placeholder="0000"
                        value={formAgencia}
                        onChange={(e) => setFormAgencia(e.target.value)} mono
                      />
                    </div>
                    <div>
                      <label htmlFor="add-func-conta" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Conta</label>
                      <Input
                        id="add-func-conta"
                        type="text"
                        disabled={isSaving}
                        placeholder="00000-0"
                        value={formConta}
                        onChange={(e) => setFormConta(e.target.value)} mono
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="add-func-tipo-conta" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tipo de conta</label>
                      <Select
                        id="add-func-tipo-conta"
                        disabled={isSaving}
                        value={formTipoConta}
                        onChange={(e) => setFormTipoConta(e.target.value as TipoConta | '')}
                      >
                        <option value="">Não informado</option>
                        {TIPOS_CONTA.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="add-func-titular" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Titular da conta</label>
                      <Input
                        id="add-func-titular"
                        type="text"
                        disabled={isSaving}
                        placeholder="Preencha só se não for o próprio colaborador"
                        value={formTitular}
                        onChange={(e) => setFormTitular(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Observações / Capacitações</label>
                  <Textarea
                    id="add-func-obs"
                    disabled={isSaving}
                    placeholder="Informações adicionais de saúde ocupacional, treinamentos especiais..."
                    value={formObs}
                    onChange={(e) => setFormObs(e.target.value)}
                    rows={2}
                  />
                </div>

                <p className="text-2xs text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
                  Documentos (ASO, treinamentos de NR, contrato) são anexados como arquivo
                  na ficha, depois de salvar — com data de validade para o aviso de vencimento.
                </p>

              </ModalForm>
      </Modal>
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
export default memo(EquipeTab);
