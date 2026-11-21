import React from 'react';
import { ToggleButton, ToggleButtonGroup } from '@heroui/react';

/**
 * Alternador de MODO da tela (tabela ⇄ cartões, quadro ⇄ calendário, por
 * categoria ⇄ por etapa): o `ToggleButtonGroup` do HeroUI em seleção única,
 * sem poder ficar vazio. O React Aria expõe o grupo como `radiogroup` e cada
 * opção como `radio` (escolha exclusiva), com setas e foco — nos testes, busque
 * por `getByRole('radio')`. Para filtro é `Pilula`; para trocar de painel é `Abas`.
 *
 * Substituiu `CONTROLE_GRUPO`/`CONTROLE_GRUPO_ITEM` (botões escritos à mão) em
 * 21/nov/2026.
 */
export interface OpcaoAlternador<T extends string> {
  id: T;
  rotulo: string;
  icone?: React.ReactNode;
  /** Dica de hover. O React Aria filtra `title`, então vai por ref. */
  dica?: string;
}

interface AlternadorProps<T extends string> {
  opcoes: OpcaoAlternador<T>[];
  valor: T;
  onTrocar: (id: T) => void;
  /** Nome do grupo para leitor de tela. */
  rotulo: string;
  /** Só o ícone à vista; o rótulo vira o nome acessível e a dica. */
  soIcone?: boolean;
  className?: string;
}

export function Alternador<T extends string>({ opcoes, valor, onTrocar, rotulo, soIcone = false, className }: AlternadorProps<T>) {
  return (
    <ToggleButtonGroup
      aria-label={rotulo}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[valor]}
      onSelectionChange={(chaves) => {
        const [escolhida] = chaves;
        if (escolhida !== undefined) onTrocar(escolhida as T);
      }}
      className={className}
    >
      {opcoes.map((o, i) => (
        <ToggleButton
          key={o.id}
          id={o.id}
          isIconOnly={soIcone}
          aria-label={soIcone ? o.rotulo : undefined}
          ref={(el: HTMLButtonElement | null) => {
            if (el) el.title = o.dica ?? (soIcone ? o.rotulo : '');
          }}
          className="gap-1.5 text-xs font-semibold"
        >
          {i > 0 && <ToggleButtonGroup.Separator />}
          {o.icone && <span aria-hidden="true">{o.icone}</span>}
          {!soIcone && o.rotulo}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
