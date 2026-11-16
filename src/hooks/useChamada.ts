import { useCallback, useMemo, useRef, useState } from 'react';
import { DadosPresenca, PessoaChamada, Presenca } from '../types';
import { presencaService } from '../services/presencaService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { chavePresenca } from '../lib/presenca';
import { mensagemDeErro } from '../lib/erros';

/**
 * A chamada de um intervalo de datas: quem está na lista e o que foi anotado.
 *
 * Mora fora do `DadosContext` de propósito: só a aba Equipe usa, e o recorte
 * muda a cada troca de semana ou de período — não é uma coleção que valha
 * manter carregada entre abas.
 *
 * O DESFAZER É POR PESSOA, e não com `comRollback`. Na chamada o uso normal é
 * tocar cinco nomes em dois segundos; restaurar o estado inteiro de antes da
 * gravação que falhou apagaria da tela as quatro que deram certo, e o
 * encarregado as veria sumir sem entender por quê.
 */
export function useChamada(de: string, ate: string, ativo = true) {
  const { toast } = useFeedback();
  const [pessoas, setPessoas] = useState<PessoaChamada[]>([]);
  const [lancamentos, setLancamentos] = useState<ReadonlyMap<string, Presenca>>(new Map());
  /**
   * A cópia síncrona do mapa. O valor anterior para desfazer é lido daqui, e não
   * de dentro de um `setLancamentos(atual => …)`: o React pode adiar o updater
   * para o próximo render, e o `anterior` capturado lá chegaria vazio ao `catch`.
   */
  const mapa = useRef<Map<string, Presenca>>(new Map());

  const { loading } = useCarregamento({
    ativo,
    escopo: `${de}|${ate}`,
    buscar: () => Promise.all([presencaService.listarPessoas(), presencaService.listarPeriodo(de, ate)]),
    aoChegar: ([p, l]) => {
      setPessoas(p);
      mapa.current = new Map(l.map((x) => [chavePresenca(x.funcionarioId, x.data), x]));
      setLancamentos(new Map(mapa.current));
    },
    aoLimpar: () => {
      setPessoas([]);
      mapa.current = new Map();
      setLancamentos(new Map());
    },
    erro: 'Falha ao carregar a chamada.',
  });

  /** Troca uma chave do mapa sem mexer nas outras. `null` remove. */
  const definir = useCallback((chave: string, valor: Presenca | null) => {
    if (valor) mapa.current.set(chave, valor);
    else mapa.current.delete(chave);
    setLancamentos(new Map(mapa.current));
  }, []);

  const marcar = useCallback(async (dados: DadosPresenca): Promise<boolean> => {
    const chave = chavePresenca(dados.funcionarioId, dados.data);
    const anterior = mapa.current.get(chave) ?? null;
    definir(chave, { id: anterior?.id ?? `pendente-${chave}`, ...dados });
    try {
      const salvo = await presencaService.gravar(dados);
      definir(chave, salvo);
      return true;
    } catch (err) {
      definir(chave, anterior);
      toast.error('Não foi possível anotar.', mensagemDeErro(err));
      return false;
    }
  }, [definir, toast]);

  const desmarcar = useCallback(async (funcionarioId: string, data: string): Promise<boolean> => {
    const chave = chavePresenca(funcionarioId, data);
    const anterior = mapa.current.get(chave) ?? null;
    if (!anterior) return true;
    definir(chave, null);
    try {
      await presencaService.remover(funcionarioId, data);
      return true;
    } catch (err) {
      definir(chave, anterior);
      toast.error('Não foi possível desmarcar.', mensagemDeErro(err));
      return false;
    }
  }, [definir, toast]);

  /**
   * Várias de uma vez (o "todos os outros vieram"), numa gravação só: com
   * vinte gravações soltas, uma queda de sinal viraria vinte avisos de erro.
   */
  const marcarVarios = useCallback(async (lista: DadosPresenca[]): Promise<boolean> => {
    const chaves = lista.map((d) => chavePresenca(d.funcionarioId, d.data));
    const anteriores = chaves.map((c) => mapa.current.get(c) ?? null);
    lista.forEach((d, i) => mapa.current.set(chaves[i], { id: `pendente-${chaves[i]}`, ...d }));
    setLancamentos(new Map(mapa.current));
    try {
      const salvos = await presencaService.gravarVarios(lista);
      for (const s of salvos) mapa.current.set(chavePresenca(s.funcionarioId, s.data), s);
      setLancamentos(new Map(mapa.current));
      return true;
    } catch (err) {
      chaves.forEach((c, i) => {
        const a = anteriores[i];
        if (a) mapa.current.set(c, a);
        else mapa.current.delete(c);
      });
      setLancamentos(new Map(mapa.current));
      toast.error('Não foi possível anotar.', mensagemDeErro(err));
      return false;
    }
  }, [toast]);

  return useMemo(
    () => ({ pessoas, lancamentos, loading, marcar, desmarcar, marcarVarios }),
    [pessoas, lancamentos, loading, marcar, desmarcar, marcarVarios]
  );
}
