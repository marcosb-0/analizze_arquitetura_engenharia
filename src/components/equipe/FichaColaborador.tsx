import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  FileText,
  Image as ImageIcon,
  Mail,
  Pencil,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { CentroCusto, EtapaCronograma, Funcionario, FuncionarioDocumento } from '../../types';
import { custoColaborador, type OrigemEncargos, type ParametrosCusto } from '../../lib/custoHora';
import { formatBRL } from '../../lib/preco';
import { formatarDataBR } from '../../lib/data';
import { situacaoValidade, rotuloValidade, resumirDocumentos } from '../../lib/validadeDocumento';
import type { SituacaoValidade } from '../../types';
import { useFeedback } from '../FeedbackContext';
import { useValidacao } from '../../hooks/useValidacao';
import { StatusBadge } from '../../constants/status';
import { Abas, Avatar, Aviso, Button, Card, CardHeader, Chip, FaixaKpis, Field, IconButton, Input, Kpi, PainelAba, Trena, type TomChip, Titulo, Typography } from '../ui';
import { LIMITE_FRENTES, parseDinheiro } from './regras';

export interface Frente {
  projetoNome: string;
  etapaNome: string;
  progresso: number;
  status: EtapaCronograma['status'];
}

/** De onde veio o % de encargos da ficha — espelha `encargosOrigem`. */
const ROTULO_ORIGEM: Record<OrigemEncargos, (regime: string) => string> = {
  ficha: () => 'definido na ficha',
  rubricas: (regime) => `tabela da empresa, ${regime.toLowerCase()}`,
  empresa: () => 'padrão da empresa',
};

const TOM_VALIDADE: Record<SituacaoValidade, TomChip> = {
  vencido: 'negativo',
  'a-vencer': 'atencao',
  vigente: 'positivo',
  'sem-validade': 'neutro',
};

