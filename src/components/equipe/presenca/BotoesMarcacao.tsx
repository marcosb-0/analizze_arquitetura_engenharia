import { Check, Clock, LogOut, X, type LucideIcon } from 'lucide-react';
import { FOCO } from '../../ui';

/**
 * Os quatro botões da chamada.
 *
 * Grandes (64 px) e com PALAVRA + ícone + cor, nunca só cor: o encarregado é de
 * mais idade, e no sol da obra o verde e o vermelho de uma tela de celular se
 * confundem. Cru e não `<Button>` porque o primitivo não tem altura de toque de
 * campo — e criar um `tamanho="campo"` para uma tela só seria uma terceira
 * altura no token que existe para haver duas.
 *
 * Os tons são os da escala clara (50/300/900) também no selecionado: a paleta
 * do tema escuro é invertida em `tema.css`, e um `bg-emerald-700 text-white`
 * viraria texto branco sobre verde claro à noite.
 */
export type AcaoChamada = 'veio' | 'atrasou' | 'saiu' | 'faltou';

const ACOES: Record<AcaoChamada, { rotulo: string; icone: LucideIcon; cor: string; ativa: string }> = {
  veio: {
    rotulo: 'Veio',
    icone: Check,
    cor: 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    ativa: 'border-emerald-600 bg-emerald-100 text-emerald-700 ring-2 ring-emerald-600',
  },
  atrasou: {
    rotulo: 'Atrasou',
    icone: Clock,
    cor: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100',
    ativa: 'border-amber-600 bg-amber-100 text-amber-700 ring-2 ring-amber-600',
  },
  saiu: {
    rotulo: 'Saiu cedo',
    icone: LogOut,
    cor: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100',
    ativa: 'border-amber-600 bg-amber-100 text-amber-700 ring-2 ring-amber-600',
  },
  faltou: {
    rotulo: 'Faltou',
    icone: X,
    cor: 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100',
    ativa: 'border-rose-600 bg-rose-100 text-rose-700 ring-2 ring-rose-600',
  },
};

interface Props {
  /** O nome da pessoa, para o leitor de tela dizer "Veio — João". */
  nome: string;
  ativas: ReadonlySet<AcaoChamada>;
  onEscolher: (acao: AcaoChamada) => void;
  desabilitado?: boolean;
}

export default function BotoesMarcacao({ nome, ativas, onEscolher, desabilitado = false }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(Object.keys(ACOES) as AcaoChamada[]).map((acao) => {
        const { rotulo, icone: Icone, cor, ativa } = ACOES[acao];
        const ligada = ativas.has(acao);
        return (
          <button
            key={acao}
            type="button"
            disabled={desabilitado}
            aria-pressed={ligada}
            aria-label={`${rotulo} — ${nome}`}
            onClick={() => onEscolher(acao)}
            className={`flex min-h-16 items-center justify-center gap-2 rounded-xl border-2 text-lg font-semibold transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 ${FOCO} ${ligada ? ativa : cor}`}
          >
            <Icone size={20} strokeWidth={2.5} aria-hidden="true" />
            {rotulo}
          </button>
        );
      })}
    </div>
  );
}
