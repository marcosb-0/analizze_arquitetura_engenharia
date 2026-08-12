import { describe, it, expect } from 'vitest';
import {
  coletarErros,
  fimAntesDoInicio,
  foraDaFaixa,
  naoEhNumero,
  naoEhPositivo,
  temErro,
  vazio,
} from './validacao';

describe('coletarErros', () => {
  it('não devolve nada quando tudo passa', () => {
    const erros = coletarErros([{ campo: 'nome', invalido: false, erro: 'Informe o nome.' }]);
    expect(erros).toEqual({});
    expect(temErro(erros)).toBe(false);
  });

  it('mantém a PRIMEIRA falha de cada campo', () => {
    // A ordem é a da regra falada: presença antes de formato. Mostrar as duas
    // no mesmo campo só ocuparia espaço com uma frase que ainda não se aplica.
    const erros = coletarErros([
      { campo: 'valor', invalido: true, erro: 'Informe o valor.' },
      { campo: 'valor', invalido: true, erro: 'O valor deve ser maior que zero.' },
    ]);
    expect(erros.valor).toBe('Informe o valor.');
  });

  it('acusa campos independentes de uma vez', () => {
    const erros = coletarErros([
      { campo: 'nome', invalido: true, erro: 'Informe o nome.' },
      { campo: 'cpf', invalido: false, erro: 'Informe o CPF.' },
      { campo: 'cargo', invalido: true, erro: 'Informe o cargo.' },
    ]);
    expect(erros).toEqual({ nome: 'Informe o nome.', cargo: 'Informe o cargo.' });
  });
});

describe('vazio', () => {
  it('trata espaços como ausência', () => {
    expect(vazio('   ')).toBe(true);
    expect(vazio('')).toBe(true);
    expect(vazio(null)).toBe(true);
    expect(vazio(undefined)).toBe(true);
  });

  it('não confunde zero com ausência', () => {
    // `'0'` é um saldo inicial legítimo. Um `if (!saldo)` o rejeitava.
    expect(vazio('0')).toBe(false);
  });
});

describe('naoEhNumero', () => {
  it('deixa o vazio passar — quem exige presença declara isso antes', () => {
    expect(naoEhNumero('')).toBe(false);
  });

  it('acusa texto', () => {
    expect(naoEhNumero('abc')).toBe(true);
    expect(naoEhNumero('12,5')).toBe(true); // vírgula decimal não é número em JS
  });

  it('aceita número com ponto e negativo', () => {
    expect(naoEhNumero('12.5')).toBe(false);
    expect(naoEhNumero('-3')).toBe(false);
  });
});

describe('foraDaFaixa', () => {
  it('usa intervalo fechado', () => {
    expect(foraDaFaixa('0', 0, 300)).toBe(false);
    expect(foraDaFaixa('300', 0, 300)).toBe(false);
    expect(foraDaFaixa('301', 0, 300)).toBe(true);
    expect(foraDaFaixa('-1', 0, 300)).toBe(true);
  });

  it('não acusa o que nem é número — esse erro é do predicado anterior', () => {
    expect(foraDaFaixa('abc', 0, 300)).toBe(false);
    expect(foraDaFaixa('', 0, 300)).toBe(false);
  });
});

describe('naoEhPositivo', () => {
  it('rejeita zero e negativo', () => {
    expect(naoEhPositivo(0)).toBe(true);
    expect(naoEhPositivo(-1)).toBe(true);
    expect(naoEhPositivo('0')).toBe(true);
  });

  it('aceita positivo', () => {
    expect(naoEhPositivo(0.01)).toBe(false);
    expect(naoEhPositivo('2')).toBe(false);
  });

  it('deixa a string vazia para o predicado de presença', () => {
    expect(naoEhPositivo('')).toBe(false);
    // O número 0 vindo de um `parseFloat(...) || 0` continua sendo acusado.
    expect(naoEhPositivo(Number(''))).toBe(true);
  });
});

describe('fimAntesDoInicio', () => {
  it('compara ISO como string, sem passar por Date', () => {
    // `new Date('2026-01-05')` numa coluna `date` volta um dia — o motivo de a
    // comparação aqui ser textual.
    expect(fimAntesDoInicio('2026-01-05', '2026-01-04')).toBe(true);
    expect(fimAntesDoInicio('2026-01-05', '2026-01-05')).toBe(false);
    expect(fimAntesDoInicio('2026-01-05', '2026-12-31')).toBe(false);
  });

  it('cala quando falta uma das pontas', () => {
    expect(fimAntesDoInicio('', '2026-01-04')).toBe(false);
    expect(fimAntesDoInicio('2026-01-05', '')).toBe(false);
  });
});
