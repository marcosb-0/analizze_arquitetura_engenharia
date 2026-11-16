import type { DadosPresenca, MotivoFalta, PessoaChamada, Presenca } from '../types';
import { dataLocal, formatarDataBR, formatarISO } from './data';

/**
 * A aritmética da chamada diária, fora da tela.
 *
 * A SEMANA AQUI COMEÇA NA SEGUNDA, ao contrário de `calendarioTarefas` (que
 * segue o calendário de parede, domingo). Não é descuido: esta semana é a
 * janela que o banco deixa o `campo` editar, e o banco usa
 * `date_trunc('week')`, que é ISO. As duas regras precisam bater — se a tela
 * liberasse o domingo anterior, o encarregado tocaria e levaria uma recusa.
 */

/** A segunda-feira da semana a que a data pertence. */
export function inicioDaSemana(iso: string): string {
  const d = dataLocal(iso)!;
  // `getDay()` é 0 no domingo; na semana ISO o domingo é o 7º dia.
  const recuo = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - recuo);
  return formatarISO(d);
}

/** Espelho de `fn_presenca_semana_aberta`: de segunda até hoje. */
export function semanaAberta(iso: string, hoje: string): boolean {
  return iso >= inicioDaSemana(hoje) && iso <= hoje;
}

/** Soma `dias` a uma data, sem passar por UTC. */
export function somarDias(iso: string, dias: number): string {
  const d = dataLocal(iso)!;
  d.setDate(d.getDate() + dias);
  return formatarISO(d);
}

/**
 * Os dias que o encarregado pode abrir: segunda até hoje. O domingo só entra
 * quando HOJE é domingo — obra não costuma rodar nele, e um botão a mais na
 * fileira é um botão a mais para errar.
 */
