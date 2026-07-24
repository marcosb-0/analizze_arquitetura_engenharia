import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Calculator, Plus, Trash2, Search, Info, Percent, Package, X } from 'lucide-react';
import {
  Proposta,
  ItemProposta,
  InsumoCatalogo,
  Fornecedor,
  CategoriaCusto,
  AjustePreco,
  TipoAjuste,
} from '../types';
import { NovoItemProposta } from '../services/itensPropostaService';
import { FiltroCatalogo } from '../services/catalogoService';
import {
  aplicarAjuste,
  deltaAjuste,
  descreveAjuste,
  melhorPreco,
  categoriaCustoDoInsumo,
  formatBRL,
  cotacaoVencida,
} from '../lib/preco';
import { useFeedback } from './FeedbackContext';

/**
 * Orçamento da PROPOSTA — montado item a item a partir do catálogo, somado de
 * baixo para cima e acrescido de BDI. É o caminho que faltava para orçar antes
 * de vender: até então a proposta era um único número digitado e o catálogo só
 * conseguia alimentar o orçamento de uma obra que já existia.
 *
 * O preço de cada item é `base + ajuste desta proposta`. Mexer no ajuste nunca
 * altera o preço de referência do catálogo — a base fica registrada para se
 * saber de onde o número partiu.
 */

const CATEGORIAS_CUSTO: CategoriaCusto[] = [
  'Materiais', 'Mão de Obra', 'Equipamentos', 'Terceiros', 'Deslocamentos', 'Administração', 'Contingências',
];

interface PropostaItensProps {
  proposta: Proposta;
  itens: ItemProposta[];
  catalogo: InsumoCatalogo[];
  fornecedores: Fornecedor[];
  /** Somente leitura quando a proposta já virou obra ou foi rejeitada. */
  bloqueado: boolean;
  aplicarFiltroCatalogo: (patch: Partial<FiltroCatalogo>) => void;
  onAddItem: (novo: NovoItemProposta) => Promise<ItemProposta | null>;
  onAjustarItem: (id: string, ajuste: AjustePreco) => Promise<ItemProposta | null>;
  onAjustarQuantidade: (id: string, quantidade: number) => Promise<ItemProposta | null>;
  onRemoveItem: (id: string) => Promise<void>;
  onUpdateBdi: (id: string, bdi: number) => Promise<void>;
}

