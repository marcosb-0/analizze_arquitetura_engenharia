import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  HardHat,
  MapPin,
  Calendar,
  UserCog,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Check,
  RefreshCw,
  Wallet,
  ListChecks
} from 'lucide-react';
import {
  Proposta,
  Cliente,
  Funcionario,
  CategoriaCusto,
  ConversaoObraPayload,
  ConversaoEtapaInput,
  ConversaoItemInput
} from '../types';
import Spinner from './Spinner';

interface ConverterObraWizardProps {
  proposta: Proposta;
  cliente?: Cliente;
  funcionarios: Funcionario[];
  onCancel: () => void;
  onConfirm: (payload: ConversaoObraPayload) => Promise<boolean>;
}

const CATEGORIAS: CategoriaCusto[] = [
  'Materiais', 'Mão de Obra', 'Equipamentos', 'Terceiros', 'Deslocamentos', 'Administração', 'Contingências',
];

const STAGE_NAMES = ['Fundação / Terraplanagem', 'Estrutura / Alvenaria', 'Instalações', 'Acabamentos', 'Entrega'];
const STAGE_FRACS = [0, 0.15, 0.45, 0.7, 0.9, 1];

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const toISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toISO(d);
};

// Staggered stage boundaries across [inicio, fim] — mirrors fn_criar_projeto_manual.
function buildStages(inicio: string, fim: string, responsavelId: string): ConversaoEtapaInput[] {
  const start = new Date(inicio + 'T00:00:00');
  const end = new Date(fim + 'T00:00:00');
  const totalDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
  const dateAt = (frac: number) => addDays(inicio, Math.floor(totalDays * frac));
  return STAGE_NAMES.map((nome, i) => ({
    ref: i,
    nome,
    dataInicio: dateAt(STAGE_FRACS[i]),
    dataFim: dateAt(STAGE_FRACS[i + 1]),
    responsavelId: responsavelId || undefined,
  }));
}

// Default budget template — same category split as the old fixed conversion,
// but every value is editable and can be re-mapped to a different etapa.
function buildDefaultItens(valor: number): ConversaoItemInput[] {
  const mk = (categoria: CategoriaCusto, descricao: string, pct: number, etapaRef: number | null): ConversaoItemInput => ({
    categoria, descricao, valorOrcado: Math.round(valor * pct * 100) / 100, valorContratado: Math.round(valor * pct * 100) / 100, etapaRef,
  });
  return [
    mk('Materiais', 'Insumos básicos de alvenaria e fechamento', 0.35, 1),
    mk('Mão de Obra', 'Execução de fundações e estrutura', 0.30, 1),
    mk('Equipamentos', 'Locações auxiliares e caçambas', 0.10, 0),
    mk('Terceiros', 'Instalações complementares', 0.15, 2),
    mk('Administração', 'Segurança NR18 e EPIs gerais', 0.05, 4),
    mk('Contingências', 'Fundo reserva', 0.05, null),
  ];
}

