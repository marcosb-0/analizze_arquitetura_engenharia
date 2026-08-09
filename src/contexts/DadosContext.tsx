import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
import { useDadoAtivo, useObraEscopo } from './NavegacaoContext';

import { useClientes } from '../hooks/useClientes';
import { useClienteDocumentos } from '../hooks/useClienteDocumentos';
import { useFornecedores } from '../hooks/useFornecedores';
import { useFuncionarios } from '../hooks/useFuncionarios';
import { useFuncionarioDocumentos } from '../hooks/useFuncionarioDocumentos';
import { usePropostas } from '../hooks/usePropostas';
import { useEmpresaConfig } from '../hooks/useEmpresaConfig';
import { useModelosTexto } from '../hooks/useModelosTexto';
import { useCatalogo } from '../hooks/useCatalogo';
import { useSinapi } from '../hooks/useSinapi';
import { useFinanceiro } from '../hooks/useFinanceiro';
import { useDocumentos } from '../hooks/useDocumentos';
import { useDocumentoCategorias } from '../hooks/useDocumentoCategorias';
import { useProjetos } from '../hooks/useProjetos';
import { useOrcamento } from '../hooks/useOrcamento';
import { useInsumosProjeto } from '../hooks/useInsumosProjeto';
import { useCronograma } from '../hooks/useCronograma';
import { useMedicoes } from '../hooks/useMedicoes';
import { useMedicoesAFaturar } from '../hooks/useMedicoesAFaturar';
import { useCargaEquipe } from '../hooks/useCargaEquipe';
import { useResumoObras } from '../hooks/useResumoObras';
import { useAcessos } from '../hooks/useAcessos';
import { useProjetoEquipe } from '../hooks/useProjetoEquipe';
import { useTarefas } from '../hooks/useTarefas';

/**
 * =============================================================================
 * UM PROVEDOR POR DOMÍNIO — o item 30 da auditoria (§1.2, §4.4).
 * =============================================================================
 *
 * O `App` instanciava os hooks de dados e montava a aba ativa no mesmo
 * componente. Consequência: **qualquer** mudança em **qualquer** hook
 * re-renderizava o `App` e, com ele, a aba inteira, a sidebar e o breadcrumb —
 * um lançamento financeiro repintava a tela de propostas. E como as abas
 * recebiam de 10 a 49 props, com `ProjetosTab` repassando 44 delas ao console,
 * nem `React.memo` resolveria: as props nunca eram referencialmente iguais.
 *
 * A correção tem duas metades, e nenhuma funciona sozinha:
 *
 *   1. os hooks devolvem objeto e handlers estáveis (`useCallback` + `useMemo`,
 *      trancado em `useClientes.test.ts`);
 *   2. cada domínio tem um provedor SEPARADO, e cada tela assina só os que usa.
 *
 * Por que provedores separados e não um `DadosProvider` que chame os 22 hooks:
 * num provedor único, uma mudança em `financeiro` re-executaria os 22 hooks e
 * recriaria os 22 `value`. Separados, uma mudança em `financeiro` re-renderiza
 * exatamente `ProvedorFinanceiro` — os outros 21 nem re-executam.
 *
 * E `children` é PROP de cada provedor, não filho declarado no corpo dele. Isso
 * é o que faz o corte valer: quando um provedor re-renderiza, o elemento de
 * `children` continua sendo o mesmo objeto, e o React pula a subárvore inteira.
 * Só quem chamou o `use*Dados()` daquele domínio re-renderiza.
 */

interface Filhos {
  children: ReactNode;
}

/**
 * Declara um domínio: o contexto, o provedor que roda o hook e o acessor.
 *
 * O parâmetro se chama `useDados` de propósito — é uma chamada de hook dentro do
 * corpo de um componente, e o nome é o que permite ao `eslint-plugin-react-hooks`
 * enxergar isso.
 */
