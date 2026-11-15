import React, { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle, BarChart3, CalendarClock, ClipboardCheck, Gauge, HardHat, RefreshCw, Ruler, Wallet,
} from 'lucide-react';
import type { Funcionario, Projeto, ResumoObra, Tarefa, Cliente } from '../../types';
import { Abas, Aviso, Button, IconButton, PaginaAba, PainelAba, type AbaDef } from '../ui';
import Spinner from '../Spinner';
import { hojeISO } from '../../lib/data';
import { filtrosAtivos, montarEscopo, opcoesDosFiltros } from '../../lib/indicadores/calculos';
import { ROTULO_ANTERIOR } from '../../lib/indicadores/periodo';
import type { AcessoBI, CategoriaBI, DadosBI, FiltrosBI } from '../../lib/indicadores/tipos';
import BarraFiltros from './BarraFiltros';
import type { ContextoVisao } from './contexto';
import VisaoGeral from './visoes/VisaoGeral';
import VisaoObras from './visoes/VisaoObras';
import VisaoFinanceiro from './visoes/VisaoFinanceiro';
import VisaoMedicoes from './visoes/VisaoMedicoes';
import VisaoProdutividade from './visoes/VisaoProdutividade';
import VisaoPrazos from './visoes/VisaoPrazos';
import VisaoQualidade from './visoes/VisaoQualidade';

/**
 * O painel de Indicadores como ferramenta de BI (15/nov/2026).
 *
 * Três níveis em toda categoria — KPIs, gráficos, tabela de detalhe — sobre UM
 * escopo, montado aqui a partir dos filtros e repassado igual para a visão. É
 * essa fonte única que garante que um filtro mexe em tudo: nenhuma visão
 * recorta os dados por conta própria.
 *
 * O que muda em relação à "Regra do Detalhe na Aba" do DESIGN.md: a regra
 * dizia que o painel responde só "preciso agir?". O usuário pediu, com todas
 * as letras, um centro de análise. A resposta foi separar as duas coisas na
 * mesma tela: a análise é filtrável e mora nas categorias; o "preciso agir?"
 * continua existindo, na Visão Geral, sob "Para agir agora" — fora dos filtros,
 * porque uma pendência não deixa de existir quando o filtro está em outra obra.
 */

const CATEGORIAS: { id: CategoriaBI; rotulo: string; icone: React.ReactNode; exige?: keyof AcessoBI }[] = [
  { id: 'geral', rotulo: 'Visão geral', icone: <BarChart3 size={15} /> },
  { id: 'obras', rotulo: 'Obras', icone: <HardHat size={15} /> },
  { id: 'financeiro', rotulo: 'Financeiro', icone: <Wallet size={15} />, exige: 'valores' },
  { id: 'medicoes', rotulo: 'Medições', icone: <Ruler size={15} /> },
  { id: 'produtividade', rotulo: 'Produtividade', icone: <Gauge size={15} /> },
  { id: 'prazos', rotulo: 'Prazos', icone: <CalendarClock size={15} /> },
  { id: 'qualidade', rotulo: 'Qualidade', icone: <ClipboardCheck size={15} /> },
];

/**
 * "Ano" e não "Mês" de padrão: no começo de um mês, o mês corrente tem dois ou
 * três dias e quase todo gráfico nasce vazio — a primeira impressão seria de um
 * painel quebrado.
 */
const FILTROS_PADRAO = (hoje: string): FiltrosBI => ({
  periodo: 'ano',
  personalizado: { de: `${hoje.slice(0, 7)}-01`, ate: hoje },
  obraId: null,
  contratoId: null,
  responsavelId: null,
  situacao: null,
  comparar: true,
});

/**
 * Categoria e filtros sobrevivem a trocar de aba e voltar, por sessão do
 * navegador. É conveniência de quem olha, não estado do sistema — então
 * `sessionStorage` e não banco, e tudo dentro de try/catch: em janela anônima
 * ou com armazenamento bloqueado a leitura lança, e o painel tem de abrir igual.
 */
const CHAVE_SESSAO = 'analizze:indicadores';

