import { useEffect, useMemo, useState } from 'react';
import { Calculator, Plus, Trash2, Search, Percent, Package, Lock } from 'lucide-react';
import {
  Proposta,
  ItemProposta,
  InsumoCatalogo,
  Fornecedor,
  CategoriaCusto,
  AjustePreco,
} from '../types';
import { NovoItemProposta } from '../services/itensPropostaService';
import { FiltroCatalogo } from '../services/catalogoService';
import {
  ajusteParaPrecoAlvo,
  deltaAjuste,
  descreveAjuste,
  melhorPreco,
  categoriaCustoDoInsumo,
  formatBRL,
  cotacaoVencida,
} from '../lib/preco';
import { useFeedback } from './FeedbackContext';
import Spinner from './Spinner';
import { Modal } from './ui';

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
  /** Somente leitura quando a proposta já virou obra, foi aprovada ou rejeitada. */
  bloqueado: boolean;
  /** Os itens desta proposta ainda estão sendo buscados. */
  carregando?: boolean;
  /** Por que está travado — mostrado no lugar do botão de adicionar item. */
  motivoBloqueio?: string;
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
  carregando = false,
  motivoBloqueio,
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

  useEffect(() => setBdiLocal(String(proposta.bdiPercentual)), [proposta.id, proposta.bdiPercentual]);

  // A busca do seletor roda no servidor (o catálogo é paginado) — debounce para
  // não disparar uma consulta por tecla.
  useEffect(() => {
    if (!showSeletor) return;
    const t = setTimeout(() => aplicarFiltroCatalogo({ busca: buscaCatalogo, ativo: true }), 350);
    return () => clearTimeout(t);
  }, [buscaCatalogo, showSeletor]);

  /**
   * A soma é feita aqui, mas com o MESMO arredondamento do servidor: ele soma
   * linha a linha já arredondada (`sum(round(quantidade * preco_unitario, 2))`)
   * e aqui se somava direto, o que rendia divergência de centavos contra o
   * `valor_itens` que fica gravado — e que é o número que vai para o PDF e para
   * a obra na conversão.
   *
   * Manter a conta local é deliberado: entre gravar um item e o refreshTotais
   * responder, `proposta.valorItens` está defasado, e exibir o valor do servidor
   * mostraria um total incoerente com a tabela logo acima. Os derivados do
   * servidor entram como conferência, no aviso ao pé do quadro.
   */
  const linha = (quantidade: number, preco: number) => Math.round(quantidade * preco * 100) / 100;

  const somaItens = useMemo(
    () => itens.reduce((s, i) => s + linha(i.quantidade, i.precoUnitario), 0),
    [itens]
  );
  // Sem equivalente no servidor — a base é anterior ao ajuste desta proposta.
  const somaBase = useMemo(
    () => itens.reduce((s, i) => s + linha(i.quantidade, i.precoUnitarioBase), 0),
    [itens]
  );
  const totalAjustes = somaItens - somaBase;
  const bdiValor = somaItens * (proposta.bdiPercentual / 100);
  const totalComBdi = Math.round(somaItens * (1 + proposta.bdiPercentual / 100) * 100) / 100;

  const porCategoria = useMemo(() => {
    const mapa = new Map<CategoriaCusto, number>();
    for (const i of itens) {
      mapa.set(i.categoria, (mapa.get(i.categoria) ?? 0) + linha(i.quantidade, i.precoUnitario));
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [itens]);

  const nomeFornecedor = (id?: string) => fornecedores.find((f) => f.id === id)?.empresa;

  const adicionarDoCatalogo = async (insumo: InsumoCatalogo) => {
    // O seletor já avisava "já na proposta" mas deixava incluir de novo,
    // criando duas linhas do mesmo insumo. Quem clica duas vezes quer mais
    // quantidade, não uma linha duplicada — e duas linhas com ajustes
    // diferentes tornariam o orçamento impossível de conferir.
    const existente = itens.find((i) => i.catalogoInsumoId === insumo.id);
    if (existente) {
      const atualizado = await onAjustarQuantidade(existente.id, existente.quantidade + 1);
      if (atualizado) {
        toast.success(
          'Quantidade somada ao item existente.',
          `${insumo.descricao}: ${existente.quantidade} → ${atualizado.quantidade} ${existente.unidade}.`
        );
      }
      return;
    }

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

  const [salvandoBdi, setSalvandoBdi] = useState(false);

  const salvarBdi = async () => {
    const bdi = parseFloat(bdiLocal);
    if (isNaN(bdi) || bdi < -100 || bdi > 1000) {
      toast.error('BDI inválido.', 'Informe um percentual entre -100 e 1000.');
      setBdiLocal(String(proposta.bdiPercentual));
      return;
    }
    if (bdi === proposta.bdiPercentual) return;
    setSalvandoBdi(true);
    await onUpdateBdi(proposta.id, bdi);
    setSalvandoBdi(false);
    // Em falha o hook reverte `proposta`, e o efeito acima devolve o campo ao
    // percentual anterior — o campo nunca fica exibindo um BDI que não gravou.
  };

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4">
      <div className="flex justify-between items-center">
        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
          <Calculator size={15} className="text-slate-500" />
          <span>
            Orçamento da proposta{' '}
            {carregando ? '' : `(${itens.length} ${itens.length === 1 ? 'item' : 'itens'})`}
          </span>
        </h4>
        {carregando ? null : !bloqueado ? (
          <button
            onClick={() => setShowSeletor(true)}
            className="text-xs text-blue-600 font-bold hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded transition active:scale-95 flex items-center gap-1"
          >
            <Plus size={12} /> Adicionar item
          </button>
        ) : (
          <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Lock size={11} /> Somente leitura
          </span>
        )}
      </div>

      {bloqueado && motivoBloqueio && (
        <p className="text-2xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-2 leading-relaxed">
          {motivoBloqueio}
        </p>
      )}

      {carregando ? (
        <div className="p-6 border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center gap-2 text-slate-500">
          <Spinner size={18} />
          <p className="text-2xs">Carregando o orçamento...</p>
        </div>
      ) : itens.length === 0 ? (
        <div className="p-4 border border-dashed border-slate-200 rounded-lg text-center space-y-1.5">
          <Package size={20} className="text-slate-300 mx-auto" aria-hidden />
          <p className="text-2xs text-slate-500 font-semibold">
            Esta proposta usa o valor digitado: <span className="font-mono">{formatBRL(proposta.valorManual)}</span>
          </p>
          <p className="text-2xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Ao adicionar itens do catálogo, o valor passa a ser calculado (soma dos itens + BDI) e o quantitativo é
            herdado pela obra na conversão. O valor digitado fica guardado e volta a valer se os itens forem removidos.
          </p>
        </div>
      ) : (
        <>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-2xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-slate-500 font-bold uppercase tracking-wider">
                    <th scope="col" className="p-2">Item</th>
                    <th scope="col" className="p-2 text-right w-20">Qtd</th>
                    <th scope="col" className="p-2 text-right w-24">Base</th>
                    <th scope="col" className="p-2 text-right w-28">Ajuste</th>
                    <th scope="col" className="p-2 text-right w-28">Unit. final</th>
                    <th scope="col" className="p-2 text-right w-28">Total</th>
                    <th scope="col" className="p-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itens.map((item) => {
                    const delta = deltaAjuste(item.precoUnitarioBase, item.ajuste);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="p-2">
                          <div className="font-bold text-slate-800 leading-tight">{item.descricao}</div>
                          <div className="text-2xs text-slate-500 mt-0.5">
                            {item.categoria} · {item.unidade}
                            {item.catalogoInsumoId ? ' · do catálogo' : ' · avulso'}
                            {nomeFornecedor(item.fornecedorId) ? ` · ${nomeFornecedor(item.fornecedorId)}` : ''}
                          </div>
                          {/* O motivo só aparece quando existe ajuste: numa
                              linha com preço de catálogo não há o que
                              justificar, e um campo vazio por item encheria a
                              tabela de ruído. */}
                          {bloqueado ? (
                            item.ajuste.motivo && (
                              <div className="text-2xs text-slate-500 italic mt-0.5">"{item.ajuste.motivo}"</div>
                            )
                          ) : (
                            delta !== 0 && (
                              <InputMotivo
                                item={item}
                                onSalvar={(motivo) => onAjustarItem(item.id, { ...item.ajuste, motivo })}
                              />
                            )
                          )}
                        </td>

                        <td className="p-2 text-right">
                          {bloqueado ? (
                            <span className="font-mono">{item.quantidade}</span>
                          ) : (
                            <InputQuantidade
                              item={item}
                              onAjustar={(q) => onAjustarQuantidade(item.id, q)}
                            />
                          )}
                        </td>

                        <td className="p-2 text-right font-mono text-slate-500">
                          {formatBRL(item.precoUnitarioBase)}
                        </td>

                        {/* O ajuste é o RESULTADO de mexer no preço final, não
                            um campo a preencher: quem negocia pensa "este item
                            vai sair por R$ X", não "quero -7,5% sobre a base".
                            Por isso a coluna é só leitura e a edição acontece
                            no preço final, ali ao lado. */}
                        <td className="p-2 text-right">
                          <span
                            className={`font-mono font-bold px-1.5 py-0.5 rounded ${
                              delta === 0 ? 'text-slate-500'
                              : delta > 0 ? 'text-rose-600 bg-rose-50'
                              : 'text-emerald-600 bg-emerald-50'
                            }`}
                            title={delta === 0 ? 'Preço igual ao da base' : descreveAjuste(item.precoUnitarioBase, item.ajuste)}
                          >
                            {delta === 0 ? '—' : `${delta > 0 ? '+' : '−'}${formatBRL(Math.abs(delta))}`}
                          </span>
                        </td>

                        <td className="p-2 text-right">
                          {bloqueado ? (
                            <span className="font-mono font-bold text-slate-900">{formatBRL(item.precoUnitario)}</span>
                          ) : (
                            <InputPrecoFinal
                              item={item}
                              onAjustar={(preco) =>
                                onAjustarItem(item.id, {
                                  ...ajusteParaPrecoAlvo(item.precoUnitarioBase, preco),
                                  // O motivo é do ajuste, não do preço: mudar o
                                  // número não pode apagar a justificativa que
                                  // já estava registrada.
                                  motivo: item.ajuste.motivo,
                                })
                              }
                            />
                          )}
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
                              aria-label="Remover item da proposta"
                              className="text-slate-500 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition"
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
              <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">Por categoria</span>
              {porCategoria.map(([cat, valor]) => (
                <div key={cat} className="flex justify-between text-2xs">
                  <span className="text-slate-600 font-medium">{cat}</span>
                  <span className="font-mono font-bold text-slate-800">{formatBRL(valor)}</span>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-2xs">
                <span className="text-slate-600 font-medium">Soma dos itens (preços base)</span>
                <span className="font-mono text-slate-500">{formatBRL(somaBase)}</span>
              </div>
              {totalAjustes !== 0 && (
                <div className="flex justify-between text-2xs">
                  <span className="text-slate-600 font-medium">Ajustes desta proposta</span>
                  <span className={`font-mono font-bold ${totalAjustes > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {totalAjustes > 0 ? '+' : '−'}{formatBRL(Math.abs(totalAjustes))}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-2xs pt-1.5 border-t border-slate-200">
                <span className="text-slate-700 font-bold">Custo dos itens</span>
                <span className="font-mono font-bold text-slate-900">{formatBRL(somaItens)}</span>
              </div>

              <div className="flex justify-between items-center text-2xs">
                <label className="text-slate-600 font-medium flex items-center gap-1">
                  <Percent size={11} /> BDI
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="any"
                    disabled={bloqueado || salvandoBdi}
                    aria-label="BDI em percentual"
                    value={bdiLocal}
                    onChange={(e) => setBdiLocal(e.target.value)}
                    onBlur={salvarBdi}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setBdiLocal(String(proposta.bdiPercentual));
                    }}
                    className="w-16 text-right bg-white border border-slate-200 rounded px-1 py-0.5 font-mono outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-500 disabled:bg-slate-100"
                  />
                  <span className="text-slate-500">%</span>
                  <span className="font-mono text-slate-500 w-24 text-right">{formatBRL(bdiValor)}</span>
                </div>
              </div>

              <div className="flex justify-between pt-2 border-t-2 border-slate-300">
                <span className="text-xs font-extrabold text-slate-900 uppercase">Valor da proposta</span>
                <span className="font-mono font-extrabold text-blue-700 text-sm">{formatBRL(totalComBdi)}</span>
              </div>

              {/* Conferência contra o que está gravado. Com o arredondamento
                  igual ao do servidor, os dois só divergem enquanto a escrita
                  não voltou — se persistir, é sinal de que algo não gravou. */}
              {proposta.qtdItens === itens.length &&
                Math.abs(totalComBdi - proposta.valorCalculado) > 0.01 && (
                  <p className="text-2xs text-amber-700 bg-amber-50 border border-amber-100 rounded p-1.5 leading-relaxed">
                    O total gravado no servidor é {formatBRL(proposta.valorCalculado)}, diferente dos
                    {' '}{formatBRL(totalComBdi)} somados aqui. Recarregue a página; se continuar diferente, a última
                    alteração pode não ter sido gravada.
                  </p>
                )}
            </div>
          </div>
        </>
      )}

      {/* SELETOR DE ITENS */}
      <Modal
        open={showSeletor}
        onClose={() => setShowSeletor(false)}
        title="Adicionar item à proposta"
        size="xl"
      >
              <div className="p-4 space-y-4 overflow-y-auto">
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={13} />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Buscar no catálogo de insumos..."
                      value={buscaCatalogo}
                      onChange={(e) => setBuscaCatalogo(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600"
                    />
                  </div>

                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {catalogo.length === 0 ? (
                      <p className="p-4 text-center text-2xs text-slate-500">Nenhum insumo encontrado.</p>
                    ) : (
                      catalogo.map((insumo) => {
                        const melhor = melhorPreco(insumo);
                        const jaNaProposta = itens.find((i) => i.catalogoInsumoId === insumo.id);
                        return (
                          <button
                            key={insumo.id}
                            type="button"
                            onClick={() => adicionarDoCatalogo(insumo)}
                            title={jaNaProposta ? 'Clicar soma 1 à quantidade já lançada' : undefined}
                            className="w-full text-left p-2.5 hover:bg-blue-50/40 transition flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="text-2xs font-bold text-slate-800 truncate">
                                {insumo.descricao}
                                {jaNaProposta && (
                                  <span className="ml-1.5 text-2xs text-blue-600 font-extrabold">
                                    na proposta · {jaNaProposta.quantidade} {jaNaProposta.unidade} (+1)
                                  </span>
                                )}
                              </div>
                              <div className="text-2xs text-slate-500">
                                {insumo.categoria} · {insumo.unidade}
                                {melhor.origem === 'Cotação' && melhor.cotacao ? ` · cotação de ${nomeFornecedor(melhor.fornecedorId) ?? 'fornecedor'}` : ' · preço de referência'}
                                {melhor.cotacao && cotacaoVencida(melhor.cotacao) ? ' (vencida)' : ''}
                              </div>
                            </div>
                            <span className="font-mono font-bold text-2xs text-slate-900 shrink-0">{formatBRL(melhor.preco)}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">Ou item avulso (fora do catálogo)</span>
                  <div className="grid grid-cols-6 gap-2">
                    <input type="text" placeholder="Descrição" value={avulsoDesc} onChange={(e) => setAvulsoDesc(e.target.value)} className="col-span-3 border border-slate-200 rounded p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600" />
                    <input type="text" placeholder="un" value={avulsoUn} onChange={(e) => setAvulsoUn(e.target.value)} className="border border-slate-200 rounded p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-mono" />
                    <input type="number" step="any" min="0.001" placeholder="Qtd" value={avulsoQtd} onChange={(e) => setAvulsoQtd(e.target.value)} className="border border-slate-200 rounded p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-mono" />
                    <input type="number" step="any" min="0.01" placeholder="R$ un" value={avulsoPreco} onChange={(e) => setAvulsoPreco(e.target.value)} className="border border-slate-200 rounded p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-mono" />
                  </div>
                  <div className="flex gap-2">
                    <select value={avulsoCategoria} onChange={(e) => setAvulsoCategoria(e.target.value as CategoriaCusto)} className="flex-1 border border-slate-200 rounded p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600">
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
      </Modal>
    </div>
  );
}

/**
 * Campo de quantidade controlado.
 *
 * Antes era `defaultValue` + `onBlur`: se o servidor recusasse a alteração, o
 * estado revertia mas o input — não controlado — continuava exibindo o número
 * digitado. A tela passava a mostrar uma quantidade que não existe no banco, e
 * o total ao lado não fechava com ela.
 *
 * Agora o valor local só sobrevive enquanto o campo está em edição; ao sair,
 * ele se rende ao que o item de fato tem.
 */
function InputQuantidade({
  item,
  onAjustar,
}: {
  item: ItemProposta;
  onAjustar: (quantidade: number) => Promise<ItemProposta | null>;
}) {
  const [valor, setValor] = useState(String(item.quantidade));
  const [salvando, setSalvando] = useState(false);

  // A fonte da verdade é o item. Se ele mudar por fora (recarga, rollback),
  // o campo acompanha em vez de insistir no que foi digitado.
  useEffect(() => setValor(String(item.quantidade)), [item.quantidade]);

  const confirmar = async () => {
    const q = parseFloat(valor);
    if (isNaN(q) || q <= 0 || q === item.quantidade) {
      setValor(String(item.quantidade));
      return;
    }
    setSalvando(true);
    const atualizado = await onAjustar(q);
    setSalvando(false);
    // Em falha, volta ao valor do item — o hook já explicou o motivo no toast.
    if (!atualizado) setValor(String(item.quantidade));
  };

  return (
    <input
      type="number"
      min="0.001"
      step="any"
      aria-label={`Quantidade de ${item.descricao}`}
      disabled={salvando}
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setValor(String(item.quantidade));
      }}
      className="w-16 text-right bg-white border border-slate-200 rounded px-1 py-0.5 font-mono outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-500 disabled:bg-slate-100"
    />
  );
}

/**
 * Preço final do item, editável no próprio campo.
 *
 * Substitui um pop-up que pedia tipo de ajuste, valor e motivo antes de
 * deixar mexer no preço — três decisões para responder a uma pergunta só
 * ("por quanto este item vai sair?"), e ainda por cima flutuando sobre a
 * tabela que se estava tentando conferir.
 *
 * Aqui se digita o preço de venda e o ajuste é DERIVADO dele: a base do
 * catálogo continua registrada, e a diferença aparece na coluna ao lado. O
 * comportamento é o mesmo do campo de quantidade — controlado, confirmado no
 * blur ou no Enter, revertido ao valor do item se a escrita falhar.
 */
function InputPrecoFinal({
  item,
  onAjustar,
}: {
  item: ItemProposta;
  onAjustar: (precoFinal: number) => Promise<ItemProposta | null>;
}) {
  const [valor, setValor] = useState(String(item.precoUnitario));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setValor(String(item.precoUnitario)), [item.precoUnitario]);

  const confirmar = async () => {
    const preco = parseFloat(valor);
    if (isNaN(preco) || preco < 0 || preco === item.precoUnitario) {
      setValor(String(item.precoUnitario));
      return;
    }
    setSalvando(true);
    const atualizado = await onAjustar(preco);
    setSalvando(false);
    if (!atualizado) setValor(String(item.precoUnitario));
  };

  const desviado = item.precoUnitario !== item.precoUnitarioBase;

  return (
    <input
      type="number"
      min="0"
      step="any"
      aria-label={`Preço unitário final de ${item.descricao}`}
      title="Preço de venda desta proposta. O preço de referência do catálogo não muda."
      disabled={salvando}
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setValor(String(item.precoUnitario));
      }}
      className={`w-24 text-right bg-white border rounded px-1 py-0.5 font-mono font-bold outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-500 disabled:bg-slate-100 ${
        desviado ? 'border-blue-200 text-slate-900' : 'border-slate-200 text-slate-900'
      }`}
    />
  );
}

/**
 * Justificativa do ajuste, no lugar onde ela é lida: sob a descrição do item.
 * Era o único campo do pop-up sem equivalente na tabela — e o que explica, meses
 * depois, por que aquele item saiu mais barato que o catálogo.
 */
function InputMotivo({
  item,
  onSalvar,
}: {
  item: ItemProposta;
  onSalvar: (motivo: string | undefined) => Promise<ItemProposta | null>;
}) {
  const [texto, setTexto] = useState(item.ajuste.motivo ?? '');

  useEffect(() => setTexto(item.ajuste.motivo ?? ''), [item.ajuste.motivo]);

  const confirmar = async () => {
    const limpo = texto.trim();
    if (limpo === (item.ajuste.motivo ?? '')) return;
    const atualizado = await onSalvar(limpo || undefined);
    if (!atualizado) setTexto(item.ajuste.motivo ?? '');
  };

  return (
    <input
      type="text"
      value={texto}
      aria-label={`Motivo do ajuste de ${item.descricao}`}
      placeholder="Motivo do ajuste (opcional)"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setTexto(item.ajuste.motivo ?? '');
      }}
      className="mt-0.5 w-full max-w-xs bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-400 focus:bg-white rounded px-1 py-0.5 text-2xs text-slate-500 italic outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 transition"
    />
  );
}
