import React, { useEffect, useMemo, useRef } from 'react';
import { Search, Users, X } from 'lucide-react';
import { Funcionario } from '../../types';
import { onlyDigits } from '../../utils/format';
import EstadoDaLista from '../EstadoDaLista';
import { LIMITE_FRENTES, temPendencia, type SinaisColaborador, type Situacao } from './regras';
import { StatusBadge } from '../../constants/status';
import { useListaOrdenada, compararTexto, compararData, type OpcaoOrdenacao } from '../../hooks/useListaOrdenada';
import { Avatar, Card, CarregarMais, Chip, COLUNA_ANCORADA, FileiraPilulas, FOCO, IconButton, Input, LINHA_SELECIONADA, Pilula, SeletorOrdenacao } from '../ui';

const ORDENS: OpcaoOrdenacao<Funcionario>[] = [
  { id: 'nome', label: 'Nome (A–Z)', comparar: (a, b) => compararTexto(a.nome, b.nome) },
  { id: 'cargo', label: 'Cargo (A–Z)', comparar: (a, b) => compararTexto(a.cargo, b.cargo) },
  { id: 'admissao', label: 'Admissão mais recente', comparar: (a, b) => compararData(a.dataAdmissao, b.dataAdmissao) },
];

interface Props {
  funcionarios: Funcionario[];
  sinais: Map<string, SinaisColaborador>;
  loading: boolean;
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
  onNovo: () => void;
  busca: string;
  setBusca: (v: string) => void;
  situacao: Situacao;
  setSituacao: (s: Situacao) => void;
}

/**
 * A coluna mestre da Equipe.
 *
 * O que mudou do cartão anterior: o título "Equipe (3)" repetia o h1 da página
 * logo acima, e o "Novo integrante" subiu para o cabeçalho, onde mora a ação
 * principal de todo destino. O filtro de situação virou pílula com contagem —
 * num `<select>` o "Inativos" ficava escondido, e era justamente o único jeito
 * de achar quem foi desligado. A linha perdeu o CPF (a busca ainda o acha) e o
 * cargo em ciano (ciano é ação, e o cargo não se clica), e ganhou as iniciais.
 */
