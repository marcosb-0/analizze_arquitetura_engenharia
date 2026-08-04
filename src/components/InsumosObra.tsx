import { useMemo, useState } from 'react';
import { Package, Trash2, Info, RefreshCw, TrendingUp, AlertTriangle } from 'lucide-react';
import { InsumoProjeto, InsumoCatalogo, Fornecedor, AjustePreco, TipoAjuste } from '../types';
import { aplicarAjuste, ajusteRecusadoPeloBanco, deltaAjuste, descreveAjuste, formatBRL } from '../lib/preco';
import { useFeedback } from './FeedbackContext';
import EmptyState from './EmptyState';

/**
 * Quantitativo de insumos da obra — o que antes se perdia dentro da string de
 * descrição do item de orçamento ("Cimento (10 saco) via Casa X").
 *
 * Aqui é onde o preço de um insumo pode ser acrescido ou reduzido PARA ESTA
 * OBRA sem tocar no preço de referência global do catálogo: a base fica
 * congelada, o ajuste é desta obra, e `valor_orcado` do item de orçamento é
 * recalculado no banco a cada mudança.
 */

interface InsumosObraProps {
  insumos: InsumoProjeto[];
  catalogo: InsumoCatalogo[];
  fornecedores: Fornecedor[];
  somenteLeitura: boolean;
  onAjustarPreco: (id: string, ajuste: AjustePreco) => Promise<InsumoProjeto | null>;
  onAjustarQuantidade: (id: string, quantidade: number) => Promise<InsumoProjeto | null>;
  onRessincronizarBase: (id: string, novaBase: number) => Promise<InsumoProjeto | null>;
  onRemover: (id: string) => Promise<boolean>;
}

