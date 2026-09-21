import { useEffect, useMemo, useState } from 'react';
import { Calculator, Plus, Trash2 } from 'lucide-react';
import { GrupoEncargo, RubricaEncargo } from '../../types';
import { calcularRubricas, totaisEncargos, type RubricaCalculada } from '../../lib/encargos';
import { useFeedback } from '../FeedbackContext';
import { Aviso, Button, Field, Input, Secao, Select, TableWrap, Td, Th } from '../ui';

type Nova = Pick<RubricaEncargo, 'codigo' | 'grupo' | 'descricao' | 'percentualHorista' | 'percentualMensalista' | 'aplicaHorista' | 'aplicaMensalista'>;
type Rascunho = { h: string; m: string; descricao: string; ativo: boolean; aplicaH: boolean; aplicaM: boolean; formula: RubricaEncargo['formula'] };
interface Props {
  rubricas: RubricaEncargo[];
  encargosModo: 'Direto' | 'Rubricas';
  onSave: (rubricas: RubricaEncargo[]) => Promise<boolean>;
  onCreate: (nova: Nova) => Promise<boolean>;
  onDelete: (codigo: string) => Promise<boolean>;
}

const GRUPOS: readonly GrupoEncargo[] = ['A', 'B', 'C', 'D'];
const TITULOS: Record<GrupoEncargo, string> = { A: 'Obrigações sociais', B: 'Incidência do grupo A', C: 'Rescisórios', D: 'Reincidências calculadas' };
const FORMULAS: Record<string, string> = {
  'A*B': 'Total A × Total B',
  'A*B-A1*B4': 'Total A × Total B − INSS × 13º',
  'A*C2+A8*C1': 'Total A × Aviso trabalhado + FGTS × Aviso indenizado',
};
const texto = (n: number | null) => n == null ? '' : String(n).replace('.', ',');
const formato = (n: number | null) => n == null ? '—' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
function numero(s: string): number | null {
  const v = s.trim();
  return /^\d+(?:[,.]\d{1,4})?$/.test(v) ? Number(v.replace(',', '.')) : null;
}
function erroNumero(s: string): string | null {
  if (!s.trim()) return null;
  const n = numero(s);
  if (n === null) return 'Use número com até 4 casas decimais.';
  return n > 300 ? 'Máximo: 300%.' : null;
}

