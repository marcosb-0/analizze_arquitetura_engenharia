import { Layers } from 'lucide-react';
import { InsumoCatalogo } from '../../types';
import { FiltroCatalogo } from '../../services/catalogoService';
import { CATEGORIAS, iconeCategoria } from './categorias';
import { ALVO, FOCO } from '../ui';

interface PilulasCategoriaProps {
  /** Quantos itens o filtro atual devolve — vem do servidor, não do array local. */
  total: number;
  categoriaAtiva: FiltroCatalogo['categoria'];
  onCategoria: (categoria: InsumoCatalogo['categoria'] | undefined) => void;
}

/**
 * As categorias do catálogo, em fileira — o desenho do mockup
 * "Analizze - App", que substituiu a coluna lateral de 256 px em
 * 14/ago/2026 (`SidebarCatalogo`).
 *
 * ## Por que a coluna saiu
 *
 * O catálogo é a tela mais larga do app: a tabela de insumos pede 1.340 px de
 * `min-content`, e era por causa dela que `CatalogoTab` precisava de
 * `largura="cheia"`. Gastar 256 px de largura fixa com sete botões — num
 * layout que já disputava cada pixel com a tabela — era o pior negócio de
 * espaço da aplicação. Em fileira, as mesmas sete opções ocupam uma linha de
 * 40 px de altura e devolvem a largura inteira para o dado.
 *
 * O contador de itens veio junto e virou texto de apoio do cabeçalho, em vez
 * de um bloco próprio: ele responde "o filtro pegou quanta coisa?", que é uma
 * legenda da lista, não uma seção da tela.
 *
 * A pílula ativa é `slate-900` sólida e não o filete azul de item ativo de
 * navegação: isto é FILTRO, não navegação. O filete esquerdo continua
 * significando "seção selecionada" (menu lateral, pastas de Documentos), e
 * gastá-lo aqui apagaria a distinção — o mesmo argumento que o `DashboardOverview`
 * já fazia sobre o filete dos próximos passos.
 */
export default function PilulasCategoria({ total, categoriaAtiva, onCategoria }: PilulasCategoriaProps) {
  const opcoes: { chave: string; rotulo: string; icone: React.ReactNode; valor?: InsumoCatalogo['categoria'] }[] = [
    { chave: 'todas', rotulo: 'Todas', icone: <Layers size={13} /> },
    ...CATEGORIAS.map((cat) => ({ chave: cat, rotulo: cat, icone: iconeCategoria(cat), valor: cat })),
  ];

  return (
    <div id="catalogo-categorias" className="flex flex-wrap items-center gap-2">
      {opcoes.map(({ chave, rotulo, icone, valor }) => {
        const ativo = categoriaAtiva === valor;
        return (
          <button
            key={chave}
            type="button"
            aria-pressed={ativo}
            onClick={() => onCategoria(valor)}
            className={`${ALVO.md} ${FOCO} inline-flex items-center gap-1.5 rounded-full px-3.5 text-2xs transition ${
              ativo
                ? 'bg-slate-900 font-bold text-white'
                : 'border border-slate-200 bg-white font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            {/* `slate-500` e não o `slate-400` do mockup: o guarda de
                contraste do `estilo.test.ts` barra o 400 mesmo em ícone
                decorativo, e a diferença entre os dois tons aqui é
                imperceptível ao lado de um rótulo `slate-600`. */}
            <span className={ativo ? '' : 'text-slate-500'} aria-hidden="true">{icone}</span>
            {rotulo}
          </button>
        );
      })}

      {/* Região viva: a busca do catálogo é servidor-side e troca a listagem
          inteira. Ver a nota em `ControlesDeLista`. */}
      <span
        aria-live="polite"
        aria-atomic="true"
        className="ml-auto text-2xs text-slate-500"
      >
        <strong className="data-font font-bold text-slate-700">{total}</strong>{' '}
        {total === 1 ? 'insumo no filtro atual' : 'insumos no filtro atual'}
      </span>
    </div>
  );
}