function lerSessao(hoje: string): { categoria: CategoriaBI; filtros: FiltrosBI } {
  const padrao = { categoria: 'geral' as CategoriaBI, filtros: FILTROS_PADRAO(hoje) };
  try {
    const bruto = sessionStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return padrao;
    const salvo = JSON.parse(bruto) as Partial<{ categoria: CategoriaBI; filtros: Partial<FiltrosBI> }>;
    return {
      categoria: CATEGORIAS.some((c) => c.id === salvo.categoria) ? salvo.categoria! : 'geral',
      filtros: { ...padrao.filtros, ...salvo.filtros },
    };
  } catch {
    return padrao;
  }
}

function gravarSessao(valor: { categoria: CategoriaBI; filtros: FiltrosBI }) {
  try {
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(valor));
  } catch {
    // Sem armazenamento, o painel só esquece o recorte ao trocar de aba.
  }
}

function saudacao(hora: number) {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function primeiroNome(valor?: string | null): string | undefined {
  const nome = valor?.trim();
  return nome && !nome.includes('@') ? nome.split(/\s+/)[0] : undefined;
}

interface Props {
  dados: DadosBI;
  acesso: AcessoBI;
  carregando: boolean;
  atualizando: boolean;
  erro: boolean;
  onRecarregar: () => void;
  projetos: Projeto[];
  resumos: ResumoObra[];
  tarefas: Tarefa[];
  clientes: Cliente[];
  funcionarios: Funcionario[];
  nomeUsuario?: string | null;
  onAbrirObra: (id: string) => void;
  /** A fila "Para agir agora" — vem pronta do conector. */
  foraDosFiltros: React.ReactNode;
}

export default function PainelIndicadores({
  dados, acesso, carregando, atualizando, erro, onRecarregar,
  projetos, resumos, tarefas, clientes, funcionarios, nomeUsuario, onAbrirObra, foraDosFiltros,
}: Props) {
  const hoje = hojeISO();
  const [estado, setEstado] = useState(() => lerSessao(hoje));
  const { filtros } = estado;

  const categorias = useMemo(() => CATEGORIAS.filter((c) => !c.exige || acesso[c.exige]), [acesso]);
  const categoria = categorias.some((c) => c.id === estado.categoria) ? estado.categoria : 'geral';

  const atualizar = useCallback((mudar: (atual: typeof estado) => typeof estado) => {
    setEstado((atual) => {
      const novo = mudar(atual);
      gravarSessao(novo);
      return novo;
    });
  }, []);
  const filtrar = useCallback(
    (mudanca: Partial<FiltrosBI>) => atualizar((a) => ({ ...a, filtros: { ...a.filtros, ...mudanca } })),
    [atualizar]
  );
  const irPara = useCallback((c: CategoriaBI) => {
    atualizar((a) => ({ ...a, categoria: c }));
    // O seletor fica no topo; quem clicou num KPI lá embaixo precisa voltar a ele.
    requestAnimationFrame(() => document.getElementById('bi-topo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [atualizar]);
  const limpar = useCallback(
    () => atualizar((a) => ({ ...a, filtros: { ...FILTROS_PADRAO(hoje), periodo: a.filtros.periodo, personalizado: a.filtros.personalizado, comparar: a.filtros.comparar } })),
    [atualizar, hoje]
  );

  // Filtro de contrato só existe para quem lê contratos: um id guardado na
  // sessão de outro papel não pode recortar em silêncio.
  const filtrosEfetivos = useMemo(() => (acesso.contratos ? filtros : { ...filtros, contratoId: null }), [filtros, acesso.contratos]);
  const escopo = useMemo(() => montarEscopo(projetos, dados.contratos, filtrosEfetivos, hoje), [projetos, dados.contratos, filtrosEfetivos, hoje]);
  const opcoes = useMemo(() => opcoesDosFiltros(projetos, dados.contratos, filtrosEfetivos), [projetos, dados.contratos, filtrosEfetivos]);

  const nomes = useMemo(() => ({
    obra: new Map(projetos.map((p) => [p.id, p.nome])),
    cliente: new Map(clientes.map((c) => [c.id, c.nome])),
    funcionario: new Map(funcionarios.map((f) => [f.id, f.nome])),
  }), [projetos, clientes, funcionarios]);

  const ctx: ContextoVisao = useMemo(() => ({
    dados, acesso, escopo, filtros: filtrosEfetivos, projetos, resumos, tarefas, hoje,
    comparar: filtros.comparar,
    rotuloAnterior: ROTULO_ANTERIOR[filtros.periodo],
    nomeObra: (id) => (id ? nomes.obra.get(id) ?? 'Obra removida' : 'Sem obra'),
    nomeCliente: (id) => (id ? nomes.cliente.get(id) ?? '—' : '—'),
    nomeFuncionario: (id) => (id ? nomes.funcionario.get(id) ?? '—' : '—'),
    filtrar, irPara, abrirObra: onAbrirObra,
  }), [dados, acesso, escopo, filtrosEfetivos, projetos, resumos, tarefas, hoje, filtros.comparar, filtros.periodo, nomes, filtrar, irPara, onAbrirObra]);

  const agora = new Date();
  const nome = primeiroNome(nomeUsuario);
  const abas: AbaDef<CategoriaBI>[] = categorias.map((c) => ({ id: c.id, rotulo: c.rotulo, icone: c.icone }));
  const ativos = filtrosAtivos(filtrosEfetivos);
  const semObrasNoRecorte = ativos > 0 && escopo.obras.size === 0 && escopo.contratos.length === 0;

  return (
    <PaginaAba largura="painel" id="dashboard-tab-content" className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 first-letter:uppercase">
            {agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="titulo-pagina mt-1 text-slate-900">{saudacao(agora.getHours())}{nome ? `, ${nome}` : ''}</h1>
        </div>
        <IconButton rotulo={atualizando ? 'Atualizando…' : 'Atualizar dados'} onClick={onRecarregar} disabled={atualizando || carregando}>
          <RefreshCw size={17} aria-hidden="true" className={atualizando ? 'animate-spin' : ''} />
        </IconButton>
      </header>

      <div id="bi-topo" className="scroll-mt-24 space-y-4">
        {/* Rola de lado no celular em vez de quebrar: sete abas em duas linhas
            perdem a leitura de "uma fileira de assuntos". */}
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
          <Abas abas={abas} ativa={categoria} onTrocar={(c) => atualizar((a) => ({ ...a, categoria: c }))} rotulo="Área dos indicadores" prefixo="bi" className="min-w-max" />
        </div>
        <BarraFiltros
          filtros={filtrosEfetivos}
          onMudar={filtrar}
          onLimpar={limpar}
          ativos={ativos}
          obras={opcoes.obras}
          contratos={acesso.contratos ? opcoes.contratos : null}
          responsaveis={opcoes.responsaveis}
          intervalo={escopo.intervalo}
          anterior={escopo.anterior}
        />
      </div>

      <PainelAba prefixo="bi" ativa={categoria}>
        {erro ? (
          <Aviso
            tom="negativo"
            icone={<AlertTriangle size={16} />}
            acoes={<Button tamanho="sm" variante="secundario" onClick={onRecarregar} carregando={atualizando}>Tentar de novo</Button>}
          >
            Os indicadores não puderam ser carregados. Nenhum número é mostrado para não exibir um zero que não é verdade.
          </Aviso>
        ) : carregando ? (
          <div className="flex min-h-[240px] items-center justify-center gap-2 text-xs text-slate-500" role="status">
            <Spinner size={18} /> Carregando indicadores…
          </div>
        ) : (
          <div className="space-y-5">
            {semObrasNoRecorte && (
              <Aviso tom="atencao" acoes={<Button tamanho="sm" variante="secundario" onClick={limpar}>Limpar filtros</Button>}>
                Nenhuma obra corresponde a esta combinação de filtros.
              </Aviso>
            )}
            {categoria === 'geral' && <VisaoGeral {...ctx} foraDosFiltros={foraDosFiltros} />}
            {categoria === 'obras' && <VisaoObras {...ctx} />}
            {categoria === 'financeiro' && <VisaoFinanceiro {...ctx} />}
            {categoria === 'medicoes' && <VisaoMedicoes {...ctx} />}
            {categoria === 'produtividade' && <VisaoProdutividade {...ctx} />}
            {categoria === 'prazos' && <VisaoPrazos {...ctx} />}
            {categoria === 'qualidade' && <VisaoQualidade {...ctx} />}
          </div>
        )}
      </PainelAba>
    </PaginaAba>
  );
}
