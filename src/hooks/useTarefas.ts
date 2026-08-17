import { useCallback, useMemo, useState } from 'react';
import { PessoaAtribuivel, StatusTarefa, Tarefa } from '../types';
import { tarefasService, type DadosTarefa } from '../services/tarefasService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function useTarefas(ativo = true) {
  const { toast } = useFeedback();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [pessoas, setPessoas] = useState<PessoaAtribuivel[]>([]);

  const { loading } = useCarregamento({
    ativo,
    // As duas consultas juntas: a lista sem o seletor de responsável mostra
    // `responsavelId` cru, e o seletor sem a lista não tem o que preencher.
    buscar: () => Promise.all([tarefasService.list(), tarefasService.listPessoas()]),
    aoChegar: ([t, p]) => {
      setTarefas(t);
      setPessoas(p);
    },
    aoLimpar: () => {
      setTarefas([]);
      setPessoas([]);
    },
    erro: 'Falha ao carregar tarefas.',
  });

  const criarTarefa = useCallback(async (dados: DadosTarefa): Promise<Tarefa | null> => {
    try {
      const criada = await tarefasService.add(dados);
      setTarefas((prev) => [criada, ...prev]);
      return criada;
    } catch (err: any) {
      toast.error('Falha ao criar tarefa.', err.message);
      return null;
    }
  }, [toast]);

  const editarTarefa = useCallback(async (id: string, dados: DadosTarefa): Promise<Tarefa | null> => {
    try {
      const atualizada = await tarefasService.update(id, dados);
      setTarefas((prev) => prev.map((t) => (t.id === atualizada.id ? atualizada : t)));
      return atualizada;
    } catch (err: any) {
      toast.error('Falha ao salvar tarefa.', err.message);
      return null;
    }
  }, [toast]);

  /**
   * A escrita mais frequente do módulo — arrastar o card, marcar o checkbox.
   *
   * Otimista com `comRollback`: o card precisa andar no instante do gesto, senão
   * o arraste parece não ter funcionado e a pessoa arrasta de novo. Se o servidor
   * recusar (o `campo` tentando mexer em tarefa que não é dele, e aí
   * `garantirEscrita` transforma o 200 de zero linhas em erro), ele volta sozinho
   * para a coluna de origem.
   *
   * `concluidaEm` NÃO é ajustado aqui: quem carimba é a trigger, e chutar o valor
   * no cliente faria a coluna "Feito" ordenar por um instante que o banco não tem.
   * O campo se acerta no próximo carregamento.
   */
  const moverTarefa = useCallback(async (id: string, status: StatusTarefa): Promise<boolean> => {
    const { aplicar, desfazer } = comRollback(setTarefas);
    aplicar((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      await tarefasService.updateStatus(id, status);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao mover a tarefa.', err.message);
      return false;
    }
  }, [toast]);

  /**
   * A outra escrita de gesto: arrastar o card para outro dia do calendário.
   *
   * Otimista pelo mesmo motivo de `moverTarefa` — o card tem de trocar de
   * célula no instante em que a pessoa solta, senão o arraste parece não ter
   * pegado e ela arrasta de novo. `undefined` no estado local e `null` no
   * servidor são o mesmo "sem prazo": o `Tarefa` do app usa `undefined` (ver
   * `fromRow`), e a coluna do banco é anulável.
   */
  const reagendarTarefa = useCallback(async (id: string, prazo?: string): Promise<boolean> => {
    const { aplicar, desfazer } = comRollback(setTarefas);
    aplicar((prev) => prev.map((t) => (t.id === id ? { ...t, prazo } : t)));
    try {
      await tarefasService.updatePrazo(id, prazo ?? null);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao mudar o prazo.', err.message);
      return false;
    }
  }, [toast]);

  const excluirTarefa = useCallback(async (id: string): Promise<boolean> => {
    const { aplicar, desfazer } = comRollback(setTarefas);
    aplicar((prev) => prev.filter((t) => t.id !== id));
    try {
      await tarefasService.remove(id);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao excluir a tarefa.', err.message);
      return false;
    }
  }, [toast]);

  // Identidade estável do objeto devolvido: é o que permite o `memo()` da tela
  // cortar o re-render. Ver o cabeçalho de DadosContext.
  return useMemo(() => ({
    tarefas,
    pessoas,
    loading,
    criarTarefa,
    editarTarefa,
    moverTarefa,
    reagendarTarefa,
    excluirTarefa,
  }), [tarefas, pessoas, loading, criarTarefa, editarTarefa, moverTarefa, reagendarTarefa, excluirTarefa]);
}