/** Rótulo e valor numa linha — a ficha é, afinal, uma lista de pares. */
function Par({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-baseline gap-3 py-1.5">
      <dt className="text-xs font-semibold text-slate-500">{rotulo}</dt>
      <dd className="min-w-0 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

/** Uma linha do extrato de custo: rótulo à esquerda, reais à direita. */
function LinhaCusto({ rotulo, detalhe, valor, forte = false }: { rotulo: string; detalhe?: string; valor: number; forte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${forte ? 'border-t border-slate-200 mt-1 pt-3' : ''}`}>
      <span className={`text-sm ${forte ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>
        {rotulo}
        {detalhe && <span className="ml-1.5 text-xs text-slate-500">{detalhe}</span>}
      </span>
      <span className={`font-mono ${forte ? 'text-base font-semibold text-slate-900' : 'text-sm font-semibold text-slate-800'}`}>
        {formatBRL(valor)}
      </span>
    </div>
  );
}

interface Props {
  funcionario: Funcionario;
  frentes: Frente[];
  documentos: FuncionarioDocumento[];
  centrosCusto: CentroCusto[];
  parametros: ParametrosCusto | null;
  /** Obras em que a pessoa é o responsável interno — pesa no aviso de desligar. */
  obrasResponsavel: number;
  onEditar: () => void;
  onVerCustos?: () => void;
  onUpdateStatus: (id: string, status: Funcionario['status']) => Promise<boolean>;
  onUpdateSalario: (id: string, salarioBase: number | null) => Promise<boolean>;
  onUploadDocumento: (funcionarioId: string, file: File, validade: string | null) => Promise<boolean>;
  onUpdateValidade: (id: string, validade: string | null) => Promise<boolean>;
  onDeleteDocumento: (id: string) => void;
  onDownloadDocumento: (doc: FuncionarioDocumento) => void;
}

/**
 * A ficha do colaborador, à direita da lista.
 *
 * Antes abria com o UUID do registro em caixa alta ("ID REGISTRO: BF2F…"), um
 * dado que ninguém lê, e com um botão verde "Ativo" que DESLIGAVA a pessoa ao
 * ser clicado — um selo de estado vestido de controle, com "Clique para
 * desligar" escrito embaixo para compensar. Agora o estado é selo e a ação é
 * botão com o verbo.
 *
 * A faixa "Distribuição de carga de trabalho" dizia o número de frentes em três
 * lugares (faixa, frase e selo). Virou um dos quatro números do topo, ao lado
 * do custo — as duas perguntas que se faz ao abrir a ficha de alguém da obra.
 */
export default function FichaColaborador({
  funcionario: f,
  frentes,
  documentos,
  centrosCusto,
  parametros,
  obrasResponsavel,
  onEditar,
  onVerCustos,
  onUpdateStatus,
  onUpdateSalario,
  onUploadDocumento,
  onUpdateValidade,
  onDeleteDocumento,
  onDownloadDocumento,
}: Props) {
  const { toast, confirm } = useFeedback();
  const salario = useValidacao<'salario'>();
  const [aba, setAba] = useState<'obras' | 'documentos'>('obras');
  const [mudandoStatus, setMudandoStatus] = useState(false);
  const [editandoSalario, setEditandoSalario] = useState(false);
  const [salvandoSalario, setSalvandoSalario] = useState(false);
  const [salarioDraft, setSalarioDraft] = useState('');
  const [enviandoDoc, setEnviandoDoc] = useState(false);
  const [docValidade, setDocValidade] = useState('');
  const [validadeEmEdicao, setValidadeEmEdicao] = useState<string | null>(null);
  const [validadeDraft, setValidadeDraft] = useState('');
  const arquivoRef = useRef<HTMLInputElement>(null);

  const custo = custoColaborador(f, parametros);
  const resumoDocs = resumirDocumentos(documentos);
  const ativo = f.status === 'Ativo';
  const sobrecarregado = frentes.length > LIMITE_FRENTES;
  const lotacao = centrosCusto.find((c) => c.id === f.centroCustoId)?.nome;
  const pg = f.dadosPagamento ?? {};
  const temPix = !!pg.pixChave;
  const temConta = !!(pg.banco || pg.agencia || pg.conta);

  const iniciarSalario = () => {
    setSalarioDraft(f.salarioBase != null ? f.salarioBase.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
    setEditandoSalario(true);
  };

  const salvarSalario = async () => {
    const lido = parseDinheiro(salarioDraft);
    if (!salario.validar([{ campo: 'salario', invalido: lido === null || (lido !== undefined && lido < 0), erro: 'Valor inválido.' }])) return;
    setSalvandoSalario(true);
    const ok = await onUpdateSalario(f.id, lido ?? null);
    setSalvandoSalario(false);
    if (!ok) return;
    setEditandoSalario(false);
    toast.success('Salário base atualizado.');
  };

  const trocarStatus = async () => {
    setMudandoStatus(true);
    const proximo = ativo ? 'Inativo' : 'Ativo';
    const ok = await onUpdateStatus(f.id, proximo);
    setMudandoStatus(false);
    if (ok) toast.success(proximo === 'Ativo' ? `${f.nome} voltou ao quadro ativo.` : `${f.nome} foi desligado.`);
  };

  /**
   * Desligar substitui a antiga exclusão: o DELETE está revogado no banco
   * porque apagar a ficha zerava a autoria em etapas, obras e folha.
   */
  const pedirTrocaStatus = () => {
    if (!ativo) { trocarStatus(); return; }
    const vinculos = [
      frentes.length > 0 ? `${frentes.length} ${frentes.length === 1 ? 'frente de obra ativa' : 'frentes de obra ativas'}` : null,
      obrasResponsavel > 0 ? `${obrasResponsavel} ${obrasResponsavel === 1 ? 'obra sob responsabilidade' : 'obras sob responsabilidade'}` : null,
    ].filter(Boolean);
    confirm({
      title: 'Desligar colaborador',
      confirmLabel: 'Desligar',
      message: vinculos.length
        ? `${f.nome} tem ${vinculos.join(' e ')}. O histórico é preservado, mas a ficha sai do quadro ativo e deixa de aparecer para novas atribuições — redistribua o que estiver em aberto.`
        : `Desligar ${f.nome}? A ficha sai do quadro ativo, com todo o histórico preservado, e pode ser reativada depois.`,
      onConfirm: trocarStatus,
    });
  };

  const aoEscolherArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Limpa o input já: sem isso, reenviar o mesmo arquivo não dispara change.
    e.target.value = '';
    if (!file) return;
    setEnviandoDoc(true);
    const ok = await onUploadDocumento(f.id, file, docValidade || null);
    setEnviandoDoc(false);
    if (!ok) return;
    setDocValidade('');
    toast.success('Documento anexado à ficha.', file.name);
  };

  const salvarValidade = async (docId: string) => {
    const ok = await onUpdateValidade(docId, validadeDraft || null);
    if (!ok) return;
    setValidadeEmEdicao(null);
    toast.success('Validade atualizada.');
  };

  return (
    <article id="equipe-detail-view" aria-labelledby="ficha-nome" className="space-y-4 text-left">
      {/* Identificação */}
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar nome={f.nome} tamanho="lg" tom="solido" />
          <div className="min-w-0">
            <Titulo papel="cartao" como="h2" id="ficha-nome" className="leading-tight break-words">{f.nome}</Titulo>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
              {!ativo && <StatusBadge type="funcionario" status="Inativo" size="sm" />}
              <span className="font-semibold text-slate-800">{f.cargo}</span>
              {f.dataAdmissao && <span>· desde {formatarDataBR(f.dataAdmissao)}</span>}
              {f.catalogoMaoDeObraId && <span>· mão de obra direta</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button id={`edit-func-btn-${f.id}`} variante="secundario" onClick={onEditar}>
            <Pencil size={14} />
            Editar ficha
          </Button>
          <Button
            id={`toggle-func-status-btn-${f.id}`}
            variante={ativo ? 'fantasma' : 'secundario'}
            carregando={mudandoStatus}
            onClick={pedirTrocaStatus}
          >
            {!mudandoStatus && (ativo ? <UserX size={14} /> : <UserCheck size={14} />)}
            {ativo ? 'Desligar' : 'Reativar'}
          </Button>
        </div>
      </Card>

      {/* O que se pergunta primeiro: quanto custa. */}
      <FaixaKpis colunas={2} className="rounded-superficie bg-superficie border border-slate-200 p-5">
        <Kpi
          rotulo="Custo por hora"
          valor={custo ? formatBRL(custo.custoHora) : '—'}
          detalhe={custo ? `${custo.jornada.toLocaleString('pt-BR')} h/mês${custo.jornadaHerdada ? ' (padrão)' : ''}` : f.salarioBase == null ? 'sem salário na ficha' : 'sem encargos definidos'}
        />
        <Kpi
          rotulo="Custo mensal"
          valor={custo ? formatBRL(custo.custoMensal) : f.salarioBase != null ? formatBRL(f.salarioBase) : '—'}
          detalhe={custo ? `salário ${formatBRL(f.salarioBase ?? 0)} + encargos e benefícios` : f.salarioBase != null ? 'só o salário' : undefined}
        />
      </FaixaKpis>

      {(resumoDocs.vencidos > 0 || resumoDocs.aVencer > 0) && ativo && (
        <Aviso tom={resumoDocs.vencidos > 0 ? 'negativo' : 'atencao'} icone={<AlertTriangle size={14} />}>
          {resumoDocs.vencidos > 0 && `${resumoDocs.vencidos} ${resumoDocs.vencidos === 1 ? 'documento vencido' : 'documentos vencidos'}`}
          {resumoDocs.vencidos > 0 && resumoDocs.aVencer > 0 && ' e '}
          {resumoDocs.aVencer > 0 && `${resumoDocs.aVencer} a vencer em 30 dias`}
          {' — regularize antes de escalar para o campo.'}
        </Aviso>
      )}

      {/* Dados da ficha em cartões — saíram das abas: são curtos e se leem juntos. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            className="mb-3"
            title="Composição do custo"
            actions={
              !editandoSalario && (
                <Button id={`edit-salario-btn-${f.id}`} variante="fantasma" tamanho="sm" onClick={iniciarSalario}>
                  <Pencil size={14} /> Salário
                </Button>
              )
            }
          />
          {editandoSalario ? (
            <form
              className="flex items-start gap-2 pb-2"
              onSubmit={(e) => { e.preventDefault(); salvarSalario(); }}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditandoSalario(false); } }}
            >
              <Field className="flex-1" id={`salario-input-${f.id}`} label="Salário base" labelOculto erro={salario.erros.salario}>
                {(props) => (
                  <Input
                    {...props}
                    inputMode="decimal"
                    autoFocus
                    disabled={salvandoSalario}
                    placeholder="0,00"
                    icone={<span className="text-xs font-semibold">R$</span>}
                    mono
                    value={salarioDraft}
                    onChange={(e) => { setSalarioDraft(e.target.value); salario.limparErro('salario'); }}
                  />
                )}
              </Field>
              <IconButton rotulo="Salvar salário" tom="acao" type="submit" carregando={salvandoSalario}>
                <Check size={14} />
              </IconButton>
              <IconButton rotulo="Cancelar" onClick={() => setEditandoSalario(false)} disabled={salvandoSalario}>
                <X size={14} />
              </IconButton>
            </form>
          ) : f.salarioBase == null ? (
            <Aviso tom="atencao" icone={<AlertTriangle size={14} />} className="mb-2">
              Salário não cadastrado — a folha não libera o pagamento sem ele.
            </Aviso>
          ) : null}

          {f.salarioBase != null && (
            <div>
              <LinhaCusto rotulo="Salário base" valor={f.salarioBase} />
              {custo && (
                <>
                  <LinhaCusto
                    rotulo={`Encargos ${custo.encargosPercentual.toLocaleString('pt-BR')}%`}
                    detalhe={ROTULO_ORIGEM[custo.encargosOrigem](f.regimeEncargos ?? 'Mensalista')}
                    valor={custo.encargosValor}
                  />
                  {([
                    ['Vale-transporte', f.beneficios?.valeTransporte],
                    ['Vale-alimentação', f.beneficios?.valeAlimentacao],
                    ['Plano de saúde', f.beneficios?.planoSaude],
                    ['Outros benefícios', f.beneficios?.outros],
                  ] as const)
                    .filter(([, v]) => v != null)
                    .map(([rotulo, v]) => <LinhaCusto key={rotulo} rotulo={rotulo} valor={v as number} />)}
                  <LinhaCusto rotulo="Custo mensal" valor={custo.custoMensal} forte />
                </>
              )}
            </div>
          )}

          {/* Sem encargos não se inventa zero: mão de obra sem encargo parece
              bem mais barata do que é e o número entraria em orçamento. */}
          {!custo && (f.salarioBase ?? 0) > 0 && parametros != null && (
            <Typography type="body-xs" weight="semibold" className="mt-2 flex items-start gap-1.5 text-amber-700">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                Custo por hora indisponível: informe os encargos na ficha ou o padrão da empresa em{' '}
                {onVerCustos ? (
                  <button type="button" onClick={onVerCustos} className="underline underline-offset-2 hover:text-amber-700">
                    Custo da mão de obra
                  </button>
                ) : 'Custo da mão de obra'}
                .
              </span>
            </Typography>
          )}

          <Typography type="body-xs" color="muted" className="mt-3">
            Lotação da folha: <span className="font-semibold text-slate-800">{lotacao ?? 'definida ao lançar a folha'}</span>
          </Typography>
        </Card>

        <Card>
          <CardHeader className="mb-3" title="Contato e registro" />
          <dl className="divide-y divide-slate-100">
            <Par rotulo="Telefone">
              {f.telefone ? (
                <a href={`tel:${f.telefone.replace(/\D/g, '')}`} className="font-semibold text-blue-600 hover:underline">{f.telefone}</a>
              ) : <span className="text-slate-500">Não informado</span>}
            </Par>
            <Par rotulo="E-mail">
              {f.email ? (
                <a href={`mailto:${f.email}`} className="inline-flex max-w-full items-center gap-1 font-semibold text-blue-600 hover:underline">
                  <Mail size={12} className="shrink-0" aria-hidden />
                  <span className="truncate">{f.email}</span>
                </a>
              ) : <span className="text-slate-500">Não informado</span>}
            </Par>
            <Par rotulo="CPF"><span className="font-mono font-semibold">{f.cpf}</span></Par>
            <Par rotulo="Admissão">{f.dataAdmissao ? formatarDataBR(f.dataAdmissao) : <span className="text-slate-500">Não informada</span>}</Par>
          </dl>
        </Card>

        {/* Para onde o dinheiro vai — a informação que quem paga procura junto
            com o salário. */}
        <Card>
          <CardHeader className="mb-3" title="Pagamento" />
          {!temPix && !temConta ? (
            <Typography type="body-sm" color="muted">
              Sem PIX ou conta.{' '}
              <button type="button" onClick={onEditar} className="font-semibold text-blue-600 hover:underline">Informar na ficha</button>
            </Typography>
          ) : (
            <dl className="divide-y divide-slate-100">
              {temPix && (
                <Par rotulo="PIX">
                  <span className="font-mono font-semibold break-all">{pg.pixChave}</span>
                  {pg.pixTipo && <Chip tom="neutro" className="ml-2 align-middle">{pg.pixTipo}</Chip>}
                </Par>
              )}
              {temConta && (
                <Par rotulo="Conta">
                  {[pg.banco, pg.agencia && `Ag. ${pg.agencia}`, pg.conta && `Conta ${pg.conta}`, pg.tipoConta].filter(Boolean).join(' · ')}
                </Par>
              )}
              {pg.titular && (
                <Par rotulo="Titular">
                  {pg.titular} <Chip tom="atencao" className="ml-1 align-middle">conta de terceiro</Chip>
                </Par>
              )}
            </dl>
          )}
        </Card>

        <Card>
          <CardHeader className="mb-3" title="Observações" />
          {f.observacoes ? (
            <Typography type="body-sm" className="max-w-prose whitespace-pre-line leading-relaxed">{f.observacoes}</Typography>
          ) : (
            <Typography type="body-sm" color="muted">
              Nada anotado.{' '}
              <button type="button" onClick={onEditar} className="font-semibold text-blue-600 hover:underline">
                Adicionar observação <ArrowRight size={12} className="inline" aria-hidden />
              </button>
            </Typography>
          )}
        </Card>
      </div>

      {/* Frentes de obra e documentos: listas que crescem, em abas. */}
      <Card semPadding>
        <div className="px-5 pt-4">
          <Titulo papel="bloco" como="h3">Obras e documentos</Titulo>
          <Abas
            className="mt-2"
            rotulo="Obras e documentos do colaborador"
            prefixo={`ficha-${f.id}`}
            ativa={aba}
            onTrocar={setAba}
            abas={[
              { id: 'obras', rotulo: 'Frentes de obra', contagem: frentes.length },
              { id: 'documentos', rotulo: 'Documentos', contagem: documentos.length },
            ]}
          />
        </div>

        {aba === 'obras' && (
          <PainelAba prefixo={`ficha-${f.id}`} ativa={aba} className="px-5 py-4">
            <Typography type="body-xs" color="muted" className="mb-3">Etapas em aberto no cronograma em que esta pessoa é a responsável.</Typography>
            {sobrecarregado && (
              <Aviso tom="negativo" icone={<AlertTriangle size={14} />} className="mb-3">
                Acima de {LIMITE_FRENTES} frentes ao mesmo tempo — redistribua antes de assumir outra.
              </Aviso>
            )}
            {frentes.length === 0 ? (
              <Typography type="body-sm" color="muted">Nenhuma etapa em aberto sob a responsabilidade desta pessoa.</Typography>
            ) : (
              <ul className="-mb-1 divide-y divide-slate-100">
                {frentes.map((w, i) => (
                  <li key={i} className="grid grid-cols-1 items-center gap-x-6 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(160px,220px)]">
                    <div className="min-w-0">
                      <Typography type="body-sm" weight="semibold" className="truncate">{w.etapaNome}</Typography>
                      <Typography type="body-xs" color="muted" className="mt-0.5 flex items-center gap-2">
                        <span className="truncate">{w.projetoNome}</span>
                        <StatusBadge type="etapa" status={w.status} size="sm" />
                      </Typography>
                    </div>
                    <div className="flex items-center gap-3">
                      <Trena percentual={w.progresso} altura={8} rotulo={`Avanço de ${w.etapaNome}`} className="flex-1" />
                      <span className="w-10 text-right font-mono text-sm font-semibold text-slate-800">{Math.round(w.progresso)}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PainelAba>
        )}

        {aba === 'documentos' && (
          <PainelAba prefixo={`ficha-${f.id}`} ativa={aba} className="px-5 py-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <Typography type="body-xs" color="muted" className="max-w-prose">ASO, NR e contrato, em imagem ou PDF. A validade dispara o aviso 30 dias antes.</Typography>
              <div className="flex items-center gap-2">
                <label htmlFor={`doc-validade-${f.id}`} className="text-xs font-semibold text-slate-500">
                  Validade <span className="font-normal">(opcional)</span>
                </label>
                <Input
                  id={`doc-validade-${f.id}`}
                  type="date"
                  tamanho="sm"
                  largura="automatica"
                  disabled={enviandoDoc}
                  value={docValidade}
                  onChange={(e) => setDocValidade(e.target.value)}
                />
                <Button id={`upload-func-doc-btn-${f.id}`} variante="secundario" tamanho="sm" carregando={enviandoDoc} onClick={() => arquivoRef.current?.click()}>
                  {!enviandoDoc && <Upload size={14} />}
                  Anexar
                </Button>
                <input
                  ref={arquivoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                  className="hidden"
                  onChange={aoEscolherArquivo}
                />
              </div>
            </div>
        {documentos.length === 0 ? (
          <Typography type="body-sm" color="muted">Nenhum documento anexado ainda.</Typography>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documentos.map((doc) => {
              const situacao = situacaoValidade(doc.validade);
              const Icone = doc.contentType === 'application/pdf' ? FileText : ImageIcon;
              return (
                <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <Icone size={16} className="shrink-0 text-slate-500" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900" title={doc.nome}>{doc.nome}</span>
                    <span className="text-xs text-slate-500">{doc.tamanho}</span>
                  </span>
                  {validadeEmEdicao === doc.id ? (
                    <form
                      className="flex items-center gap-1"
                      onSubmit={(e) => { e.preventDefault(); salvarValidade(doc.id); }}
                      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setValidadeEmEdicao(null); } }}
                    >
                      <Input
                        type="date"
                        tamanho="sm"
                        largura="automatica"
                        autoFocus
                        aria-label={`Validade de ${doc.nome}`}
                        value={validadeDraft}
                        onChange={(e) => setValidadeDraft(e.target.value)}
                      />
                      <IconButton rotulo="Salvar validade" tom="acao" type="submit"><Check size={14} /></IconButton>
                      <IconButton rotulo="Cancelar" onClick={() => setValidadeEmEdicao(null)}><X size={14} /></IconButton>
                    </form>
                  ) : (
                    <button
                      type="button"
                      title="Alterar validade"
                      aria-label={`${rotuloValidade(doc.validade)} — alterar validade de ${doc.nome}`}
                      onClick={() => { setValidadeDraft(doc.validade ?? ''); setValidadeEmEdicao(doc.id); }}
                      className="group inline-flex items-center gap-1 rounded-lg"
                    >
                      <Chip tom={TOM_VALIDADE[situacao]} ponto className="group-hover:brightness-95">
                        {rotuloValidade(doc.validade)}
                        <Pencil size={12} aria-hidden className="opacity-60" />
                      </Chip>
                    </button>
                  )}
                  <span className="flex items-center">
                    <IconButton rotulo={`Baixar ${doc.nome}`} tom="acao" onClick={() => onDownloadDocumento(doc)}>
                      <Download size={14} />
                    </IconButton>
                    <IconButton
                      rotulo={`Excluir ${doc.nome}`}
                      tom="perigo"
                      onClick={() => confirm({
                        title: 'Excluir documento',
                        confirmLabel: 'Excluir',
                        message: `Remover "${doc.nome}"? Esta operação não pode ser desfeita.`,
                        onConfirm: () => onDeleteDocumento(doc.id),
                      })}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
          </PainelAba>
        )}
      </Card>
    </article>
  );
}
