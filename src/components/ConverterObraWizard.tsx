import React, { useMemo, useState } from 'react';
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
  ConversaoItemInput,
  ItemProposta
} from '../types';
import Spinner from './Spinner';
import { Button, Input, Modal, Select } from './ui';

interface ConverterObraWizardProps {
  proposta: Proposta;
  /** Itens orçados da proposta. Quando existem, substituem o rateio por percentuais. */
  itensProposta: ItemProposta[];
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

/**
 * Herda o orçamento real da proposta: cada item vira um item de obra COM a
 * procedência do catálogo, a quantidade e o ajuste negociado. É isso que faz a
 * RPC criar também as linhas de `insumos_projeto`, em vez de a conversão jogar
 * fora o quantitativo que originou o preço.
 *
 * O BDI é distribuído proporcionalmente sobre os itens, para que a soma da obra
 * feche com o valor vendido ao cliente.
 */
function itensDaProposta(itens: ItemProposta[], bdiPercentual: number): ConversaoItemInput[] {
  const fatorBdi = 1 + bdiPercentual / 100;
  return itens.map((item, i) => {
    const precoComBdi = Math.round(item.precoUnitario * fatorBdi * 100) / 100;
    return {
      categoria: item.categoria,
      descricao: `${item.descricao} (${item.quantidade} ${item.unidade})`,
      valorOrcado: Math.round(item.quantidade * precoComBdi * 100) / 100,
      // Contratação segue sendo decisão explícita — nunca igualada ao orçado.
      valorContratado: 0,
      etapaRef: i < 2 ? 1 : null,
      catalogoInsumoId: item.catalogoInsumoId,
      quantidade: item.quantidade,
      // A base carregada para a obra já inclui o BDI: é o preço efetivamente
      // vendido. O ajuste original da proposta fica preservado no motivo.
      precoUnitarioBase: precoComBdi,
      ajuste: {
        tipo: 'Nenhum' as const,
        valor: 0,
        motivo: item.ajuste.motivo ?? (bdiPercentual !== 0 ? `Preço de venda (BDI ${bdiPercentual}%)` : undefined),
      },
      fornecedorId: item.fornecedorId,
    };
  });
}

export default function ConverterObraWizard({ proposta, itensProposta, cliente, funcionarios, onCancel, onConfirm }: ConverterObraWizardProps) {
  const today = toISO(new Date());

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nome, setNome] = useState(`Obra: ${proposta.descricao}`);
  const [endereco, setEndereco] = useState(cliente?.endereco ?? '');
  const [dataInicio, setDataInicio] = useState(today);
  const [dataFim, setDataFim] = useState(addDays(today, 180));
  const [responsavelId, setResponsavelId] = useState(funcionarios[0]?.id ?? '');

