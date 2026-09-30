import { useEffect, useMemo, useState } from 'react';
import type { ComponenteItemProposta, FolhaComposicao, ItemProposta } from '../types';

/**
 * As composições de TODOS os itens de uma proposta: a cópia adaptada de cada
 * item que tem uma, e as folhas do catálogo para o que não tem (e para os
 * componentes que são composições — a argamassa dentro do emboço).
 *
 * Saiu de `DocumentoProposta` quando a tela da proposta passou a precisar do
 * mesmo dado para a divisão por natureza. Duas cópias da busca divergiriam na
 * primeira correção de uma só.
 *
 * `ativo` falso não busca nada — o documento no preço global não espera uma
 * consulta cujo resultado não vai para o papel.
 */
export function useComposicoesProposta({
  ativo,
  itens,
  onCarregarComposicao,
  onCarregarFolhas,
}: {
  ativo: boolean;
  itens: ItemProposta[];
  onCarregarComposicao: (itemId: string) => Promise<ComponenteItemProposta[] | null>;
  onCarregarFolhas: (ids: string[]) => Promise<FolhaComposicao[] | null>;
}) {
  const [tentativa, setTentativa] = useState(0);
  const chave = useMemo(
    () => ({ itens, tentativa, onCarregarComposicao, onCarregarFolhas }),
    [itens, tentativa, onCarregarComposicao, onCarregarFolhas]
  );
  const [consulta, setConsulta] = useState<{
    chave: typeof chave;
    componentes: ComponenteItemProposta[];
    folhas: FolhaComposicao[];
    erro: boolean;
  } | null>(null);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    async function carregar() {
      try {
        const lista: ComponenteItemProposta[] = [];
        const compostos = itens.filter(i => i.qtdComponentes > 0);
        // Limita concorrência para propostas grandes.
        for (let i = 0; i < compostos.length; i += 4) {
          const grupo = await Promise.all(compostos.slice(i, i + 4).map(item => onCarregarComposicao(item.id)));
          if (!vivo) return;
          if (grupo.some(g => g === null)) throw new Error('Composição indisponível');
          lista.push(...grupo.flatMap(g => g ?? []));
        }
        // O catálogo entra onde a proposta não tem cópia própria (o item veio
        // do catálogo e ninguém adaptou a composição) e para descer os
        // componentes que são composições — a argamassa dentro do emboço.
        // Uma consulta só, para todas as raízes.
        const raizes = [...new Set([
          ...itens.filter(i => i.qtdComponentes === 0).map(i => i.catalogoInsumoId),
          ...lista.filter(c => c.categoria !== 'Mão de Obra').map(c => c.catalogoInsumoId),
        ].filter((id): id is string => !!id))];
        const folhas = await onCarregarFolhas(raizes);
        if (!vivo) return;
        if (folhas === null) throw new Error('Catálogo indisponível');
        setConsulta({ chave, componentes: lista, folhas, erro: false });
      } catch {
        if (vivo) setConsulta({ chave, componentes: [], folhas: [], erro: true });
      }
    }
    void carregar();
    return () => { vivo = false; };
  }, [ativo, itens, onCarregarComposicao, onCarregarFolhas, chave]);

  const atual = consulta?.chave === chave ? consulta : null;
  const componentes = useMemo(() => atual?.componentes ?? [], [atual]);
  const folhas = useMemo(() => atual?.folhas ?? [], [atual]);
  const carregando = ativo && !atual;
  return {
    componentes,
    folhas,
    carregando,
    erro: !carregando && atual?.erro === true,
    tentarDeNovo: () => setTentativa(t => t + 1),
  };
}
