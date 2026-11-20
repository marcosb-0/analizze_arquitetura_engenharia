import React from 'react';
import { Tabs } from '@heroui/react';

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
  /** Variante `secondary` do HeroUI (sublinhada): abas DENTRO de uma aba, um nível abaixo da fileira principal. */
  secundaria?: boolean;
  className?: string;
}

const idAba = (prefixo: string, id: string) => `${prefixo}-aba-${id}`;

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
  // Os ids das abas são do React Aria (gerados); o painel se rotula pelo texto da aba, cujo id é nosso.
  return (
    <div role="tabpanel" aria-labelledby={idAba(prefixo, ativa)} className={className}>
      {children}
    </div>
  );
}

/** Abas do HeroUI: setas, Home/End e roving tabindex vêm do React Aria. */
export function Abas<T extends string>({ abas, ativa, onTrocar, rotulo, prefixo, secundaria = false, className = '' }: AbasProps<T>) {
  return (
    <Tabs selectedKey={ativa} onSelectionChange={(k) => onTrocar(k as T)} variant={secundaria ? 'secondary' : 'primary'} className={className}>
      <Tabs.ListContainer>
        <Tabs.List aria-label={rotulo}>
          {abas.map((a) => {
            const selecionada = a.id === ativa;
            return (
              <Tabs.Tab key={a.id} id={a.id} className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
                {a.icone && <span aria-hidden="true">{a.icone}</span>}
                <span id={idAba(prefixo, a.id)}>{a.rotulo}</span>
                {a.contagem !== undefined && (
                  <span
                    className={`font-mono min-w-[1.25rem] rounded-full px-1.5 text-2xs font-semibold ${
                      selecionada ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {a.contagem}
                  </span>
                )}
                <Tabs.Indicator />
              </Tabs.Tab>
            );
          })}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}
