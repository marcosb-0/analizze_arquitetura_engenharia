import { Ruler, Wand2 } from 'lucide-react';
import { InsumoProjeto } from '../../types';
import { sugerirQuantidadeDaEtapa } from '../../lib/quantidadeEtapa';
import { formatarQuantidade } from '../../lib/medicaoQuantidade';
import { Button, Typography } from '../ui';

/**
 * A meta da etapa, sugerida a partir dos insumos já amarrados a ela.
 *
 * SUGERE, NUNCA SOBRESCREVE — mesmo contrato do `PainelHHEtapa` ao lado. Aqui o
 * motivo é ainda mais direto: a quantidade prevista vira base de cálculo de
 * todo boletim futuro, e o banco proíbe alterá-la depois do primeiro boletim
 * medido. Um número que aparece sozinho no campo é um número que alguém salva
 * sem ler.
 *
 * Só o vínculo DIRETO conta (ver `sugerirQuantidadeDaEtapa`): o rateio por peso
 * de orçamento reparte valor, e uma quantidade multiplicada por peso de valor
 * não está em unidade nenhuma.
 */
interface PainelQuantidadeEtapaProps {
  etapaId: string;
  insumos: InsumoProjeto[];
  /** Preenche os dois campos de uma vez — meta e unidade andam em par. */
  onUsar: (quantidade: number, unidade: string) => void;
  desabilitado?: boolean;
}

export default function PainelQuantidadeEtapa({
  etapaId,
  insumos,
  onUsar,
  desabilitado = false,
}: PainelQuantidadeEtapaProps) {
  const sugestao = sugerirQuantidadeDaEtapa(insumos, etapaId);

  // Sem insumo amarrado não há o que oferecer, e um painel dizendo "nada a
  // sugerir" seria ruído em toda etapa que ainda não tem orçamento.
  if (sugestao.tipo === 'sem-insumos') return null;

  if (sugestao.tipo === 'unidades-divergentes') {
    return (
      <Typography type="body-xs" color="muted" className="leading-relaxed bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        Os insumos desta etapa estão em unidades diferentes ({sugestao.unidades.join(', ')}), então
        não há uma meta única a sugerir. Informe a quantidade do serviço que esta etapa entrega.
      </Typography>
    );
  }

  return (
    <div className="bg-sky-50/60 border border-sky-200 rounded-lg p-3 flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-sky-700 flex items-center gap-1.5">
        <Ruler size={12} aria-hidden /> Pelos insumos
      </span>
      <span className="font-mono font-semibold text-sky-700">
        {formatarQuantidade(sugestao.quantidade, sugestao.unidade)}
      </span>
      <span className="text-xs text-slate-500">
        em {sugestao.insumos} insumo{sugestao.insumos === 1 ? '' : 's'} desta etapa
      </span>
      <Button
        type="button"
        variante="secundario"
        className="ml-auto"
        disabled={desabilitado}
        onClick={() => onUsar(sugestao.quantidade, sugestao.unidade)}
      >
        <Wand2 size={12} />
        <span>Usar esta meta</span>
      </Button>
    </div>
  );
}
