import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFeedback } from '../components/FeedbackContext';
import { indicadoresService } from '../services/indicadoresService';
import { acessoDoPapel, type DadosBI } from '../lib/indicadores/tipos';
import { useCarregamento } from './useCarregamento';
import { mensagemDeErro } from '../lib/erros';
import { registrarErro } from '../lib/telemetria';

const VAZIO: DadosBI = { medicoes: [], etapas: [], contratos: [], faturamentos: [], rejeicoes: [] };

/**
 * As linhas do painel de indicadores (ver `indicadoresService`).
 *
 * Sem escrita, como `useResumoObras`: tudo aqui é derivado de medições,
 * cronograma, contratos e razão. `recarregar` é o botão "Atualizar dados" do
 * painel — a tela não assina as escritas do console, de propósito (o mesmo
 * motivo de o painel não assinar orçamento, cronograma e medições, §4.2).
 *
 * `erro` é guardado, e não só avisado por toast: um painel de BI que falhou ao
 * carregar e mostra zeros é pior que um que diz "não carregou". A tela troca o
 * conteúdo por um aviso com "tentar de novo" enquanto `erro` estiver ligado.
 */
export function useIndicadores(ativo = true) {
  const { toast } = useFeedback();
  const { profile } = useAuth();
  const acesso = useMemo(() => acessoDoPapel(profile?.role), [profile?.role]);
  const [dados, setDados] = useState<DadosBI>(VAZIO);
  const [erro, setErro] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const buscar = useCallback(() => indicadoresService.carregar(acesso), [acesso]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () =>
      buscar().catch((e: unknown) => {
        setErro(true);
        throw e;
      }),
    aoChegar: (d) => {
      setErro(false);
      setDados(d);
    },
    aoLimpar: () => setDados(VAZIO),
    erro: 'Falha ao carregar os indicadores.',
    // A leitura muda com o papel: sem isto, trocar de conta na mesma aba
    // manteria os contratos de quem saiu.
    escopo: profile?.role ?? null,
  });

  const recarregar = useCallback(() => {
    setAtualizando(true);
    return buscar()
      .then((d) => {
        setErro(false);
        setDados(d);
      })
      // Não é `avisoRefetch`: aquele aviso diz "a alteração foi salva", e aqui
      // não houve alteração nenhuma — é o botão de atualizar.
      .catch((e: unknown) => {
        registrarErro(e, { origem: 'refetch', escopo: 'os indicadores' });
        toast.error('Não foi possível atualizar os indicadores.', mensagemDeErro(e));
      })
      .finally(() => setAtualizando(false));
  }, [buscar, toast]);

  return useMemo(
    () => ({ dados, acesso, loading, atualizando, erro, recarregar }),
    [dados, acesso, loading, atualizando, erro, recarregar]
  );
}