export default function ConverterObraWizard({ proposta, cliente, funcionarios, onCancel, onConfirm }: ConverterObraWizardProps) {
  const today = toISO(new Date());

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nome, setNome] = useState(`Obra: ${proposta.descricao}`);
  const [endereco, setEndereco] = useState(cliente?.endereco ?? '');
  const [dataInicio, setDataInicio] = useState(today);
  const [dataFim, setDataFim] = useState(addDays(today, 180));
  const [responsavelId, setResponsavelId] = useState(funcionarios[0]?.id ?? '');

  const [itens, setItens] = useState<ConversaoItemInput[]>(() => buildDefaultItens(proposta.valorEstimado));
  const [etapas, setEtapas] = useState<ConversaoEtapaInput[]>(() => buildStages(today, addDays(today, 180), funcionarios[0]?.id ?? ''));

  const totalOrcado = useMemo(() => itens.reduce((s, it) => s + (it.valorOrcado || 0), 0), [itens]);
  const diffProposta = totalOrcado - proposta.valorEstimado;

  const redistribuirDatas = () => setEtapas(buildStages(dataInicio, dataFim, responsavelId));

  const updateItem = (idx: number, patch: Partial<ConversaoItemInput>) =>
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => setItens((prev) => prev.filter((_, i) => i !== idx));
  const addItem = () =>
    setItens((prev) => [...prev, { categoria: 'Materiais', descricao: '', valorOrcado: 0, valorContratado: 0, etapaRef: null }]);

  const updateEtapa = (idx: number, patch: Partial<ConversaoEtapaInput>) =>
    setEtapas((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  const validateStep1 = (): string | null => {
    if (!nome.trim()) return 'Informe o nome da obra.';
    if (!dataInicio || !dataFim) return 'Informe as datas de início e de entrega.';
    if (dataFim < dataInicio) return 'A data de entrega não pode ser anterior à de início.';
    return null;
  };

  const goToStep2 = () => {
    const err = validateStep1();
    if (err) { setError(err); return; }
    setError(null);
    // Keep stage dates aligned with the obra window the user just set.
    setEtapas((prev) => (prev.length ? prev : buildStages(dataInicio, dataFim, responsavelId)));
    setStep(2);
  };

  const handleConfirm = async () => {
    const err = validateStep1();
    if (err) { setError(err); setStep(1); return; }
    setError(null);
    setSaving(true);
    const ok = await onConfirm({
      nome: nome.trim(),
      endereco: endereco.trim(),
      dataInicio,
      dataFim,
      responsavelId: responsavelId || undefined,
      etapas,
      itens: itens.map((it) => ({ ...it, valorContratado: it.valorOrcado })),
    });
    setSaving(false);
    // On success the parent closes the wizard; on failure it stays open (toast shown).
    if (!ok) setError('Não foi possível criar a obra. Verifique os dados e tente novamente.');
  };

  const stepMeta = [
    { n: 1, label: 'Dados da Obra', icon: HardHat },
    { n: 2, label: 'Orçamento', icon: Wallet },
    { n: 3, label: 'Cronograma', icon: ListChecks },
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><HardHat size={18} /></div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-none">Iniciar Obra a partir da Proposta</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                {proposta.numero} · {cliente?.nome ?? 'Cliente'} · {fmtBRL(proposta.valorEstimado)}
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 font-bold transition text-lg leading-none">✕</button>
        </div>

        {/* Stepper */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
          {stepMeta.map((s, i) => {
            const Icon = s.icon;
            const active = step === s.n;
            const done = step > s.n;
            return (
              <React.Fragment key={s.n}>
                <div className={`flex items-center gap-1.5 text-xs font-bold ${active ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-slate-400'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${active ? 'border-blue-300 bg-blue-50' : done ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                    {done ? <Check size={13} /> : <Icon size={13} />}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < stepMeta.length - 1 && <div className="flex-1 h-px bg-slate-150" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 text-left">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1"><HardHat size={13} /> Nome da obra</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1"><MapPin size={13} /> Endereço do canteiro</label>
                <input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Endereço da obra" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1"><Calendar size={13} /> Início</label>
                  <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1"><Calendar size={13} /> Entrega</label>
                  <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1"><UserCog size={13} /> Responsável interno</label>
                <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none">
                  <option value="">A definir</option>
                  {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome} — {f.cargo}</option>)}
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Ajuste as linhas de custo e a etapa que cada uma financia. Os valores partem da proposta, mas você pode editá-los livremente.
              </p>
              <div className="border border-slate-150 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left font-bold px-2 py-2">Categoria</th>
                      <th className="text-left font-bold px-2 py-2">Descrição</th>
                      <th className="text-right font-bold px-2 py-2 w-32">Valor orçado</th>
                      <th className="text-left font-bold px-2 py-2 w-40">Etapa vinculada</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itens.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="px-2 py-1.5">
                          <select value={it.categoria} onChange={(e) => updateItem(idx, { categoria: e.target.value as CategoriaCusto })} className="w-full px-1.5 py-1 border border-slate-200 rounded bg-white outline-none focus:border-blue-300">
                            {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={it.descricao} onChange={(e) => updateItem(idx, { descricao: e.target.value })} placeholder="Descrição" className="w-full px-1.5 py-1 border border-slate-200 rounded outline-none focus:border-blue-300" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min={0} step="0.01" value={it.valorOrcado} onChange={(e) => updateItem(idx, { valorOrcado: parseFloat(e.target.value) || 0 })} className="w-full px-1.5 py-1 border border-slate-200 rounded text-right font-mono outline-none focus:border-blue-300" />
                        </td>
                        <td className="px-2 py-1.5">
                          <select value={it.etapaRef ?? ''} onChange={(e) => updateItem(idx, { etapaRef: e.target.value === '' ? null : parseInt(e.target.value, 10) })} className="w-full px-1.5 py-1 border border-slate-200 rounded bg-white outline-none focus:border-blue-300">
                            <option value="">Sem vínculo</option>
                            {etapas.map((et) => <option key={et.ref} value={et.ref}>{et.nome}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button onClick={() => removeItem(idx)} className="text-slate-300 hover:text-rose-500 transition"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between">
                <button onClick={addItem} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition"><Plus size={14} /> Adicionar linha</button>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-800 font-mono">Total: {fmtBRL(totalOrcado)}</div>
                  <div className={`text-[11px] font-mono ${Math.abs(diffProposta) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {Math.abs(diffProposta) < 0.01 ? 'Igual ao valor da proposta' : `${diffProposta > 0 ? '+' : ''}${fmtBRL(diffProposta)} vs. proposta`}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Itens vinculados a uma etapa avançam automaticamente conforme as medições daquela etapa. Itens "Sem vínculo" ficam no orçamento sem serem movidos por medição.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Revise as etapas do cronograma. Datas e responsáveis são editáveis.</p>
                <button onClick={redistribuirDatas} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition"><RefreshCw size={13} /> Redistribuir datas</button>
              </div>
              <div className="border border-slate-150 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left font-bold px-2 py-2">Etapa</th>
                      <th className="text-left font-bold px-2 py-2 w-32">Início</th>
                      <th className="text-left font-bold px-2 py-2 w-32">Fim</th>
                      <th className="text-left font-bold px-2 py-2 w-40">Responsável</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {etapas.map((et, idx) => (
                      <tr key={et.ref} className="hover:bg-slate-50/50">
                        <td className="px-2 py-1.5">
                          <input value={et.nome} onChange={(e) => updateEtapa(idx, { nome: e.target.value })} className="w-full px-1.5 py-1 border border-slate-200 rounded outline-none focus:border-blue-300" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="date" value={et.dataInicio} onChange={(e) => updateEtapa(idx, { dataInicio: e.target.value })} className="w-full px-1.5 py-1 border border-slate-200 rounded font-mono outline-none focus:border-blue-300" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="date" value={et.dataFim} onChange={(e) => updateEtapa(idx, { dataFim: e.target.value })} className="w-full px-1.5 py-1 border border-slate-200 rounded font-mono outline-none focus:border-blue-300" />
                        </td>
                        <td className="px-2 py-1.5">
                          <select value={et.responsavelId ?? ''} onChange={(e) => updateEtapa(idx, { responsavelId: e.target.value || undefined })} className="w-full px-1.5 py-1 border border-slate-200 rounded bg-white outline-none focus:border-blue-300">
                            <option value="">A definir</option>
                            {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-50 border border-slate-150 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Itens</div><div className="text-sm font-bold text-slate-800">{itens.length}</div></div>
                <div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Etapas</div><div className="text-sm font-bold text-slate-800">{etapas.length}</div></div>
                <div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Total orçado</div><div className="text-sm font-bold text-slate-800 font-mono">{fmtBRL(totalOrcado)}</div></div>
                <div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Vinculados</div><div className="text-sm font-bold text-slate-800">{itens.filter((it) => it.etapaRef !== null).length}/{itens.length}</div></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-rose-600 font-semibold min-h-[16px]">{error}</div>
          <div className="flex items-center gap-2">
            {step > 1 ? (
              <button onClick={() => { setError(null); setStep((s) => (s - 1) as 1 | 2 | 3); }} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg transition disabled:opacity-50">
                <ArrowLeft size={13} /> Voltar
              </button>
            ) : (
              <button onClick={onCancel} disabled={saving} className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg transition disabled:opacity-50">Cancelar</button>
            )}

            {step === 1 && (
              <button onClick={goToStep2} className="flex items-center gap-1 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-sm">Avançar <ArrowRight size={13} /></button>
            )}
            {step === 2 && (
              <button onClick={() => setStep(3)} className="flex items-center gap-1 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-sm">Avançar <ArrowRight size={13} /></button>
            )}
            {step === 3 && (
              <button onClick={handleConfirm} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-sm disabled:opacity-60">
                {saving ? <><Spinner size={13} /> Criando obra…</> : <><Check size={14} /> Criar obra</>}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
