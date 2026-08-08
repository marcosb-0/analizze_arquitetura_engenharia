import { memo, useCallback, useMemo, useState } from 'react';
import { KanbanSquare, ListChecks, Plus, Search } from 'lucide-react';
import type { PessoaAtribuivel, Projeto, StatusTarefa, Tarefa } from '../types';
import type { Role } from '../lib/database.types';
import type { DadosTarefa } from '../services/tarefasService';
import { Button, Input, Select } from './ui';
import EstadoDaLista from './EstadoDaLista';
import { useFeedback } from './FeedbackContext';
import { contarMinhasAbertas, minhasDoDia } from '../lib/tarefas';
import { PRIORIDADES } from './tarefas/constantes';
import ListaDoDia from './tarefas/ListaDoDia';
import Quadro from './tarefas/Quadro';
import ModalTarefa from './tarefas/ModalTarefa';

interface TarefasTabProps {
  tarefas: Tarefa[];
  pessoas: PessoaAtribuivel[];
  projetos: Projeto[];
  loading: boolean;
  meuId?: string;
  role?: Role;
  onCriar: (dados: DadosTarefa) => Promise<Tarefa | null>;
  onEditar: (id: string, dados: DadosTarefa) => Promise<Tarefa | null>;
  onMover: (id: string, status: StatusTarefa) => Promise<boolean>;
  onExcluir: (id: string) => Promise<boolean>;
}

type Visao = 'dia' | 'quadro';

/** Valor de "sem filtro" e de "tarefa sem obra" nos dois seletores. */
const TODOS = '';
const SEM_OBRA = 'sem-obra';
const MINHAS = 'minhas';

/**
 * A pauta da empresa: o que precisa ser feito e quem está com cada coisa.
 *
 * Duas visões da MESMA lista — a pauta pessoal ("minhas do dia") e o quadro do
 * time. Concluir numa move o card na outra porque é a mesma coluna `status` do
 * banco; não há nada para sincronizar, e portanto nada para dessincronizar.
 */