function dominio<T>(nome: string, dado: string, useDados: (ativo: boolean) => T) {
  const Ctx = createContext<T | null>(null);

  function Provedor({ children }: Filhos) {
    const valor = useDados(useDadoAtivo(dado));
    return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
  }
  Provedor.displayName = `Provedor${nome}`;

  function useDominio(): T {
    const valor = useContext(Ctx);
    if (valor === null) {
      throw new Error(`use${nome}Dados() precisa estar dentro de <DadosProvider>`);
    }
    return valor;
  }

  return [Provedor, useDominio] as const;
}

/**
 * Um domínio recortado pela OBRA ABERTA — item 23, peça 2 (§4.2).
 *
 * A diferença para `dominio` é uma linha: o hook recebe também a obra do
 * `ObraEscopoCtx`. Existe como construtor separado, e não como parâmetro
 * opcional do outro, para que a lista de declarações lá embaixo diga sozinha
 * quais são os quatro domínios que NÃO carregam o app inteiro — a informação
 * que a auditoria passou duas fases procurando no código.
 */
function dominioDaObra<T>(nome: string, dado: string, useDados: (ativo: boolean, obraId: string | null) => T) {
  const Ctx = createContext<T | null>(null);

  function Provedor({ children }: Filhos) {
    const valor = useDados(useDadoAtivo(dado), useObraEscopo());
    return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
  }
  Provedor.displayName = `Provedor${nome}`;

  function useDominio(): T {
    const valor = useContext(Ctx);
    if (valor === null) {
      throw new Error(`use${nome}Dados() precisa estar dentro de <DadosProvider>`);
    }
    return valor;
  }

  return [Provedor, useDominio] as const;
}

const [ProvedorClientes, useClientesDados] = dominio('Clientes', 'clientes', useClientes);
const [ProvedorClienteDocumentos, useClienteDocumentosDados] = dominio('ClienteDocumentos', 'clienteDocumentos', useClienteDocumentos);
const [ProvedorFornecedores, useFornecedoresDados] = dominio('Fornecedores', 'fornecedores', useFornecedores);
const [ProvedorFuncionarios, useFuncionariosDados] = dominio('Funcionarios', 'funcionarios', useFuncionarios);
const [ProvedorFuncionarioDocumentos, useFuncionarioDocumentosDados] = dominio('FuncionarioDocumentos', 'funcionarioDocumentos', useFuncionarioDocumentos);
const [ProvedorPropostas, usePropostasDados] = dominio('Propostas', 'propostas', usePropostas);
const [ProvedorEmpresaConfig, useEmpresaConfigDados] = dominio('EmpresaConfig', 'empresaConfig', useEmpresaConfig);
const [ProvedorModelosTexto, useModelosTextoDados] = dominio('ModelosTexto', 'modelosTexto', useModelosTexto);
const [ProvedorCatalogo, useCatalogoDados] = dominio('Catalogo', 'catalogo', useCatalogo);
// A base de referência SINAPI acompanha a aba de catálogo: é de lá que o painel
// de adoção é aberto. O hook só vai ao servidor quando o painel abre.
const [ProvedorSinapi, useSinapiDados] = dominio('Sinapi', 'catalogo', useSinapi);
const [ProvedorFinanceiro, useFinanceiroDados] = dominio('Financeiro', 'financeiro', useFinanceiro);
const [ProvedorDocumentos, useDocumentosDados] = dominio('Documentos', 'documentos', useDocumentos);
const [ProvedorDocumentoCategorias, useDocumentoCategoriasDados] = dominio('DocumentoCategorias', 'documentoCategorias', useDocumentoCategorias);
const [ProvedorProjetos, useProjetosDados] = dominio('Projetos', 'projetos', useProjetos);
// ---------------------------------------------------------------------------
// Os quatro domínios recortados pela obra aberta (§4.2, item 23, peça 2).
// Fora do console, não carregam nada.
// ---------------------------------------------------------------------------
const [ProvedorOrcamento, useOrcamentoDados] = dominioDaObra('Orcamento', 'orcamento', useOrcamento);
const [ProvedorInsumosProjeto, useInsumosProjetoDados] = dominioDaObra('InsumosProjeto', 'insumos', useInsumosProjeto);
const [ProvedorCronograma, useCronogramaDados] = dominioDaObra('Cronograma', 'cronograma', useCronograma);
const [ProvedorMedicoes, useMedicoesDados] = dominioDaObra('Medicoes', 'medicoes', useMedicoes);
// E as duas leituras que atravessam obras de propósito, cada uma estreita o
// bastante para não ser o carregamento global de volta. Ver os hooks.
const [ProvedorCargaEquipe, useCargaEquipeDados] = dominio('CargaEquipe', 'cargaEquipe', useCargaEquipe);
const [ProvedorMedicoesAFaturar, useMedicoesAFaturarDados] = dominio('MedicoesAFaturar', 'medicoesAFaturar', useMedicoesAFaturar);
// O agregado por obra (§4.2). Domínio SEPARADO de orçamento/cronograma/medições
// apesar de derivar dos três: quem só quer o número — a lista de obras e o
// painel — não deve assinar os três provedores de linhas para obtê-lo, senão
// volta a re-renderizar a cada escrita no console.
const [ProvedorResumoObras, useResumoObrasDados] = dominio('ResumoObras', 'resumoObras', useResumoObras);
const [ProvedorAcessos, useAcessosDados] = dominio('Acessos', 'acessos', useAcessos);
const [ProvedorProjetoEquipe, useProjetoEquipeDados] = dominio('ProjetoEquipe', 'projetoEquipe', useProjetoEquipe);
// `dominio` e não `dominioDaObra`: a pauta atravessa obras de propósito — metade
// das tarefas não tem obra nenhuma. O filtro por obra é da tela.
const [ProvedorTarefas, useTarefasDados] = dominio('Tarefas', 'tarefas', useTarefas);

