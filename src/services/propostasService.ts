import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { hojeISO } from '../lib/data';
import {
  ItemRevisaoProposta, NovaProposta, Proposta, RevisaoProposta, SecaoRevisaoProposta,
} from '../types';

function fromRow(row: {
  id: string; numero: string; cliente_id: string; descricao: string; valor_estimado: number;
  valor_manual?: number;
  bdi_percentual: number; bdi_visivel_pdf?: boolean;
  prazo_execucao_dias: number | null; data_validade: string | null;
  status: Proposta['status']; data_envio?: string | null; motivo_rejeicao?: string | null;
  qtd_itens?: number; valor_itens?: number; valor_calculado?: number; qtd_secoes?: number;
}, revisoes: RevisaoProposta[]): Proposta {
  return {
    id: row.id,
    numero: row.numero,
    clienteId: row.cliente_id,
    descricao: row.descricao,
    valorEstimado: row.valor_estimado,
    valorManual: row.valor_manual ?? row.valor_estimado,
    bdiPercentual: row.bdi_percentual ?? 0,
    bdiVisivelPdf: row.bdi_visivel_pdf ?? true,
    qtdItens: row.qtd_itens ?? 0,
    valorItens: row.valor_itens ?? 0,
    valorCalculado: row.valor_calculado ?? row.valor_estimado,
    // Contagem, e não o texto: a lista mostra dezenas de propostas e só precisa
    // saber se o descritivo existe. O texto chega por propostaSecoesService
    // quando a proposta é aberta.
    qtdSecoes: row.qtd_secoes ?? 0,
    prazoExecucaoDias: row.prazo_execucao_dias ?? undefined,
    dataValidade: row.data_validade ?? '',
    status: row.status,
    dataEnvio: row.data_envio ?? undefined,
    motivoRejeicao: row.motivo_rejeicao ?? undefined,
    revisoes,
  };
}