function TarefasTab({
  tarefas,
  pessoas,
  projetos,
  loading,
  meuId,
  role,
  onCriar,
  onEditar,
  onMover,
  onExcluir,
}: TarefasTabProps) {
  const { confirm } = useFeedback();
  const [visao, setVisao] = useState<Visao>('dia');
  const [busca, setBusca] = useState('');
  const [filtroResponsavel, setFiltroResponsavel] = useState(TODOS);
  const [filtroObra, setFiltroObra] = useState(TODOS);
  const [filtroPrioridade, setFiltroPrioridade] = useState(TODOS);
  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Tarefa | null>(null);

  /**
   * `campo` executa, não pauta: move o próprio card e nada mais. É a mesma
   * fronteira da RLS (ele não tem `insert` nem `delete` em `tarefas`), repetida
   * aqui só para não oferecer botão que morreria no servidor.
   */
  const podePautar = role !== 'campo';

  const nomePessoa = useCallback(
    (id?: string) => pessoas.find((p) => p.id === id)?.nome,
    [pessoas]
  );
  const nomeObra = useCallback(
    (id?: string) => projetos.find((p) => p.id === id)?.nome,
    [projetos]
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return tarefas.filter((t) => {
      if (termo && !t.titulo.toLowerCase().includes(termo) && !t.descricao?.toLowerCase().includes(termo)) {
        return false;
      }
      if (filtroResponsavel === MINHAS ? t.responsavelId !== meuId : filtroResponsavel && t.responsavelId !== filtroResponsavel) {
        return false;
      }
      if (filtroObra === SEM_OBRA ? t.projetoId !== undefined : filtroObra && t.projetoId !== filtroObra) {
        return false;
      }
      if (filtroPrioridade && t.prioridade !== filtroPrioridade) return false;
      return true;
    });
  }, [tarefas, busca, filtroResponsavel, filtroObra, filtroPrioridade, meuId]);

  const temFiltro = Boolean(busca || filtroResponsavel || filtroObra || filtroPrioridade);
  const limparFiltros = useCallback(() => {
    setBusca('');
    setFiltroResponsavel(TODOS);
    setFiltroObra(TODOS);
    setFiltroPrioridade(TODOS);
  }, []);

  /**
   * O total que decide o estado vazio muda com a visão: no quadro é tudo que
   * passou pelo filtro; na pauta é só o que sobrou para MIM depois dele. Usar o
   * total do quadro nas duas faria a lista pessoal vazia mostrar os cards do
   * time — o estado errado, e o mais confuso dos dois.
   */
  const daPauta = useMemo(
    () => Object.values(minhasDoDia(filtradas, meuId)).reduce((n, bloco) => n + bloco.length, 0),
    [filtradas, meuId]
  );
  const total = visao === 'dia' ? daPauta : filtradas.length;

  const abrirNova = useCallback(() => {
    setEmEdicao(null);
    setModalAberto(true);
  }, []);

  const abrirEdicao = useCallback((t: Tarefa) => {
    setEmEdicao(t);
    setModalAberto(true);
  }, []);

  const salvar = useCallback(
    async (dados: DadosTarefa) => {
      const salva = emEdicao ? await onEditar(emEdicao.id, dados) : await onCriar(dados);
      return salva !== null;
    },
    [emEdicao, onCriar, onEditar]
  );

  const pedirExclusao = useCallback(
    (t: Tarefa) => {
      confirm({
        title: 'Excluir tarefa',
        message: `"${t.titulo}" será removida para todo mundo. Se ela já foi feita, prefira concluí-la — assim fica o registro de que aconteceu.`,
        confirmLabel: 'Excluir',
        onConfirm: () => void onExcluir(t.id),
      });
    },
    [confirm, onExcluir]
  );

  // O quadro escreve direto; os componentes filhos não precisam do resultado.
  const mover = useCallback((id: string, status: StatusTarefa) => void onMover(id, status), [onMover]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-bold text-slate-900">Tarefas</h1>
          <p className="text-2xs text-slate-500">
            O dia a dia da empresa: o que precisa ser feito e com quem está.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Alternador de visão. `aria-pressed` porque são dois botões de
              alternância, não abas — não há painel com id para `role="tab"`. */}
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            {([
              { id: 'dia', label: 'Minhas do dia', Icone: ListChecks },
              { id: 'quadro', label: 'Quadro', Icone: KanbanSquare },
            ] as const).map(({ id, label, Icone }) => (
              <button
                key={id}
                type="button"
                aria-pressed={visao === id}
                onClick={() => setVisao(id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-2xs font-semibold transition ${
                  visao === id ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icone size={13} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {podePautar && (
            <Button onClick={abrirNova}>
              <Plus size={14} aria-hidden="true" />
              Nova tarefa
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Input
          type="search"
          tamanho="sm"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por título ou detalhe..."
          icone={<Search size={13} />}
          aria-label="Buscar tarefas"
          className="w-full sm:w-64"
        />

        {/* No quadro o filtro de responsável é o recorte mais usado; na pauta ele
            não faz sentido, porque a visão inteira já é "as minhas". */}
        {visao === 'quadro' && (
          <Select
            tamanho="sm"
            value={filtroResponsavel}
            onChange={(e) => setFiltroResponsavel(e.target.value)}
            aria-label="Filtrar por responsável"
            className="w-auto"
          >
            <option value={TODOS}>Todos os responsáveis</option>
            <option value={MINHAS}>Minhas</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        )}

        <Select
          tamanho="sm"
          value={filtroObra}
          onChange={(e) => setFiltroObra(e.target.value)}
          aria-label="Filtrar por obra"
          className="w-auto"
        >
          <option value={TODOS}>Todas as obras</option>
          <option value={SEM_OBRA}>Só da empresa</option>
          {projetos.map((obra) => (
            <option key={obra.id} value={obra.id}>
              {obra.nome}
            </option>
          ))}
        </Select>

        <Select
          tamanho="sm"
          value={filtroPrioridade}
          onChange={(e) => setFiltroPrioridade(e.target.value)}
          aria-label="Filtrar por prioridade"
          className="w-auto"
        >
          <option value={TODOS}>Toda prioridade</option>
          {PRIORIDADES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </div>

      <EstadoDaLista
        loading={loading}
        total={total}
        totalSemFiltro={visao === 'dia' ? contarMinhasAbertas(tarefas, meuId) : tarefas.length}
        carregandoLabel="Carregando tarefas..."
        onLimparFiltros={temFiltro ? limparFiltros : undefined}
        semResultado={
          visao === 'dia'
            ? {
                title: 'Nada seu com esses critérios',
                description: 'Você tem tarefas em aberto, mas nenhuma corresponde ao que está filtrado.',
              }
            : undefined
        }
        vazio={
          visao === 'dia'
            ? {
                icon: ListChecks,
                title: 'Sua pauta está limpa',
                description: podePautar
                  ? 'Nada em aberto com você. Crie uma tarefa ou veja o quadro para saber o que o time está tocando.'
                  : 'Nada em aberto com você. Quando alguém delegar uma tarefa, ela aparece aqui.',
                actionLabel: podePautar ? 'Nova tarefa' : undefined,
                onAction: podePautar ? abrirNova : undefined,
              }
            : {
                icon: KanbanSquare,
                title: 'Nenhuma tarefa no quadro',
                description: podePautar
                  ? 'Registre o que a empresa precisa fazer nesta semana e delegue para quem vai tocar.'
                  : 'Ainda não há tarefas atribuídas a você.',
                actionLabel: podePautar ? 'Criar a primeira' : undefined,
                onAction: podePautar ? abrirNova : undefined,
              }
        }
      >
        {visao === 'dia' ? (
          <ListaDoDia
            tarefas={filtradas}
            meuId={meuId}
            nomeObra={nomeObra}
            podeEditar={podePautar}
            onMover={mover}
            onEditar={abrirEdicao}
            onExcluir={pedirExclusao}
          />
        ) : (
          <Quadro
            tarefas={filtradas}
            nomePessoa={nomePessoa}
            nomeObra={nomeObra}
            podeMover
            podeEditar={podePautar}
            onMover={mover}
            onEditar={abrirEdicao}
            onExcluir={pedirExclusao}
          />
        )}
      </EstadoDaLista>

      <ModalTarefa
        open={modalAberto}
        tarefa={emEdicao}
        pessoas={pessoas}
        projetos={projetos}
        obraSugerida={filtroObra && filtroObra !== SEM_OBRA ? filtroObra : undefined}
        onClose={() => setModalAberto(false)}
        onSalvar={salvar}
      />
    </div>
  );
}

export default memo(TarefasTab);
