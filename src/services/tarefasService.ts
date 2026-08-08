import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import type { Database } from '../lib/database.types';
import { PessoaAtribuivel, RoleAcesso, StatusTarefa, Tarefa } from '../types';

type TarefaRow = Database['public']['Tables']['tarefas']['Row'];
type TarefaInsert = Database['public']['Tables']['tarefas']['Insert'];

function fromRow(row: TarefaRow): Tarefa {
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao ?? undefined,
    status: row.status,
    prioridade: row.prioridade,
    responsavelId: row.responsavel_id ?? undefined,
    criadoPor: row.criado_por,
    projetoId: row.projeto_id ?? undefined,
    prazo: row.prazo ?? undefined,
    concluidaEm: row.concluida_em ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * `criado_por`, `concluida_em` e os timestamps ficam de fora: os três primeiros
 * são do banco (default `auth.uid()` e trigger) e mandá-los daqui seria a
 * aplicação opinando sobre o que ela não sabe.
 *
 * String vazia vira `null` em vez de ir como `''`: um `<select>` sem seleção e um
 * campo de texto limpo entregam `''`, e gravar isso faria "sem responsável"
 * (nulo) e "responsável em branco" virarem dois estados diferentes para a mesma
 * coisa — com o segundo quebrando a foreign key.
 */
function toRow(t: Omit<Tarefa, 'id' | 'criadoPor' | 'createdAt' | 'concluidaEm'>): TarefaInsert {
  return {
    titulo: t.titulo.trim(),
    descricao: t.descricao?.trim() || null,
    status: t.status,
    prioridade: t.prioridade,
    responsavel_id: t.responsavelId || null,
    projeto_id: t.projetoId || null,
    prazo: t.prazo || null,
  };
}

export type DadosTarefa = Omit<Tarefa, 'id' | 'criadoPor' | 'createdAt' | 'concluidaEm'>;

export const tarefasService = {
  async list(): Promise<Tarefa[]> {
    // Desempate estável obrigatório: sem o `id`, duas tarefas criadas no mesmo
    // instante podem repetir ou pular entre blocos de 1000 (ver `buscarTudo`).
    const linhas = await buscarTudo<TarefaRow>((de, ate) =>
      supabase.from('tarefas').select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(fromRow);
  },

  /**
   * O seletor de responsável. RPC e não `select` em `profiles`: `financeiro` e
   * `campo` não têm policy de leitura lá e receberiam **lista vazia sem erro** —
   * ver o cabeçalho de 20260808100000_tarefas.sql.
   */
  async listPessoas(): Promise<PessoaAtribuivel[]> {
    const { data, error } = await supabase.rpc('fn_pessoas_atribuiveis');
    if (error) throw error;
    return (data ?? []).map((p) => ({
      id: p.id,
      nome: p.full_name,
      role: p.role as RoleAcesso,
    }));
  },

  async add(dados: DadosTarefa): Promise<Tarefa> {
    const { data, error } = await supabase
      .from('tarefas')
      .insert(toRow(dados))
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async update(id: string, dados: DadosTarefa): Promise<Tarefa> {
    const { data, error } = await supabase
      .from('tarefas')
      .update(toRow(dados))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  /**
   * Mover de coluna é a escrita que TODO papel faz, inclusive o `campo` — e é
   * exatamente a que some em silêncio: sob RLS um update fora da política casa
   * zero linhas e o PostgREST devolve 200. Sem `garantirEscrita`, o card ficaria
   * na coluna nova com um toast de sucesso e voltaria sozinho no próximo refresh.
   */
  async updateStatus(id: string, status: StatusTarefa): Promise<void> {
    const { data, error } = await supabase
      .from('tarefas')
      .update({ status })
      .eq('id', id)
      .select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('mover esta tarefa'));
  },

  async remove(id: string): Promise<void> {
    const { data, error } = await supabase.from('tarefas').delete().eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('excluir esta tarefa'));
  },
};
