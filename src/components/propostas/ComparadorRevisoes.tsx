import { useState } from 'react';
import { RevisaoProposta } from '../../types';
import { formatarDataBR } from '../../lib/data';
import { formatBRL } from '../../lib/preco';
import { ROTULO_MUDANCA, compararRevisoes } from '../../lib/diffRevisao';
import { Select } from '../ui';

interface Props {
  revisoes: RevisaoProposta[];
}

/**
 * Comparador lado a lado de duas versões congeladas da proposta.
 *
 * As duas seleções vivem aqui: nada fora deste bloco depende de qual par está
 * aberto, e antes elas eram dois `useState` no componente de 2.100 linhas.
 */
export default function ComparadorRevisoes({ revisoes }: Props) {
  const [versaoA, setVersaoA] = useState<number | ''>('');
  const [versaoB, setVersaoB] = useState<number | ''>('');

  return (
    <div
      id="revisoes-comparison-widget"
      className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-left"
    >
      <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">
        Comparador de Versões Lado a Lado
      </span>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-2xs font-bold text-slate-500 uppercase mb-1">
            Revisão Base (A)
          </label>
          <Select
            value={versaoA}
            onChange={(e) => setVersaoA(e.target.value ? parseInt(e.target.value) : '')} className="font-medium cursor-pointer"
          >
            <option value="">Selecione...</option>
            {revisoes.map((r) => (
              <option key={r.versao} value={r.versao}>
                Versão v{r.versao}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-2xs font-bold text-slate-500 uppercase mb-1">
            Revisão Comparada (B)
          </label>
          <Select
            value={versaoB}
            onChange={(e) => setVersaoB(e.target.value ? parseInt(e.target.value) : '')} className="font-medium cursor-pointer"
          >
            <option value="">Selecione...</option>
            {revisoes.map((r) => (
              <option key={r.versao} value={r.versao}>
                Versão v{r.versao}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Diferencas revisoes={revisoes} versaoA={versaoA} versaoB={versaoB} />
    </div>
  );
}

function Diferencas({
  revisoes,
  versaoA,
  versaoB,
}: Props & { versaoA: number | ''; versaoB: number | '' }) {
  if (versaoA === '' || versaoB === '') return null;
  if (versaoA === versaoB) {
    return (
      <p className="text-2xs text-slate-500 italic">
        Selecione duas revisões diferentes para ver as diferenças.
      </p>
    );
  }

  const revA = revisoes.find((r) => r.versao === versaoA);
  const revB = revisoes.find((r) => r.versao === versaoB);
  if (!revA || !revB) return null;

  const diff = compararRevisoes(revA, revB);
  const deltaVal = diff.deltaValor;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5 shadow-xs">
      <div className="grid grid-cols-2 gap-3 divide-x divide-slate-100">
        <div className="space-y-1">
          <span className="text-2xs font-bold text-slate-500 uppercase block">
            Versão v{revA.versao}
          </span>
          <p className="font-mono text-xs font-bold text-slate-800">{formatBRL(revA.valor)}</p>
          <p className="text-2xs text-slate-500 font-mono">Em: {formatarDataBR(revA.data)}</p>
          <p className="text-2xs text-slate-600 italic mt-1 leading-relaxed">"{revA.alteracoes}"</p>
        </div>

        <div className="pl-3 space-y-1">
          <span className="text-2xs font-bold text-slate-500 uppercase block">
            Versão v{revB.versao}
          </span>
          <p className="font-mono text-xs font-bold text-slate-800">{formatBRL(revB.valor)}</p>
          <p className="text-2xs text-slate-500 font-mono">Em: {formatarDataBR(revB.data)}</p>
          <p className="text-2xs text-slate-600 italic mt-1 leading-relaxed">"{revB.alteracoes}"</p>
        </div>
      </div>

      {/* O que mudou, item a item */}
      {diff.comparavel && (
        <div className="border-t border-slate-100 pt-2 space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">
              O que mudou na composição
            </span>
            {diff.inalterados > 0 && (
              <span className="text-2xs text-slate-500">
                {diff.inalterados} {diff.inalterados === 1 ? 'item inalterado' : 'itens inalterados'}
              </span>
            )}
          </div>

          {diff.parcial && (
            <p className="text-2xs text-amber-700 bg-amber-50 border border-amber-100 rounded p-1.5 leading-relaxed">
              Uma das versões não tem composição congelada, então a comparação mostra o orçamento
              inteiro como novidade.
            </p>
          )}

          {diff.linhas.length === 0 ? (
            <p className="text-2xs text-slate-500 italic">
              Os itens são idênticos nas duas versões
              {diff.deltaBdi !== 0 ? ' — a diferença veio só do BDI.' : '.'}
            </p>
          ) : (
            <div className="space-y-1">
              {diff.linhas.map((linha) => (
                <div
                  key={linha.chave}
                  className="flex items-start justify-between gap-2 bg-slate-50/70 rounded px-1.5 py-1"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-2xs font-extrabold uppercase px-1 py-0.5 rounded shrink-0 ${
                          linha.tipo === 'adicionado'
                            ? 'bg-emerald-100 text-emerald-700'
                            : linha.tipo === 'removido'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        {ROTULO_MUDANCA[linha.tipo]}
                      </span>
                      <span className="text-2xs font-bold text-slate-700 truncate">
                        {linha.descricao}
                      </span>
                    </div>
                    {linha.antes && linha.depois && (
                      <div className="text-2xs text-slate-500 font-mono mt-0.5 pl-1">
                        {linha.antes.quantidade !== linha.depois.quantidade && (
                          <span className="mr-2">
                            {linha.antes.quantidade} → {linha.depois.quantidade} {linha.unidade}
                          </span>
                        )}
                        {linha.antes.precoUnitario !== linha.depois.precoUnitario && (
                          <span>
                            {formatBRL(linha.antes.precoUnitario)} →{' '}
                            {formatBRL(linha.depois.precoUnitario)}
                          </span>
                        )}
                      </div>
                    )}
                    {!linha.antes && linha.depois && (
                      <div className="text-2xs text-slate-500 font-mono mt-0.5 pl-1">
                        {linha.depois.quantidade} {linha.unidade} ×{' '}
                        {formatBRL(linha.depois.precoUnitario)}
                      </div>
                    )}
                    {linha.antes && !linha.depois && (
                      <div className="text-2xs text-slate-500 font-mono mt-0.5 pl-1">
                        {linha.antes.quantidade} {linha.unidade} ×{' '}
                        {formatBRL(linha.antes.precoUnitario)}
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-2xs font-mono font-bold shrink-0 ${
                      linha.deltaTotal > 0
                        ? 'text-rose-600'
                        : linha.deltaTotal < 0
                          ? 'text-emerald-600'
                          : 'text-slate-500'
                    }`}
                  >
                    {linha.deltaTotal > 0 ? '+' : linha.deltaTotal < 0 ? '−' : ''}
                    {formatBRL(Math.abs(linha.deltaTotal))}
                  </span>
                </div>
              ))}
            </div>
          )}

          {diff.deltaBdi !== 0 && (
            <div className="flex justify-between text-2xs px-1.5">
              <span className="text-slate-600 font-semibold">BDI</span>
              <span className="font-mono font-bold text-slate-700">
                {revA.bdiPercentual}% → {revB.bdiPercentual}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Comparativo de diferença */}
      <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-xs">
        <span className="font-semibold text-slate-600">Diferença Financeira:</span>
        <div className="text-right">
          <span className={`font-mono font-bold ${deltaVal >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {deltaVal >= 0 ? '+' : ''}
            {formatBRL(deltaVal)}
          </span>
          <span
            className={`text-2xs font-bold font-mono ml-1.5 px-1 rounded ${
              deltaVal >= 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {deltaVal >= 0 ? '+' : ''}
            {diff.deltaPercentual.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
