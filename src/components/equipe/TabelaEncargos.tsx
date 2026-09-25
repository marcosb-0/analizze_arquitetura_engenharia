import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { GrupoEncargo, RubricaEncargo } from '../../types';
import { erroNumero, formatoPct, numero, type Nova, type Rascunho, type Rascunhos } from './rascunhoEncargos';
import { calcularRubricas, type RubricaCalculada, type TotaisEncargos } from '../../lib/encargos';
import { useFeedback } from '../FeedbackContext';
import { Abas, Button, Field, Input, PainelAba, Select, TableWrap, Td, Th } from '../ui';

/**
 * A tabela de encargos, rubrica a rubrica, CONTROLADA pelo pai.
 *
 * Era dona do próprio rascunho e tinha o próprio "Salvar tabela", separado do
 * "Salvar parâmetros de custo" que gravava o modo. Os dois salvam uma decisão
 * só — e o guarda do banco exige a tabela completa ANTES de o modo virar
 * 'Rubricas' e o modo 'Direto' ANTES de a tabela poder ficar incompleta. A
 * ordem certa não estava escrita em lugar nenhum. Agora o rascunho mora em
 * `ParametrosMaoDeObra`, que salva as duas coisas na ordem que o guarda aceita.
 */

const GRUPOS: readonly GrupoEncargo[] = ['A', 'B', 'C', 'D'];
const TITULOS: Record<GrupoEncargo, string> = { A: 'Obrigações sociais', B: 'Incidência do grupo A', C: 'Rescisórios', D: 'Reincidências calculadas' };
const FORMULAS: Record<string, string> = {
  'A*B': 'Total A × Total B',
  'A*B-A1*B4': 'Total A × Total B − INSS × 13º',
  'A*C2+A8*C1': 'Total A × Aviso trabalhado + FGTS × Aviso indenizado',
};
interface Props {
  rubricas: RubricaEncargo[];
  editadas: RubricaEncargo[];
  rascunho: Rascunhos;
  totais: TotaisEncargos;
  pendentes: RubricaEncargo[];
  /** Há alteração não salva: criar/excluir recarrega a tabela e a descartaria. */
  alterado: boolean;
  /** Papel sem escrita (financeiro) vê a tabela, mas não a edita. */
  editavel: boolean;
  onEditar: (codigo: string, patch: Partial<Rascunho>) => void;
  onCreate: (nova: Nova) => Promise<boolean>;
  onDelete: (codigo: string) => Promise<boolean>;
}