export function diasDaSemanaAberta(hoje: string): string[] {
  const dias: string[] = [];
  for (let d = inicioDaSemana(hoje); d <= hoje; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

/** Todos os dias de um intervalo fechado, em ordem. */
export function diasDoPeriodo(de: string, ate: string): string[] {
  const dias: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

/** "seg", "ter"… — na mesma grafia de `DIAS_SEMANA` dos calendários. */
export function diaDaSemanaCurto(iso: string): string {
  return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dataLocal(iso)!.getDay()];
}

/** "quarta-feira, 28 de outubro" — o título da chamada. */
export function dataPorExtenso(iso: string): string {
  const d = dataLocal(iso);
  return d ? d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
}

/**
 * O que aconteceu, em uma palavra. É a MESMA palavra do botão que o
 * encarregado tocou, para o relatório falar a língua de quem anotou.
 */
export type Marcacao = 'Veio' | 'Atrasou' | 'Saiu cedo' | 'Atrasou e saiu cedo' | 'Faltou';

export function marcacaoDe(p: Pick<Presenca, 'situacao' | 'horaChegada' | 'horaSaida'>): Marcacao {
  if (p.situacao === 'Falta') return 'Faltou';
  if (p.horaChegada && p.horaSaida) return 'Atrasou e saiu cedo';
  if (p.horaChegada) return 'Atrasou';
  if (p.horaSaida) return 'Saiu cedo';
  return 'Veio';
}

/** "Atrasou · chegou 07:40 · saiu 15:00" — o cartão da chamada e a dica da grade. */
export function descreverPresenca(p: Presenca, comObservacao = false): string {
  const partes: string[] = [marcacaoDe(p)];
  if (p.horaChegada) partes.push(`chegou ${p.horaChegada}`);
  if (p.horaSaida) partes.push(`saiu ${p.horaSaida}`);
  if (p.motivoFalta) partes.push(p.motivoFalta.toLowerCase());
  if (comObservacao && p.observacao) partes.push(p.observacao);
  return partes.join(' · ');
}

export const MOTIVOS_FALTA: readonly MotivoFalta[] = ['Avisou', 'Atestado', 'Sem aviso'];

/** A chave do mapa de lançamentos: uma pessoa num dia. */
export function chavePresenca(funcionarioId: string, data: string): string {
  return `${funcionarioId}|${data}`;
}

export function indexarPresencas(presencas: readonly Presenca[]): Map<string, Presenca> {
  return new Map(presencas.map((p) => [chavePresenca(p.funcionarioId, p.data), p]));
}

/**
 * O "Todos os outros vieram": um `Presente` limpo para cada pessoa ainda sem
 * marcação no dia. Quem já foi anotado não é tocado — o atraso de hoje cedo não
 * pode virar "veio" por causa de um toque às cinco da tarde.
 */
export function restantesComoPresentes(
  pessoas: readonly PessoaChamada[],
  lancamentos: ReadonlyMap<string, Presenca>,
  data: string
): DadosPresenca[] {
  return pessoas
    .filter((p) => !lancamentos.has(chavePresenca(p.id, data)))
    .map((p) => ({ funcionarioId: p.id, data, situacao: 'Presente' as const }));
}

export interface ResumoPessoa {
  pessoa: PessoaChamada;
  /** Dias com qualquer `Presente`, inclusive atrasado ou saída cedo. */
  presencas: number;
  faltas: number;
  faltasPorMotivo: Record<MotivoFalta | 'Sem motivo', number>;
  atrasos: number;
  saidasCedo: number;
}

/**
 * Totais por pessoa no período. Todas as pessoas entram, inclusive quem não
 * tem lançamento nenhum: a contabilidade precisa ver o zero, e uma linha que
 * some é lida como "não trabalhava aqui".
 */
export function resumirPorPessoa(pessoas: readonly PessoaChamada[], presencas: readonly Presenca[]): ResumoPessoa[] {
  const porPessoa = new Map<string, ResumoPessoa>(
    pessoas.map((pessoa) => [
      pessoa.id,
      {
        pessoa,
        presencas: 0,
        faltas: 0,
        faltasPorMotivo: { Avisou: 0, Atestado: 0, 'Sem aviso': 0, 'Sem motivo': 0 },
        atrasos: 0,
        saidasCedo: 0,
      },
    ])
  );
  for (const p of presencas) {
    const r = porPessoa.get(p.funcionarioId);
    if (!r) continue;
    if (p.situacao === 'Falta') {
      r.faltas++;
      r.faltasPorMotivo[p.motivoFalta ?? 'Sem motivo']++;
    } else {
      r.presencas++;
      if (p.horaChegada) r.atrasos++;
      if (p.horaSaida) r.saidasCedo++;
    }
  }
  return [...porPessoa.values()];
}

/**
 * CSV para a contabilidade, no dialeto do Excel brasileiro: `;` separa campo
 * (a vírgula é decimal no pt-BR e o Excel daqui não abre CSV de vírgula em
 * colunas) e o BOM no início faz ele ler os acentos como UTF-8.
 */
function csv(linhas: readonly (readonly (string | number)[])[]): string {
  const campo = (v: string | number) => {
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + linhas.map((l) => l.map(campo).join(';')).join('\r\n');
}

/** Um lançamento por linha — o histórico completo do período. */
export function csvDetalhado(pessoas: readonly PessoaChamada[], presencas: readonly Presenca[]): string {
  const nome = new Map(pessoas.map((p) => [p.id, p]));
  const ordenadas = [...presencas].sort(
    (a, b) => a.data.localeCompare(b.data) || (nome.get(a.funcionarioId)?.nome ?? '').localeCompare(nome.get(b.funcionarioId)?.nome ?? '')
  );
  return csv([
    ['Data', 'Dia', 'Colaborador', 'Cargo', 'Situação', 'Chegada', 'Saída', 'Motivo da falta', 'Observação'],
    ...ordenadas.map((p) => [
      formatarDataBR(p.data),
      diaDaSemanaCurto(p.data),
      nome.get(p.funcionarioId)?.nome ?? '(desligado)',
      nome.get(p.funcionarioId)?.cargo ?? '',
      marcacaoDe(p),
      p.horaChegada ?? '',
      p.horaSaida ?? '',
      p.motivoFalta ?? '',
      p.observacao ?? '',
    ]),
  ]);
}

/** Uma linha por pessoa, com os totais do período. */
export function csvResumo(resumo: readonly ResumoPessoa[]): string {
  return csv([
    ['Colaborador', 'Cargo', 'Presenças', 'Faltas', 'Faltas avisadas', 'Atestados', 'Faltas sem aviso', 'Atrasos', 'Saídas antecipadas'],
    ...resumo.map((r) => [
      r.pessoa.nome,
      r.pessoa.cargo,
      r.presencas,
      r.faltas,
      r.faltasPorMotivo.Avisou,
      r.faltasPorMotivo.Atestado,
      // "Sem motivo" é falta anotada sem tocar no motivo: para o contador ela é
      // tão sem aviso quanto a outra.
      r.faltasPorMotivo['Sem aviso'] + r.faltasPorMotivo['Sem motivo'],
      r.atrasos,
      r.saidasCedo,
    ]),
  ]);
}
