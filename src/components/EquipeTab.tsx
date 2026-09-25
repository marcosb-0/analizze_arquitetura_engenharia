import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { CentroCusto, Funcionario, FuncionarioDocumento, Projeto, EtapaCronograma, InsumoCatalogo, EmpresaConfig, RubricaEncargo } from '../types';
import { catalogoService } from '../services/catalogoService';
import { custoColaborador, parametrosDaEmpresa } from '../lib/custoHora';
import { formatBRL } from '../lib/preco';
import { resumirDocumentos } from '../lib/validadeDocumento';
import { useFeedback } from './FeedbackContext';
import SemSelecao from './SemSelecao';
import Spinner from './Spinner';
import { Button, CabecalhoPagina, FaixaKpis, Kpi, Modal, PaginaAba } from './ui';
import ListaEquipe from './equipe/ListaEquipe';
import { LIMITE_FRENTES, temPendencia, type SinaisColaborador, type Situacao } from './equipe/regras';
import FichaColaborador, { type Frente } from './equipe/FichaColaborador';
import FormularioColaborador from './equipe/FormularioColaborador';
import { DESCRICAO_EQUIPE } from './equipe/descricao';

interface EquipeTabProps {
  funcionarios: Funcionario[];
  centrosCusto: CentroCusto[];
  projetos: Projeto[];
  /** Encargos e jornada padrão; a ficha só sobrescreve o que difere. */
  empresa: EmpresaConfig | null;
  /** Tabela de encargos: no modo 'Rubricas' o % padrão sai dela, pelo regime. */
  rubricas: RubricaEncargo[];
  /** "Pessoas | Custo da mão de obra" — a troca de visão mora no conector. */
  seletorVisao?: React.ReactNode;
  /** Leva à visão de custo (o padrão de encargos mora lá). */
  onVerCustos?: () => void;
  /** Ficha a abrir ao chegar — vinda de um clique na visão de custo. */
  selecionadoInicial?: string | null;
  cronograma: EtapaCronograma[];
  loading: boolean;
  funcionarioDocumentos: FuncionarioDocumento[];
  onAddFuncionario: (func: Funcionario) => Promise<Funcionario | null>;
  onUpdateFuncionario: (func: Funcionario) => Promise<Funcionario | null>;
  onUpdateStatusFuncionario: (id: string, status: Funcionario['status']) => Promise<boolean>;
  onUpdateSalarioFuncionario: (id: string, salarioBase: number | null) => Promise<boolean>;
  onUploadFuncionarioDocumento: (funcionarioId: string, file: File, validade: string | null) => Promise<boolean>;
  onUpdateValidadeDocumento: (id: string, validade: string | null) => Promise<boolean>;
  onDeleteFuncionarioDocumento: (id: string) => void;
  onDownloadFuncionarioDocumento: (doc: FuncionarioDocumento) => void;
}