export default function TabelaEncargos({ rubricas, editadas, rascunho, totais, pendentes, alterado, editavel, onEditar, onCreate, onDelete }: Props) {
  const { confirm } = useFeedback();
  const [grupo, setGrupo] = useState<GrupoEncargo>('A');
  const [novoAberto, setNovoAberto] = useState(false);
  const [criando, setCriando] = useState(false);
  const [novoGrupo, setNovoGrupo] = useState<'A' | 'B' | 'C'>('A');
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [h, setH] = useState('');
  const [m, setM] = useState('');
  const [erroCriacao, setErroCriacao] = useState('');

  const calculadas = calcularRubricas(editadas);

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
    if (r.grupo === 'D') return formatoPct(regime === 'h' ? r.valorHorista : r.valorMensalista);
    const d = rascunho[r.codigo];
    if (!d) return null;
    const incide = regime === 'h' ? d.aplicaH : d.aplicaM;
    const valor = regime === 'h' ? d.h : d.m;
    if (!editavel) return incide ? formatoPct(numero(valor)) : <span className="text-2xs text-slate-600">Não incide</span>;
    const erro = incide ? erroNumero(valor) : null;
    const nome = regime === 'h' ? 'horista' : 'mensalista';
    return <div className="flex flex-col items-end gap-1">
      <label className="flex items-center gap-1.5 text-2xs text-slate-600 whitespace-nowrap">
        <input type="checkbox" checked={incide} className="size-4 accent-blue-600"
          onChange={(e) => onEditar(r.codigo, regime === 'h' ? { aplicaH: e.target.checked } : { aplicaM: e.target.checked })} />
        Incide para {nome}
      </label>
      {incide ? <><Input aria-label={`${r.descricao} — ${nome} (%)`} aria-invalid={!!erro || undefined}
        value={valor} onChange={(e) => onEditar(r.codigo, regime === 'h' ? { h: e.target.value } : { m: e.target.value })}
        disabled={!d.ativo} inputMode="decimal" placeholder="—" tamanho="sm" fundo="suave" largura="percentual" mono className="text-right" />
        {erro && <span role="alert" className="text-2xs text-rose-600 text-right">{erro}</span>}</>
        : <span className="text-2xs text-slate-600">Não incide</span>}
    </div>;
  }

  // O subtotal no rótulo da aba devolve a leitura A + B + C + D que o
  // `<Select>` de antes escondia — é ela que se confere contra a tabela oficial.
  const abas = GRUPOS.map((g) => {
    const pend = pendentes.filter((r) => r.grupo === g).length;
    return {
      id: g,
      rotulo: <>Grupo {g} <span className="font-mono font-normal text-slate-500">{formatoPct(totais[g].horista)} · {formatoPct(totais[g].mensalista)}</span></>,
      contagem: pend > 0 ? pend : undefined,
    };
  });

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <p className="text-2xs text-slate-600">Subtotais por grupo: horista · mensalista. O número ao lado indica rubricas pendentes.</p>
      {editavel && <Button variante="secundario" tamanho="sm" disabled={alterado} onClick={() => setNovoAberto((v) => !v)}><Plus size={14} /> Nova rubrica</Button>}
    </div>
    {editavel && alterado && <p className="text-2xs text-slate-600">Salve as alterações antes de criar ou excluir uma rubrica.</p>}
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
    <Abas abas={abas} ativa={grupo} onTrocar={setGrupo} rotulo="Grupos de encargos" prefixo="encargos" />
    <PainelAba prefixo="encargos" ativa={grupo}>
      <TableWrap><thead><tr><Th>Código</Th><Th>Rubrica</Th><Th align="right">Horista</Th><Th align="right">Mensalista</Th><Th align="center">Ativa</Th>{editavel && <Th>Ações</Th>}</tr></thead>
        <tbody><tr><Td colSpan={editavel ? 6 : 5} className="bg-slate-50 font-semibold text-slate-700">Grupo {grupo} — {TITULOS[grupo]}</Td></tr>
          {calculadas.filter((r) => r.grupo === grupo).map((r) => <tr key={r.codigo} className={r.ativo ? '' : 'opacity-60'}>
            <Td mono>{r.codigo}</Td>
            <Td>{r.grupo === 'D' || !editavel ? <>{r.descricao}{r.grupo === 'D' && <span className="block text-2xs text-slate-500">{FORMULAS[r.formula ?? '']}</span>}</>
              : <Input aria-label={`Descrição de ${r.codigo}`} value={rascunho[r.codigo]?.descricao ?? r.descricao}
                  onChange={(e) => onEditar(r.codigo, { descricao: e.target.value })} maxLength={120} tamanho="sm" fundo="suave" />}</Td>
            <Td align="right">{celula(r, 'h')}</Td><Td align="right">{celula(r, 'm')}</Td>
            <Td align="center"><input type="checkbox" checked={r.ativo} disabled={!editavel} onChange={(e) => onEditar(r.codigo, { ativo: e.target.checked })}
              aria-label={`${r.descricao} — rubrica ativa`} className="size-4 accent-blue-600" /></Td>
            {editavel && <Td>{!r.sistema && <Button variante="fantasma" tamanho="sm" disabled={alterado}
              onClick={() => confirm({ title: 'Excluir rubrica adicional', confirmLabel: 'Excluir rubrica',
                message: `Excluir ${r.codigo} — ${r.descricao}? Os custos vinculados serão atualizados.`,
                onConfirm: async () => { await onDelete(r.codigo); } })}>
              <Trash2 size={13} /> Excluir</Button>}</Td>}
          </tr>)}</tbody>
        <tfoot><tr><Td /><Td className="font-bold text-slate-900">Total dos encargos</Td>
          <Td align="right" mono className="font-bold text-slate-900">{formatoPct(totais.total.horista)}</Td>
          <Td align="right" mono className="font-bold text-slate-900">{formatoPct(totais.total.mensalista)}</Td><Td />{editavel && <Td />}</tr></tfoot>
      </TableWrap>
    </PainelAba>
    <Field label="Fórmula de D1" id="formula-encargo-d1" hint="Escolha a fórmula compatível com a incidência adotada para o INSS (A1). A troca não é automática.">
      {(p) => <Select {...p} disabled={!editavel} value={rascunho.D1?.formula ?? 'A*B'} onChange={(e) => onEditar('D1', { formula: e.target.value as RubricaEncargo['formula'] })}>
        <option value="A*B">A × B</option><option value="A*B-A1*B4">A × B − INSS × 13º</option>
      </Select>}
    </Field>
  </div>;
}
