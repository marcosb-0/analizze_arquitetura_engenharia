/**
 * Quanto o colaborador custa por hora.
 *
 * ESTA FUNÇÃO É O ESPELHO DE `fn_custo_hora_folha` (20260810141000). O banco
 * calcula o mesmo número para orçar mão de obra pela fonte `Folha`, e o cliente
 * o recalcula para mostrar na ficha — a função do banco é SECURITY DEFINER com
 * EXECUTE revogado (chamá-la por RPC devolveria o salário pela conta inversa),
 * então não há como pedir o valor pronto ao servidor. Divergir das duas contas
 * significa a Equipe e o orçamento afirmarem preços diferentes para a mesma
 * pessoa, e é exatamente isso que `custoHora.test.ts` existe para impedir.
 *
 *     custo mensal = salário × (1 + encargos/100) + benefícios
 *     custo/hora   = round(custo mensal ÷ jornada mensal, 2)
 *
 * Encargos e jornada saem da ficha quando preenchidos e da empresa quando não.
 * Benefício ausente é zero; encargo ausente NOS DOIS níveis não é zero, é a
 * ausência do número — e então não existe custo/hora. Ver o cabeçalho de
 * 20260810140000, onde essa distinção está escrita por extenso.
 */

import { Beneficios, Funcionario } from '../types';
import { round2 } from './preco';

/** O que a empresa oferece como padrão — recorte de `EmpresaConfig`. */
export interface ParametrosCusto {
  /** `null` = não configurado. Não é 0. */
  encargosPercentual: number | null;
  jornadaMensalHoras: number;
}

export interface CustoColaborador {
  custoHora: number;
  custoMensal: number;
  /** Salário × encargos, sem benefícios — o que a folha em si custa. */
  custoFolha: number;
  beneficiosTotal: number;
  encargosPercentual: number;
  /** Encargos em reais, para a ficha não obrigar o leitor a fazer a conta. */
  encargosValor: number;
  jornada: number;
  /** Veio de `empresa_config` porque a ficha não define. Rotula a tela. */
  encargosHerdados: boolean;
  jornadaHerdada: boolean;
}

export function somarBeneficios(beneficios: Beneficios | undefined): number {
  if (!beneficios) return 0;
  return (
    (beneficios.valeTransporte ?? 0) +
    (beneficios.valeAlimentacao ?? 0) +
    (beneficios.planoSaude ?? 0) +
    (beneficios.outros ?? 0)
  );
}

/**
 * `null` nos mesmos casos em que a função do banco não devolve linha: sem
 * salário, salário não positivo, ou encargos indefinidos na ficha E na empresa.
 * Devolver 0 aqui seria pior que não responder — "R$ 0,00/h" é uma afirmação, e
 * uma falsa; é a mesma escolha de `sugerirDuracao` em `lib/hh.ts`.
 *
 * Diferente do banco em um ponto de propósito: aqui não há filtro de `status`.
 * A pergunta do banco é "quanto orçar este cargo" e só quem está ativo conta; a
 * pergunta da ficha é "quanto esta pessoa custa", que continua valendo enquanto
 * a ficha estiver aberta. Quem soma vários colaboradores — o KPI da folha —
 * filtra os ativos antes de chamar.
 */
export function custoColaborador(
  func: Funcionario,
  cfg: ParametrosCusto | null
): CustoColaborador | null {
  const salario = func.salarioBase;
  if (salario == null || !Number.isFinite(salario) || salario <= 0) return null;

  // `??` e não `||`: encargo de 0% é uma resposta legítima (quem contrata PJ
  // não paga encargo), e `||` a trocaria pelo padrão da empresa em silêncio.
  const encargosPercentual = func.encargosPercentual ?? cfg?.encargosPercentual ?? null;
  if (encargosPercentual == null || !Number.isFinite(encargosPercentual)) return null;

  const jornada = func.jornadaMensalHoras ?? cfg?.jornadaMensalHoras ?? null;
  if (jornada == null || !Number.isFinite(jornada) || jornada <= 0) return null;

  const beneficiosTotal = somarBeneficios(func.beneficios);
  const custoFolha = salario * (1 + encargosPercentual / 100);
  const custoMensal = custoFolha + beneficiosTotal;

  return {
    // Só o custo/hora é arredondado, e é onde `fn_custo_hora_folha` arredonda:
    // fechar o mensal antes mudaria o centavo final em parte dos casos.
    custoHora: round2(custoMensal / jornada),
    custoMensal,
    custoFolha,
    beneficiosTotal,
    encargosPercentual,
    encargosValor: custoFolha - salario,
    jornada,
    encargosHerdados: func.encargosPercentual == null,
    jornadaHerdada: func.jornadaMensalHoras == null,
  };
}

/**
 * Os parâmetros da empresa no formato que `custoColaborador` espera.
 *
 * Existe para as telas não repetirem o mapeamento de nomes (`empresa_config`
 * chama de `encargosSociaisPercentual` o que aqui é `encargosPercentual`, para
 * poder cair no `??` junto do campo da ficha) e para tratarem "empresa ainda
 * não carregada" como `null`, e não como zero.
 */
export function parametrosDaEmpresa(
  empresa: { encargosSociaisPercentual: number | null; jornadaMensalHoras: number } | null
): ParametrosCusto | null {
  if (!empresa) return null;
  return {
    encargosPercentual: empresa.encargosSociaisPercentual,
    jornadaMensalHoras: empresa.jornadaMensalHoras,
  };
}
