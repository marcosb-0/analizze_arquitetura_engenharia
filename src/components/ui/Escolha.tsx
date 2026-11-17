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

export function Checkbox({ checked, onChange, disabled, id, className = '', children, ...aria }: CheckboxProps) {
  return (
    <HeroCheckbox id={id} isSelected={checked} onChange={onChange} isDisabled={disabled} aria-label={aria['aria-label']}>
      <HeroCheckbox.Content className={className}>
        <HeroCheckbox.Control className="shrink-0">
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
        <HeroRadio.Control className="shrink-0">
          <HeroRadio.Indicator />
        </HeroRadio.Control>
        {children}
      </HeroRadio.Content>
    </HeroRadio>
  );
}
