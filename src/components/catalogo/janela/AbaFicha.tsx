import { InsumoCatalogo } from '../../../types';
import { formatBRL } from '../../../lib/preco';
import { formatarDataBR } from '../../../lib/data';
import { nomeDaUnidade } from '../../../constants/unidades';

/**
 * A aba Ficha: o que o item É, fora do preço e da estrutura.
 *
 * As ações (vincular, editar, desativar, excluir) moravam no rodapé daqui e
 * subiram para o topo da janela em 25/set/2026 — ficavam na terceira aba, longe
 * de onde se decide usá-las. Especificação e aplicação perderam as caixas
 * tingidas de azul e âmbar: cor de fundo por assunto é a moldura que o layout
 * de seções abertas aposentou, e aqui ela só dizia "isto é um texto".
 */
interface AbaFichaProps {
  insumo: InsumoCatalogo;
}

function Dado({ rotulo, children, numero = false }: { rotulo: string; children: React.ReactNode; numero?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-semibold uppercase tracking-[0.08em] text-slate-500">{rotulo}</dt>
      <dd className={`mt-0.5 text-xs font-semibold text-slate-800 ${numero ? 'data-font' : ''}`}>{children}</dd>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-sm font-bold text-slate-900">{titulo}</h3>
      {children}
    </section>
  );
}

export default function AbaFicha({ insumo }: AbaFichaProps) {
  return (
    <div className="max-w-3xl space-y-6">
      <Bloco titulo="Identificação">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Dado rotulo="Código" numero>{insumo.codigo}</Dado>
          {/* Nome por extenso, não só o símbolo: `m³` e `m²` se confundem num
              relance, e aqui há espaço para a forma que não se confunde. */}
          <Dado rotulo="Unidade">{nomeDaUnidade(insumo.unidade)}</Dado>
          <Dado rotulo="Categoria">{insumo.categoria}</Dado>
          <Dado rotulo="Preço de referência" numero>{formatBRL(insumo.precoReferencia)}</Dado>
          <Dado rotulo="Origem do preço">{insumo.precoFonte}</Dado>
          <Dado rotulo="Preço atualizado em" numero>{formatarDataBR(insumo.dataAtualizacaoPreco)}</Dado>
        </dl>
      </Bloco>

      <Bloco titulo="Onde é usado">
        <ul className="space-y-1 text-xs text-slate-700">
          <li>
            {insumo.obrasUtilizando === 0
              ? 'Ainda não entrou no orçamento de nenhuma obra.'
              : `${insumo.obrasUtilizando} obra${insumo.obrasUtilizando > 1 ? 's já orçaram' : ' já orçou'} este item.`}
          </li>
          <li>
            {insumo.usadoEmComposicoes === 0
              ? 'Não é componente de nenhuma composição.'
              : `É componente de ${insumo.usadoEmComposicoes} composiç${insumo.usadoEmComposicoes > 1 ? 'ões' : 'ão'} — mudar o preço dele recalcula todas.`}
          </li>
        </ul>
      </Bloco>

      <Bloco titulo="Especificação técnica">
        {insumo.composicao ? (
          <p className="whitespace-pre-line text-xs leading-relaxed text-slate-700">{insumo.composicao}</p>
        ) : (
          <p className="text-xs text-slate-500">Sem especificação. Use “Editar” no topo para descrever marca, norma ou traço.</p>
        )}
      </Bloco>

      <Bloco titulo="Aplicações">
        {insumo.aplicacao ? (
          <p className="whitespace-pre-line text-xs leading-relaxed text-slate-700">{insumo.aplicacao}</p>
        ) : (
          <p className="text-xs text-slate-500">Sem aplicações registradas.</p>
        )}
      </Bloco>
    </div>
  );
}
