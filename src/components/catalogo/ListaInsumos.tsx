import { ChevronLeft, ChevronRight, Database } from 'lucide-react';
import { GRADE_CARTOES, IconButton } from '../ui';
import { InsumoCatalogo } from '../../types';
import EstadoDaLista from '../EstadoDaLista';
import CardInsumo from './CardInsumo';
import TabelaInsumos from './TabelaInsumos';
import { AcoesInsumo } from './acoesInsumo';

export type VisaoCatalogo = 'tabela' | 'cards';

/**
 * Casca da listagem: estado vazio, escolha da visão e paginação.
 *
 * As duas visões convivem. A tabela é o padrão porque orçar é comparar dezenas
 * de itens e para isso conta densidade e alinhamento; o cartão continua sendo
 * melhor para ler procedência de relance. Apagar um dos dois não devolveria
 * nada — é código que já existe e funciona.
 */
interface ListaInsumosProps extends AcoesInsumo {
  catalogo: InsumoCatalogo[];
  loading: boolean;
  visao: VisaoCatalogo;
  paginas: number;
  paginaAtual: number;
  /** Algum critério de busca/categoria/tipo/situação está aplicado — o filtro é do servidor. */
  filtrado: boolean;
  onLimparFiltros: () => void;
  onNovoInsumo: () => void;
  onPagina: (pagina: number) => void;
}

export default function ListaInsumos({
  catalogo,
  loading,
  visao,
  paginas,
  paginaAtual,
  filtrado,
  onLimparFiltros,
  onNovoInsumo,
  onPagina,
  ...acoes
}: ListaInsumosProps) {
  if (loading || catalogo.length === 0) {
    return (
      <EstadoDaLista
        loading={loading}
        total={catalogo.length}
        // O catálogo busca e pagina no servidor: o total sem filtro não chega
        // ao cliente, e a pergunta que dá para responder é se há critério ativo.
        totalSemFiltro={null}
        filtrado={filtrado}
        carregandoLabel="Carregando o banco de custos..."
        className="py-8"
        vazio={{
          icon: Database,
          title: 'Nenhum insumo no banco de custos',
          description:
            'O catálogo guarda o preço histórico de materiais, mão de obra e equipamentos. Cadastre o primeiro insumo ou importe uma publicação do SINAPI.',
          actionLabel: 'Cadastrar novo insumo',
          onAction: onNovoInsumo,
        }}
        semResultado={{
          title: 'Nenhum insumo encontrado',
          description:
            'Nenhum item corresponde à busca ou aos filtros de categoria, origem, tipo e situação.',
        }}
        onLimparFiltros={onLimparFiltros}
      >
        {null}
      </EstadoDaLista>
    );
  }

  return (
    <>
      {visao === 'tabela' ? (
        <div id="catalogo-tabela">
          <TabelaInsumos catalogo={catalogo} {...acoes} />
        </div>
      ) : (
        <div id="catalogo-grid" className={GRADE_CARTOES.entidade}>
          {catalogo.map((item, index) => (
            <CardInsumo key={item.id} item={item} index={index} {...acoes} />
          ))}
        </div>
      )}

      {paginas > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <IconButton
            rotulo="Página anterior"
            onClick={() => onPagina(paginaAtual - 1)}
            disabled={paginaAtual === 0}
            className="border border-slate-200"
          >
            <ChevronLeft size={14} />
          </IconButton>
          <span className="text-xs font-bold text-slate-500">
            Página {paginaAtual + 1} de {paginas}
          </span>
          <IconButton
            rotulo="Próxima página"
            onClick={() => onPagina(paginaAtual + 1)}
            disabled={paginaAtual >= paginas - 1}
            className="border border-slate-200"
          >
            <ChevronRight size={14} />
          </IconButton>
        </div>
      )}
    </>
  );
}
