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
  /**
   * `aria-required` e NÃO o `required` do HTML.
   *
   * Medido no navegador: com `required` no `<input>`, o navegador intercepta o
   * submit **antes** do `onSubmit` e mostra o balão do sistema. A nossa rotina
   * (`useValidacao`) nunca chegava a rodar — o pior dos dois mundos, porque o
   * balão some sozinho, aparece um campo por vez e não conhece nenhuma das
   * regras que cruzam dois campos ("entrega antes do início", "telefone OU
   * e-mail"). Duas validações discordando é o defeito que a §M nomeia.
   *
   * Para o leitor de tela os dois dizem a mesma coisa; só um deles sequestra o
   * envio do formulário.
   */
  'aria-required': boolean | undefined;
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
  /**
   * Id fixo, quando o campo já tinha um e algo externo o endereça (automação de
   * navegador, âncora). Sem isto, migrar um campo para o `Field` troca o id por
   * um gerado e quebra quem apontava para ele em silêncio.
   */
  id?: string;
  className?: string;
}

export function Field({ label, children, hint, erro, required, labelOculto = false, id: idFixo, className = '' }: FieldProps) {
  const uid = React.useId();
  const id = idFixo ?? `campo-${uid}`;
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
        'aria-required': required || undefined,
      })}

      {erro ? (
        // `role="alert"` para o erro ser anunciado quando aparece, não só quando
        // o campo recebe foco.
        <p id={idAuxiliar} role="alert" className="text-2xs text-rose-600 mt-1">
          {erro}
        </p>
      ) : hint ? (
        <p id={idAuxiliar} className="text-2xs text-slate-500 mt-1 leading-snug">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