function EquipeTab({
  funcionarios,
  centrosCusto,
  projetos,
  empresa,
  rubricas,
  seletorVisao,
  onVerCustos,
  selecionadoInicial = null,
  cronograma,
  loading,
  funcionarioDocumentos,
  onAddFuncionario,
  onUpdateFuncionario,
  onUpdateStatusFuncionario,
  onUpdateSalarioFuncionario,
  onUploadFuncionarioDocumento,
  onUpdateValidadeDocumento,
  onDeleteFuncionarioDocumento,
  onDownloadFuncionarioDocumento,
}: EquipeTabProps) {
  const { toast } = useFeedback();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('Todos');
  // Only the id is held in state: the record itself is always read from the
  // list, so edits elsewhere never leave a stale copy on screen.
  const [selectedId, setSelectedId] = useState<string | null>(selecionadoInicial);
  /** `undefined` = janela fechada; `null` = cadastro novo; id = edição. */
  const [emEdicao, setEmEdicao] = useState<string | null | undefined>(undefined);
  /**
   * O alvo da janela, que NÃO volta a vazio ao fechar: durante a animação de
   * saída `emEdicao` já é `undefined`, e o título piscava "Novo colaborador".
   */
  const [alvoForm, setAlvoForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [insumosMaoDeObra, setInsumosMaoDeObra] = useState<InsumoCatalogo[]>([]);
  const detalheRef = useRef<HTMLDivElement>(null);

  /**
   * Insumos de mão de obra do catálogo, para o seletor da ficha.
   *
   * Lista curta e estável (algumas dezenas), buscada uma vez ao montar a aba.
   * Não usa o hook paginado do catálogo de propósito: aquele filtro é estado
   * compartilhado da aba Catálogo e mexer nele daqui mudaria a outra tela.
   */
  const carregarInsumos = useCallback(() => {
    catalogoService
      .listarMaoDeObra()
      .then(setInsumosMaoDeObra)
      // Falhar aqui não pode derrubar a ficha: o seletor fica vazio e o resto
      // do cadastro continua funcionando.
      .catch(() => setInsumosMaoDeObra([]));
  }, []);
  useEffect(carregarInsumos, [carregarInsumos]);

  const parametros = useMemo(() => parametrosDaEmpresa(empresa, rubricas), [empresa, rubricas]);

  // Single source of truth for workload: active stages only, indexed by owner.
  const frentesPorPessoa = useMemo(() => {
    const nomeObra = new Map(projetos.map((p) => [p.id, p.nome]));
    const map = new Map<string, Frente[]>();
    for (const etapa of cronograma) {
      if (etapa.status === 'Concluído') continue;
      const lista = map.get(etapa.responsavelId) ?? [];
      lista.push({
        projetoNome: nomeObra.get(etapa.projetoId) ?? 'Obra desconhecida',
        etapaNome: etapa.nome,
        progresso: etapa.percentualExecutado,
        status: etapa.status,
      });
      map.set(etapa.responsavelId, lista);
    }
    return map;
  }, [cronograma, projetos]);

  const documentosPorPessoa = useMemo(() => {
    const map = new Map<string, FuncionarioDocumento[]>();
    for (const doc of funcionarioDocumentos) {
      map.set(doc.funcionarioId, [...(map.get(doc.funcionarioId) ?? []), doc]);
    }
    return map;
  }, [funcionarioDocumentos]);

  const sinais = useMemo(() => {
    const map = new Map<string, SinaisColaborador>();
    for (const f of funcionarios) {
      const r = resumirDocumentos(documentosPorPessoa.get(f.id) ?? []);
      map.set(f.id, {
        frentes: frentesPorPessoa.get(f.id)?.length ?? 0,
        docsVencidos: r.vencidos,
        docsAVencer: r.aVencer,
        semSalario: f.salarioBase == null,
      });
    }
    return map;
  }, [funcionarios, documentosPorPessoa, frentesPorPessoa]);

  /** O retrato do quadro: quem está ativo, quanto custa, onde está e o que falta. */
  const resumo = useMemo(() => {
    let ativos = 0, custoMensal = 0, semCusto = 0, alocados = 0, sobrecarregados = 0, pendencias = 0;
    for (const f of funcionarios) {
      if (f.status !== 'Ativo') continue;
      ativos += 1;
      const c = custoColaborador(f, parametros);
      if (c) custoMensal += c.custoMensal; else semCusto += 1;
      const s = sinais.get(f.id);
      if (s && s.frentes > 0) alocados += 1;
      if (s && s.frentes > LIMITE_FRENTES) sobrecarregados += 1;
      if (temPendencia(f, s)) pendencias += 1;
    }
    return { ativos, desligados: funcionarios.length - ativos, custoMensal, semCusto, alocados, sobrecarregados, pendencias };
  }, [funcionarios, parametros, sinais]);

  const selecionar = useCallback((id: string) => {
    setSelectedId(id);
    // No celular a ficha fica abaixo da lista: sem rolar até ela, o toque
    // parece não ter feito nada.
    if (!window.matchMedia('(min-width: 1024px)').matches) {
      const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      requestAnimationFrame(() => detalheRef.current?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' }));
    }
  }, []);

  const selectedFunc = funcionarios.find((f) => f.id === selectedId) ?? null;
  const funcEmEdicao = alvoForm ? funcionarios.find((f) => f.id === alvoForm) : undefined;
  const abrirFormulario = (id: string | null) => { setAlvoForm(id); setEmEdicao(id); };

  const fecharFormulario = () => { if (!salvando) setEmEdicao(undefined); };

  return (
    <PaginaAba
      largura="painel"
      id="equipe-tab-container"
      fluxo="livre"
      /* Só a lista fica ancorada; a ficha do colaborador rola com a página —
         ela tem documentos, vínculos e histórico, e era ela que mais sofria
         com a altura travada. Ver `COLUNA_ANCORADA`. */
      className="grid grid-cols-1 lg:grid-cols-[minmax(300px,360px)_1fr] 2xl:grid-cols-[minmax(340px,400px)_1fr] gap-x-8 gap-y-6 items-start"
    >
      <CabecalhoPagina
        className="col-span-full"
        titulo="Equipe"
        descricao={DESCRICAO_EQUIPE}
        acoes={
          <Button id="add-func-btn" onClick={() => abrirFormulario(null)}>
            <Plus size={15} />
            Novo colaborador
          </Button>
        }
      />
      {seletorVisao && <div className="col-span-full -mt-2">{seletorVisao}</div>}

      {funcionarios.length > 0 && (
        <FaixaKpis className="col-span-full" id="equipe-resumo">
          <Kpi
            rotulo="No quadro"
            valor={resumo.ativos}
            detalhe={resumo.desligados > 0 ? `${resumo.desligados} desligado${resumo.desligados > 1 ? 's' : ''}` : 'todos ativos'}
          />
          <Kpi
            rotulo="Custo mensal"
            valor={formatBRL(resumo.custoMensal)}
            detalhe={resumo.semCusto > 0 ? `${resumo.semCusto} sem custo definido` : 'encargos e benefícios inclusos'}
            onClick={onVerCustos}
          />
          <Kpi
            rotulo="Em frentes de obra"
            valor={resumo.alocados}
            detalhe={resumo.sobrecarregados > 0 ? `${resumo.sobrecarregados} acima de ${LIMITE_FRENTES} frentes` : `de ${resumo.ativos} ativos`}
          />
          <Kpi
            rotulo="Com pendência"
            valor={resumo.pendencias}
            detalhe={resumo.pendencias > 0 ? 'documento ou salário' : 'nenhuma'}
            onClick={resumo.pendencias > 0 ? () => { setSituacao('Pendencias'); setBusca(''); } : undefined}
          />
        </FaixaKpis>
      )}

      <ListaEquipe
        funcionarios={funcionarios}
        sinais={sinais}
        loading={loading}
        selecionadoId={selectedId}
        onSelecionar={selecionar}
        onNovo={() => abrirFormulario(null)}
        busca={busca}
        setBusca={setBusca}
        situacao={situacao}
        setSituacao={setSituacao}
      />

      <div id="equipe-detail-col" ref={detalheRef} className="min-w-0 scroll-mt-4">
        {selectedFunc ? (
          <FichaColaborador
            // `key` zera as edições em linha (salário, validade) ao trocar de pessoa.
            key={selectedFunc.id}
            funcionario={selectedFunc}
            frentes={frentesPorPessoa.get(selectedFunc.id) ?? []}
            documentos={documentosPorPessoa.get(selectedFunc.id) ?? []}
            centrosCusto={centrosCusto}
            parametros={parametros}
            obrasResponsavel={projetos.filter((p) => p.responsavelInternoId === selectedFunc.id).length}
            onEditar={() => abrirFormulario(selectedFunc.id)}
            onVerCustos={onVerCustos}
            onUpdateStatus={onUpdateStatusFuncionario}
            onUpdateSalario={onUpdateSalarioFuncionario}
            onUploadDocumento={onUploadFuncionarioDocumento}
            onUpdateValidade={onUpdateValidadeDocumento}
            onDeleteDocumento={onDeleteFuncionarioDocumento}
            onDownloadDocumento={onDownloadFuncionarioDocumento}
          />
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <Spinner size={24} />
            <p className="mt-2 text-xs">Carregando colaboradores...</p>
          </div>
        ) : funcionarios.length > 0 ? (
          <SemSelecao icone={Users}>
            Escolha um colaborador na lista para ver o custo, as frentes de obra e os documentos.
          </SemSelecao>
        ) : null}
      </div>

      <Modal
        id="employee-form-modal"
        open={emEdicao !== undefined}
        onClose={fecharFormulario}
        title={funcEmEdicao ? `Editar ficha · ${funcEmEdicao.nome}` : 'Novo colaborador'}
        size="xl"
        bloqueado={salvando}
      >
        <FormularioColaborador
          funcionario={funcEmEdicao}
          funcionarios={funcionarios}
          centrosCusto={centrosCusto}
          parametros={parametros}
          insumosMaoDeObra={insumosMaoDeObra}
          onInsumosMudaram={carregarInsumos}
          salvando={salvando}
          setSalvando={setSalvando}
          onSalvar={(func) => (funcEmEdicao ? onUpdateFuncionario(func) : onAddFuncionario(func))}
          onSalvo={(salvo) => {
            const editando = !!funcEmEdicao;
            setEmEdicao(undefined);
            setSelectedId(salvo.id);
            // Quem acabou de ser cadastrado precisa aparecer, mesmo que um
            // filtro o escondesse.
            if (!editando) { setBusca(''); setSituacao('Todos'); }
            toast.success(
              editando ? 'Ficha atualizada.' : 'Colaborador cadastrado.',
              editando ? `Os dados de ${salvo.nome} foram salvos.` : `Ficha funcional criada para ${salvo.nome}.`
            );
          }}
          onCancelar={fecharFormulario}
        />
      </Modal>
    </PaginaAba>
  );
}

/**
 * `memo` porque o conector acima é assinante de contexto: ele re-renderiza a
 * cada mudança de navegação (abrir a gaveta do menu, selecionar uma obra) mesmo
 * quando nenhuma prop desta tela mudou. Só vale porque os handlers vêm de
 * `useCallback` nos hooks de domínio — com uma prop instável o `memo` seria
 * custo de leitura com ganho zero, que é o que a auditoria previa no item 30.
 */
export default memo(EquipeTab);
