import { ReactNode } from 'react';
import { LucideIcon, SearchX } from 'lucide-react';
import Spinner from './Spinner';
import EmptyState from './EmptyState';
import { Button } from './ui';

/**
 * Os três estados que toda lista de cadastro tem antes de ter conteúdo:
 * carregando, vazia de verdade e vazia por causa do filtro.
 *
 * Cada tela escrevia essa decisão à mão, e as três variações que apareceram
 * são exatamente os três jeitos de errar:
 *
 * 1. **Não checar `loading`.** `ClientesTab` não recebia a flag: durante o
 *    fetch a tela mostrava "Nenhum cliente cadastrado" com o botão de criar —
 *    convite a cadastrar de novo um cliente que já existe. `ProjetosTab` já
 *    tinha levado esse tiro e resolveu no lugar dela, com o comentário no
 *    código; as outras seis listas nunca souberam.
 * 2. **Não separar filtro de primeiro uso.** Uma busca sem resultado dizia
 *    "cadastre seu primeiro X" e oferecia o CTA de criar, escondendo que o
 *    remédio é limpar o campo de busca, não cadastrar de novo.
 * 3. **Separar o texto e esquecer a saída.** O caso de filtro dizia "limpe os
 *    filtros" numa frase, sem nada para clicar.
 *
 * Por isso a decisão é do componente e não do chamador: `totalSemFiltro` é a
 * única informação que separa (2), e `loading` chega antes de tudo. Passar as
 * duas é obrigatório — não há como pedir o estado vazio sem dizer qual dos dois
 * é.
 *
 * Devolve `children` num fragmento quando há conteúdo, sem nó extra no DOM:
 * as listas moram dentro de `grid` e `divide-y`, e um `<div>` de embrulho
 * quebraria o layout das duas.
 */

/**
 * De onde vem a resposta de "isto está vazio porque filtrou ou porque nunca teve
 * nada?". As listas de cadastro filtram em memória e sabem o total real; o
 * catálogo e o SINAPI filtram e paginam no servidor, e o número de trás não
 * existe do lado do cliente. Como união, quem filtra no servidor é **obrigado**
 * a responder a pergunta de outro jeito, em vez de passar um total inventado.
 */
type Origem =
  /** Filtro em memória: itens **antes** do filtro. Zero significa primeiro uso. */
  | { totalSemFiltro: number }
  /** Filtro no servidor: só há como saber se algum critério está aplicado. */
  | { totalSemFiltro: null; filtrado: boolean };

type EstadoDaListaProps = Origem & {
  loading: boolean;
  /** Itens **depois** do filtro — `lista.total` do `useListaOrdenada`. */
  total: number;
  /** "Carregando obras..." — o nome da coisa, não "Carregando...". */
  carregandoLabel: string;
  /** O estado de primeiro uso: o que é esta lista e como criar o primeiro item. */
  vazio: {
    icon: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
  };
  /** Texto do caso "o filtro não achou nada". O padrão serve à maioria das listas. */
  semResultado?: { title?: string; description?: string };
  /** Sem isto o estado de filtro vazio é um beco: informa e não oferece saída. */
  onLimparFiltros?: () => void;
  /** Aplicado ao embrulho dos três estados — `col-span-full` nas listas em grid. */
  className?: string;
  children: ReactNode;
};

export default function EstadoDaLista({
  loading,
  total,
  carregandoLabel,
  vazio,
  semResultado,
  onLimparFiltros,
  className = '',
  children,
  ...origem
}: EstadoDaListaProps) {
  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 py-16 text-slate-500 ${className}`}>
        <Spinner size={22} />
        <span className="text-xs font-semibold">{carregandoLabel}</span>
      </div>
    );
  }

  if (total > 0) return <>{children}</>;

  // Vazio com itens por trás só pode ser filtro. O contrário — `totalSemFiltro`
  // zero — é primeiro uso, e aí o CTA de criar é o que a pessoa quer.
  const filtrado =
    origem.totalSemFiltro === null ? origem.filtrado : origem.totalSemFiltro > 0;

  return (
    <div className={className}>
      {filtrado ? (
        <EmptyState
          icon={SearchX}
          title={semResultado?.title ?? 'Nenhum resultado'}
          description={
            semResultado?.description ??
            'Nada corresponde à busca ou aos filtros aplicados. Ajuste os critérios para ver os itens de novo.'
          }
        >
          {onLimparFiltros && (
            <Button variante="secundario" onClick={onLimparFiltros}>
              Limpar filtros
            </Button>
          )}
        </EmptyState>
      ) : (
        <EmptyState {...vazio} />
      )}
    </div>
  );
}