export default function TabelaEncargos({ rubricas, encargosModo, onSave, onCreate, onDelete }: Props) {
  const { confirm } = useFeedback();
  const [rascunho, setRascunho] = useState<Record<string, Rascunho>>({});
  const [grupo, setGrupo] = useState<GrupoEncargo>('A');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [novoAberto, setNovoAberto] = useState(false);
  const [criando, setCriando] = useState(false);
  const [novoGrupo, setNovoGrupo] = useState<'A' | 'B' | 'C'>('A');
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [h, setH] = useState('');
  const [m, setM] = useState('');
  const [erroCriacao, setErroCriacao] = useState('');

  useEffect(() => {
    const inicial: Record<string, Rascunho> = {};
    for (const r of rubricas) inicial[r.codigo] = {
      h: texto(r.percentualHorista), m: texto(r.percentualMensalista), descricao: r.descricao,
      ativo: r.ativo, aplicaH: r.aplicaHorista, aplicaM: r.aplicaMensalista, formula: r.formula,
    };
    setRascunho(inicial);
  }, [rubricas]);

  const editadas = useMemo(() => rubricas.map((r) => {
    const d = rascunho[r.codigo];
    return d ? { ...r, descricao: d.descricao, ativo: d.ativo, formula: d.formula,
      aplicaHorista: d.aplicaH, aplicaMensalista: d.aplicaM,
      percentualHorista: r.grupo === 'D' || !d.aplicaH ? null : numero(d.h),
      percentualMensalista: r.grupo === 'D' || !d.aplicaM ? null : numero(d.m) } : r;
  }), [rubricas, rascunho]);
  const calculadas = useMemo(() => calcularRubricas(editadas), [editadas]);
  const totais = useMemo(() => totaisEncargos(editadas), [editadas]);
  const pendentes = editadas.filter((r) => r.ativo && !r.formula &&
    ((r.aplicaHorista && r.percentualHorista === null) || (r.aplicaMensalista && r.percentualMensalista === null)));
  const invalido = rubricas.some((r) => {
    const d = rascunho[r.codigo];
    return d && (d.descricao.trim().length < 1 || d.descricao.trim().length > 120 ||
      (d.aplicaH && !!erroNumero(d.h)) || (d.aplicaM && !!erroNumero(d.m)));
  });
  const alterado = editadas.some((r, i) => {
    const o = rubricas[i];
    return r.descricao !== o.descricao || r.ativo !== o.ativo || r.formula !== o.formula ||
      r.aplicaHorista !== o.aplicaHorista || r.aplicaMensalista !== o.aplicaMensalista ||
      r.percentualHorista !== o.percentualHorista || r.percentualMensalista !== o.percentualMensalista;
  });

  const editar = (chave: string, patch: Partial<Rascunho>) => {
    setRascunho((prev) => ({ ...prev, [chave]: { ...prev[chave], ...patch } }));
    setSalvo(false);
  };
  const salvar = async () => {
    if (!alterado || invalido || salvando) return;
    setSalvando(true);
    setSalvo(await onSave(editadas));
    setSalvando(false);
  };
  const criar = async () => {
    const chave = codigo.trim().toUpperCase();
    if (!new RegExp(`^${novoGrupo}[1-9][0-9]{0,3}$`).test(chave)) setErroCriacao(`Use um código como ${novoGrupo}10.`);
    else if (rubricas.some((r) => r.codigo === chave)) setErroCriacao('Este código já existe.');
    else if (!descricao.trim() || descricao.trim().length > 120) setErroCriacao('Informe uma descrição de até 120 caracteres.');
    else if (erroNumero(h) || erroNumero(m)) setErroCriacao('Corrija os percentuais: 0 a 300, com até 4 casas decimais.');
    else {
      setCriando(true);
      const ok = await onCreate({ codigo: chave, grupo: novoGrupo, descricao: descricao.trim(),
        percentualHorista: numero(h), percentualMensalista: numero(m), aplicaHorista: true, aplicaMensalista: true });
      setCriando(false);
      if (ok) { setNovoAberto(false); setCodigo(''); setDescricao(''); setH(''); setM(''); setErroCriacao(''); setGrupo(novoGrupo); }
    }
  };

  function celula(r: RubricaCalculada, regime: 'h' | 'm') {
    if (r.grupo === 'D') return formato(regime === 'h' ? r.valorHorista : r.valorMensalista);
    const d = rascunho[r.codigo];
    if (!d) return null;
    const incide = regime === 'h' ? d.aplicaH : d.aplicaM;
    const valor = regime === 'h' ? d.h : d.m;
    const erro = incide ? erroNumero(valor) : null;
    const nome = regime === 'h' ? 'horista' : 'mensalista';
    return <div className="flex flex-col items-end gap-1">
      <label className="flex items-center gap-1.5 text-2xs text-slate-600 whitespace-nowrap">
        <input type="checkbox" checked={incide} className="size-4 accent-blue-600"
          onChange={(e) => editar(r.codigo, regime === 'h' ? { aplicaH: e.target.checked } : { aplicaM: e.target.checked })} />
        Incide para {nome}
      </label>
      {incide ? <><Input aria-label={`${r.descricao} — ${nome} (%)`} aria-invalid={!!erro || undefined}
        value={valor} onChange={(e) => editar(r.codigo, regime === 'h' ? { h: e.target.value } : { m: e.target.value })}
        disabled={!d.ativo} inputMode="decimal" placeholder="—" tamanho="sm" fundo="suave" largura="percentual" mono className="text-right" />
        {erro && <span role="alert" className="text-2xs text-rose-600 text-right">{erro}</span>}</>
        : <span className="text-2xs text-slate-600">Não incide</span>}
    </div>;
  }

  return <Secao id="tabela-encargos" icone={<Calculator size={16} />} titulo="Tabela de encargos sociais"
    descricao="Revise as rubricas antes de usar os totais no custo-hora."
    acoes={<Button onClick={salvar} carregando={salvando} disabled={!alterado || invalido}>Salvar tabela</Button>}>
    <div className="space-y-4">
      <Aviso tom={encargosModo === 'Rubricas' ? 'positivo' : 'informativo'}>
        {encargosModo === 'Rubricas'
          ? 'Em uso: os totais desta tabela alimentam o custo-hora. Alterações entram após Salvar tabela.'
          : 'Somente conferência: o custo-hora ainda usa o percentual direto. Complete a tabela e salve a escolha acima para ativá-la.'}
      </Aviso>
      {pendentes.length > 0 && <Aviso tom="atencao">{pendentes.length} {pendentes.length === 1 ? 'rubrica ativa incompleta' : 'rubricas ativas incompletas'}.
        Preencha, marque “não incide” no regime correspondente ou desative. Em branco não é 0%.</Aviso>}
      {salvo && <p role="status" className="text-xs text-emerald-700">Tabela salva. Os custos vinculados foram atualizados.</p>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Grupo exibido" id="filtro-grupo-encargos" className="min-w-[220px]">
          {(props) => <Select {...props} value={grupo} onChange={(e) => setGrupo(e.target.value as GrupoEncargo)}>
            {GRUPOS.map((g) => <option key={g} value={g}>Grupo {g} — {TITULOS[g]} ({pendentes.filter((r) => r.grupo === g).length} pendentes)</option>)}
          </Select>}
        </Field>
        <Button variante="secundario" disabled={alterado} onClick={() => setNovoAberto((v) => !v)}><Plus size={14} /> Nova rubrica</Button>
      </div>
      {alterado && <p className="text-2xs text-slate-600">Salve as alterações antes de criar ou excluir uma rubrica.</p>}
      {novoAberto && <div className="space-y-3 border-y border-slate-200 py-4">
        <p className="text-xs font-semibold text-slate-800">Adicionar rubrica própria</p>
        <p className="text-2xs text-slate-600">Ela começa inativa. Código e grupo não podem ser alterados depois.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Grupo" id="novo-encargo-grupo">{(p) => <Select {...p} value={novoGrupo} onChange={(e) => setNovoGrupo(e.target.value as 'A' | 'B' | 'C')}>
            <option value="A">A — obrigações sociais</option><option value="B">B — incidência do grupo A</option><option value="C">C — rescisórios</option>
          </Select>}</Field>
          <Field label="Código" id="novo-encargo-codigo" hint={`Exemplo: ${novoGrupo}10`}>{(p) => <Input {...p} value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={5} />}</Field>
          <Field label="Descrição" id="novo-encargo-descricao" className="sm:col-span-2">{(p) => <Input {...p} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={120} />}</Field>
          <Field label="Horista (%)" id="novo-encargo-horista" hint="Pode ficar em branco enquanto inativa.">{(p) => <Input {...p} value={h} onChange={(e) => setH(e.target.value)} inputMode="decimal" />}</Field>
          <Field label="Mensalista (%)" id="novo-encargo-mensalista" hint="Zero é diferente de não incidir.">{(p) => <Input {...p} value={m} onChange={(e) => setM(e.target.value)} inputMode="decimal" />}</Field>
        </div>
        {erroCriacao && <p role="alert" className="text-xs text-rose-600">{erroCriacao}</p>}
        <div className="flex gap-2"><Button onClick={criar} carregando={criando}>Criar rubrica</Button><Button variante="fantasma" onClick={() => setNovoAberto(false)}>Cancelar</Button></div>
      </div>}
      <TableWrap><thead><tr><Th>Código</Th><Th>Rubrica</Th><Th align="right">Horista</Th><Th align="right">Mensalista</Th><Th align="center">Ativa</Th><Th>Ações</Th></tr></thead>
        <tbody><tr><Td colSpan={6} className="bg-slate-50 font-semibold text-slate-700">Grupo {grupo} — {TITULOS[grupo]}</Td></tr>
          {calculadas.filter((r) => r.grupo === grupo).map((r) => <tr key={r.codigo} className={r.ativo ? '' : 'opacity-60'}>
            <Td mono>{r.codigo}</Td>
            <Td>{r.grupo === 'D' ? <>{r.descricao}<span className="block text-2xs text-slate-500">{FORMULAS[r.formula ?? '']}</span></>
              : <Input aria-label={`Descrição de ${r.codigo}`} value={rascunho[r.codigo]?.descricao ?? r.descricao}
                  onChange={(e) => editar(r.codigo, { descricao: e.target.value })} maxLength={120} tamanho="sm" fundo="suave" />}</Td>
            <Td align="right">{celula(r, 'h')}</Td><Td align="right">{celula(r, 'm')}</Td>
            <Td align="center"><input type="checkbox" checked={r.ativo} onChange={(e) => editar(r.codigo, { ativo: e.target.checked })}
              aria-label={`${r.descricao} — rubrica ativa`} className="size-4 accent-blue-600" /></Td>
            <Td>{!r.sistema && <Button variante="fantasma" tamanho="sm" disabled={alterado}
              onClick={() => confirm({ title: 'Excluir rubrica adicional', confirmLabel: 'Excluir rubrica',
                message: `Excluir ${r.codigo} — ${r.descricao}? Os custos vinculados serão atualizados.`,
                onConfirm: async () => { await onDelete(r.codigo); } })}>
              <Trash2 size={13} /> Excluir</Button>}</Td>
          </tr>)}</tbody>
        <tfoot><tr><Td /><Td className="font-bold text-slate-900">Total dos encargos</Td>
          <Td align="right" mono className="font-bold text-slate-900">{formato(totais.total.horista)}</Td>
          <Td align="right" mono className="font-bold text-slate-900">{formato(totais.total.mensalista)}</Td><Td /><Td /></tr></tfoot>
      </TableWrap>
      <Field label="Fórmula de D1" id="formula-encargo-d1" hint="Escolha a fórmula compatível com a incidência adotada para o INSS (A1). A troca não é automática.">
        {(p) => <Select {...p} value={rascunho.D1?.formula ?? 'A*B'} onChange={(e) => editar('D1', { formula: e.target.value as RubricaEncargo['formula'] })}>
          <option value="A*B">A × B</option><option value="A*B-A1*B4">A × B − INSS × 13º</option>
        </Select>}
      </Field>
      <div className="flex items-center justify-end gap-3">
        {alterado && !invalido && <span className="text-2xs text-slate-600">Alterações não salvas</span>}
        {invalido && <span role="alert" className="text-2xs text-rose-600">Corrija os campos destacados.</span>}
        <Button onClick={salvar} carregando={salvando} disabled={!alterado || invalido}>Salvar tabela</Button>
      </div>
    </div>
  </Secao>;
}