export const propostasService = {
  async list(): Promise<Proposta[]> {
    // v_propostas acrescenta a contagem e a soma dos itens — o que permite à
    // UI mostrar lado a lado o valor gravado e o total calculado dos itens.
    // Os snapshots de itens NÃO vêm aqui: são a maior tabela do conjunto (uma
    // cópia do orçamento por versão de cada proposta) e só o comparador de
    // versões precisa deles. Chegam por listRevisoes quando a proposta é
    // aberta. O cabeçalho da revisão vem, porque a linha do tempo o mostra.
    const [propostas, revisoes] = await Promise.all([
      buscarTudo((de, ate) =>
        supabase
          .from('v_propostas')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(de, ate)
      ),
      // Uma linha por versão de cada proposta: some rápido. Truncada, a linha do
      // tempo de revisões de uma proposta antiga simplesmente não aparecia.
      buscarTudo((de, ate) =>
        supabase
          .from('revisoes_proposta')
          .select('*')
          .order('versao', { ascending: true })
          .order('id', { ascending: true })
          .range(de, ate)
      ),
    ]);

    const revisoesByProposta = new Map<string, RevisaoProposta[]>();
    for (const r of revisoes) {
      const list = revisoesByProposta.get(r.proposta_id) ?? [];
      list.push({
        id: r.id,
        versao: r.versao,
        data: r.data,
        valor: r.valor,
        valorItens: r.valor_itens ?? 0,
        bdiPercentual: r.bdi_percentual ?? 0,
        alteracoes: r.alteracoes ?? '',
        // Preenchidos por listRevisoes quando a proposta é aberta.
        itens: [],
        secoes: [],
      });
      revisoesByProposta.set(r.proposta_id, list);
    }

    return propostas.map((p) => fromRow(p, revisoesByProposta.get(p.id) ?? []));
  },

  /**
   * `numero` é omitido de propósito — o trigger trg_propostas_set_numero
   * atribui o próximo do ano. O `.select()` traz de volta o valor atribuído,
   * que é o único número confiável para exibir.
   */
  async add(proposta: NovaProposta): Promise<Proposta> {
    const { data, error } = await supabase
      .from('propostas')
      .insert({
        id: proposta.id,
        cliente_id: proposta.clienteId,
        descricao: proposta.descricao,
        // valor_estimado é derivado: trg_propostas_valor_inicial o espelha a
        // partir daqui, e daí em diante ele pertence aos itens.
        valor_manual: proposta.valorManual,
        bdi_percentual: proposta.bdiPercentual,
        prazo_execucao_dias: proposta.prazoExecucaoDias ?? null,
        data_validade: proposta.dataValidade || null,
        status: proposta.status,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data, []);
  },

  /**
   * Edição do cabeçalho comercial. Existe porque a criação passou a pedir só
   * cliente e escopo: valor, BDI, prazo e validade são descobertos depois, e
   * uma proposta duplicada nasce precisando exatamente disso.
   *
   * `valor_estimado` fica de fora de propósito — é derivado. O que se escreve
   * é `valor_manual`, e o trigger decide se ele vale (sem itens) ou se quem
   * manda é o orçamento. A releitura pela view devolve os dois já conciliados.
   */
  async update(id: string, patch: {
    clienteId: string;
    descricao: string;
    valorManual: number;
    bdiPercentual: number;
    prazoExecucaoDias?: number;
    dataValidade: string;
  }): Promise<Proposta> {
    const { data: alteradas, error } = await supabase
      .from('propostas')
      .update({
        cliente_id: patch.clienteId,
        descricao: patch.descricao,
        valor_manual: patch.valorManual,
        bdi_percentual: patch.bdiPercentual,
        prazo_execucao_dias: patch.prazoExecucaoDias ?? null,
        data_validade: patch.dataValidade || null,
      })
      .eq('id', id)
      .select('id');
    if (error) throw error;
    garantirEscrita(alteradas, semPermissao('editar esta proposta'));

    const { data, error: readError } = await supabase
      .from('v_propostas')
      .select('*')
      .eq('id', id)
      .single();
    if (readError) throw readError;
    return fromRow(data, []);
  },

  /**
   * A mudança de status carrega os marcos do ciclo comercial. `data_envio` só
   * é gravada na primeira ida para Enviada — reenviar não deve reiniciar a
   * contagem de quanto tempo o cliente está com a proposta.
   */
  async updateStatus(
    id: string,
    status: Proposta['status'],
    extras: { dataEnvioAtual?: string; motivoRejeicao?: string } = {}
  ): Promise<{ dataEnvio?: string; motivoRejeicao?: string }> {
    const patch: {
      status: Proposta['status'];
      data_envio?: string;
      // Sair de Rejeitada apaga o motivo: manter um texto de recusa numa
      // proposta que voltou para a mesa confundiria mais do que informaria.
      motivo_rejeicao: string | null;
    } = {
      status,
      motivo_rejeicao: status === 'Rejeitada' ? extras.motivoRejeicao ?? null : null,
    };

    if (status === 'Enviada' && !extras.dataEnvioAtual) patch.data_envio = hojeISO();

    const { data, error } = await supabase
      .from('propostas')
      .update(patch)
      .eq('id', id)
      .select('data_envio, motivo_rejeicao')
      .single();
    if (error) throw error;
    return {
      dataEnvio: data.data_envio ?? undefined,
      motivoRejeicao: data.motivo_rejeicao ?? undefined,
    };
  },

  /** Como o BDI aparece no documento impresso. Não altera nenhum valor. */
  async updateBdiVisivelPdf(id: string, visivel: boolean): Promise<void> {
    const { data, error } = await supabase
      .from('propostas')
      .update({ bdi_visivel_pdf: visivel })
      .eq('id', id)
      .select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('alterar a exibição do BDI'));
  },

  /** Uma proposta pelo id, para trazer ao estado o que o servidor acabou de criar. */
  async get(id: string): Promise<Proposta> {
    const { data, error } = await supabase.from('v_propostas').select('*').eq('id', id).single();
    if (error) throw error;
    return fromRow(data, []);
  },

  /** Nova proposta em Elaboração com o mesmo orçamento. Devolve o id criado. */
  async duplicar(id: string, descricao?: string): Promise<string> {
    const { data, error } = await supabase.rpc('fn_duplicar_proposta', {
      p_proposta_id: id,
      p_descricao: descricao ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  /**
   * Mudar o BDI dispara o recálculo de valor_estimado no banco (trigger
   * trg_proposta_bdi_sync) quando a proposta tem itens. Devolve o valor
   * recalculado para o estado local não precisar adivinhar.
   */
  async updateBdi(id: string, bdiPercentual: number): Promise<{ valorEstimado: number; valorCalculado: number }> {
    const { data: alteradas, error } = await supabase
      .from('propostas').update({ bdi_percentual: bdiPercentual }).eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(alteradas, semPermissao('alterar o BDI desta proposta'));

    const { data, error: readError } = await supabase
      .from('v_propostas')
      .select('valor_estimado, valor_calculado')
      .eq('id', id)
      .single();
    if (readError) throw readError;
    return { valorEstimado: data.valor_estimado, valorCalculado: data.valor_calculado };
  },

  /** Total dos itens + BDI, para refletir no estado local após mexer nos itens. */
  async refreshTotais(id: string): Promise<{ valorEstimado: number; valorManual: number; valorItens: number; valorCalculado: number; qtdItens: number }> {
    const { data, error } = await supabase
      .from('v_propostas')
      .select('valor_estimado, valor_manual, valor_itens, valor_calculado, qtd_itens')
      .eq('id', id)
      .single();
    if (error) throw error;
    return {
      valorEstimado: data.valor_estimado,
      // Muda quando uma revisão de proposta sem itens redefine o valor digitado.
      valorManual: data.valor_manual,
      valorItens: data.valor_itens,
      valorCalculado: data.valor_calculado,
      qtdItens: data.qtd_itens,
    };
  },

  async remove(id: string): Promise<void> {
    const { data: linkedProjeto, error: checkError } = await supabase
      .from('projetos')
      .select('id')
      .eq('proposta_id', id)
      .limit(1);
    if (checkError) throw checkError;
    if (linkedProjeto && linkedProjeto.length > 0) {
      throw new Error('Esta proposta já foi convertida em obra e não pode ser excluída.');
    }

    // Mesma checagem para o contrato, pelo mesmo motivo e com uma diferença: a
    // do projeto é só mensagem (a FK lá é `set null`), esta duplica uma regra
    // que o banco JÁ impõe — `contratos.proposta_id` é `on delete restrict`
    // desde 20260812100000. Sem ela o usuário veria a violação de chave crua.
    const { data: linkedContrato, error: contratoError } = await supabase
      .from('contratos')
      .select('numero')
      .eq('proposta_id', id)
      .limit(1);
    if (contratoError) throw contratoError;
    if (linkedContrato && linkedContrato.length > 0) {
      throw new Error(
        `Esta proposta gerou o contrato ${linkedContrato[0].numero} e não pode ser excluída.`
      );
    }

    const { data, error } = await supabase.from('propostas').delete().eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('excluir propostas'));
  },

  /**
   * Revisões de uma proposta, com o snapshot de itens E do descritivo de cada
   * versão. As seções entraram em 20260810100002: antes disso, uma revisão que
   * mexia só no texto congelava um estado idêntico ao da versão anterior.
   */
  async listRevisoes(propostaId: string): Promise<RevisaoProposta[]> {
    const { data: revisoes, error } = await supabase
      .from('revisoes_proposta')
      .select('*')
      .eq('proposta_id', propostaId)
      .order('versao', { ascending: true });
    if (error) throw error;
    if (!revisoes || revisoes.length === 0) return [];

    const ids = revisoes.map((r) => r.id);
    const [
      { data: itens, error: itensError },
      { data: secoes, error: secoesError },
    ] = await Promise.all([
      supabase
        .from('itens_revisao_proposta')
        .select('*')
        .in('revisao_id', ids)
        .order('ordem', { ascending: true }),
      supabase
        .from('secoes_revisao_proposta')
        .select('*')
        .in('revisao_id', ids)
        .order('posicao', { ascending: true })
        .order('ordem', { ascending: true }),
    ]);
    if (itensError) throw itensError;
    if (secoesError) throw secoesError;

    const secoesByRevisao = new Map<string, SecaoRevisaoProposta[]>();
    for (const s of secoes ?? []) {
      const list = secoesByRevisao.get(s.revisao_id) ?? [];
      list.push({ titulo: s.titulo, corpo: s.corpo, posicao: s.posicao, ordem: s.ordem });
      secoesByRevisao.set(s.revisao_id, list);
    }

    const itensByRevisao = new Map<string, ItemRevisaoProposta[]>();
    for (const i of itens ?? []) {
      const list = itensByRevisao.get(i.revisao_id) ?? [];
      list.push({
        catalogoInsumoId: i.catalogo_insumo_id ?? undefined,
        descricao: i.descricao,
        unidade: i.unidade,
        categoria: i.categoria,
        quantidade: i.quantidade,
        precoUnitario: i.preco_unitario,
        total: i.total,
        ordem: i.ordem,
      });
      itensByRevisao.set(i.revisao_id, list);
    }

    return revisoes.map((r) => ({
      id: r.id,
      versao: r.versao,
      data: r.data,
      valor: r.valor,
      valorItens: r.valor_itens ?? 0,
      bdiPercentual: r.bdi_percentual ?? 0,
      alteracoes: r.alteracoes ?? '',
      itens: itensByRevisao.get(r.id) ?? [],
      secoes: secoesByRevisao.get(r.id) ?? [],
    }));
  },

  /**
   * Congela o orçamento vigente como uma nova versão. A numeração da versão, o
   * total e a cópia dos itens são responsabilidade da RPC — calcular a versão
   * no cliente esbarrava na unique (proposta_id, versao), e um total calculado
   * aqui divergiria do que o trigger grava em valor_estimado.
   *
   * `valor` só é usado quando a proposta não tem itens; com itens, quem manda
   * é o orçamento.
   */
  async addRevision(propostaId: string, alteracoes: string, valor?: number): Promise<void> {
    const { error } = await supabase.rpc('fn_registrar_revisao_proposta', {
      p_proposta_id: propostaId,
      p_alteracoes: alteracoes,
      p_valor: valor ?? null,
      // O banco roda em UTC; o dia que interessa é o de quem está registrando.
      p_data: hojeISO(),
    });
    if (error) throw error;
  },
};
