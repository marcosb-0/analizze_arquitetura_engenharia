import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFeedback } from '../components/FeedbackContext';
import { comCancelamento } from './comCancelamento';

/**
 * O carregamento que os 17 hooks de dados repetiam.
 *
 * §3.3 da auditoria. Cada hook trazia a mesma sequência: derivar `userId`, guardar
 * por sessão e por `ativo`, limpar o estado quando inativo, ligar `loading`,
 * buscar com cancelamento, avisar erro por toast, desligar `loading`. Mais o mesmo
 * bloco de comentário de 10 linhas, copiado **literalmente em 15 arquivos** (§3.9).
 *
 * Extrair isto só ficou possível — e seguro — depois da Fase 3:
 *
 *   - `comCancelamento` (§3.7) tirou o descarte de resposta obsoleta de cada hook;
 *   - `FeedbackContext` (§4.3) tornou `toast` referencialmente estável, sem o que
 *     o efeito daqui dispararia a cada render;
 *   - o teste de hook (item 32) permite provar que a extração não introduz laço,
 *     que é o modo de falha que `tsc` e o build não pegam.
 *
 * O QUE ESTE HOOK **NÃO** FAZ, de propósito: não é dono dos dados. Cada hook segue
 * com o próprio `useState`, porque vários carregam DUAS ou TRÊS coleções no mesmo
 * efeito (`useCronograma`, `useOrcamento`, `useProjetoEquipe`, `useFinanceiro`) e
 * um `useColecao<T>` que devolvesse um array só cobriria 11 dos 17 — recriando a
 * inconsistência de "padrão aplicado em parte do código" que esta auditoria
 * critica em oito lugares. Aqui o hook é dono só do `loading` e do ciclo.
 */
interface Carregamento<T> {
  /**
   * A aba que consome estes dados está aberta — adia a busca até lá.
   *
   * Os 20 hooks disparavam juntos no login, independentemente do papel e da aba:
   * um usuário de `campo`, que só enxerga Indicadores e Obras, buscava catálogo,
   * financeiro, propostas e acessos — a maioria voltando vazia pela RLS. Eram ~20
   * idas ao servidor antes do primeiro pixel útil.
   *
   * Uma vez ativo, continua ativo (ver `DADOS_POR_ABA` em App.tsx): voltar a uma
   * aba já visitada não refaz a busca. Esta nota também estava copiada em 15
   * arquivos.
   */
  ativo: boolean;
  /** Só busca — não aplica. Pode ser um `Promise.all` de várias consultas. */
  buscar: () => Promise<T>;
  /** Aplica o que chegou. Não roda se o carregamento tiver sido cancelado. */
  aoChegar: (dados: T) => void;
  /** Zera o estado quando não há sessão ou a aba não está ativa. */
  aoLimpar: () => void;
  /** Título do toast de falha. Deve ser um literal — entra nas dependências. */
  erro: string;
  /**
   * Guarda extra, avaliada junto de `ativo`. Existe para `useAcessos`, que só
   * carrega para `admin`. `undefined` = sem guarda extra.
   */
  permitido?: boolean;
  /**
   * O RECORTE carregado — hoje, a obra aberta (item 23, peça 2 do §4.2).
   *
   * Três estados, e confundi-los é o modo de falha desta opção:
   *
   *   `undefined` — leitura sem recorte. É o padrão, e o que os 16 hooks não
   *                 escopados continuam usando.
   *   `null`      — hook escopado, sem nada selecionado. NÃO busca e limpa,
   *                 igual a `ativo: false`. Sem isso, fechar o console dispararia
   *                 uma busca da obra `null`.
   *   uma chave   — busca. Trocar de chave RECARREGA, e é o ponto: sem `escopo`
   *                 nas dependências, abrir outra obra manteria em tela o
   *                 orçamento da anterior. O erro seria mudo — os números são
   *                 plausíveis, só são de outra obra.
   */
  escopo?: string | null;
}

export function useCarregamento<T>({
  ativo,
  buscar,
  aoChegar,
  aoLimpar,
  erro,
  permitido = true,
  escopo,
}: Carregamento<T>): { loading: boolean } {
  const { session } = useAuth();
  const { toast } = useFeedback();
  const userId = session?.user.id;
  const [loading, setLoading] = useState(true);

  /**
   * As três funções vivem numa ref, não nas dependências.
   *
   * Elas são recriadas a cada render do hook que chama (são arrows no corpo), e
   * colocá-las na lista faria o efeito disparar a cada render — o laço infinito
   * que o teste `useClientes.test.ts` existe para pegar. A ref é atualizada em um
   * efeito sem dependências, que roda a cada commit, então `.current` está sempre
   * fresco quando o carregamento dispara.
   */
  const cbs = useRef({ buscar, aoChegar, aoLimpar });
  useEffect(() => {
    cbs.current = { buscar, aoChegar, aoLimpar };
  });

  /**
   * `userId` em vez de `session`, de propósito: o supabase-js cria um OBJETO de
   * sessão novo a cada renovação de token (~1h) e a cada `onAuthStateChange`.
   * Depender de `session` refaria todas as buscas do app de hora em hora, sem nada
   * ter mudado. O id é o que de fato identifica de quem são os dados.
   *
   * Esta nota estava copiada em 15 arquivos. Agora mora aqui.
   */
  useEffect(() => {
    if (!userId || !ativo || !permitido || escopo === null) {
      cbs.current.aoLimpar();
      setLoading(false);
      return;
    }
    setLoading(true);
    return comCancelamento(
      () => cbs.current.buscar(),
      (dados) => cbs.current.aoChegar(dados),
      (err) => toast.error(erro, err.message),
      () => setLoading(false)
    );
  }, [userId, ativo, permitido, escopo, erro, toast]);

  return { loading };
}
