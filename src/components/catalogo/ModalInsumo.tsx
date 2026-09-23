import React, { useEffect, useState } from 'react';
import { History, Sigma } from 'lucide-react';
import { Fornecedor, InsumoCatalogo, NovoInsumoCatalogo } from '../../types';
import { formatBRL } from '../../lib/preco';
import { hojeISO } from '../../lib/data';
import { useFeedback } from '../FeedbackContext';
import { Button, Field, Input, Modal, Select, Textarea } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import { vazio } from '../../lib/validacao';
import Spinner from '../Spinner';
import { CATEGORIAS } from './categorias';
import SelectUnidade from '../SelectUnidade';
import { UNIDADE_PADRAO } from '../../constants/unidades';

/** Estado do formulário de insumo, compartilhado por criar e editar. */
type FormInsumo = {
  descricao: string;
  unidade: string;
  precoRef: string;
  categoria: InsumoCatalogo['categoria'];
  precoFonte: InsumoCatalogo['precoFonte'];
  fornecedorPadrao: string;
  composicao: string;
  aplicacao: string;
};

const FORM_VAZIO: FormInsumo = {
  descricao: '', unidade: UNIDADE_PADRAO, precoRef: '', categoria: 'Material',
  precoFonte: 'Manual',
  fornecedorPadrao: '', composicao: '', aplicacao: '',
};

function formDoInsumo(item: InsumoCatalogo): FormInsumo {
  return {
    descricao: item.descricao,
    unidade: item.unidade,
    precoRef: String(item.precoReferencia),
    categoria: item.categoria,
    precoFonte: item.precoFonte,
    fornecedorPadrao: item.fornecedorPadraoId ?? '',
    composicao: item.composicao ?? '',
    aplicacao: item.aplicacao ?? '',
  };
}

interface ModalInsumoProps {
  open: boolean;
  /** Insumo em edição; `null` = o diálogo está criando. */
  insumo: InsumoCatalogo | null;
  fornecedores: Fornecedor[];
  onClose: () => void;
  onAddCatalogoItem: (item: NovoInsumoCatalogo) => Promise<void>;
  onUpdateCatalogoItem: (item: InsumoCatalogo) => Promise<InsumoCatalogo | null>;
  /** Busca de parecidos para o aviso de duplicata. Inclui inativos. */
  procurarParecidos: (
    descricao: string,
    unidade: string,
    excluirId?: string
  ) => Promise<{ parecidos: InsumoCatalogo[]; colide: InsumoCatalogo | null }>;
}

export default function ModalInsumo({ open, insumo, ...resto }: ModalInsumoProps) {
  return (
    <Modal
      id="form-insumo-modal"
      open={open}
      onClose={resto.onClose}
      title={insumo ? 'Editar insumo' : 'Cadastrar insumo no catálogo'}
      size="lg"
    >
      <FormularioInsumo insumo={insumo} {...resto} />
    </Modal>
  );
}