export default function InsumosObra({
  insumos,
  catalogo,
  fornecedores,
  somenteLeitura,
  onAjustarPreco,
  onAjustarQuantidade,
  onRessincronizarBase,
  onRemover,
}: InsumosObraProps) {
  const { confirm } = useFeedback();
  const [editando, setEditando] = useState<string | null>(null);

  const totais = useMemo(() => {
    const base = insumos.reduce((s, i) => s + i.quantidade * i.precoUnitarioBase, 0);
    const final = insumos.reduce((s, i) => s + i.valorTotal, 0);
    return { base, final, ajuste: final - base };
  }, [insumos]);

  /**
   * Curva ABC simplificada: quais insumos concentram o custo. Só é possível
   * porque agora existe quantidade × preço por insumo, e não um total opaco.
   */
  const curvaABC = useMemo(() => {
    const ordenados = [...insumos].sort((a, b) => b.valorTotal - a.valorTotal);
    // `react-hooks/immutability` reprova a reatribuição de `acumulado` abaixo,
    // por ser uma variável capturada por closure e mutada durante o render.
    // Aqui é falso positivo, e a supressão é deliberada: `acumulado` é local
    // desta callback do `useMemo`, e o `.map()` que a lê roda de forma síncrona
    // e termina antes de a callback retornar — nada escapa nem sobrevive ao
    // cálculo. As alternativas sem mutação (fatiar e somar por índice, ou
    // `reduce` recriando o array a cada passo) trocam um O(n) por um O(n²) para
    // agradar a regra, o que é um péssimo negócio numa curva ABC.
    let acumulado = 0;
    return ordenados.map((i) => {
      // eslint-disable-next-line react-hooks/immutability
      acumulado += i.valorTotal;
      return { insumo: i, participacao: totais.final > 0 ? (i.valorTotal / totais.final) * 100 : 0, acumulado: totais.final > 0 ? (acumulado / totais.final) * 100 : 0 };
    });
  }, [insumos, totais.final]);

  const nomeFornecedor = (id?: string) => fornecedores.find((f) => f.id === id)?.empresa;

  /**
   * Linhas que valem atualizar em lote.
   *
   * O recorte é por FIRMEZA, não por diferença de preço: uma linha que nasceu
   * de cotação firme foi negociada e não se mexe nela por atacado, ainda que o
   * catálogo tenha mudado — quem negociou decide caso a caso, pelo botão da
   * própria linha. O lote existe para o resto: o que entrou como estimativa ou
   * como referência SINAPI porque não deu tempo de cotar.
   *
   * Linha sem procedência (anterior ao rastreamento) entra: não saber de onde
   * veio é motivo para atualizar, não para preservar.
   */
  const candidatosLote = useMemo(() => {
    return insumos
      .map((insumo) => {
        const c = catalogo.find((x) => x.id === insumo.catalogoInsumoId);
        const novaBase = c?.precoVigente ?? c?.precoReferencia;
        if (novaBase == null) return null;
        if (Math.abs(novaBase - insumo.precoUnitarioBase) <= 0.005) return null;
        // Nível 1 = cotação firme desta obra. Fica de fora do lote.
        if (insumo.precoNivel === 1) return null;
        const delta = (novaBase - insumo.precoUnitarioBase) * insumo.quantidade;
        return { insumo, novaBase, delta };
      })
      .filter((x): x is { insumo: InsumoProjeto; novaBase: number; delta: number } => x !== null);
  }, [insumos, catalogo]);

  const impactoLote = useMemo(
    () => candidatosLote.reduce((s, c) => s + c.delta, 0),
    [candidatosLote]
  );

  const [aplicandoLote, setAplicandoLote] = useState(false);

  const aplicarLote = () => {
    confirm({
      title: `Atualizar ${candidatosLote.length} ${candidatosLote.length === 1 ? 'preço' : 'preços'}?`,
      message:
        `As linhas que nasceram de cotação firme não são tocadas. ` +
        `Impacto no orçamento desta obra: ${impactoLote >= 0 ? '+' : '−'}${formatBRL(Math.abs(impactoLote))}. ` +
        `O ajuste de cada linha é preservado — muda só a base.`,
      onConfirm: async () => {
        setAplicandoLote(true);
        try {
          // Sequencial de propósito: cada escrita dispara o recálculo de
          // `valor_orcado` por trigger, e disparar dezenas em paralelo só
          // aumenta a chance de erro parcial sem ganhar tempo real.
          for (const c of candidatosLote) {
            await onRessincronizarBase(c.insumo.id, c.novaBase);
          }
        } finally {
          setAplicandoLote(false);
        }
      },
    });
  };

  if (insumos.length === 0) {
    return (
      <div className="space-y-3 pt-4 border-t border-slate-200">
        <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
          <Package size={14} className="text-slate-500" />
          <span>Quantitativo de Insumos</span>
        </h4>
        <EmptyState
          icon={Package}
          title="Nenhum insumo quantificado"
          description="Vincule insumos pelo Catálogo para registrar quantidade e preço unitário. Só assim é possível recalcular o orçamento quando o preço muda e montar a curva ABC."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-4 border-t border-slate-200">
      <div className="flex justify-between items-center">
        <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
          <Package size={14} className="text-slate-500" />
          <span>Quantitativo de Insumos ({insumos.length})</span>
        </h4>
        <div className="flex items-center gap-2">
          {totais.ajuste !== 0 && (
            <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border ${totais.ajuste > 0 ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
              {totais.ajuste > 0 ? '+' : '−'}{formatBRL(Math.abs(totais.ajuste))} em ajustes desta obra
            </span>
          )}
          {/* Atualizar o que não é firme, de uma vez. Some quando não há nada a
              atualizar — botão que nunca faz nada é ruído. */}
          {!somenteLeitura && candidatosLote.length > 0 && (
            <button
              onClick={aplicarLote}
              disabled={aplicandoLote}
              title="Atualiza a base das linhas que não vieram de cotação firme, preservando o ajuste de cada uma."
              className="inline-flex items-center gap-1.5 text-2xs font-bold px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={11} className={aplicandoLote ? 'animate-spin' : undefined} />
              Atualizar {candidatosLote.length} {candidatosLote.length === 1 ? 'preço' : 'preços'}
              <span className={`font-mono ${impactoLote >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                ({impactoLote >= 0 ? '+' : '−'}{formatBRL(Math.abs(impactoLote))})
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-visible shadow-xs bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase text-2xs">
              <tr>
                <th scope="col" className="p-2.5">Insumo</th>
                <th scope="col" className="p-2.5 text-right w-20">Qtd</th>
                <th scope="col" className="p-2.5 text-right w-24">Base</th>
                <th scope="col" className="p-2.5 text-right w-28">Ajuste da obra</th>
                <th scope="col" className="p-2.5 text-right w-24">Unit. final</th>
                <th scope="col" className="p-2.5 text-right w-28">Total</th>
                <th scope="col" className="p-2.5 text-right w-16">% obra</th>
                <th scope="col" className="p-2.5 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {curvaABC.map(({ insumo, participacao }) => {
                const delta = deltaAjuste(insumo.precoUnitarioBase, insumo.ajuste);
                const catalogoAtual = catalogo.find((c) => c.id === insumo.catalogoInsumoId);
                // O catálogo pode ter mudado depois da vinculação — a obra
                // mantém a foto antiga de propósito; só avisamos.
                //
                // Compara com o preço VIGENTE (cotação > praticado > estimado >
                // referência), não com `precoReferencia`: desde 20260726230000 o
                // preço que vale é o resolvido pela cadeia, e comparar com o
                // valor gravado ignoraria justamente a cotação recém-cadastrada
                // — que é o caso em que atualizar mais importa.
                const referenciaAtual =
                  catalogoAtual?.precoVigente ?? catalogoAtual?.precoReferencia ?? insumo.insumoPrecoReferencia;
                const baseDesatualizada = Math.abs(referenciaAtual - insumo.precoUnitarioBase) > 0.005;

                return (
                  <tr key={insumo.id} className="hover:bg-slate-50/40 transition relative">
                    <td className="p-2.5">
                      <div className="font-bold text-slate-800 leading-tight">{insumo.insumoDescricao}</div>
                      <div className="text-2xs text-slate-500 mt-0.5">
                        {insumo.insumoUnidade} · {insumo.status}
                        {nomeFornecedor(insumo.fornecedorId) ? ` · ${nomeFornecedor(insumo.fornecedorId)}` : ''}
                      </div>
                      {insumo.ajuste.motivo && (
                        <div className="text-2xs text-slate-500 italic mt-0.5">"{insumo.ajuste.motivo}"</div>
                      )}
                      {baseDesatualizada && (
                        <button
                          disabled={somenteLeitura}
                          onClick={() =>
                            confirm({
                              title: 'Atualizar preço base',
                              message: `A base desta obra é ${formatBRL(insumo.precoUnitarioBase)} e o catálogo hoje está em ${formatBRL(referenciaAtual)}. Atualizar a base mantendo o ajuste desta obra?`,
                              onConfirm: () => {
                                onRessincronizarBase(insumo.id, referenciaAtual);
                              },
                            })
                          }
                          className="mt-1 inline-flex items-center gap-1 text-2xs font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 hover:bg-amber-100 transition disabled:opacity-50 disabled:cursor-default"
                          title="O preço de referência do catálogo mudou desde a vinculação"
                        >
                          <AlertTriangle size={9} />
                          Catálogo hoje: {formatBRL(referenciaAtual)}
                          {!somenteLeitura && <RefreshCw size={9} />}
                        </button>
                      )}
                    </td>

                    <td className="p-2.5 text-right">
                      {somenteLeitura ? (
                        <span className="font-mono">{insumo.quantidade}</span>
                      ) : (
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          defaultValue={insumo.quantidade}
                          onBlur={(e) => {
                            const q = parseFloat(e.target.value);
                            if (!isNaN(q) && q > 0 && q !== insumo.quantidade) onAjustarQuantidade(insumo.id, q);
                            else e.target.value = String(insumo.quantidade);
                          }}
                          className="w-16 text-right bg-white border border-slate-200 rounded px-1 py-0.5 font-mono outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-500"
                        />
                      )}
                    </td>

                    <td className="p-2.5 text-right font-mono text-slate-500">
                      {formatBRL(insumo.precoUnitarioBase)}
                      {/* Firmeza congelada no vínculo. É o que explica por que
                          uma linha fica de fora da atualização em lote. */}
                      {insumo.precoNivel && (
                        <span
                          title={
                            insumo.precoNivel === 1
                              ? 'Preço negociado: veio de cotação firme e não é alterado em lote.'
                              : `Origem do preço: ${insumo.precoFonteEfetiva}. Entra na atualização em lote.`
                          }
                          className={`block text-2xs font-sans font-bold mt-0.5 ${
                            insumo.precoNivel === 1 ? 'text-emerald-600'
                            : insumo.precoNivel === 2 ? 'text-sky-600'
                            : insumo.precoNivel === 3 ? 'text-slate-500'
                            : 'text-amber-600'
                          }`}
                        >
                          {insumo.precoNivel === 1 ? 'firme' : insumo.precoFonteEfetiva?.toLowerCase()}
                        </span>
                      )}
                    </td>

                    <td className="p-2.5 text-right relative">
                      {editando === insumo.id ? (
                        <EditorAjusteObra
                          base={insumo.precoUnitarioBase}
                          ajusteAtual={insumo.ajuste}
                          onCancelar={() => setEditando(null)}
                          onSalvar={async (a) => {
                            await onAjustarPreco(insumo.id, a);
                            setEditando(null);
                          }}
                        />
                      ) : (
                        <button
                          disabled={somenteLeitura}
                          onClick={() => setEditando(insumo.id)}
                          className={`font-mono font-bold px-1.5 py-0.5 rounded transition disabled:cursor-default ${
                            delta === 0 ? 'text-slate-500 hover:bg-slate-100'
                            : delta > 0 ? 'text-rose-600 bg-rose-50'
                            : 'text-emerald-600 bg-emerald-50'
                          } ${!somenteLeitura && 'hover:ring-1 hover:ring-blue-200'}`}
                          title={somenteLeitura ? undefined : 'Acréscimo ou desconto só desta obra — o catálogo global não muda'}
                        >
                          {delta === 0 ? '—' : `${delta > 0 ? '+' : '−'}${formatBRL(Math.abs(delta))}`}
                        </button>
                      )}
                    </td>

                    <td className="p-2.5 text-right font-mono font-bold text-slate-900">{formatBRL(insumo.precoUnitario)}</td>
                    <td className="p-2.5 text-right font-mono font-extrabold text-slate-900">{formatBRL(insumo.valorTotal)}</td>

                    <td className="p-2.5 text-right">
                      <span className={`font-mono text-2xs font-bold ${participacao >= 20 ? 'text-blue-700' : 'text-slate-500'}`}>
                        {participacao.toFixed(1)}%
                      </span>
                    </td>

                    <td className="p-2.5 text-right">
                      {!somenteLeitura && (
                        <button
                          onClick={() =>
                            confirm({
                              title: 'Remover insumo da obra',
                              message: `Remover "${insumo.insumoDescricao}"? O item de orçamento vinculado tem o valor recalculado.`,
                              onConfirm: () => {
                                onRemover(insumo.id);
                              },
                            })
                          }
                          aria-label="Remover insumo da obra"
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
            <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold">
              <tr>
                <td className="p-2.5 text-2xs uppercase text-slate-500" colSpan={2}>Total do quantitativo</td>
                <td className="p-2.5 text-right font-mono text-slate-500">{formatBRL(totais.base)}</td>
                <td className={`p-2.5 text-right font-mono ${totais.ajuste > 0 ? 'text-rose-600' : totais.ajuste < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {totais.ajuste === 0 ? '—' : `${totais.ajuste > 0 ? '+' : '−'}${formatBRL(Math.abs(totais.ajuste))}`}
                </td>
                <td />
                <td className="p-2.5 text-right font-mono text-slate-900">{formatBRL(totais.final)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {curvaABC.length > 2 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-2">
            <TrendingUp size={11} /> Concentração de custo
          </span>
          <p className="text-2xs text-slate-600 leading-relaxed">
            {(() => {
              const ateOitenta = curvaABC.findIndex((c) => c.acumulado >= 80) + 1;
              const qtd = ateOitenta || curvaABC.length;
              return (
                <>
                  <strong>{qtd}</strong> de {curvaABC.length} insumos concentram 80% do custo desta obra.
                  Comece por eles ao negociar: {curvaABC.slice(0, Math.min(3, qtd)).map((c) => c.insumo.insumoDescricao).join(', ')}.
                </>
              );
            })()}
          </p>
        </div>
      )}
    </div>
  );
}

/** Editor inline do ajuste — mesmo contrato do usado na proposta. */
function EditorAjusteObra({
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

  /**
   * O desconto passou do valor da base.
   *
   * `aplicarAjuste` limita a exibição a zero, mas o banco NÃO limita: ele calcula
   * o negativo e a CHECK `preco_unitario >= 0` **recusa a linha** (23514). Sem
   * esta checagem, a tela mostrava `R$ 0,00`, o usuário clicava em Aplicar e
   * recebia o erro cru do Postgres. Ver §3.11 e `lib/preco.ts`.
   *
   * `CatalogoTab` já tratava o caso equivalente no seu formulário de vinculação
   * (`if (bindPrecoFinal <= 0)`); aqui faltava.
   */
  const recusado = ajusteRecusadoPeloBanco(base, ajuste);

  return (
    <div className="absolute right-2 top-8 z-30 bg-white border border-blue-200 rounded-lg shadow-lg p-2.5 w-64 space-y-2 text-left">
      <div className="flex items-start gap-1.5">
        <Info size={11} className="text-blue-600 mt-0.5 shrink-0" />
        <p className="text-2xs text-blue-900 font-semibold leading-tight">
          Vale só para esta obra. O preço de referência do catálogo permanece o mesmo.
        </p>
      </div>

      <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAjuste)} className="w-full border border-slate-200 rounded p-1 text-2xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50">
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
        className="w-full border border-slate-200 rounded p-1 text-2xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 font-mono disabled:bg-slate-50"
      />

      <input
        type="text"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (ex: frete, urgência)"
        className="w-full border border-slate-200 rounded p-1 text-2xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
      />

      <div className="text-2xs font-mono text-slate-600 bg-slate-50 rounded p-1.5">
        {formatBRL(base)} → <strong className="text-slate-900">{formatBRL(final)}</strong>
        <span className="block text-2xs text-slate-500 mt-0.5">{descreveAjuste(base, ajuste)}</span>
      </div>

      {recusado && (
        <p role="alert" className="text-2xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded p-1.5 leading-snug">
          O desconto passou do preço base. Reveja o ajuste — o preço final não pode ficar
          negativo.
        </p>
      )}

      <div className="flex gap-1.5">
        <button onClick={onCancelar} className="flex-1 border border-slate-200 text-slate-600 font-bold py-1 rounded text-2xs hover:bg-slate-50">
          Cancelar
        </button>
        <button
          onClick={() => onSalvar(ajuste)}
          disabled={recusado}
          title={recusado ? 'O preço final não pode ser negativo.' : undefined}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-1 rounded text-2xs"
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}
