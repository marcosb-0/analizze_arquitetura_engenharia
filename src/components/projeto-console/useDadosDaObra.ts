import { useCallback, useMemo } from 'react';
import {
  Acesso,
  AlteracaoOrcamento,
  Cliente,
  Documento,
  EtapaCronograma,
  EtapaOrcamentoVinculo,
  Dependencia,
  Funcionario,
  InsumoProjeto,
  ItemOrcamento,
  MedicaoObra,
  Projeto,
  ProjetoEquipeMembro,
} from '../../types';
import { calcularAvancoFisico, detalharAvancoFisico } from '../../lib/avanco';
import { folhasDe, montarArvore, somenteFolhas } from '../../lib/cronograma/wbs';
import { agendar } from '../../lib/cronograma/agendar';
import { calcularFolgas } from '../../lib/cronograma/caminhoCritico';
import { versaoDoCronograma } from '../../services/cronogramaService';

/**
 * Tudo o que o console deriva, para UMA obra.
 *
 * O recorte por `projeto.id` e as contas em cima dele eram 22 `useMemo` no corpo
 * do componente de 2.500 linhas; aqui viram um valor só, que as abas consomem
 * sem recalcular.
 *
 * **Os filtros por `projeto.id` viraram rede de segurança em 04/ago/2026** (item
 * 23, peça 2): as coleções já chegam recortadas pela obra aberta, então eles não
 * descartam mais nada em regime. Ficam porque existe uma janela em que
 * descartam: `ConsoleConectado` tem `key={obra.id}` e remonta ao trocar de obra,
 * mas o provedor de dados é externo à `key` — entre o remonte e a chegada da
 * nova busca, o estado ainda é o da obra anterior. Sem o filtro, o console
 * pintaria por um instante o orçamento da obra errada, que é o tipo de erro que
 * ninguém reporta porque parece um piscar de tela.
 */
interface Entrada {
  projeto: Projeto;
  clientes: Cliente[];
  funcionarios: Funcionario[];
  orcamentos: ItemOrcamento[];
  alteracoesOrcamento: AlteracaoOrcamento[];
  insumosProjeto: InsumoProjeto[];
  cronogramas: EtapaCronograma[];
  vinculos: EtapaOrcamentoVinculo[];
  dependencias: Dependencia[];
  medicoes: MedicaoObra[];
  documentos: Documento[];
  projetoEquipe: ProjetoEquipeMembro[];
  perfisCampo: Acesso[];
}

/** Uma frente de serviço com a fatia de orçamento que ela consome. */
export interface LinhaAlocacao {
  etapa: EtapaCronograma;
  vinculos: number;
  orcado: number;
  contratado: number;
  executado: number;
}

export interface EncarregadoDaObra {
  chave: string;
  funcionario?: Funcionario;
  etapas: string[];
}

