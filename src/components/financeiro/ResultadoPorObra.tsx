import { useMemo } from 'react';
import { Briefcase, AlertTriangle } from 'lucide-react';
import { MargemObra, ResultadoObra } from '../../types';
import { formatBRL } from '../../lib/preco';
import { margemEhParcial } from '../../lib/margem';
import EmptyState from '../EmptyState';
import { Card } from '../ui';

interface ResultadoPorObraProps {
  /** Somado no servidor (fn_resultado_obra) — não recalcular no cliente. */
  resultadoObras: ResultadoObra[];
  /** Somada em `v_margem_obra` (item A1). Ausente para obra sem insumo vinculado. */
  margensObra: MargemObra[];
}

export default function ResultadoPorObra({ resultadoObras, margensObra }: ResultadoPorObraProps) {
  const margemPorObra = useMemo(
    () => new Map(margensObra.map((m) => [m.projetoId, m])),
    [margensObra]
  );
  /** Alguma obra tem margem apurada sobre parte do orçamento? A nota de rodapé depende disso. */
  const algumaParcial = useMemo(
    () => margensObra.some((m) => margemEhParcial(m.itensConhecidos, m.itensTotal)),
    [margensObra]
  );
  const totais = useMemo(() => resultadoObras.reduce((acc, r) => ({
    orcado: acc.orcado + r.valorOrcado,
    executado: acc.executado + r.valorExecutado,
    faturado: acc.faturado + r.receitaFaturada,
    aFaturar: acc.aFaturar + r.aFaturar,
    despesa: acc.despesa + r.despesaLancada,
    resultado: acc.resultado + r.resultadoCompetencia,
    resultadoCaixa: acc.resultadoCaixa + r.resultadoCaixa,
  }), { orcado: 0, executado: 0, faturado: 0, aFaturar: 0, despesa: 0, resultado: 0, resultadoCaixa: 0 }), [resultadoObras]);

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl border border-slate-200">
        <h3 className="font-bold text-slate-800 text-sm">Resultado por Obra</h3>
        <p className="text-2xs text-slate-500 font-semibold uppercase tracking-wider mt-0.5">
          Receita faturada contra despesa lançada, obra a obra
        </p>
        <p className="text-2xs text-slate-500 mt-2 leading-relaxed">
          O resultado compara <strong>dinheiro com dinheiro</strong>: só o que passou pelo razão.
          Orçado e executado aparecem como contexto da execução física — somá-los à despesa
          contaria o mesmo custo duas vezes.
        </p>
        <p className="text-2xs text-slate-500 mt-2 leading-relaxed">
          A <strong>margem orçada</strong> é outra pergunta: o que o orçamento previa ganhar,
          comparando o preço de venda com o custo de origem de cada insumo. Uma obra pode ter
          margem alta e caixa negativo — é o normal no começo dela.
        </p>
      </div>

      {resultadoObras.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Nenhuma obra para apurar"
          description="Assim que uma obra tiver orçamento, medição faturada ou despesa lançada, o resultado dela aparece aqui."
        />
      ) : (
        <>
          <Card semPadding className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-2xs font-extrabold uppercase tracking-wider border-b border-slate-200 text-left">
                    <th scope="col" className="p-3">Obra</th>
                    <th scope="col" className="p-3 text-right">Orçado</th>
                    <th scope="col" className="p-3 text-right">Executado</th>
                    <th scope="col" className="p-3 text-right">Faturado</th>
                    <th scope="col" className="p-3 text-right">A faturar</th>
                    <th scope="col" className="p-3 text-right">Despesa</th>
                    <th scope="col" className="p-3 text-right">Margem orçada</th>
                    <th scope="col" className="p-3 text-right">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                  {resultadoObras.map(r => (
                    <tr key={r.projetoId} className="hover:bg-slate-50/40 transition">
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{r.projetoNome}</div>
                        <div className="text-2xs text-slate-500 font-semibold">
                          {r.clienteNome ?? 'Sem cliente'} · {r.situacao}
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600 whitespace-nowrap">{formatBRL(r.valorOrcado)}</td>
                      <td className="p-3 text-right font-mono text-slate-600 whitespace-nowrap">{formatBRL(r.valorExecutado)}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-600 whitespace-nowrap">{formatBRL(r.receitaFaturada)}</td>
                      <td className={`p-3 text-right font-mono whitespace-nowrap ${r.aFaturar > 0 ? 'font-bold text-amber-600' : 'text-slate-500'}`}>
                        {formatBRL(r.aFaturar)}
                      </td>
                      <td className="p-3 text-right font-mono text-rose-600 whitespace-nowrap">{formatBRL(r.despesaLancada)}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {(() => {
                          const m = margemPorObra.get(r.projetoId);
                          // Três estados diferentes, três respostas diferentes.
                          // "—" para obra sem orçamento vinculado; aviso para
                          // orçamento cujo custo não foi registrado; e o número
                          // com a ressalva quando ele fala de parte da obra.
                          if (!m || m.itensTotal === 0) {
                            return <span className="text-slate-500">—</span>;
                          }
                          if (m.margemValor == null || m.margemPercentual == null) {
                            return (
                              <span
                                className="text-2xs font-semibold text-slate-500"
                                title="Nenhum item deste orçamento tem custo de origem registrado. Obras convertidas antes de 12/ago/2026 não guardavam o custo."
                              >
                                custo não registrado
                              </span>
                            );
                          }
                          const parcial = margemEhParcial(m.itensConhecidos, m.itensTotal);
                          return (
                            <>
                              <div className={`font-mono font-bold ${m.margemValor >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                {formatBRL(m.margemValor)}
                              </div>
                              <div className="text-2xs font-semibold text-slate-500 flex items-center justify-end gap-1">
                                {parcial && (
                                  <AlertTriangle
                                    size={11}
                                    className="text-amber-700"
                                    aria-hidden="true"
                                  />
                                )}
                                <span>
                                  {m.margemPercentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                                  {parcial && ` · ${m.itensConhecidos} de ${m.itensTotal}`}
                                </span>
                              </div>
                            </>
                          );
                        })()}
                      </td>
                      <td className={`p-3 text-right font-mono font-extrabold whitespace-nowrap ${r.resultadoCompetencia >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                        {formatBRL(r.resultadoCompetencia)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 text-xs font-extrabold text-slate-800">
                    <td className="p-3 uppercase text-2xs tracking-wider text-slate-500">Total</td>
                    <td className="p-3 text-right font-mono">{formatBRL(totais.orcado)}</td>
                    <td className="p-3 text-right font-mono">{formatBRL(totais.executado)}</td>
                    <td className="p-3 text-right font-mono text-emerald-700">{formatBRL(totais.faturado)}</td>
                    <td className="p-3 text-right font-mono text-amber-700">{formatBRL(totais.aFaturar)}</td>
                    <td className="p-3 text-right font-mono text-rose-700">{formatBRL(totais.despesa)}</td>
                    {/* Sem total de margem de propósito: somar margens apuradas
                        sobre coberturas diferentes daria um número que não
                        descreve nada. O percentual de cada obra é sobre a venda
                        DELA. */}
                    <td className="p-3 text-right text-2xs font-semibold text-slate-500">por obra</td>
                    <td className={`p-3 text-right font-mono ${totais.resultado >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                      {formatBRL(totais.resultado)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {algumaParcial && (
            <p className="text-2xs text-slate-600 flex items-start gap-1.5 justify-center">
              <AlertTriangle size={12} className="text-amber-700 shrink-0 mt-px" aria-hidden="true" />
              <span>
                O triângulo marca a margem apurada sobre <strong>parte</strong> do orçamento — os
                demais itens não têm custo de origem registrado, e entram na venda sem entrar no
                custo.
              </span>
            </p>
          )}

          <p className="text-2xs text-slate-500 font-semibold text-center">
            Resultado por competência (faturado − lançado). Em regime de caixa, considerando só o que foi
            pago e recebido: <span className="font-mono text-slate-600">{formatBRL(totais.resultadoCaixa)}</span>.
          </p>
        </>
      )}
    </div>
  );
}