function FormularioInsumo({
  insumo,
  fornecedores,
  onClose,
  onAddCatalogoItem,
  onUpdateCatalogoItem,
  procurarParecidos,
}: Omit<ModalInsumoProps, 'open'>) {
  const { toast } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<'descricao' | 'unidade' | 'preco'>();
  const [form, setForm] = useState<FormInsumo>(insumo ? formDoInsumo(insumo) : FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [parecidos, setParecidos] = useState<InsumoCatalogo[]>([]);
  const [colide, setColide] = useState<InsumoCatalogo | null>(null);

  /**
   * Procura gêmeos enquanto o usuário digita, com a mesma pausa de 350 ms da
   * busca de componentes.
   *
   * O aviso NÃO bloqueia o botão de salvar, nem quando a colisão é exata: a
   * autoridade é o índice único do banco, e uma trava no cliente que
   * discordasse dele seria uma segunda regra para manter em dia. O papel desta
   * consulta é fazer o usuário encontrar o item que já existe antes de
   * descobrir que ele existe por uma mensagem de erro.
   */
  useEffect(() => {
    const descricao = form.descricao.trim();
    if (descricao.length < 3) {
      setParecidos([]);
      setColide(null);
      return;
    }
    let cancelado = false;
    const t = setTimeout(() => {
      procurarParecidos(descricao, form.unidade, insumo?.id).then((r) => {
        if (cancelado) return;
        setParecidos(r.parecidos);
        setColide(r.colide);
      });
    }, 350);
    return () => { cancelado = true; clearTimeout(t); };
  }, [form.descricao, form.unidade, insumo?.id, procurarParecidos]);

  /**
   * O tipo NÃO é mais um campo: ele vem do item carregado e, num item novo, é
   * sempre `Insumo`. Quem promove a composição é o banco, no primeiro
   * componente (trigger `trg_promove_composicao`). Enquanto isso era uma
   * escolha de formulário, 11 das 12 composições da base estavam VAZIAS — a
   * intenção declarada e nunca cumprida.
   */
  const ehComposicao = insumo?.tipoItem === 'Composicao';

  /**
   * Composição já povoada: o preço é derivado no banco, então o campo do
   * formulário vira somente-leitura. Deixá-lo editável seria pior que inútil —
   * o usuário digitaria um valor, salvaria com sucesso e veria o número antigo
   * de volta, sem nenhuma explicação.
   */
  const precoBloqueado = ehComposicao && (insumo?.qtdComponentes ?? 0) > 0;

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    // Composição com componentes não tem preço próprio: o banco sobrescreve com
    // a soma dos componentes em qualquer caminho de escrita. O campo fica
    // somente-leitura, e o que estiver nele é ignorado.
    const preco = precoBloqueado ? insumo!.precoReferencia : parseFloat(form.precoRef);

    if (
      !validar([
        { campo: 'descricao', invalido: vazio(form.descricao), erro: 'Descreva o insumo.' },
        { campo: 'unidade', invalido: vazio(form.unidade), erro: 'Informe a unidade.' },
        // Todo item nasce insumo simples, então o preço é sempre exigido na
        // criação. O único caso sem preço próprio é a composição já povoada,
        // e aí `precoBloqueado` já resolveu o valor acima.
        {
          campo: 'preco',
          invalido: !precoBloqueado && (Number.isNaN(preco) || preco <= 0),
          erro: 'O preço de referência deve ser maior que zero.',
        },
      ])
    ) return;

    setSalvando(true);

    const payload: NovoInsumoCatalogo = {
      id: insumo?.id ?? crypto.randomUUID(),
      descricao: form.descricao.trim(),
      unidade: form.unidade.trim(),
      precoReferencia: preco,
      categoria: form.categoria,
      // Numa edição o tipo é o que o banco já decidiu; numa criação é sempre
      // `Insumo`. Este campo nunca vem do formulário.
      tipoItem: insumo?.tipoItem ?? 'Insumo',
      precoFonte: form.precoFonte,
      fornecedorPadraoId: form.fornecedorPadrao || undefined,
      composicao: form.composicao || undefined,
      aplicacao: form.aplicacao || undefined,
      ativo: insumo?.ativo ?? true,
      dataAtualizacaoPreco: insumo?.dataAtualizacaoPreco ?? hojeISO(),
      historicoPrecos: insumo?.historicoPrecos ?? [],
      cotacoesFornecedores: insumo?.cotacoesFornecedores ?? [],
      obrasUtilizando: insumo?.obrasUtilizando ?? 0,
      pontosHistorico: insumo?.pontosHistorico ?? 0,
      qtdComponentes: insumo?.qtdComponentes ?? 0,
      usadoEmComposicoes: insumo?.usadoEmComposicoes ?? 0,
      temComponenteInativo: insumo?.temComponenteInativo ?? false,
      // Derivados de fn_preco_vigente: quem resolve é o banco. Numa edição
      // mantemos o que já valia — `handleUpdateCatalogoItem` aplica este objeto
      // otimisticamente, e inventar um nível aqui faria o selo de procedência
      // piscar um valor errado antes da resposta chegar. Num item novo não há
      // cotação nenhuma, então o preço digitado É o vigente.
      precoVigente: insumo?.precoVigente ?? preco,
      precoNivel: insumo?.precoNivel ?? (form.precoFonte === 'Manual' ? 3 : 4),
      precoFonteEfetiva: insumo?.precoFonteEfetiva ?? (form.precoFonte === 'Manual' ? 'Estimado' : 'Referência'),
      precoFornecedorId: insumo?.precoFornecedorId,
      precoDataOrigem: insumo?.precoDataOrigem,
      precoDiasIdade: insumo?.precoDiasIdade,
    };

    if (insumo) {
      const mudouPreco = insumo.precoReferencia !== preco;
      // O código só existe na EDIÇÃO, e vem do item carregado — nunca do
      // formulário. O banco recusa alterá-lo; mandá-lo de volta inalterado é o
      // que completa o `InsumoCatalogo` que o update espera.
      const salvo = await onUpdateCatalogoItem({ ...payload, codigo: insumo.codigo });
      if (salvo) {
        toast.success(
          'Insumo atualizado.',
          precoBloqueado
            ? 'O preço continua sendo calculado pelos componentes desta composição.'
            : mudouPreco
              ? `Novo preço registrado no histórico: ${formatBRL(insumo.precoReferencia)} → ${formatBRL(preco)}.`
              : undefined
        );
      }
    } else {
      await onAddCatalogoItem(payload);
      toast.success(
        'Insumo cadastrado no catálogo.',
        `"${payload.descricao}" já pode ser usado em orçamentos. Para transformá-lo numa composição, abra-o e adicione o primeiro componente.`
      );
    }

    setSalvando(false);
    onClose();
  };

  return (
    <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={submeter} className="p-4 space-y-3.5 overflow-y-auto">
      {insumo && (
        <div className="bg-blue-50/40 border border-blue-100 rounded-lg p-2.5 flex items-start gap-2">
          <History size={13} className="text-blue-600 mt-0.5 shrink-0" />
          <p className="text-2xs text-blue-900 font-semibold leading-relaxed">
            Mudar o preço de referência acrescenta um ponto ao histórico automaticamente. Os orçamentos já
            existentes mantêm o preço que foi negociado neles.
          </p>
        </div>
      )}

      {/* O seletor "Tipo" (Insumo/Composição) saiu daqui em 20/set/2026. Ele
          pedia uma decisão antes da estrutura existir, e o resultado medido na
          base real foi 11 composições vazias de 12. Agora o item nasce insumo e
          o banco o promove no primeiro componente. A Categoria fica sozinha na
          linha — e é ela que decide o prefixo do código (MAT, MO, EQP...). */}
      <div className="space-y-1">
        <label htmlFor="insumo-categoria" className="text-2xs font-bold text-slate-500 uppercase">Categoria</label>
        <Select id="insumo-categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as InsumoCatalogo['categoria'] })} className="font-medium">
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </div>

      <Field className="space-y-1" label="Descrição" erro={erros.descricao} required>
        {(props) => (
          <Input
            {...props}
            type="text" placeholder="Ex: Cimento CP-II 50kg" value={form.descricao} onChange={(e) => { setForm({ ...form, descricao: e.target.value }); limparErro('descricao'); }} className="font-medium"
          />
        )}
      </Field>

      {/* Aviso, não trava. Quem recusa o gêmeo é o índice único do banco; aqui
          o objetivo é que o usuário ENCONTRE o item que já existe antes de
          descobrir que ele existe por uma mensagem de erro.
          `aria-live="polite"` porque o bloco aparece sozinho, sem o usuário ter
          pedido — anunciá-lo de forma assertiva interromperia a digitação. */}
      {parecidos.length > 0 && (
        <div
          aria-live="polite"
          className={`rounded-lg border p-2.5 space-y-1.5 ${
            colide ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <p className={`text-2xs font-bold leading-relaxed ${colide ? 'text-amber-900' : 'text-slate-600'}`}>
            {colide
              ? `Já existe "${colide.descricao}" em ${colide.unidade} (${colide.codigo}). Salvar assim será recusado — use o item que já existe.`
              : 'Itens parecidos já cadastrados:'}
          </p>
          <ul className="space-y-0.5">
            {parecidos.map((i) => (
              <li key={i.id} className="text-2xs text-slate-600 flex items-baseline gap-1.5">
                <span className="font-mono font-bold text-slate-500 shrink-0">{i.codigo}</span>
                <span className="truncate">{i.descricao}</span>
                <span className="font-mono text-slate-500 shrink-0">/ {i.unidade}</span>
                {/* Um inativo colide no índice igual a um ativo, e é o caso que
                    produz a mensagem mais confusa: "já existe" apontando para
                    algo que não aparece na lista. Por isso ele é rotulado. */}
                {!i.ativo && <span className="text-amber-700 font-bold shrink-0">inativo</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Lista fechada, e não mais um campo de texto. Com texto livre a base
            real já tinha `UN` e `un` como unidades diferentes — e é essa
            divergência que faz `lib/quantidadeEtapa.ts` se recusar a somar. */}
        <Field className="space-y-1" label="Unidade" erro={erros.unidade} required>
          {(props) => (
            <SelectUnidade
              {...props}
              value={form.unidade}
              onChange={(codigo) => { setForm({ ...form, unidade: codigo }); limparErro('unidade'); }}
            />
          )}
        </Field>
        {/* O `<input>` continua cru: a borda e o fundo mudam quando o preço é
            derivado da composição, e passar isso por `className` cairia na
            disputa de utilitários do §M. O que o `Field` traz aqui é o rótulo
            ligado e o erro anunciado. */}
        <Field
          className="space-y-1"
          label={precoBloqueado ? 'Preço (calculado)' : 'Preço ref. (R$)'}
          erro={erros.preco}
          required={!precoBloqueado}
        >
          {(props) => (
          <input
            {...props}
            type="number"
            readOnly={precoBloqueado}
            min="0.01"
            step="any"
            value={precoBloqueado ? String(insumo!.precoReferencia) : form.precoRef}
            onChange={(e) => { setForm({ ...form, precoRef: e.target.value }); limparErro('preco'); }}
            title={precoBloqueado ? 'Soma dos componentes — editar aqui não tem efeito.' : undefined}
            className={`w-full border rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-mono font-bold ${
              precoBloqueado
                ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-superficie border-slate-200'
            }`}
          />
          )}
        </Field>
      </div>

      {/* Um só texto, e não mais dois. O ramo "composição ainda sem preço
          digitado" descrevia a composição VAZIA, que deixou de ser um estado
          possível: se o item é composição, ele tem componentes — foi o primeiro
          deles que o promoveu. */}
      {ehComposicao && (
        <div className="flex items-start gap-1.5 bg-indigo-50/40 border border-indigo-100 rounded-lg p-2.5">
          <Sigma size={12} className="text-indigo-700 mt-0.5 shrink-0" />
          <p className="text-2xs text-indigo-900 font-semibold leading-relaxed">
            O preço desta composição é a soma dos componentes e é recalculado pelo servidor.
            Para mudá-lo, altere os coeficientes ou o preço dos insumos.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase">Fornecedor recomendado</label>
          <Select value={form.fornecedorPadrao} onChange={(e) => setForm({ ...form, fornecedorPadrao: e.target.value })} className="font-medium">
            <option value="">Nenhum</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>{f.empresa}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase" title="Registrado no histórico junto com o preço">Origem do preço</label>
          <Select value={form.precoFonte} onChange={(e) => setForm({ ...form, precoFonte: e.target.value as InsumoCatalogo['precoFonte'] })} className="font-medium">
            <option value="Manual">Manual</option>
            <option value="Fornecedor">Fornecedor</option>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        {/* Campo de texto livre — NÃO é a composição estruturada, que
            é a lista de componentes no drawer de detalhe. */}
        <label className="text-2xs font-bold text-slate-500 uppercase">Ficha técnica / especificação</label>
        <Textarea rows={2} placeholder="Marca preferencial, aditivos, especificação..." value={form.composicao} onChange={(e) => setForm({ ...form, composicao: e.target.value })} />
      </div>

      <Field className="space-y-1" label="Aplicações recomendadas">
        {(props) => (
          <Input
            {...props}
            type="text" placeholder="Ex: assentamento de blocos, contrapiso" value={form.aplicacao} onChange={(e) => setForm({ ...form, aplicacao: e.target.value })}
          />
        )}
      </Field>

      <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
        <Button type="button" onClick={onClose} variante="secundario">
          Cancelar
        </Button>
        <Button type="submit" disabled={salvando}>
          {salvando && <Spinner size={12} />}
          <span>{insumo ? 'Salvar alterações' : 'Cadastrar insumo'}</span>
        </Button>
      </div>
    </form>
  );
}
