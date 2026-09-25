import React, { useRef } from 'react';
import { FOCO } from './tokens';

/**
 * Abas de uma superfície (hoje, a janela do insumo do Catálogo).
 *
 * Existia uma tablist escrita à mão dentro de `JanelaInsumo`, com o filete da
 * aba ativa em `indigo` — cor que o redesenho Trena aposentou — e sem teclado:
 * `role="tab"` promete ao leitor de tela que as setas trocam de aba, e elas não
 * trocavam. Aqui vale o padrão do WAI-ARIA com ativação automática: ←/→ andam
 * (dando a volta), Home/End vão às pontas, e só a aba ativa entra na ordem do
 * Tab (roving tabindex) — senão atravessar três abas custa três Tabs antes de
 * chegar ao conteúdo.
 *
 * O filete é `blue-600`, o ciano de ação no claro e no escuro: a regra de cores
 * reserva o ciano para "ação e navegação selecionada", e aba ativa é as duas.
 */
export interface AbaDef<T extends string> {
  id: T;
  rotulo: React.ReactNode;
  icone?: React.ReactNode;
  /** Número ao lado do rótulo ("Preço · 3"). Some quando `undefined`. */
  contagem?: number;
}

interface AbasProps<T extends string> {
  abas: AbaDef<T>[];
  ativa: T;
  onTrocar: (id: T) => void;
  /** Rótulo acessível da tablist. */
  rotulo: string;
  /** Prefixo dos ids — `${prefixo}-aba-x` e `${prefixo}-painel-x`. */
  prefixo: string;
  className?: string;
}

const idAba = (prefixo: string, id: string) => `${prefixo}-aba-${id}`;
const idPainel = (prefixo: string, id: string) => `${prefixo}-painel-${id}`;

/**
 * O painel da aba ativa. Existe para que o par `aria-controls`/`aria-labelledby`
 * seja montado num lugar só: escrito à mão dos dois lados, bastava um prefixo
 * diferente para o leitor de tela perder a ligação sem nenhum erro visível.
 */
export function PainelAba({
  prefixo,
  ativa,
  children,
  className = '',
}: {
  prefixo: string;
  ativa: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="tabpanel" id={idPainel(prefixo, ativa)} aria-labelledby={idAba(prefixo, ativa)} className={className}>
      {children}
    </div>
  );
}

export function Abas<T extends string>({ abas, ativa, onTrocar, rotulo, prefixo, className = '' }: AbasProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const irPara = (indice: number) => {
    const n = abas.length;
    const alvo = ((indice % n) + n) % n;
    onTrocar(abas[alvo].id);
    refs.current[alvo]?.focus();
  };

  const aoTeclar = (e: React.KeyboardEvent, indice: number) => {
    const mapa: Record<string, number> = {
      ArrowRight: indice + 1,
      ArrowLeft: indice - 1,
      Home: 0,
      End: abas.length - 1,
    };
    if (!(e.key in mapa)) return;
    e.preventDefault();
    irPara(mapa[e.key]);
  };

  return (
    <div role="tablist" aria-label={rotulo} className={`flex items-center gap-1 border-b border-slate-200 ${className}`}>
      {abas.map((a, i) => {
        const selecionada = a.id === ativa;
        return (
          <button
            key={a.id}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            type="button"
            id={idAba(prefixo, a.id)}
            aria-selected={selecionada}
            aria-controls={idPainel(prefixo, a.id)}
            tabIndex={selecionada ? 0 : -1}
            onClick={() => onTrocar(a.id)}
            onKeyDown={(e) => aoTeclar(e, i)}
            className={`flex items-center gap-1.5 px-3 py-2.5 -mb-px text-xs font-semibold border-b-2 transition ${FOCO} ${
              selecionada
                ? 'border-blue-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            {a.icone && <span aria-hidden="true">{a.icone}</span>}
            <span>{a.rotulo}</span>
            {a.contagem !== undefined && (
              <span
                className={`data-font min-w-[1.25rem] rounded-full px-1.5 text-2xs font-bold ${
                  selecionada ? 'bg-slate-900 text-superficie' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {a.contagem}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
