import { useEffect, useState } from 'react';
import { Check, PlusCircle, Search } from 'lucide-react';
import { InsumoCatalogo, NovoInsumoCatalogo } from '../../types';
import { formatBRL } from '../../lib/preco';
import { hojeISO } from '../../lib/data';
import { UNIDADE_PADRAO } from '../../constants/unidades';
import Spinner from '../Spinner';
import { Button, Field, Input, Select } from '../ui';
import SelectUnidade from '../SelectUnidade';
import { CATEGORIAS } from './categorias';
import { lerDecimal } from '../../lib/validacao';

/**
 * Escolha de um insumo por busca no servidor, com a mesma pausa da busca
 * principal do catálogo.
 *
 * A busca é do servidor porque o catálogo pode ter milhares de itens e o
 * cliente só tem a página atual em memória — filtrar localmente encontraria
 * apenas o que já está na tela.
 *
 * Duas coisas que este componente ganhou em 20/set/2026, e as duas existem para
 * o mesmo fim — que ninguém crie um insumo repetido:
 *
 * 1. **`jaUsados`**: o que já está nesta composição aparece rotulado e
 *    desabilitado. Antes, a única defesa era a unique `(composicao_id,
 *    insumo_id)` do banco, e o usuário só descobria o repetido DEPOIS de
 *    escolher o item, digitar o coeficiente e clicar em Incluir — por um toast
 *    vermelho.
 * 2. **Cadastro sem sair daqui**: "Nenhum insumo encontrado" era um beco sem
 *    saída. Para cadastrar o componente era preciso fechar a composição, ir ao
 *    topo da aba, criar, e voltar a procurar. Essa fricção é justamente o que
 *    leva alguém a digitar um nome parecido em outro lugar mais tarde.
 */
interface BuscaInsumoProps {
  buscar: (termo: string, excluirId: string) => Promise<InsumoCatalogo[]>;
  /** A própria composição, que nunca pode ser componente de si mesma. */
  excluirId: string;
  selecionadoId: string;
  onSelecionar: (id: string) => void;
  /** Ids já presentes na composição — mostrados, mas não escolhíveis. */
  jaUsados?: string[];
  /** Ausente esconde o atalho de cadastro (quem não pode escrever no catálogo). */
  onCriarInsumo?: (novo: NovoInsumoCatalogo) => Promise<InsumoCatalogo | null>;
  autoFocus?: boolean;
}