export default function PropostaItens({
  proposta,
  itens,
  catalogo,
  fornecedores,
  bloqueado,
  aplicarFiltroCatalogo,
  onAddItem,
  onAjustarItem,
  onAjustarQuantidade,
  onRemoveItem,
  onUpdateBdi,
}: PropostaItensProps) {
  const { toast, confirm } = useFeedback();
  const [showSeletor, setShowSeletor] = useState(false);
  const [buscaCatalogo, setBuscaCatalogo] = useState('');
  const [bdiLocal, setBdiLocal] = useState(String(proposta.bdiPercentual));
  const [editandoAjuste, setEditandoAjuste] = useState<string | null>(null);

  useEffect(() => setBdiLocal(String(proposta.bdiPercentual)), [proposta.id, proposta.bdiPercentual]);

  // A busca do seletor roda no servidor (o catálogo é paginado) — debounce para
  // não disparar uma consulta por tecla.
  useEffect(() => {
    if (!showSeletor) return;
    const t = setTimeout(() => aplicarFiltroCatalogo({ busca: buscaCatalogo, ativo: true }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaCatalogo, showSeletor]);

  const somaItens = useMemo(
    () => itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0),
    [itens]
  );
  const somaBase = useMemo(
    () => itens.reduce((s, i) => s + i.quantidade * i.precoUnitarioBase, 0),
    [itens]
  );
  const totalAjustes = somaItens - somaBase;
  const bdiValor = somaItens * (proposta.bdiPercentual / 100);
  const totalComBdi = somaItens + bdiValor;

  const porCategoria = useMemo(() => {
    const mapa = new Map<CategoriaCusto, number>();
    for (const i of itens) {
      mapa.set(i.categoria, (mapa.get(i.categoria) ?? 0) + i.quantidade * i.precoUnitario);
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [itens]);

  const nomeFornecedor = (id?: string) => fornecedores.find((f) => f.id === id)?.empresa;

  const adicionarDoCatalogo = async (insumo: InsumoCatalogo) => {
    const melhor = melhorPreco(insumo);
    const criado = await onAddItem({
      propostaId: proposta.id,
      catalogoInsumoId: insumo.id,
      descricao: insumo.descricao,
      unidade: insumo.unidade,
      categoria: categoriaCustoDoInsumo(insumo.categoria),
      quantidade: 1,
      precoUnitarioBase: melhor.preco,
      ajuste: { tipo: 'Nenhum', valor: 0 },
      fornecedorId: melhor.fornecedorId,
      ordem: itens.length,
    });
    if (criado) {
      toast.success('Item adicionado à proposta.', 'Ajuste a quantidade e, se precisar, o preço desta proposta.');
    }
  };

  const [avulsoDesc, setAvulsoDesc] = useState('');
  const [avulsoUn, setAvulsoUn] = useState('un');
  const [avulsoQtd, setAvulsoQtd] = useState('1');
  const [avulsoPreco, setAvulsoPreco] = useState('');
  const [avulsoCategoria, setAvulsoCategoria] = useState<CategoriaCusto>('Materiais');

  const adicionarAvulso = async () => {
    const preco = parseFloat(avulsoPreco);
    const qtd = parseFloat(avulsoQtd);
    if (!avulsoDesc.trim() || isNaN(preco) || preco <= 0 || isNaN(qtd) || qtd <= 0) {
      toast.error('Informe descrição, quantidade e preço maiores que zero.');
      return;
    }
    const criado = await onAddItem({
      propostaId: proposta.id,
      descricao: avulsoDesc.trim(),
      unidade: avulsoUn.trim() || 'un',
      categoria: avulsoCategoria,
      quantidade: qtd,
      precoUnitarioBase: preco,
      ajuste: { tipo: 'Nenhum', valor: 0 },
      ordem: itens.length,
    });
    if (criado) {
      setAvulsoDesc('');
      setAvulsoQtd('1');
      setAvulsoPreco('');
      toast.success('Item avulso adicionado.');
    }
  };

  const salvarBdi = async () => {
    const bdi = parseFloat(bdiLocal);
    if (isNaN(bdi) || bdi < -100 || bdi > 1000) {
      toast.error('BDI inválido.', 'Informe um percentual entre -100 e 1000.');
      setBdiLocal(String(proposta.bdiPercentual));
      return;
    }
    if (bdi === proposta.bdiPercentual) return;
    await onUpdateBdi(proposta.id, bdi);
  };

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4">
      <div className="flex justify-between items-center">
        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
          <Calculator size={15} className="text-slate-500" />
          <span>Orçamento da proposta ({itens.length} {itens.length === 1 ? 'item' : 'itens'})</span>
        </h4>
        {!bloqueado && (
          <button
            onClick={() => setShowSeletor(true)}
            className="text-xs text-blue-600 font-bold hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded transition active:scale-95 flex items-center gap-1"
          >
            <Plus size={12} /> Adicionar item
          </button>
        )}
      </div>

      {itens.length === 0 ? (
        <div className="p-4 border border-dashed border-slate-200 rounded-lg text-center space-y-1.5">
          <Package size={20} className="text-slate-300 mx-auto" />
          <p className="text-[11px] text-slate-500 font-semibold">Esta proposta ainda usa apenas o valor digitado.</p>
          <p className="text-[10px] text-slate-400 max-w-md mx-auto leading-relaxed">
            Ao adicionar itens do catálogo, o valor da proposta passa a ser calculado (soma dos itens + BDI) e o
            quantitativo é herdado pela obra na conversão.
          </p>
        </div>
      ) : (
        <>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-slate-400 font-bold uppercase tracking-wider">
                    <th className="p-2">Item</th>
                    <th className="p-2 text-right w-20">Qtd</th>
                    <th className="p-2 text-right w-24">Base</th>
                    <th className="p-2 text-right w-32">Ajuste</th>
                    <th className="p-2 text-right w-24">Unit. final</th>
                    <th className="p-2 text-right w-28">Total</th>
                    <th className="p-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itens.map((item) => {
                    const delta = deltaAjuste(item.precoUnitarioBase, item.ajuste);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="p-2">
                          <div className="font-bold text-slate-800 leading-tight">{item.descricao}</div>
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            {item.categoria} · {item.unidade}
                            {item.catalogoInsumoId ? ' · do catálogo' : ' · avulso'}
                            {nomeFornecedor(item.fornecedorId) ? ` · ${nomeFornecedor(item.fornecedorId)}` : ''}
                          </div>
                          {item.ajuste.motivo && (
                            <div className="text-[9px] text-slate-500 italic mt-0.5">"{item.ajuste.motivo}"</div>
                          )}
                        </td>

                        <td className="p-2 text-right">
                          {bloqueado ? (
                            <span className="font-mono">{item.quantidade}</span>
                          ) : (
                            <input
                              type="number"
                              min="0.001"
                              step="any"
                              defaultValue={item.quantidade}
                              onBlur={(e) => {
                                const q = parseFloat(e.target.value);
                                if (!isNaN(q) && q > 0 && q !== item.quantidade) onAjustarQuantidade(item.id, q);
                                else e.target.value = String(item.quantidade);
                              }}
                              className="w-16 text-right bg-white border border-slate-200 rounded px-1 py-0.5 font-mono outline-none focus:border-blue-500"
                            />
                          )}
                        </td>

                        <td className="p-2 text-right font-mono text-slate-500">
                          {formatBRL(item.precoUnitarioBase)}
                        </td>

                        <td className="p-2 text-right">
                          {editandoAjuste === item.id ? (
                            <EditorAjuste
                              base={item.precoUnitarioBase}
                              ajusteAtual={item.ajuste}
                              onCancelar={() => setEditandoAjuste(null)}
                              onSalvar={async (a) => {
                                await onAjustarItem(item.id, a);
                                setEditandoAjuste(null);
                              }}
                            />
                          ) : (
                            <button
                              disabled={bloqueado}
                              onClick={() => setEditandoAjuste(item.id)}
                              className={`font-mono font-bold px-1.5 py-0.5 rounded transition disabled:cursor-default ${
                                delta === 0 ? 'text-slate-300 hover:bg-slate-100'
                                : delta > 0 ? 'text-rose-600 bg-rose-50'
                                : 'text-emerald-600 bg-emerald-50'
                              } ${!bloqueado && 'hover:ring-1 hover:ring-blue-200'}`}
                              title={bloqueado ? undefined : 'Acréscimo ou desconto só desta proposta'}
                            >
                              {delta === 0 ? '—' : `${delta > 0 ? '+' : '−'}${formatBRL(Math.abs(delta))}`}
                            </button>
                          )}
                        </td>

                        <td className="p-2 text-right font-mono font-bold text-slate-900">
                          {formatBRL(item.precoUnitario)}
                        </td>

                        <td className="p-2 text-right font-mono font-extrabold text-slate-900">
                          {formatBRL(item.quantidade * item.precoUnitario)}
                        </td>

                        <td className="p-2 text-right">
                          {!bloqueado && (
                            <button
                              onClick={() =>
                                confirm({
                                  title: 'Remover item',
                                  message: `Remover "${item.descricao}" da proposta? O valor total será recalculado.`,
                                  onConfirm: () => onRemoveItem(item.id),
                                })
                              }
                              className="text-slate-300 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Por categoria</span>
              {porCategoria.map(([cat, valor]) => (
                <div key={cat} className="flex justify-between text-[11px]">
                  <span className="text-slate-600 font-medium">{cat}</span>
                  <span className="font-mono font-bold text-slate-800">{formatBRL(valor)}</span>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-600 font-medium">Soma dos itens (preços base)</span>
                <span className="font-mono text-slate-500">{formatBRL(somaBase)}</span>
              </div>
              {totalAjustes !== 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-600 font-medium">Ajustes desta proposta</span>
                  <span className={`font-mono font-bold ${totalAjustes > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {totalAjustes > 0 ? '+' : '−'}{formatBRL(Math.abs(totalAjustes))}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-[11px] pt-1.5 border-t border-slate-200">
                <span className="text-slate-700 font-bold">Custo dos itens</span>
                <span className="font-mono font-bold text-slate-900">{formatBRL(somaItens)}</span>
              </div>

              <div className="flex justify-between items-center text-[11px]">
                <label className="text-slate-600 font-medium flex items-center gap-1">
                  <Percent size={11} /> BDI
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="any"
                    disabled={bloqueado}
                    value={bdiLocal}
                    onChange={(e) => setBdiLocal(e.target.value)}
                    onBlur={salvarBdi}
                    className="w-16 text-right bg-white border border-slate-200 rounded px-1 py-0.5 font-mono outline-none focus:border-blue-500 disabled:bg-slate-100"
                  />
                  <span className="text-slate-400">%</span>
                  <span className="font-mono text-slate-500 w-24 text-right">{formatBRL(bdiValor)}</span>
                </div>
              </div>

              <div className="flex justify-between pt-2 border-t-2 border-slate-300">
                <span className="text-xs font-extrabold text-slate-900 uppercase">Valor da proposta</span>
                <span className="font-mono font-extrabold text-blue-700 text-sm">{formatBRL(totalComBdi)}</span>
              </div>

              {Math.abs(totalComBdi - proposta.valorEstimado) > 0.01 && (
                <p className="text-[9px] text-amber-700 bg-amber-50 border border-amber-100 rounded p-1.5 leading-relaxed">
                  O valor gravado na proposta é {formatBRL(proposta.valorEstimado)} — provavelmente fixado por uma
                  revisão manual. Qualquer mudança nos itens ou no BDI volta a sincronizar.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* SELETOR DE ITENS */}
      <AnimatePresence>
        {showSeletor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSeletor(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl border border-slate-200 flex flex-col max-h-[85vh]"
            >
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-extrabold text-slate-900 text-sm">Adicionar item à proposta</h3>
                <button onClick={() => setShowSeletor(false)} className="w-6 h-6 rounded-full hover:bg-slate-200/60 text-slate-400 flex items-center justify-center">
                  <X size={14} />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto">
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={13} />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Buscar no catálogo de insumos..."
                      value={buscaCatalogo}
                      onChange={(e) => setBuscaCatalogo(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-600"
                    />
                  </div>

                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {catalogo.length === 0 ? (
                      <p className="p-4 text-center text-[11px] text-slate-400">Nenhum insumo encontrado.</p>
                    ) : (
                      catalogo.map((insumo) => {
                        const melhor = melhorPreco(insumo);
                        const jaAdicionado = itens.some((i) => i.catalogoInsumoId === insumo.id);
                        return (
                          <button
                            key={insumo.id}
                            onClick={() => adicionarDoCatalogo(insumo)}
                            className="w-full text-left p-2.5 hover:bg-blue-50/40 transition flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-slate-800 truncate">
                                {insumo.descricao}
                                {jaAdicionado && <span className="ml-1.5 text-[9px] text-blue-600 font-extrabold">já na proposta</span>}
                              </div>
                              <div className="text-[9px] text-slate-400">
                                {insumo.categoria} · {insumo.unidade}
                                {melhor.origem === 'Cotação' && melhor.cotacao ? ` · cotação de ${nomeFornecedor(melhor.fornecedorId) ?? 'fornecedor'}` : ' · preço de referência'}
                                {melhor.cotacao && cotacaoVencida(melhor.cotacao) ? ' (vencida)' : ''}
                              </div>
                            </div>
                            <span className="font-mono font-bold text-[11px] text-slate-900 shrink-0">{formatBRL(melhor.preco)}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ou item avulso (fora do catálogo)</span>
                  <div className="grid grid-cols-6 gap-2">
                    <input type="text" placeholder="Descrição" value={avulsoDesc} onChange={(e) => setAvulsoDesc(e.target.value)} className="col-span-3 border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-blue-600" />
                    <input type="text" placeholder="un" value={avulsoUn} onChange={(e) => setAvulsoUn(e.target.value)} className="border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-blue-600 font-mono" />
                    <input type="number" step="any" min="0.001" placeholder="Qtd" value={avulsoQtd} onChange={(e) => setAvulsoQtd(e.target.value)} className="border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-blue-600 font-mono" />
                    <input type="number" step="any" min="0.01" placeholder="R$ un" value={avulsoPreco} onChange={(e) => setAvulsoPreco(e.target.value)} className="border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-blue-600 font-mono" />
                  </div>
                  <div className="flex gap-2">
                    <select value={avulsoCategoria} onChange={(e) => setAvulsoCategoria(e.target.value as CategoriaCusto)} className="flex-1 border border-slate-200 rounded p-1.5 text-xs outline-none focus:border-blue-600">
                      {CATEGORIAS_CUSTO.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <button onClick={adicionarAvulso} className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-3 py-1.5 rounded text-xs transition flex items-center gap-1">
                      <Plus size={12} /> Adicionar
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Edição inline do ajuste de um item. Aceita percentual, valor por unidade ou
 * o preço final desejado — e converte tudo para o par (tipo, valor) que o banco
 * usa na coluna gerada.
 */
function EditorAjuste({
  base,
  ajusteAtual,
  onSalvar,
  onCancelar,
}: {
  base: number;
  ajusteAtual: AjustePreco;
  onSalvar: (a: AjustePreco) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoAjuste>(ajusteAtual.tipo);
  const [valor, setValor] = useState(String(ajusteAtual.valor));
  const [motivo, setMotivo] = useState(ajusteAtual.motivo ?? '');

  const ajuste: AjustePreco = { tipo, valor: parseFloat(valor) || 0, motivo: motivo || undefined };
  const final = aplicarAjuste(base, ajuste);

  return (
    <div className="absolute right-2 z-20 bg-white border border-blue-200 rounded-lg shadow-lg p-2.5 w-64 space-y-2 text-left">
      <div className="flex items-start gap-1.5">
        <Info size={11} className="text-blue-600 mt-0.5 shrink-0" />
        <p className="text-[9px] text-blue-900 font-semibold leading-tight">
          Ajuste só desta proposta. O preço de referência do catálogo não muda.
        </p>
      </div>

      <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAjuste)} className="w-full border border-slate-200 rounded p-1 text-[11px] outline-none">
        <option value="Nenhum">Sem ajuste</option>
        <option value="Percentual">Percentual (%)</option>
        <option value="Valor">Valor por unidade (R$)</option>
      </select>

      <input
        type="number"
        step="any"
        disabled={tipo === 'Nenhum'}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="− desconto, + acréscimo"
        className="w-full border border-slate-200 rounded p-1 text-[11px] outline-none font-mono disabled:bg-slate-50"
      />

      <input
        type="text"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (opcional)"
        className="w-full border border-slate-200 rounded p-1 text-[11px] outline-none"
      />

      <div className="text-[10px] font-mono text-slate-600 bg-slate-50 rounded p-1.5">
        {formatBRL(base)} → <strong className="text-slate-900">{formatBRL(final)}</strong>
        <span className="block text-[9px] text-slate-400 mt-0.5">{descreveAjuste(base, ajuste)}</span>
      </div>

      <div className="flex gap-1.5">
        <button onClick={onCancelar} className="flex-1 border border-slate-200 text-slate-600 font-bold py-1 rounded text-[10px] hover:bg-slate-50">
          Cancelar
        </button>
        <button onClick={() => onSalvar(ajuste)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 rounded text-[10px]">
          Aplicar
        </button>
      </div>
    </div>
  );
}
