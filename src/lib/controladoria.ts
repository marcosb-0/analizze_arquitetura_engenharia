import type {
  CustoPorCentro, LancamentoFinanceiro, MargemObra, MedicaoRecente, Projeto, Proposta, ResultadoObra, ResumoObra,
} from '../types';
import type { CompromissoControle } from '../services/controladoriaService';

export interface FontesControladoria {
  propostas: Proposta[];
  projetos: Projeto[];
  resultados: ResultadoObra[];
  resumos: ResumoObra[];
  margens: MargemObra[];
  lancamentos: LancamentoFinanceiro[];
  medicoesRecentes: MedicaoRecente[];
  custos: CustoPorCentro[];
  compromissos: CompromissoControle[];
}

export interface FatoControladoria {
  id: string;
  data: string;
  titulo: string;
  origem: 'Comercial' | 'Operação' | 'Financeiro';
  valor?: number;
  projetoId?: string;
  propostaId?: string;
}

/** O relatório soma apenas fatos do mesmo estágio e mantém a origem de cada número. */
export function montarControladoria(fontes: FontesControladoria) {
  const raiz = fontes.custos.find((centro) => centro.codigo === '1000' && !centro.paiId);
  const grupos = fontes.custos.filter((centro) => centro.paiId === raiz?.centroId);
  const resultadoPorId = new Map(fontes.resultados.map((r) => [r.projetoId, r]));
  const resumoPorId = new Map(fontes.resumos.map((r) => [r.projetoId, r]));
  const margemPorId = new Map(fontes.margens.map((r) => [r.projetoId, r]));
  const propostasEnviadas = fontes.propostas.filter((p) => p.status === 'Enviada');
  const obrasEmExecucao = fontes.projetos.filter((p) => p.situacao === 'Em Execução');
  const compromissosAtivos = fontes.compromissos.reduce((total, compromisso) => total + compromisso.valor, 0);

  const obras = fontes.projetos.map((projeto) => ({
    projeto,
    resultado: resultadoPorId.get(projeto.id),
    resumo: resumoPorId.get(projeto.id),
    margem: margemPorId.get(projeto.id),
    compromissos: fontes.compromissos
      .filter((compromisso) => compromisso.projetoId === projeto.id)
      .reduce((total, compromisso) => total + compromisso.valor, 0),
  }));

  const margensCompletas = fontes.margens.filter(
    (m) => m.itensTotal > 0 && m.itensConhecidos === m.itensTotal && m.margemValor !== undefined
  );
  const margemProjetada = margensCompletas.reduce((total, margem) => total + (margem.margemValor ?? 0), 0);

  const fatos: FatoControladoria[] = [
    ...fontes.propostas.filter((p) => p.status === 'Enviada' && p.dataEnvio).map((p) => ({
      id: `proposta:${p.id}`, data: p.dataEnvio!, titulo: `Proposta ${p.numero} enviada`,
      origem: 'Comercial' as const, valor: p.valorEstimado, propostaId: p.id,
    })),
    ...fontes.medicoesRecentes.map((m) => ({
      id: `medicao:${m.id}`, data: m.dataMedicao, titulo: `Medição ${m.status.toLowerCase()} · ${m.etapaNome ?? 'Geral'}`,
      origem: 'Operação' as const, valor: m.valorMedido, projetoId: m.projetoId,
    })),
    ...fontes.compromissos.map((c) => ({
      id: `compromisso:${c.id}`, data: c.criadoEm, titulo: `Compromisso · ${c.descricao}`,
      origem: 'Operação' as const, valor: c.valor, projetoId: c.projetoId,
    })),
    ...fontes.lancamentos.map((l) => ({
      id: `lancamento:${l.id}`, data: l.data, titulo: l.descricao,
      origem: 'Financeiro' as const, valor: l.tipo === 'Despesa' ? -l.valor : l.valor,
      projetoId: l.projetoId,
    })),
  ].sort((a, b) => b.data.localeCompare(a.data) || a.id.localeCompare(b.id)).slice(0, 10);

  return {
    raiz,
    grupos,
    propostasEnviadas: propostasEnviadas.length,
    valorEmNegociacao: propostasEnviadas.reduce((total, proposta) => total + proposta.valorEstimado, 0),
    obrasEmExecucao: obrasEmExecucao.length,
    medicoesPendentes: fontes.resumos.reduce((total, resumo) => total + resumo.medicoesPendentes, 0),
    etapasAtrasadas: fontes.resumos.reduce((total, resumo) => total + resumo.etapasAtrasadas, 0),
    compromissosAtivos,
    margemProjetada,
    margemCobertura: { completas: margensCompletas.length, total: fontes.margens.length },
    obras,
    fatos,
  };
}
