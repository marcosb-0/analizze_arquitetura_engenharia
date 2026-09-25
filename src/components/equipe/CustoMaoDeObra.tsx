import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { EmpresaConfig, Funcionario, GrupoEncargoDef, InsumoCatalogo, RubricaEncargo } from '../../types';
import { custoColaborador, parametrosDaEmpresa } from '../../lib/custoHora';
import { formatBRL } from '../../lib/preco';
import { catalogoService } from '../../services/catalogoService';
import { CabecalhoPagina, FaixaKpis, Kpi, PaginaAba } from '../ui';
import { DESCRICAO_EQUIPE } from './descricao';
import CustoPorCargo from './CustoPorCargo';
import ParametrosMaoDeObra from './ParametrosMaoDeObra';
import type { Nova } from './rascunhoEncargos';

/**
 * Equipe › Custo da mão de obra.
 *
 * A tabela de encargos morava em Configurações, ao lado do timbre das
 * propostas. Mas a pergunta que ela responde — quanto custa por hora o meu
 * pedreiro — nasce onde estão as pessoas, e a cadeia até a composição não
 * aparecia em tela nenhuma. Aqui ficam juntos o resultado (custo-hora por cargo
 * e o que o catálogo cobra) e os parâmetros que o produzem.
 *
 * O papel `financeiro` lê a Equipe e passa a ver esta visão em leitura; a
 * escrita continua admin/gestão, que é o que a RLS de `empresa_config` e
 * `encargos_rubricas` já exige.
 */

interface Props {
  seletor: ReactNode;
  funcionarios: Funcionario[];
  empresa: EmpresaConfig | null;
  rubricas: RubricaEncargo[];
  editavel: boolean;
  onSaveEmpresa: (config: Omit<EmpresaConfig, 'id' | 'logoUrl'>) => Promise<EmpresaConfig | null>;
  onSaveRubricas: (rubricas: RubricaEncargo[]) => Promise<boolean>;
  onCreate: (nova: Nova) => Promise<boolean>;
  onDelete: (codigo: string) => Promise<boolean>;
  gruposEncargo: GrupoEncargoDef[];
  onCriarGrupo: (titulo: string) => Promise<GrupoEncargoDef | null>;
  onExcluirGrupo: (codigo: string) => Promise<boolean>;
  /** Clique num nome: volta a Pessoas com a ficha aberta. */
  onAbrirFicha: (id: string) => void;
}

export default function CustoMaoDeObra({ seletor, funcionarios, empresa, rubricas, editavel, onAbrirFicha, gruposEncargo, onCriarGrupo, onExcluirGrupo, ...escritas }: Props) {
  const parametros = useMemo(() => parametrosDaEmpresa(empresa, rubricas), [empresa, rubricas]);

  /**
   * O preço que o catálogo cobra, relido sempre que um insumo da cadeia muda
   * — senão, depois de salvar os encargos, a coluna "No catálogo" mostraria o
   * preço velho ao lado do custo novo e acusaria uma divergência que não existe.
   * `listarMaoDeObra` é a lista curta que a ficha já usa no seletor de cargo.
   */
  const [insumos, setInsumos] = useState<InsumoCatalogo[]>([]);
  useEffect(() => {
    let vivo = true;
    catalogoService
      .listarMaoDeObra()
      .then((itens) => { if (vivo) setInsumos(itens); })
      // Falhar aqui (ou o papel não ler o catálogo) só esconde as colunas do
      // catálogo; o custo-hora da folha continua visível.
      .catch(() => { if (vivo) setInsumos([]); });
    return () => { vivo = false; };
  }, [empresa, rubricas, funcionarios]);

  /** O retrato da folha que os parâmetros abaixo produzem. */
  const resumo = useMemo(() => {
    let custoMensal = 0, semCusto = 0, foraDasComposicoes = 0, ativos = 0;
    for (const f of funcionarios) {
      if (f.status !== 'Ativo') continue;
      ativos += 1;
      const c = custoColaborador(f, parametros);
      if (c) custoMensal += c.custoMensal; else semCusto += 1;
      if (!f.catalogoMaoDeObraId) foraDasComposicoes += 1;
    }
    return { custoMensal, semCusto, foraDasComposicoes, ativos };
  }, [funcionarios, parametros]);

  // Duas casas no número grande: as quatro da tabela são para conferir rubrica,
  // não para ler de relance.
  const pct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
  const encargosEmUso =
    parametros?.encargosModo === 'Rubricas'
      ? { valor: pct(parametros.encargosRubricas.mensalista), detalhe: `mensalista · horista ${pct(parametros.encargosRubricas.horista)}` }
      : parametros?.encargosPercentual != null
        ? { valor: `${parametros.encargosPercentual.toLocaleString('pt-BR')}%`, detalhe: 'percentual direto' }
        : { valor: '—', detalhe: 'não definido — sem custo/hora' };

  // Mesma largura e mesmo cabeçalho de Pessoas: trocar de visão não pode fazer
  // o título pular nem a página encolher de 1440 para 960 px.
  return (
    <PaginaAba largura="painel">
      <CabecalhoPagina titulo="Equipe" descricao={DESCRICAO_EQUIPE} />
      <div className="-mt-2">{seletor}</div>
      <FaixaKpis>
        <Kpi
          rotulo="Custo mensal da folha"
          valor={formatBRL(resumo.custoMensal)}
          detalhe={resumo.semCusto > 0 ? `${resumo.semCusto} de ${resumo.ativos} ativos sem custo definido` : `${resumo.ativos} ativos, com encargos e benefícios`}
        />
        <Kpi rotulo="Encargos em uso" valor={encargosEmUso.valor} detalhe={encargosEmUso.detalhe} />
        <Kpi rotulo="Jornada padrão" valor={`${(parametros?.jornadaMensalHoras ?? 220).toLocaleString('pt-BR')} h`} detalhe="por mês, repouso incluído" />
        <Kpi
          rotulo="Fora das composições"
          valor={resumo.foraDasComposicoes}
          detalhe={resumo.foraDasComposicoes > 0 ? 'ativos sem cargo no catálogo' : 'toda a folha precifica serviço'}
        />
      </FaixaKpis>
      <CustoPorCargo funcionarios={funcionarios} parametros={parametros} insumos={insumos} onAbrirFicha={onAbrirFicha} />
      <ParametrosMaoDeObra empresa={empresa} rubricas={rubricas} editavel={editavel}
        onSaveEmpresa={escritas.onSaveEmpresa} onSaveRubricas={escritas.onSaveRubricas}
        onCreate={escritas.onCreate} onDelete={escritas.onDelete}
        grupos={gruposEncargo} onCriarGrupo={onCriarGrupo} onExcluirGrupo={onExcluirGrupo} />
    </PaginaAba>
  );
}
