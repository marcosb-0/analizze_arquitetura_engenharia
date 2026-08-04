import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { FatiaConfiancaPreco } from '../types';
import { confiancaService } from '../services/confiancaService';
import Spinner from './Spinner';

/**
 * Composição do orçamento por firmeza de preço.
 *
 * A pergunta que este bloco responde não é "o preço está certo" — é "quanto
 * deste orçamento é chute". Quando não dá tempo de cotar, o orçamento se
 * preenche sozinho com o melhor preço disponível (fn_preco_vigente), e a
 * decisão que sobra para a pessoa é de MARGEM: quanta contingência colocar em
 * cima da parte que não está confirmada.
 *
 * Hoje essa conta é feita de cabeça, ou não é feita.
 */

const ESTILO: Record<number, { rotulo: string; barra: string; texto: string }> = {
  1: { rotulo: 'Cotação firme',     barra: 'bg-emerald-500', texto: 'text-emerald-700' },
  2: { rotulo: 'Praticado',         barra: 'bg-sky-500',     texto: 'text-sky-700' },
  3: { rotulo: 'Estimado',          barra: 'bg-slate-400',   texto: 'text-slate-600' },
  4: { rotulo: 'Referência SINAPI', barra: 'bg-amber-500',   texto: 'text-amber-700' },
  0: { rotulo: 'Sem procedência',   barra: 'bg-slate-300',   texto: 'text-slate-500' },
};

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Props {
  /** Um dos dois. A origem muda a view consultada, não a leitura. */
  projetoId?: string;
  propostaId?: string;
  /** Muda para forçar releitura depois de mexer nos insumos. */
  recarregarEm?: unknown;
}

export default function ConfiancaPreco({ projetoId, propostaId, recarregarEm }: Props) {
  const [fatias, setFatias] = useState<FatiaConfiancaPreco[] | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setErro(false);
    const busca = projetoId
      ? confiancaService.doProjeto(projetoId)
      : propostaId
        ? confiancaService.daProposta(propostaId)
        : Promise.resolve([]);
    busca
      .then((f) => { if (vivo) setFatias(f); })
      .catch(() => { if (vivo) { setFatias([]); setErro(true); } });
    return () => { vivo = false; };
  }, [projetoId, propostaId, recarregarEm]);

  const resumo = useMemo(() => {
    if (!fatias) return null;
    const total = fatias.reduce((s, f) => s + f.valor, 0);
    // Exposição = tudo que não é cotação firme. "Praticado" entra porque é
    // preço real mas não garantido: o fornecedor não está mais preso a ele.
    const exposto = fatias.filter((f) => f.nivel !== 1).reduce((s, f) => s + f.valor, 0);
    const pctExposto = total > 0 ? (exposto / total) * 100 : 0;
    // Contingência sugerida: peso por nível sobre a fatia de cada um. Não é
    // norma de lugar nenhum — é uma referência de partida, explícita para poder
    // ser discutida em vez de virar número mágico.
    const PESO: Record<number, number> = { 1: 0, 2: 0.03, 3: 0.08, 4: 0.10, 0: 0.10 };
    const contingencia = total > 0
      ? fatias.reduce((s, f) => s + f.valor * (PESO[f.nivel] ?? 0.1), 0) / total * 100
      : 0;
    return { total, exposto, pctExposto, contingencia };
  }, [fatias]);

  if (!fatias) {
    return (
      <div className="flex justify-center py-6"><Spinner size={16} /></div>
    );
  }

  if (erro) {
    return (
      <p className="text-2xs text-slate-500 py-2">
        Não foi possível carregar a composição de preços.
      </p>
    );
  }

  if (fatias.length === 0 || !resumo || resumo.total <= 0) {
    return (
      <p className="text-2xs text-slate-500 py-2">
        Nenhum insumo com preço vinculado ainda — a composição por procedência aparece
        assim que o orçamento tiver itens do catálogo.
      </p>
    );
  }

  const ordenadas = [...fatias].sort((a, b) => (a.nivel === 0 ? 9 : a.nivel) - (b.nivel === 0 ? 9 : b.nivel));

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-slate-100 rounded text-slate-600"><ShieldCheck size={14} /></div>
        <div>
          <h4 className="text-xs font-bold text-slate-900 leading-none">Confiança do preço</h4>
          <p className="text-2xs text-slate-500 mt-1">De onde veio cada real deste orçamento.</p>
        </div>
      </div>

      {/* Barra empilhada — a leitura de um segundo */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
        {ordenadas.map((f) => (
          <div
            key={f.nivel}
            className={ESTILO[f.nivel]?.barra ?? 'bg-slate-300'}
            style={{ width: `${(f.valor / resumo.total) * 100}%` }}
            title={`${ESTILO[f.nivel]?.rotulo}: ${fmtBRL(f.valor)}`}
          />
        ))}
      </div>

      <div className="space-y-1.5">
        {ordenadas.map((f) => {
          const pct = (f.valor / resumo.total) * 100;
          const est = ESTILO[f.nivel] ?? ESTILO[0];
          return (
            <div key={f.nivel} className="flex items-center gap-2 text-2xs">
              <span className={`w-2 h-2 rounded-sm shrink-0 ${est.barra}`} />
              <span className={`font-bold ${est.texto}`}>{est.rotulo}</span>
              <span className="text-slate-500">
                {f.itens} {f.itens === 1 ? 'item' : 'itens'}
                {f.nivel > 0 && f.nivel <= 2 && f.idadeMediaDias != null &&
                  ` · idade média ${Math.round(f.idadeMediaDias)}d`}
              </span>
              <span className="ml-auto font-mono font-bold text-slate-700">{fmtBRL(f.valor)}</span>
              <span className="font-mono text-slate-500 w-10 text-right">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>

      <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-1.5 text-2xs">
          {resumo.pctExposto > 30
            ? <AlertTriangle size={12} className="text-amber-500 shrink-0" />
            : <ShieldCheck size={12} className="text-emerald-500 shrink-0" />}
          <span className="text-slate-500">Exposição a preço não confirmado:</span>
          <strong className="font-mono text-slate-800">{fmtBRL(resumo.exposto)}</strong>
          <span className="font-mono text-slate-500">({resumo.pctExposto.toFixed(0)}%)</span>
        </div>
        <div className="text-2xs text-slate-500">
          Contingência sugerida:{' '}
          <strong className="font-mono text-slate-800">{resumo.contingencia.toFixed(1)}%</strong>
        </div>
      </div>
    </div>
  );
}