export default function BuscaInsumo({
  buscar,
  excluirId,
  selecionadoId,
  onSelecionar,
  jaUsados = [],
  onCriarInsumo,
  autoFocus = false,
}: BuscaInsumoProps) {
  const [termo, setTermo] = useState('');
  const [candidatos, setCandidatos] = useState<InsumoCatalogo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    if (termo.trim() === '') {
      setCandidatos([]);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    const t = setTimeout(() => {
      buscar(termo, excluirId)
        .then((lista) => {
          if (!cancelado) setCandidatos(lista);
        })
        .finally(() => {
          if (!cancelado) setBuscando(false);
        });
    }, 350);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [termo, excluirId, buscar]);

  const usados = new Set(jaUsados);

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label htmlFor="busca-insumo-componente" className="block text-2xs font-semibold text-slate-500 uppercase tracking-wider">
          Buscar insumo ou composição
        </label>
        <Input
          id="busca-insumo-componente"
          type="text"
          autoFocus={autoFocus}
          value={termo}
          onChange={(e) => { setTermo(e.target.value); setCriando(false); }}
          placeholder="Código ou nome — cimento, argamassa, servente…"
          icone={<Search size={13} aria-hidden="true" />}
        />
      </div>

      {buscando ? (
        <div className="flex justify-center py-2"><Spinner size={13} /></div>
      ) : candidatos.length > 0 ? (
        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-200 bg-superficie">
          {candidatos.map((cand) => {
            const jaEsta = usados.has(cand.id);
            return (
              <button
                key={cand.id}
                type="button"
                disabled={jaEsta}
                aria-pressed={selecionadoId === cand.id}
                onClick={() => onSelecionar(cand.id)}
                className={`w-full text-left px-3 py-2 text-xs transition flex items-center gap-2 ${
                  jaEsta
                    ? 'bg-slate-50 text-slate-500 cursor-not-allowed'
                    : selecionadoId === cand.id
                      ? 'bg-blue-50 text-slate-900'
                      : 'text-slate-800 hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="data-font text-2xs font-semibold text-slate-500 shrink-0">{cand.codigo}</span>
                    <span className={`truncate ${selecionadoId === cand.id ? 'font-semibold' : ''}`}>{cand.descricao}</span>
                  </span>
                  <span className="block text-2xs text-slate-500">
                    <span className="data-font">{formatBRL(cand.precoVigente)} / {cand.unidade}</span>
                    {cand.tipoItem === 'Composicao' && ' · composição'}
                    {jaEsta && ' · já está nesta composição'}
                  </span>
                </span>
                {selecionadoId === cand.id && <Check size={14} className="text-blue-600 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      ) : termo.trim() !== '' && !criando ? (
        <div className="flex items-center justify-between gap-2 py-1">
          <p className="text-xs text-slate-500">Nenhum insumo ativo encontrado.</p>
          {onCriarInsumo && (
            <Button variante="secundario" tamanho="sm" onClick={() => setCriando(true)} className="shrink-0">
              <PlusCircle size={13} aria-hidden />
              <span>Cadastrar “{termo.trim()}”</span>
            </Button>
          )}
        </div>
      ) : null}

      {criando && onCriarInsumo && (
        <NovoInsumoInline
          descricaoInicial={termo.trim()}
          onCancelar={() => setCriando(false)}
          onCriar={async (novo) => {
            const criado = await onCriarInsumo(novo);
            if (!criado) return;
            // Selecionar o recém-criado é o ponto do atalho: sem isso o usuário
            // teria de procurar de novo o que acabou de cadastrar.
            setCriando(false);
            setCandidatos([criado]);
            onSelecionar(criado.id);
          }}
        />
      )}
    </div>
  );
}

/**
 * Cadastro mínimo de insumo, aqui dentro.
 *
 * Só os campos SEM os quais a linha não existe: descrição, categoria, unidade e
 * preço. Ficha técnica, aplicações e fornecedor padrão ficam para a edição — um
 * formulário completo aqui competiria com o `ModalInsumo` e teria de ser mantido
 * em dois lugares.
 */
function NovoInsumoInline({
  descricaoInicial,
  onCriar,
  onCancelar,
}: {
  descricaoInicial: string;
  onCriar: (novo: NovoInsumoCatalogo) => Promise<void>;
  onCancelar: () => void;
}) {
  const [descricao, setDescricao] = useState(descricaoInicial);
  const [categoria, setCategoria] = useState<InsumoCatalogo['categoria']>('Material');
  const [unidade, setUnidade] = useState(UNIDADE_PADRAO);
  const [precoTexto, setPrecoTexto] = useState('');
  const [salvando, setSalvando] = useState(false);

  const preco = lerDecimal(precoTexto);
  const valido = descricao.trim() !== '' && Number.isFinite(preco) && preco > 0;

  return (
    <div className="bg-superficie border border-slate-300 rounded-lg p-3 space-y-2.5">
      <p className="text-xs font-semibold text-slate-900">Novo insumo no catálogo</p>

      <Field className="space-y-1" id="novo-inline-descricao" label="Descrição" required>
        {(props) => (
          <Input {...props} type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        )}
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label htmlFor="novo-inline-categoria" className="text-2xs font-bold text-slate-500 uppercase">Categoria</label>
          <Select
            id="novo-inline-categoria"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as InsumoCatalogo['categoria'])}
          >
            {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="novo-inline-unidade" className="text-2xs font-bold text-slate-500 uppercase">Unidade</label>
          <SelectUnidade id="novo-inline-unidade" value={unidade} onChange={setUnidade} />
        </div>
        <Field className="space-y-1" id="novo-inline-preco" label="Preço (R$)" required>
          {(props) => (
            <Input
              {...props}
              type="text"
              inputMode="decimal"
              value={precoTexto}
              onChange={(e) => setPrecoTexto(e.target.value)}
              placeholder="0,00" mono
            />
          )}
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Button
          disabled={!valido || salvando}
          onClick={async () => {
            setSalvando(true);
            await onCriar({
              id: crypto.randomUUID(),
              descricao: descricao.trim(),
              unidade,
              precoReferencia: preco,
              categoria,
              // Todo item nasce insumo simples: quem promove a composição é o
              // banco, no primeiro componente.
              tipoItem: 'Insumo',
              precoFonte: 'Manual',
              ativo: true,
              dataAtualizacaoPreco: hojeISO(),
              historicoPrecos: [],
              cotacoesFornecedores: [],
              obrasUtilizando: 0,
              pontosHistorico: 0,
              qtdComponentes: 0,
              usadoEmComposicoes: 0,
              temComponenteInativo: false,
              // Sem cotação nenhuma, o preço digitado É o vigente — nível 3,
              // "Estimado". Inventar outro nível aqui faria o selo de
              // procedência mentir já no primeiro render.
              precoVigente: preco,
              precoNivel: 3,
              precoFonteEfetiva: 'Estimado',
            });
            setSalvando(false);
          }}
        >
          {salvando ? <Spinner size={13} /> : <PlusCircle size={13} />}
          <span>Cadastrar e usar</span>
        </Button>
        <Button variante="secundario" onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  );
}
