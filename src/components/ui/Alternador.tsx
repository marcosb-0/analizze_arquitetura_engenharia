import React from 'react';
import { ToggleButton, ToggleButtonGroup } from '@heroui/react';

/**
 * Alternador de MODO da tela (tabela ⇄ cartões): o `ToggleButtonGroup` do
 * HeroUI em seleção única, sem poder ficar vazio. Setas, foco e
 * `aria-pressed` vêm do React Aria. Para filtro é `Pilula`; para trocar de
 * painel é `Abas`.
 */
interface AlternadorProps<T extends string> {
  opcoes: { id: T; rotulo: string; icone: React.ReactNode }[];
  valor: T;
  onTrocar: (id: T) => void;
  /** Nome do grupo para leitor de tela. */
  rotulo: string;
}

export function Alternador<T extends string>({ opcoes, valor, onTrocar, rotulo }: AlternadorProps<T>) {
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
    >
      {opcoes.map((o, i) => (
        <ToggleButton key={o.id} id={o.id} isIconOnly aria-label={o.rotulo}>
          {i > 0 && <ToggleButtonGroup.Separator />}
          <span aria-hidden="true">{o.icone}</span>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
