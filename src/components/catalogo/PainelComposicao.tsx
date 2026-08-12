import { AlertTriangle, Clock, Sigma } from 'lucide-react';
import { InsumoCatalogo } from '../../types';
import { formatBRL } from '../../lib/preco';
import { participacao } from '../../lib/composicao';
import { Button } from '../ui';

/**
 * Resumo da composição dentro do drawer de detalhe.
 *
 * Este painel já foi a única forma de ver e editar uma composição, e mostrava
 * apenas os filhos DIRETOS numa lista apertada — quem abrisse uma alvenaria via
 * "ARGAMASSA 0,028 M3" e parava aí, sem saber que dentro da argamassa há
 * cimento, areia e mais um servente. A visão completa mora agora em
 * `ModalComposicao`, com espaço para a árvore analítica, o HH e a quebra de
 * custo. O que ficou aqui é o cartão de visita: os três números que decidem se
 * vale abrir.
 */
interface PainelComposicaoProps {
  insumo: InsumoCatalogo;
  onAbrirComposicao: () => void;
}

const numero = (v: number, casas = 3) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

export default function PainelComposicao({ insumo, onAbrirComposicao }: PainelComposicaoProps) {
  const ag = insumo.agregados;
  const pctMO = ag ? participacao(ag.custoMaoDeObra, ag.custoTotal) : null;

  return (
    <div className="bg-indigo-50/30 p-3.5 rounded-xl border border-indigo-100 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-1.5">
          <Sigma size={12} aria-hidden /> Composição · {insumo.qtdComponentes} componente{insumo.qtdComponentes === 1 ? '' : 's'}
        </span>
      </div>

      {insumo.qtdComponentes === 0 ? (
        <p className="text-2xs text-slate-600 leading-relaxed">
          {insumo.precoFonte === 'SINAPI' ? (
            <>
              Adotada do SINAPI com o <strong>custo publicado</strong> ({formatBRL(insumo.precoReferencia)}),
              sem abrir os componentes — o número é idêntico ao oficial. Abrir a estrutura é o que
              destrava o HH e faz o preço reagir às suas cotações.
            </>
          ) : (
            <>
              Composição sem componentes. Enquanto estiver vazia, o preço é o valor digitado
              ({formatBRL(insumo.precoReferencia)}); no primeiro componente ele passa a ser calculado.
            </>
          )}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">
              Custo/{insumo.unidade}
            </span>
            <span className="text-sm font-extrabold text-indigo-900 font-mono">
              {formatBRL(insumo.precoReferencia)}
            </span>
          </div>
          <div>
            <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">
              HH/{insumo.unidade}
            </span>
            <span className="text-sm font-extrabold text-violet-800 font-mono flex items-center gap-1">
              {ag && ag.hhPorUnidade > 0 ? (
                <>
                  <Clock size={11} aria-hidden />
                  {numero(ag.hhPorUnidade)}
                </>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </span>
          </div>
          <div>
            <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">
              Mão de obra
            </span>
            <span className="text-sm font-extrabold text-slate-800 font-mono">
              {pctMO != null && pctMO > 0 ? `${numero(pctMO, 0)}%` : '—'}
            </span>
          </div>
        </div>
      )}

      {insumo.temComponenteInativo && (
        <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2">
          <AlertTriangle size={11} className="text-amber-700 mt-0.5 shrink-0" aria-hidden />
          <p className="text-2xs text-amber-900 font-semibold leading-relaxed">
            Há insumo desativado nesta composição. O preço dele continua entrando na conta —
            troque ou remova o componente.
          </p>
        </div>
      )}

      <Button onClick={onAbrirComposicao} bloco>
        <Sigma size={13} />
        <span>{insumo.qtdComponentes === 0 ? 'Montar composição' : 'Abrir composição'}</span>
      </Button>
    </div>
  );
}
