import { describe, it, expect } from 'vitest';
import {
  csvDetalhado,
  csvResumo,
  diasDaSemanaAberta,
  inicioDaSemana,
  indexarPresencas,
  marcacaoDe,
  restantesComoPresentes,
  resumirPorPessoa,
  semanaAberta,
} from './presenca';
import type { PessoaChamada, Presenca } from '../types';

const JOAO: PessoaChamada = { id: 'j', nome: 'João', cargo: 'Pedreiro' };
const ZE: PessoaChamada = { id: 'z', nome: 'Zé', cargo: 'Servente' };

function presenca(p: Partial<Presenca> & Pick<Presenca, 'funcionarioId' | 'data'>): Presenca {
  return { id: `${p.funcionarioId}${p.data}`, situacao: 'Presente', ...p };
}

describe('semana aberta — tem de bater com fn_presenca_semana_aberta (ISO, segunda)', () => {
  it('a semana começa na segunda', () => {
    expect(inicioDaSemana('2026-10-28')).toBe('2026-10-26'); // quarta → segunda
    expect(inicioDaSemana('2026-10-26')).toBe('2026-10-26'); // a própria segunda
  });

  it('o domingo pertence à semana que termina nele, não à que começa', () => {
    // Com a convenção do calendário de parede (domingo primeiro), 01/11 abriria
    // a semana seguinte e o encarregado ganharia a semana inteira passada.
    expect(inicioDaSemana('2026-11-01')).toBe('2026-10-26');
  });

  it('atravessa a virada de mês', () => {
    expect(inicioDaSemana('2026-10-01')).toBe('2026-09-28');
  });

  it('libera de segunda até hoje, e nada além', () => {
    expect(semanaAberta('2026-10-26', '2026-10-28')).toBe(true);
    expect(semanaAberta('2026-10-28', '2026-10-28')).toBe(true);
    expect(semanaAberta('2026-10-25', '2026-10-28')).toBe(false); // domingo anterior
    expect(semanaAberta('2026-10-29', '2026-10-28')).toBe(false); // amanhã
  });

  it('os dias da fileira vão de segunda até hoje', () => {
    expect(diasDaSemanaAberta('2026-10-28')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
    expect(diasDaSemanaAberta('2026-10-26')).toEqual(['2026-10-26']);
    expect(diasDaSemanaAberta('2026-11-01')).toHaveLength(7);
  });
});

describe('marcação', () => {
  it('fala a língua do botão', () => {
    expect(marcacaoDe({ situacao: 'Presente' })).toBe('Veio');
    expect(marcacaoDe({ situacao: 'Presente', horaChegada: '07:40' })).toBe('Atrasou');
    expect(marcacaoDe({ situacao: 'Presente', horaSaida: '15:00' })).toBe('Saiu cedo');
    expect(marcacaoDe({ situacao: 'Presente', horaChegada: '07:40', horaSaida: '15:00' })).toBe('Atrasou e saiu cedo');
    expect(marcacaoDe({ situacao: 'Falta' })).toBe('Faltou');
  });
});

describe('"todos os outros vieram"', () => {
  it('não sobrescreve quem já foi anotado', () => {
    const lanc = indexarPresencas([presenca({ funcionarioId: 'j', data: '2026-10-28', horaChegada: '08:10' })]);
    const novos = restantesComoPresentes([JOAO, ZE], lanc, '2026-10-28');
    expect(novos).toEqual([{ funcionarioId: 'z', data: '2026-10-28', situacao: 'Presente' }]);
  });
});

describe('resumo por pessoa', () => {
  const lancamentos = [
    presenca({ funcionarioId: 'j', data: '2026-10-26' }),
    presenca({ funcionarioId: 'j', data: '2026-10-27', horaChegada: '07:40', horaSaida: '15:00' }),
    presenca({ funcionarioId: 'j', data: '2026-10-28', situacao: 'Falta', motivoFalta: 'Atestado' }),
    presenca({ funcionarioId: 'fora-da-lista', data: '2026-10-28', situacao: 'Falta' }),
  ];

  it('conta atraso e saída cedo como presença', () => {
    const [j] = resumirPorPessoa([JOAO], lancamentos);
    expect(j).toMatchObject({ presencas: 2, faltas: 1, atrasos: 1, saidasCedo: 1 });
    expect(j.faltasPorMotivo.Atestado).toBe(1);
  });

  it('quem não tem lançamento aparece com zero', () => {
    const r = resumirPorPessoa([JOAO, ZE], lancamentos);
    expect(r.map((x) => x.pessoa.id)).toEqual(['j', 'z']);
    expect(r[1]).toMatchObject({ presencas: 0, faltas: 0 });
  });
});

describe('CSV para a contabilidade', () => {
  it('abre no Excel brasileiro: BOM, ponto e vírgula e data dd/mm/aaaa', () => {
    const texto = csvDetalhado([JOAO], [presenca({ funcionarioId: 'j', data: '2026-10-27', horaChegada: '07:40' })]);
    expect(texto.startsWith('﻿')).toBe(true);
    const [cab, linha] = texto.slice(1).split('\r\n');
    expect(cab.split(';')[0]).toBe('Data');
    expect(linha).toBe('27/10/2026;ter;João;Pedreiro;Atrasou;07:40;;;');
  });

  it('protege observação com ponto e vírgula e aspas', () => {
    const texto = csvDetalhado([JOAO], [presenca({ funcionarioId: 'j', data: '2026-10-27', observacao: 'chuva; disse "volto"' })]);
    expect(texto).toContain('"chuva; disse ""volto"""');
  });

  it('o resumo junta falta sem motivo com falta sem aviso', () => {
    const r = resumirPorPessoa([JOAO], [
      presenca({ funcionarioId: 'j', data: '2026-10-26', situacao: 'Falta' }),
      presenca({ funcionarioId: 'j', data: '2026-10-27', situacao: 'Falta', motivoFalta: 'Sem aviso' }),
    ]);
    const [, linha] = csvResumo(r).slice(1).split('\r\n');
    expect(linha).toBe('João;Pedreiro;0;2;0;0;2;0;0');
  });
});
