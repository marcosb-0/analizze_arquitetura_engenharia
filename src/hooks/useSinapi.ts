import { useCallback, useEffect, useState } from 'react';
import {
  PublicacaoSINAPI,
  ResultadoSINAPI,
  LinhaCustoSINAPI,
  ResultadoAdocao,
  RegimeSINAPI,
  RegimeAdotavel,
} from '../types';
import { sinapiService, FiltroSINAPI, SINAPI_PAGINA, SINAPI_UF_PADRAO } from '../services/sinapiService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

/**
 * Estado da busca na base de referência SINAPI.
 *
 * `ativo` adia tudo até o painel de adoção ser aberto — são 16.492 itens no
 * servidor e nada disso interessa a quem só abriu a aba de catálogo. Mesmo
 * padrão de `useCatalogo`.
 */
export function useSinapi(ativo = false) {
  const { toast } = useFeedback();
  const { session } = useAuth();

  const [publicacoes, setPublicacoes] = useState<PublicacaoSINAPI[]>([]);
  const [resultados, setResultados] = useState<ResultadoSINAPI[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<FiltroSINAPI>({
    uf: SINAPI_UF_PADRAO,
    regime: 'SD',
    pagina: 0,
  });
  /** Código da composição cujo detalhamento está aberto. */
  const [detalhando, setDetalhando] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<LinhaCustoSINAPI[]>([]);
  /** Código em adoção — trava o botão daquela linha, não da tela toda. */
  const [adotando, setAdotando] = useState<number | null>(null);

  useEffect(() => {
    if (!session || !ativo || publicacoes.length > 0) return;
    sinapiService
      .publicacoes()
      .then((lista) => {
        setPublicacoes(lista);
        if (lista.length === 0) {
          toast.info(
            'Nenhuma publicação do SINAPI importada.',
            'Rode scripts/sinapi/importar.py — o passo a passo está em data/sinapi/README.md.'
          );
        }
      })
      .catch((err: any) => toast.error('Falha ao carregar publicações do SINAPI.', err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, ativo]);

  const buscar = useCallback(
    async (f: FiltroSINAPI) => {
      if (!session) return;
      setLoading(true);
      try {
        const { itens, total: qtd } = await sinapiService.buscar(f);
        setResultados(itens);
        setTotal(qtd);
      } catch (err: any) {
        toast.error('Falha ao buscar no SINAPI.', err.message);
        setResultados([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.user.id]
  );

  // Debounce só no termo: trocar de regime ou de página deve responder na hora,
  // digitar não deve disparar uma busca por tecla.
  useEffect(() => {
    if (!session || !ativo) return;
    const atraso = filtro.termo ? 350 : 0;
    const t = setTimeout(() => buscar(filtro), atraso);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, ativo, filtro]);

  const aplicarFiltro = (patch: Partial<FiltroSINAPI>) => {
    // Qualquer mudança de critério volta para a primeira página — senão a busca
    // cai numa página que não existe mais no resultado novo.
    setFiltro((prev) => ({ ...prev, ...patch, pagina: patch.pagina ?? 0 }));
    if (patch.pagina === undefined) {
      // O detalhamento aberto era de um resultado que pode nem estar na lista
      // nova; fechar evita mostrar a composição de um item que saiu da tela.
      setDetalhando(null);
      setDetalhe([]);
    }
  };

  const abrirDetalhe = async (codigo: number) => {
    if (detalhando === codigo) {
      setDetalhando(null);
      setDetalhe([]);
      return;
    }
    setDetalhando(codigo);
    setDetalhe([]);
    try {
      const linhas = await sinapiService.custoExpandido(codigo, {
        uf: filtro.uf,
        regime: filtro.regime,
        publicacaoId: filtro.publicacaoId,
      });
      setDetalhe(linhas);
    } catch (err: any) {
      toast.error('Falha ao abrir a composição.', err.message);
      setDetalhando(null);
    }
  };

  /**
   * Adota e devolve o resultado para quem chamou decidir o que fazer com o
   * catálogo (recarregar a listagem, abrir o item...). O toast de sucesso conta
   * o que realmente aconteceu, incluindo a diferença de centavos contra o
   * SINAPI quando ela existe — esconder isso é o que faz um orçamentista perder
   * a tarde procurando de onde vem R$ 0,02.
   */
  const adotar = async (
    codigo: number,
    modo: 'item' | 'expandido'
  ): Promise<ResultadoAdocao | null> => {
    if (filtro.regime === 'SE') {
      toast.error(
        'Regime "sem encargos sociais" não pode ser adotado.',
        'O catálogo guarda desoneração como sim/não. Escolha com ou sem desoneração.'
      );
      return null;
    }
    setAdotando(codigo);
    try {
      const r = await sinapiService.adotar(codigo, modo, {
        uf: filtro.uf,
        regime: filtro.regime as RegimeAdotavel,
        publicacaoId: filtro.publicacaoId,
      });

      const partes: string[] = [];
      if (r.jaExistia) {
        partes.push('O item já estava no catálogo e foi reaproveitado, sem sobrescrever o preço.');
      }
      if (modo === 'expandido') {
        partes.push(`${r.itensCriados} item(ns) criado(s), ${r.itensReusados} reaproveitado(s).`);
      }
      if (r.diferenca !== null && r.diferenca !== 0) {
        const sinal = r.diferenca > 0 ? '+' : '';
        partes.push(
          `Custo no catálogo R$ ${r.custoCatalogo.toFixed(2)} contra R$ ${r.custoSinapi?.toFixed(2)} do SINAPI ` +
            `(${sinal}${r.diferenca.toFixed(2)}): o SINAPI trunca cada parcela em centavos, o catálogo arredonda uma vez.`
        );
      }
      if (r.ignorados.length > 0) {
        partes.push(
          `${r.ignorados.length} componente(s) fora da conta: ` +
            r.ignorados.map((i) => `${i.codigo} (${i.motivo})`).join(', ') +
            '.'
        );
      }
      toast.success(`${r.descricao} adotado.`, partes.join(' ') || undefined);
      // Sem isto o resultado na tela continuaria marcado como não adotado.
      await buscar(filtro);
      return r;
    } catch (err: any) {
      toast.error('Não foi possível adotar este item.', err.message);
      return null;
    } finally {
      setAdotando(null);
    }
  };

  return {
    publicacoes,
    resultados,
    total,
    loading,
    filtro,
    paginas: Math.max(1, Math.ceil(total / SINAPI_PAGINA)),
    detalhando,
    detalhe,
    adotando,
    aplicarFiltro,
    abrirDetalhe,
    adotar,
  };
}

export type UseSinapi = ReturnType<typeof useSinapi>;
export type { RegimeSINAPI };
