import React from 'react';

/**
 * Rótulo + campo + ajuda/erro, com o `htmlFor` sempre ligado.
 *
 * Havia 160 `<label>` para apenas 26 `htmlFor`: a maioria dos rótulos era um
 * texto solto ao lado do campo. Clicar no rótulo não focava o campo e o leitor
 * de tela não relacionava os dois. Aqui o id é gerado e distribuído, então a
 * ligação não depende de ninguém lembrar de fazê-la.
 */

export interface CampoRenderProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': boolean | undefined;
  required: boolean | undefined;
}

interface FieldProps {
  label: React.ReactNode;
  /** Recebe os atributos já ligados ao rótulo — espalhe-os no input/select. */
  children: (props: CampoRenderProps) => React.ReactNode;
  hint?: React.ReactNode;
  erro?: string;
  required?: boolean;
  /** Some com o rótulo visualmente, mantendo-o para leitores de tela. */
  labelOculto?: boolean;
  className?: string;
}

export function Field({ label, children, hint, erro, required, labelOculto = false, className = '' }: FieldProps) {
  const uid = React.useId();
  const id = `campo-${uid}`;
  const idAuxiliar = erro ? `${id}-erro` : hint ? `${id}-hint` : undefined;

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={
          labelOculto
            ? 'sr-only'
            : 'block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1'
        }
      >
        {label}
        {required && <span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>}
      </label>

      {children({
        id,
        'aria-describedby': idAuxiliar,
        'aria-invalid': erro ? true : undefined,
        required,
      })}

      {erro ? (
        // `role="alert"` para o erro ser anunciado quando aparece, não só quando
        // o campo recebe foco.
        <p id={idAuxiliar} role="alert" className="text-2xs text-rose-600 mt-1">
          {erro}
        </p>
      ) : hint ? (
        <p id={idAuxiliar} className="text-2xs text-slate-400 mt-1 leading-snug">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