export function useDadosDaObra({
  projeto,
  clientes,
  funcionarios,
  orcamentos,
  alteracoesOrcamento,
  insumosProjeto,
  cronogramas,
  vinculos,
  dependencias,
  medicoes,
  documentos,
  projetoEquipe,
  perfisCampo,
}: Entrada) {
  const cliente = useMemo(
    () => clientes.find((c) => c.id === projeto.clienteId),
    [clientes, projeto.clienteId]
  );

  const responsavelFuncionario = useMemo(
    () => funcionarios.find((f) => f.id === projeto.responsavelInternoId),
    [funcionarios, projeto.responsavelInternoId]
  );

  const itens = useMemo(
    () => orcamentos.filter((item) => item.projetoId === projeto.id),
    [orcamentos, projeto.id]
  );

  const insumos = useMemo(
    () => insumosProjeto.filter((i) => i.projetoId === projeto.id),
    [insumosProjeto, projeto.id]
  );

  const alteracoes = useMemo(
    () => alteracoesOrcamento.filter((alt) => alt.projetoId === projeto.id),
    [alteracoesOrcamento, projeto.id]
  );

  const etapas = useMemo(
    () => cronogramas.filter((step) => step.projetoId === projeto.id),
    [cronogramas, projeto.id]
  );

  /**
   * As frentes de verdade. Grupo da EAP é soma, não trabalho: ele não recebe
   * medição nem vincula orçamento (fn_execucao_so_em_folha), então contá-lo em
   * qualquer agregado infla o denominador com um 0%.
   */
  const folhas = useMemo(() => somenteFolhas(etapas), [etapas]);

  /** A EAP montada, para a tela recolher grupos e recusar destinos inválidos. */
  const arvore = useMemo(() => montarArvore(etapas), [etapas]);

  /** Token de concorrência otimista de `fn_aplicar_cronograma`. */
  const versaoCronograma = useMemo(() => versaoDoCronograma(etapas), [etapas]);

  /**
   * Aresta cujas duas pontas estão na obra aberta.
   *
   * O filtro é a mesma rede de segurança dos demais: entre trocar de obra e a
   * busca nova chegar, uma aresta antiga apontaria para uma etapa que não está
   * mais na lista — e o forward pass a descartaria em silêncio, mudando as datas
   * calculadas sem nenhum aviso.
   */
  const dependenciasDaObra = useMemo(() => {
    const ids = new Set(etapas.map((e) => e.id));
    return dependencias.filter((d) => ids.has(d.predecessoraId) && ids.has(d.sucessoraId));
  }, [dependencias, etapas]);

  /**
   * O forward pass sobre as FOLHAS — grupo tem data rolada, não calculada.
   *
   * Roda no cliente porque precisa rodar a cada quadro do arraste (Fase 4), e
   * porque uma segunda implementação em SQL divergiria produzindo uma data
   * plausível e errada. Ver o cabeçalho de 20260809110000.
   */
  const agendamento = useMemo(
    () => agendar({ nos: folhas, dependencias: dependenciasDaObra }),
    [folhas, dependenciasDaObra]
  );

  /** Folga e caminho crítico. Vazio quando há ciclo — não há o que calcular. */
  const folgas = useMemo(
    () => calcularFolgas(folhas.map((e) => e.id), dependenciasDaObra, agendamento),
    [folhas, dependenciasDaObra, agendamento]
  );

  const medicoesDaObra = useMemo(
    () => medicoes.filter((med) => med.projetoId === projeto.id),
    [medicoes, projeto.id]
  );

  const vinculosDaObra = useMemo(() => {
    const idsDasEtapas = new Set(etapas.map((s) => s.id));
    return vinculos.filter((v) => idsDasEtapas.has(v.etapaId));
  }, [vinculos, etapas]);

  const equipe = useMemo(
    () => projetoEquipe.filter((m) => m.projetoId === projeto.id),
    [projetoEquipe, projeto.id]
  );

  const documentosDaObra = useMemo(
    () => documentos.filter((doc) => doc.projetoId === projeto.id),
    [documentos, projeto.id]
  );

  /** Quanto do valor de cada item de orçamento já está alocado a etapas (0–100). */
  const pesoAlocadoPorItem = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const v of vinculosDaObra) {
      mapa.set(v.itemOrcamentoId, (mapa.get(v.itemOrcamentoId) ?? 0) + v.pesoPercentual);
    }
    return mapa;
  }, [vinculosDaObra]);

  /** Quantas etapas consomem cada item — "cimento em 3 etapas". */
  const etapasPorItem = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const v of vinculosDaObra) {
      mapa.set(v.itemOrcamentoId, (mapa.get(v.itemOrcamentoId) ?? 0) + 1);
    }
    return mapa;
  }, [vinculosDaObra]);

  /**
   * A planilha vista pelo lado da obra: os mesmos vínculos etapa↔item lidos na
   * direção contrária, para responder "quanto custa a fundação".
   *
   * O executado reproduz a conta do `fn_apply_medicao` (percentual medido da
   * etapa × peso do vínculo × valor orçado do item), e não um rateio do
   * `valorExecutado` do item — assim o número por etapa é o mesmo que foi de
   * fato aplicado no banco quando a medição entrou.
   *
   * A linha "não alocado" existe porque peso sobrando é dinheiro que nenhuma
   * medição vai alcançar: some as duas e você tem o total orçado da obra.
   */
  const alocacaoPorEtapa = useMemo(() => {
    const itensPorId = new Map<string, ItemOrcamento>(itens.map((i) => [i.id, i]));

    // Só folhas: um grupo nunca tem vínculo, então entraria como uma linha de
    // zeros no meio da planilha — ruído que faz parecer que falta alocar.
    const linhas: LinhaAlocacao[] = folhas.map((step) => {
      const doStep = vinculosDaObra.filter((v) => v.etapaId === step.id);
      let orcado = 0;
      let contratado = 0;
      let executado = 0;
      for (const v of doStep) {
        const item = itensPorId.get(v.itemOrcamentoId);
        if (!item) continue;
        const fatia = v.pesoPercentual / 100;
        orcado += fatia * item.valorOrcado;
        contratado += fatia * item.valorContratado;
        executado += fatia * item.valorOrcado * (step.percentualExecutado / 100);
      }
      return { etapa: step, vinculos: doStep.length, orcado, contratado, executado };
    });


    let orcadoNaoAlocado = 0;
    let contratadoNaoAlocado = 0;
    let itensNaoAlocados = 0;
    for (const item of itens) {
      const sobra = Math.max(0, 100 - (pesoAlocadoPorItem.get(item.id) ?? 0)) / 100;
      if (sobra <= 0) continue;
      itensNaoAlocados += 1;
      orcadoNaoAlocado += sobra * item.valorOrcado;
      contratadoNaoAlocado += sobra * item.valorContratado;
    }

    return {
      linhas,
      naoAlocado: {
        orcado: orcadoNaoAlocado,
        contratado: contratadoNaoAlocado,
        itens: itensNaoAlocados,
      },
    };
  }, [folhas, vinculosDaObra, itens, pesoAlocadoPorItem]);

  /**
   * Encarregados agrupados por pessoa, com as etapas que cada um lidera. A tela
   * antes renderizava uma linha por etapa, então o mesmo encarregado aparecia
   * cinco vezes numa obra de cinco frentes.
   */
  const encarregados = useMemo<EncarregadoDaObra[]>(() => {
    const porPessoa = new Map<string, { funcionario?: Funcionario; etapas: string[] }>();
    // Só folhas: a responsabilidade mora na frente, não no grupo. Sem o recorte
    // o encarregado apareceria liderando "Estrutura" MAIS as quatro frentes
    // dentro dela — o mesmo trabalho listado cinco vezes.
    for (const step of folhas) {
      const chave = step.responsavelId || 'sem-responsavel';
      const atual = porPessoa.get(chave) ?? {
        funcionario: funcionarios.find((f) => f.id === step.responsavelId),
        etapas: [],
      };
      atual.etapas.push(step.nome);
      porPessoa.set(chave, atual);
    }
    return Array.from(porPessoa, ([chave, dados]) => ({ chave, ...dados }));
  }, [folhas, funcionarios]);

  /**
   * O percentual que a linha da EAP mostra: o próprio, na folha; nas frentes
   * abaixo, no grupo.
   *
   * O rollup do grupo é `calcularAvancoFisico` das folhas descendentes — a MESMA
   * função do avanço da obra, e não uma média nova. Uma segunda fórmula aqui
   * seria a terceira cópia da mesma conta (avanco.ts, v_resumo_obra, e esta), e
   * o modo de falha é o grupo mostrar um número que não bate com a soma das
   * linhas logo abaixo dele.
   */
  const percentualDaEtapa = useCallback(
    (etapa: EtapaCronograma): number =>
      etapa.ehFolha
        ? etapa.percentualExecutado
        : calcularAvancoFisico(folhasDe(etapas, etapa.id), vinculosDaObra, itens),
    [etapas, vinculosDaObra, itens]
  );

  const perfisDisponiveis = useMemo(() => {
    const jaComAcesso = new Set(equipe.map((m) => m.profileId));
    return perfisCampo.filter((p) => !jaComAcesso.has(p.id));
  }, [perfisCampo, equipe]);

  const totalOrcado = useMemo(
    () => itens.reduce((acc, curr) => acc + curr.valorOrcado, 0),
    [itens]
  );
  const totalContratado = useMemo(
    () => itens.reduce((acc, curr) => acc + curr.valorContratado, 0),
    [itens]
  );
  const totalExecutado = useMemo(
    () => itens.reduce((acc, curr) => acc + curr.valorExecutado, 0),
    [itens]
  );

  // Two distinct notions of "saldo": what's left to physically execute/measure
  // vs. what's left to commit into new contracts. Conflating them into one
  // number used to hide the case where everything is already contracted (0 left
  // to negotiate) while still showing a "healthy" green balance based on execution.
  const saldoDisponivel = totalOrcado - totalExecutado;
  const saldoAComprometer = totalOrcado - totalContratado;

  // Avanço físico ponderado pelo orçamento vinculado a cada etapa. A conta vive
  // em src/lib/avanco.ts porque a lista de obras e o dashboard mostram o mesmo
  // número — antes cada tela tinha a sua e elas discordavam.
  //
  // `detalhar*` em vez de `calcular*` para a tela saber DE ONDE veio o número:
  // sem vínculo de orçamento ele é média simples, e a legenda dizia "ponderada"
  // de qualquer jeito (§2.2, fricção 6).
  const avancoFisico = useMemo(
    () => detalharAvancoFisico(etapas, vinculosDaObra, itens),
    [etapas, vinculosDaObra, itens]
  );
  const progressoFisico = avancoFisico.percentual;

  return {
    cliente,
    responsavelFuncionario,
    itens,
    insumos,
    alteracoes,
    etapas,
    folhas,
    arvore,
    dependencias: dependenciasDaObra,
    agendamento,
    folgas,
    versaoCronograma,
    percentualDaEtapa,
    medicoes: medicoesDaObra,
    vinculos: vinculosDaObra,
    equipe,
    documentos: documentosDaObra,
    pesoAlocadoPorItem,
    etapasPorItem,
    alocacaoPorEtapa,
    encarregados,
    perfisDisponiveis,
    totalOrcado,
    totalContratado,
    totalExecutado,
    saldoDisponivel,
    saldoAComprometer,
    progressoFisico,
    avancoFisico,
  };
}

export type DadosDaObra = ReturnType<typeof useDadosDaObra>;
