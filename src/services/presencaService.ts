import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import type { Database } from '../lib/database.types';
import { DadosPresenca, PessoaChamada, Presenca } from '../types';

type PresencaRow = Database['public']['Tables']['presencas']['Row'];
type PresencaInsert = Database['public']['Tables']['presencas']['Insert'];

/** O banco devolve `time` como 'HH:MM:SS'; a tela fala em 'HH:MM'. */
function hora(valor: string | null): string | undefined {
  return valor ? valor.slice(0, 5) : undefined;
}

function fromRow(row: PresencaRow): Presenca {
  return {
    id: row.id,
    funcionarioId: row.funcionario_id,
    data: row.data,
    situacao: row.situacao,
    horaChegada: hora(row.hora_chegada),
    horaSaida: hora(row.hora_saida),
    motivoFalta: row.motivo_falta ?? undefined,
    observacao: row.observacao ?? undefined,
  };
}

/**
 * Tudo que não pertence à situação vira null, e não fica para trás: trocar
 * "Atrasou" por "Faltou" no upsert manda a linha inteira, e uma hora de chegada
 * esquecida numa falta seria recusada pela constraint `presenca_falta_sem_horario`.
 */
function toRow(p: DadosPresenca): PresencaInsert {
  const presente = p.situacao === 'Presente';
  return {
    funcionario_id: p.funcionarioId,
    data: p.data,
    situacao: p.situacao,
    hora_chegada: presente ? p.horaChegada || null : null,
    hora_saida: presente ? p.horaSaida || null : null,
    motivo_falta: presente ? null : p.motivoFalta ?? null,
    observacao: p.observacao?.trim() || null,
  };
}

export const presencaService = {
  /**
   * A lista da chamada. RPC e não `select` em `funcionarios`: o `campo` não tem
   * policy lá e receberia **lista vazia sem erro**.
   */
  async listarPessoas(): Promise<PessoaChamada[]> {
    const { data, error } = await supabase.rpc('fn_funcionarios_chamada');
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Os lançamentos de um intervalo fechado de datas. Para o `campo`, a RLS
   * recorta na semana aberta — pedir o mês volta só a semana, sem erro.
   */
  async listarPeriodo(de: string, ate: string): Promise<Presenca[]> {
    const linhas = await buscarTudo<PresencaRow>((ini, fim) =>
      supabase.from('presencas').select('*')
        .gte('data', de)
        .lte('data', ate)
        .order('data', { ascending: true })
        .order('id', { ascending: true })
        .range(ini, fim)
    );
    return linhas.map(fromRow);
  },

  /**
   * Grava o dia da pessoa. Upsert pela chave (pessoa, dia): o encarregado toca
   * "Veio" e depois "Atrasou" e é a mesma linha, não duas.
   */
  async gravar(dados: DadosPresenca): Promise<Presenca> {
    const { data, error } = await supabase
      .from('presencas')
      .upsert(toRow(dados), { onConflict: 'funcionario_id,data' })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  /** Vários dias de uma vez, numa ida só — o "todos os outros vieram". */
  async gravarVarios(lista: DadosPresenca[]): Promise<Presenca[]> {
    if (lista.length === 0) return [];
    const { data, error } = await supabase
      .from('presencas')
      .upsert(lista.map(toRow), { onConflict: 'funcionario_id,data' })
      .select();
    if (error) throw error;
    return garantirEscrita(data, semPermissao('anotar a presença')).map(fromRow);
  },

  /** Desmarca: o dia volta a "não anotado". */
  async remover(funcionarioId: string, data: string): Promise<void> {
    const { data: linhas, error } = await supabase
      .from('presencas')
      .delete()
      .eq('funcionario_id', funcionarioId)
      .eq('data', data)
      .select('id');
    if (error) throw error;
    garantirEscrita(linhas, semPermissao('desmarcar este dia'));
  },
};