  // Proposta orçada por item herda o quantitativo real; proposta legada (só um
  // valor digitado) continua caindo no rateio por percentuais.
  const herdouItens = itensProposta.length > 0;
  const [itens, setItens] = useState<ConversaoItemInput[]>(() =>
    herdouItens ? itensDaProposta(itensProposta, proposta.bdiPercentual) : buildDefaultItens(proposta.valorEstimado)
  );
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
      // Contratação é decisão explícita — não se iguala contratado ao orçado
      // automaticamente (mesma regra do modal manual e da vinculação do catálogo).
      itens,
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
    <Modal
      open
      onClose={onCancel}
      title="Iniciar Obra a partir da Proposta"
      description={`${proposta.numero} · ${cliente?.nome ?? 'Cliente'} · ${fmtBRL(proposta.valorEstimado)}`}
      size="full"
      bloqueado={saving}
    >
        {/* Stepper */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
          {stepMeta.map((s, i) => {
            const Icon = s.icon;
            const active = step === s.n;
            const done = step > s.n;
            return (
              <React.Fragment key={s.n}>
                <div className={`flex items-center gap-1.5 text-xs font-bold ${active ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-slate-500'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${active ? 'border-blue-300 bg-blue-50' : done ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                    {done ? <Check size={13} /> : <Icon size={13} />}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < stepMeta.length - 1 && <div className="flex-1 h-px bg-slate-200" />}
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
                <Input value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1"><MapPin size={13} /> Endereço do canteiro</label>
                <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Endereço da obra" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1"><Calendar size={13} /> Início</label>
                  <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1"><Calendar size={13} /> Entrega</label>
                  <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1"><UserCog size={13} /> Responsável interno</label>
                <Select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
                  <option value="">A definir</option>
                  {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome} — {f.cargo}</option>)}
                </Select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              {herdouItens ? (
                <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-2.5 flex items-start gap-2">
                  <ListChecks size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                  <p className="text-2xs text-emerald-900 leading-relaxed">
                    <strong>{itensProposta.length} itens herdados da proposta</strong>
                    {proposta.bdiPercentual !== 0 && <> (com BDI de {proposta.bdiPercentual}% aplicado)</>}.
                    A quantidade e o preço de cada insumo atravessam a conversão — a obra nasce com o quantitativo,
                    não só com totais. Você ainda pode editar tudo aqui.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Esta proposta não tem itens orçados, então as linhas abaixo vêm de um rateio por percentuais sobre o
                  valor total. Ajuste as linhas de custo e a etapa que cada uma financia.
                </p>
              )}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th scope="col" className="text-left font-bold px-2 py-2">Categoria</th>
                        <th scope="col" className="text-left font-bold px-2 py-2">Descrição</th>
                        <th scope="col" className="text-right font-bold px-2 py-2 w-32">Valor orçado</th>
                        <th scope="col" className="text-left font-bold px-2 py-2 w-40">Etapa vinculada</th>
                        <th scope="col" className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {itens.map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-2 py-1.5">
                            <Select value={it.categoria} onChange={(e) => updateItem(idx, { categoria: e.target.value as CategoriaCusto })} tamanho="sm">
                              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </Select>
                          </td>
                          <td className="px-2 py-1.5">
                            <Input value={it.descricao} onChange={(e) => updateItem(idx, { descricao: e.target.value })} placeholder="Descrição" tamanho="sm" />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input type="number" min={0} step="0.01" value={it.valorOrcado} onChange={(e) => updateItem(idx, { valorOrcado: parseFloat(e.target.value) || 0 })} mono tamanho="sm" className="text-right" />
                          </td>
                          <td className="px-2 py-1.5">
                            <Select value={it.etapaRef ?? ''} onChange={(e) => updateItem(idx, { etapaRef: e.target.value === '' ? null : parseInt(e.target.value, 10) })} tamanho="sm">
                              <option value="">Sem vínculo</option>
                              {etapas.map((et) => <option key={et.ref} value={et.ref}>{et.nome}</option>)}
                            </Select>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button onClick={() => removeItem(idx)} aria-label="Remover item do orçamento" className="text-slate-500 hover:text-rose-500 transition"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <button onClick={addItem} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition"><Plus size={14} /> Adicionar linha</button>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-800 font-mono">Total: {fmtBRL(totalOrcado)}</div>
                  <div className={`text-2xs font-mono ${Math.abs(diffProposta) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {Math.abs(diffProposta) < 0.01 ? 'Igual ao valor da proposta' : `${diffProposta > 0 ? '+' : ''}${fmtBRL(diffProposta)} vs. proposta`}
                  </div>
                </div>
              </div>
              <p className="text-2xs text-slate-500 leading-snug">
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
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th scope="col" className="text-left font-bold px-2 py-2">Etapa</th>
                        <th scope="col" className="text-left font-bold px-2 py-2 w-32">Início</th>
                        <th scope="col" className="text-left font-bold px-2 py-2 w-32">Fim</th>
                        <th scope="col" className="text-left font-bold px-2 py-2 w-40">Responsável</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {etapas.map((et, idx) => (
                        <tr key={et.ref} className="hover:bg-slate-50/50">
                          <td className="px-2 py-1.5">
                            <Input value={et.nome} onChange={(e) => updateEtapa(idx, { nome: e.target.value })} tamanho="sm" />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input type="date" value={et.dataInicio} onChange={(e) => updateEtapa(idx, { dataInicio: e.target.value })} mono tamanho="sm" />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input type="date" value={et.dataFim} onChange={(e) => updateEtapa(idx, { dataFim: e.target.value })} mono tamanho="sm" />
                          </td>
                          <td className="px-2 py-1.5">
                            <Select value={et.responsavelId ?? ''} onChange={(e) => updateEtapa(idx, { responsavelId: e.target.value || undefined })} tamanho="sm">
                              <option value="">A definir</option>
                              {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div><div className="text-2xs text-slate-500 font-bold uppercase tracking-wide">Itens</div><div className="text-sm font-bold text-slate-800">{itens.length}</div></div>
                <div><div className="text-2xs text-slate-500 font-bold uppercase tracking-wide">Etapas</div><div className="text-sm font-bold text-slate-800">{etapas.length}</div></div>
                <div><div className="text-2xs text-slate-500 font-bold uppercase tracking-wide">Total orçado</div><div className="text-sm font-bold text-slate-800 font-mono">{fmtBRL(totalOrcado)}</div></div>
                <div><div className="text-2xs text-slate-500 font-bold uppercase tracking-wide">Vinculados</div><div className="text-sm font-bold text-slate-800">{itens.filter((it) => it.etapaRef !== null).length}/{itens.length}</div></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
          <div className="text-2xs text-rose-600 font-semibold min-h-[16px]">{error}</div>
          <div className="flex items-center gap-2">
            {step > 1 ? (
              <Button onClick={() => { setError(null); setStep((s) => (s - 1) as 1 | 2 | 3); }} disabled={saving} variante="secundario">
                <ArrowLeft size={13} /> Voltar
              </Button>
            ) : (
              <Button onClick={onCancel} disabled={saving} variante="secundario">Cancelar</Button>
            )}

            {step === 1 && (
              <Button onClick={goToStep2}>Avançar <ArrowRight size={13} /></Button>
            )}
            {step === 2 && (
              <Button onClick={() => setStep(3)}>Avançar <ArrowRight size={13} /></Button>
            )}
            {step === 3 && (
              <button onClick={handleConfirm} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-sm disabled:opacity-60">
                {saving ? <><Spinner size={13} /> Criando obra…</> : <><Check size={14} /> Criar obra</>}
              </button>
            )}
          </div>
        </div>
    </Modal>
  );
}