export {
  useClientesDados,
  useClienteDocumentosDados,
  useFornecedoresDados,
  useFuncionariosDados,
  useFuncionarioDocumentosDados,
  usePropostasDados,
  useEmpresaConfigDados,
  useModelosTextoDados,
  useCatalogoDados,
  useSinapiDados,
  useFinanceiroDados,
  useDocumentosDados,
  useDocumentoCategoriasDados,
  useProjetosDados,
  useOrcamentoDados,
  useInsumosProjetoDados,
  useCronogramaDados,
  useMedicoesDados,
  useCargaEquipeDados,
  useMedicoesAFaturarDados,
  useResumoObrasDados,
  useAcessosDados,
  useProjetoEquipeDados,
  useTarefasDados,
};

/**
 * A ordem não importa para o comportamento — nenhum provedor lê o contexto de
 * outro. Está agrupada por assunto só para leitura.
 */
const PROVEDORES: ComponentType<Filhos>[] = [
  ProvedorClientes,
  ProvedorClienteDocumentos,
  ProvedorFornecedores,
  ProvedorFuncionarios,
  ProvedorFuncionarioDocumentos,
  ProvedorPropostas,
  ProvedorEmpresaConfig,
  ProvedorModelosTexto,
  ProvedorCatalogo,
  ProvedorSinapi,
  ProvedorFinanceiro,
  ProvedorDocumentos,
  ProvedorDocumentoCategorias,
  ProvedorProjetos,
  ProvedorOrcamento,
  ProvedorInsumosProjeto,
  ProvedorCronograma,
  ProvedorMedicoes,
  ProvedorCargaEquipe,
  ProvedorMedicoesAFaturar,
  ProvedorResumoObras,
  ProvedorAcessos,
  ProvedorProjetoEquipe,
  ProvedorTarefas,
];

/**
 * Aninha os 22 provedores. `reduceRight` em vez de 22 níveis de JSX: o resultado
 * é o mesmo e a lista acima passa a ser a única coisa a manter.
 */
export function DadosProvider({ children }: Filhos) {
  return PROVEDORES.reduceRight<ReactNode>(
    (filho, Provedor) => <Provedor>{filho}</Provedor>,
    children
  );
}
