import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { CHIP, Kpi } from '../ui';
import type { Comparado } from '../../lib/indicadores/calculos';
import { variacaoTexto } from '../../lib/indicadores/formato';

/**
 * O KPI do painel de indicadores: o `Kpi` do sistema com a linha de variação.
 *
 * `sentido` diz se subir é bom. "Medido" subir é bom; "rejeitadas" subir é
 * ruim; "boletins" é neutro (mais boletins não é melhor nem pior). Sem isso a
 * seta verde de "+40% de rejeições" comemoraria um problema.
 *
 * A variação some — e diz por quê — quando o período anterior é zero: "+∞%"
 * não é informação, e "sem base de comparação" é.
 */
export type Sentido = 'alta-boa' | 'baixa-boa' | 'neutro';

interface Props {
  rotulo: string;
  valor: React.ReactNode;
  /** Valor por extenso, no `title` — o KPI mostra a forma curta. */
  titulo?: string;
  detalhe?: React.ReactNode;
  /** Presente = o período está sendo comparado. */
  comparado?: Comparado | null;
  sentido?: Sentido;
  rotuloAnterior?: string;
  onClick?: () => void;
  icone?: React.ReactNode;
}

export default function KpiBI({ rotulo, valor, titulo, detalhe, comparado, sentido = 'neutro', rotuloAnterior, onClick, icone }: Props) {
  return (
    <Kpi
      rotulo={rotulo}
      icone={icone}
      onClick={onClick}
      valor={<span title={titulo}>{valor}</span>}
      detalhe={
        (detalhe || comparado) ? (
          <>
            {comparado && <LinhaVariacao comparado={comparado} sentido={sentido} rotuloAnterior={rotuloAnterior} />}
            {detalhe && <span className="block">{detalhe}</span>}
          </>
        ) : undefined
      }
    />
  );
}

function LinhaVariacao({ comparado, sentido, rotuloAnterior }: { comparado: Comparado; sentido: Sentido; rotuloAnterior?: string }) {
  const v = comparado.variacao;
  if (v === null) {
    return <span className="block">{comparado.atual === 0 ? 'Nada no período anterior também' : 'Sem base de comparação'}</span>;
  }
  const subiu = v > 0;
  const tom = v === 0 || sentido === 'neutro' ? 'neutro' : (subiu === (sentido === 'alta-boa')) ? 'positivo' : 'negativo';
  const Icone = v === 0 ? Minus : subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex items-center gap-1" title={rotuloAnterior ? `Comparado com ${rotuloAnterior}` : undefined}>
      <span className="inline-flex items-center gap-0.5 font-semibold" style={{ color: CHIP[tom].texto }}>
        <Icone size={13} aria-hidden="true" />
        <span className="data-font">{variacaoTexto(v)}</span>
      </span>
      <span>vs. anterior</span>
    </span>
  );
}
