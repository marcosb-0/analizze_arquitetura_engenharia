import React from 'react';
import { Checkbox as HeroCheckbox, Radio as HeroRadio, RadioGroup } from '@heroui/react';

/**
 * Caixa de marcação e botão de opção do HeroUI. `className` vai para a área
 * clicável (controle + texto), que é onde as telas punham o layout do `<label>`.
 */
interface CheckboxProps {
  checked: boolean;
  onChange: (marcado: boolean) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * O HeroUI desenha o contorno do controle desmarcado com sombra e borda de
 * `--border-width-field` (0 no nosso tema): no escuro, sobre um cartão, o
 * quadradinho sumia. Borda de 1 px em `slate-500` (3:1 contra o cartão nos dois
 * temas), trocando só as variáveis — o estado marcado continua sendo do HeroUI.
 */
const CONTROLE_ESCOLHA = 'shrink-0 [border-width:1px] [--field-border:var(--color-slate-500)] [--field-border-hover:var(--color-slate-800)]';

export function Checkbox({ checked, onChange, disabled, id, className = '', children, ...aria }: CheckboxProps) {
  return (
    <HeroCheckbox id={id} isSelected={checked} onChange={onChange} isDisabled={disabled} aria-label={aria['aria-label']}>
      <HeroCheckbox.Content className={className}>
        <HeroCheckbox.Control className={CONTROLE_ESCOLHA}>
          <HeroCheckbox.Indicator />
        </HeroCheckbox.Control>
        {children}
      </HeroCheckbox.Content>
    </HeroCheckbox>
  );
}

interface GrupoRadioProps<T extends string> {
  valor: T;
  onChange: (valor: T) => void;
  rotulo: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function GrupoRadio<T extends string>({ valor, onChange, rotulo, disabled, className = '', children }: GrupoRadioProps<T>) {
  return (
    <RadioGroup aria-label={rotulo} value={valor} onChange={(v) => onChange(v as T)} isDisabled={disabled} className={className}>
      {children}
    </RadioGroup>
  );
}

interface RadioProps {
  valor: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Radio({ valor, disabled, className = '', children }: RadioProps) {
  return (
    <HeroRadio value={valor} isDisabled={disabled}>
      <HeroRadio.Content className={className}>
        <HeroRadio.Control className={CONTROLE_ESCOLHA}>
          <HeroRadio.Indicator />
        </HeroRadio.Control>
        {children}
      </HeroRadio.Content>
    </HeroRadio>
  );
}