export default function ListaEquipe({
  funcionarios,
  sinais,
  loading,
  selecionadoId,
  onSelecionar,
  onNovo,
  busca,
  setBusca,
  situacao,
  setSituacao,
}: Props) {
  // No contêiner, e não no `<Input>`: o primitivo não repassa `ref`.
  const buscaRef = useRef<HTMLDivElement>(null);
  const focarBusca = () => buscaRef.current?.querySelector('input')?.focus();
  const listaRef = useRef<HTMLDivElement>(null);

  const contagem = useMemo(() => {
    let ativos = 0, pendencias = 0;
    for (const f of funcionarios) {
      if (f.status === 'Ativo') ativos += 1;
      if (temPendencia(f, sinais.get(f.id))) pendencias += 1;
    }
    return { Todos: funcionarios.length, Ativo: ativos, Inativo: funcionarios.length - ativos, Pendencias: pendencias };
  }, [funcionarios, sinais]);

  const termo = busca.trim().toLowerCase();
  const digitos = onlyDigits(busca);
  const filtrados = useMemo(() => funcionarios.filter((f) => {
    const casaBusca =
      !termo ||
      f.nome.toLowerCase().includes(termo) ||
      f.cargo.toLowerCase().includes(termo) ||
      (digitos.length > 0 && onlyDigits(f.cpf).includes(digitos));
    const casaSituacao =
      situacao === 'Todos' ? true
      : situacao === 'Pendencias' ? temPendencia(f, sinais.get(f.id))
      : f.status === situacao;
    return casaBusca && casaSituacao;
  }), [funcionarios, termo, digitos, situacao, sinais]);

  const lista = useListaOrdenada({ itens: filtrados, opcoes: ORDENS });

  /**
   * No desktop a ficha abre com a primeira pessoa da lista: a coluna da
   * direita vazia pedindo "escolha alguém" era um clique obrigatório a cada
   * visita. No celular a ficha fica ABAIXO da lista, e abri-la sozinha só
   * empurraria o conteúdo — lá continua esperando o toque.
   */
  const primeiro = lista.visiveis[0]?.id;
  useEffect(() => {
    if (selecionadoId || !primeiro) return;
    if (window.matchMedia('(min-width: 1024px)').matches) onSelecionar(primeiro);
  }, [selecionadoId, primeiro, onSelecionar]);

  // `/` foca a busca, como no Catálogo — só quando ninguém está digitando em
  // outro campo e nenhum diálogo está aberto.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      focarBusca();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, []);

  /** Setas percorrem a lista e já abrem a ficha: ler dez fichas não exige dez cliques. */
  const aoTeclarNaLinha = (e: React.KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const destino =
      e.key === 'ArrowDown' ? indice + 1
      : e.key === 'ArrowUp' ? indice - 1
      : e.key === 'Home' ? 0
      : e.key === 'End' ? lista.visiveis.length - 1
      : null;
    if (destino == null) return;
    e.preventDefault();
    const alvo = lista.visiveis[Math.max(0, Math.min(lista.visiveis.length - 1, destino))];
    if (!alvo) return;
    onSelecionar(alvo.id);
    listaRef.current?.querySelector<HTMLButtonElement>(`[data-func-id="${alvo.id}"]`)?.focus();
  };

  const OPCOES: { id: Situacao; rotulo: string }[] = [
    { id: 'Todos', rotulo: 'Todos' },
    { id: 'Ativo', rotulo: 'Ativos' },
    { id: 'Inativo', rotulo: 'Desligados' },
    { id: 'Pendencias', rotulo: 'Com pendência' },
  ];

  return (
    <Card semPadding id="equipe-list-col" className={`flex flex-col overflow-hidden ${COLUNA_ANCORADA}`}>
      <div className="p-3.5 border-b border-slate-200 space-y-3 shrink-0">
        <div ref={buscaRef} className="relative">
          <Input
            id="func-search-input"
            type="search"
            aria-label="Buscar colaborador"
            placeholder="Nome, cargo ou CPF"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && busca) { e.stopPropagation(); setBusca(''); } }}
            icone={<Search size={14} aria-hidden="true" />}
            className="pr-10 [&::-webkit-search-cancel-button]:hidden"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
            {busca ? (
              <IconButton rotulo="Limpar busca" tamanho="sm" onClick={() => { setBusca(''); focarBusca(); }}>
                <X size={13} />
              </IconButton>
            ) : (
              <kbd className="hidden md:inline-block rounded border border-slate-300 px-1.5 text-2xs font-semibold text-slate-500" title="Atalho: / foca a busca">
                /
              </kbd>
            )}
          </span>
        </div>

        <FileiraPilulas rotulo="Situação" className="gap-1.5">
          {OPCOES.filter((o) => o.id !== 'Pendencias' || contagem.Pendencias > 0 || situacao === 'Pendencias').map((o) => (
            <Pilula key={o.id} ativo={situacao === o.id} onClick={() => setSituacao(o.id)} className="px-3">
              {o.rotulo}
              <span className={`font-mono ${situacao === o.id ? '' : 'text-slate-500'}`}>{contagem[o.id]}</span>
            </Pilula>
          ))}
        </FileiraPilulas>

        {lista.total > 0 && (
          <SeletorOrdenacao
            opcoes={lista.opcoes}
            valor={lista.ordemId}
            onChange={lista.setOrdemId}
            mostrando={lista.mostrando}
            total={lista.total}
          />
        )}
      </div>

      <div ref={listaRef} id="equipe-scroll-area" className="flex-1 overflow-y-auto divide-y divide-slate-100">
        <EstadoDaLista
          loading={loading}
          total={lista.total}
          totalSemFiltro={funcionarios.length}
          carregandoLabel="Carregando colaboradores..."
          className="p-4"
          vazio={{
            icon: Users,
            title: 'Nenhum colaborador cadastrado',
            description: 'Cadastre profissionais de engenharia, administração e campo para montar o quadro.',
            actionLabel: 'Novo colaborador',
            onAction: onNovo,
          }}
          semResultado={{
            title: 'Ninguém encontrado',
            description: situacao === 'Ativo'
              ? 'Nenhuma ficha ativa corresponde à busca. Quem foi desligado aparece em "Desligados".'
              : 'Nenhuma ficha corresponde à busca ou à situação escolhida.',
          }}
          onLimparFiltros={() => { setBusca(''); setSituacao('Todos'); }}
        >
          {lista.visiveis.map((func, indice) => {
            const ativo = selecionadoId === func.id;
            const s = sinais.get(func.id);
            const frentes = s?.frentes ?? 0;
            return (
              <button
                key={func.id}
                type="button"
                id={`func-item-${func.id}`}
                data-func-id={func.id}
                aria-current={ativo || undefined}
                // Roving tabindex: Tab entra na lista uma vez, as setas andam.
                tabIndex={ativo || (!selecionadoId && indice === 0) ? 0 : -1}
                onClick={() => onSelecionar(func.id)}
                onKeyDown={(e) => aoTeclarNaLinha(e, indice)}
                className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition ${FOCO} focus-visible:ring-inset ${
                  ativo ? LINHA_SELECIONADA.ativa : LINHA_SELECIONADA.inativa
                } ${func.status === 'Inativo' ? 'text-slate-500' : ''}`}
              >
                <Avatar nome={func.nome} tamanho="md" tom={ativo ? 'solido' : 'suave'} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`truncate text-sm font-bold ${func.status === 'Inativo' ? 'text-slate-600' : 'text-slate-900'}`}>{func.nome}</span>
                    {func.status === 'Inativo' && <StatusBadge type="funcionario" status="Inativo" size="sm" />}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600">
                    <span className="truncate">{func.cargo}</span>
                    {frentes > 0 && (
                      <span className="shrink-0 text-slate-500">
                        · <span className="font-mono">{frentes}</span> {frentes === 1 ? 'frente' : 'frentes'}
                      </span>
                    )}
                  </span>
                  {(frentes > LIMITE_FRENTES || (s && (s.docsVencidos > 0 || s.docsAVencer > 0 || s.semSalario)) ) && func.status === 'Ativo' && (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {s && s.docsVencidos > 0 && <Chip tom="negativo" ponto>Doc vencido</Chip>}
                      {s && s.docsVencidos === 0 && s.docsAVencer > 0 && <Chip tom="atencao" ponto>Doc a vencer</Chip>}
                      {s?.semSalario && <Chip tom="atencao" ponto>Sem salário</Chip>}
                      {frentes > LIMITE_FRENTES && <Chip tom="negativo" ponto>Sobrecarregado</Chip>}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </EstadoDaLista>
        <CarregarMais temMais={lista.temMais} restantes={lista.restantes} onCarregarMais={lista.carregarMais} />
      </div>
    </Card>
  );
}
