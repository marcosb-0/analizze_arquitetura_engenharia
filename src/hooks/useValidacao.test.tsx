/**
 * @vitest-environment jsdom
 *
 * O que este teste protege é o comportamento que a auditoria pediu e que nenhum
 * `tsc` enxerga: **o formulário fala e leva o usuário até o campo errado**. Se o
 * foco parar de acontecer, nada quebra, nada avisa — o formulário volta a ficar
 * mudo exatamente como estava antes, e só um usuário perdido no passo 1 do
 * assistente descobre.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useValidacao } from './useValidacao';
import { Field, Input } from '../components/ui';

type Campo = 'nome' | 'cpf';

/**
 * Formulário mínimo com dois campos, montado com os mesmos primitivos das telas
 * — é o `Field` quem escreve o `aria-invalid` que o hook procura, então testar
 * com um `<input>` cru testaria outra coisa.
 */
function FormularioDeTeste({ aoValidar }: { aoValidar: (ok: boolean) => void }) {
  const { erros, validar, limparErro, areaRef } = useValidacao<Campo>();
  const valores = useRef({ nome: '', cpf: '' });

  return (
    <form ref={areaRef as React.RefObject<HTMLFormElement>}>
      <Field label="Nome" erro={erros.nome} required>
        {(props) => (
          <Input
            {...props}
            data-testid="nome"
            onChange={(e) => {
              valores.current.nome = e.target.value;
              limparErro('nome');
            }}
          />
        )}
      </Field>
      <Field label="CPF" erro={erros.cpf} required>
        {(props) => <Input {...props} data-testid="cpf" />}
      </Field>
      <button
        type="button"
        onClick={() =>
          aoValidar(
            validar([
              { campo: 'nome', invalido: valores.current.nome.trim() === '', erro: 'Informe o nome.' },
              { campo: 'cpf', invalido: valores.current.cpf.trim() === '', erro: 'Informe o CPF.' },
            ])
          )
        }
      >
        Salvar
      </button>
    </form>
  );
}

const enviar = () => act(() => screen.getByText('Salvar').click());

// A suíte não roda com `globals`, então a limpeza automática da testing-library
// não é registrada — sem isto o segundo teste renderiza um formulário ao lado do
// primeiro e toda busca acha dois campos.
afterEach(cleanup);

describe('useValidacao', () => {
  it('mostra a mensagem no campo, não num toast genérico', () => {
    render(<FormularioDeTeste aoValidar={() => {}} />);
    enviar();

    expect(screen.getByText('Informe o nome.')).toBeTruthy();
    expect(screen.getByText('Informe o CPF.')).toBeTruthy();
    // A mensagem é anunciada por ser um `alert`, e não por o campo receber foco:
    // quem lê a segunda mensagem nunca chega a focar o segundo campo.
    expect(screen.getByText('Informe o CPF.').getAttribute('role')).toBe('alert');
  });

  it('campo obrigatório não traz o `required` nativo, que sequestraria o submit', () => {
    // Medido no navegador, no cadastro de cliente: com `required` no `<input>`,
    // o navegador barra o envio ANTES do `onSubmit` e mostra o balão do sistema
    // — a rotina nunca rodava, e as regras que cruzam dois campos nunca eram
    // avaliadas. `aria-required` diz a mesma coisa a quem lê a tela e não
    // sequestra nada. Se alguém devolver `required`, os formulários voltam a
    // ficar mudos sem nada quebrar visivelmente.
    render(<FormularioDeTeste aoValidar={() => {}} />);
    const campo = screen.getByTestId('nome') as HTMLInputElement;
    expect(campo.required).toBe(false);
    expect(campo.getAttribute('aria-required')).toBe('true');
  });

  it('leva o foco ao primeiro inválido na ordem da TELA', () => {
    render(<FormularioDeTeste aoValidar={() => {}} />);
    enviar();
    expect(document.activeElement).toBe(screen.getByTestId('nome'));
  });

  it('liga a mensagem ao campo por aria-describedby', () => {
    render(<FormularioDeTeste aoValidar={() => {}} />);
    enviar();

    const campo = screen.getByTestId('nome');
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    const descrito = campo.getAttribute('aria-describedby');
    expect(descrito).toBeTruthy();
    expect(document.getElementById(descrito!)?.textContent).toBe('Informe o nome.');
  });

  it('devolve false enquanto há erro e true quando tudo passa', () => {
    const resultados: boolean[] = [];
    render(<FormularioDeTeste aoValidar={(ok) => resultados.push(ok)} />);

    enviar();
    expect(resultados).toEqual([false]);

    // Digitar apaga o erro do campo e o próximo envio já não o acusa.
    // `fireEvent.change` e não `.value = …`: o rastreador de valor do React
    // engole um evento cujo valor ele mesmo não viu mudar.
    fireEvent.change(screen.getByTestId('nome'), { target: { value: 'Marcos' } });
    expect(screen.queryByText('Informe o nome.')).toBeNull();

    enviar();
    expect(resultados).toEqual([false, false]); // o CPF continua faltando
    expect(document.activeElement).toBe(screen.getByTestId('cpf'));
  });

  it('foca de novo quando o mesmo erro se repete', () => {
    // O caso que obrigou o contador de tentativas: enviar duas vezes com o mesmo
    // campo em falta não muda o objeto de erros. Sem o contador, o segundo envio
    // não mexeria em nada — o formulário voltaria a ficar mudo justo para quem já
    // não tinha entendido na primeira.
    render(<FormularioDeTeste aoValidar={() => {}} />);
    enviar();

    act(() => (screen.getByText('Salvar') as HTMLButtonElement).focus());
    expect(document.activeElement).not.toBe(screen.getByTestId('nome'));

    enviar();
    expect(document.activeElement).toBe(screen.getByTestId('nome'));
  });
});
