import React, { useState } from 'react';
import { History, Info, Sigma } from 'lucide-react';
import { Fornecedor, InsumoCatalogo } from '../../types';
import { formatBRL } from '../../lib/preco';
import { hojeISO } from '../../lib/data';
import { useFeedback } from '../FeedbackContext';
import { Modal } from '../ui';
import Spinner from '../Spinner';
import { CATEGORIAS, UFS } from './categorias';

/** Estado do formulário de insumo, compartilhado por criar e editar. */
type FormInsumo = {
  descricao: string;
  codigoSINAPI: string;
  unidade: string;
  precoRef: string;
  categoria: InsumoCatalogo['categoria'];
  tipo: InsumoCatalogo['tipo'];
  tipoItem: InsumoCatalogo['tipoItem'];
  precoFonte: InsumoCatalogo['precoFonte'];
  uf: string;
  mesReferencia: string;
  desonerado: boolean;
  fornecedorPadrao: string;
  composicao: string;
  aplicacao: string;
};

const FORM_VAZIO: FormInsumo = {
  descricao: '', codigoSINAPI: '', unidade: 'un', precoRef: '', categoria: 'Material',
  tipo: 'Proprio', tipoItem: 'Insumo', precoFonte: 'Manual', uf: '', mesReferencia: '',
  desonerado: false, fornecedorPadrao: '', composicao: '', aplicacao: '',
};

function formDoInsumo(item: InsumoCatalogo): FormInsumo {
  return {
    descricao: item.descricao,
    codigoSINAPI: item.codigoSINAPI ?? '',
    unidade: item.unidade,
    precoRef: String(item.precoReferencia),
    categoria: item.categoria,
    tipo: item.tipo,
    tipoItem: item.tipoItem,
    precoFonte: item.precoFonte,
    uf: item.uf ?? '',
    mesReferencia: item.mesReferencia ?? '',
    desonerado: item.desonerado ?? false,
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
  onAddCatalogoItem: (item: InsumoCatalogo) => Promise<void>;
  onUpdateCatalogoItem: (item: InsumoCatalogo) => Promise<InsumoCatalogo | null>;
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
}: Omit<ModalInsumoProps, 'open'>) {
  const { toast } = useFeedback();
  const [form, setForm] = useState<FormInsumo>(insumo ? formDoInsumo(insumo) : FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  /**
   * Composição já povoada: o preço é derivado no banco, então o campo do
   * formulário vira somente-leitura. Deixá-lo editável seria pior que inútil —
   * o usuário digitaria um valor, salvaria com sucesso e veria o número antigo
   * de volta, sem nenhuma explicação.
   */
  const precoBloqueado = form.tipoItem === 'Composicao' && (insumo?.qtdComponentes ?? 0) > 0;

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    // Composição com componentes não tem preço próprio: o banco sobrescreve com
    // a soma dos componentes em qualquer caminho de escrita. O campo fica
    // somente-leitura, e o que estiver nele é ignorado.
    const precoEhDerivado = form.tipoItem === 'Composicao' && (insumo?.qtdComponentes ?? 0) > 0;
    const preco = precoEhDerivado
      ? insumo!.precoReferencia
      : form.precoRef.trim() === '' && form.tipoItem === 'Composicao'
        ? 0
        : parseFloat(form.precoRef);

    if (!form.descricao.trim() || !form.unidade.trim()) {
      toast.error('Preencha descrição e unidade.');
      return;
    }
    // Composição nova nasce em zero e ganha preço no primeiro componente —
    // exigir valor aqui obrigaria a inventar um número que vai ser descartado.
    if (isNaN(preco) || (preco <= 0 && form.tipoItem !== 'Composicao')) {
      toast.error('O preço de referência deve ser maior que zero.');
      return;
    }
    if (form.tipo === 'SINAPI' && !form.codigoSINAPI.trim()) {
      toast.error('Informe o código SINAPI.', 'Sem o código o item não é rastreável na tabela oficial.');
      return;
    }

    setSalvando(true);

    const payload: InsumoCatalogo = {
      id: insumo?.id ?? crypto.randomUUID(),
      codigoSINAPI: form.tipo === 'SINAPI' ? form.codigoSINAPI.trim() : undefined,
      descricao: form.descricao.trim(),
      unidade: form.unidade.trim(),
      precoReferencia: preco,
      categoria: form.categoria,
      tipo: form.tipo,
      tipoItem: form.tipoItem,
      precoFonte: form.precoFonte,
      uf: form.tipo === 'SINAPI' && form.uf ? form.uf : undefined,
      mesReferencia: form.tipo === 'SINAPI' && form.mesReferencia ? form.mesReferencia : undefined,
      desonerado: form.tipo === 'SINAPI' ? form.desonerado : undefined,
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
      const salvo = await onUpdateCatalogoItem(payload);
      if (salvo) {
        toast.success(
          'Insumo atualizado.',
          precoEhDerivado
            ? 'O preço continua sendo calculado pelos componentes desta composição.'
            : mudouPreco
              ? `Novo preço registrado no histórico: ${formatBRL(insumo.precoReferencia)} → ${formatBRL(preco)}.`
              : undefined
        );
      }
    } else {
      await onAddCatalogoItem(payload);
      toast.success(
        form.tipoItem === 'Composicao' ? 'Composição criada.' : 'Insumo cadastrado no catálogo.',
        form.tipoItem === 'Composicao'
          ? `Abra "${payload.descricao}" e adicione os componentes — o preço sai da soma deles.`
          : `"${payload.descricao}" já pode ser usado em orçamentos.`
      );
    }

    setSalvando(false);
    onClose();
  };

  return (
    <form onSubmit={submeter} className="p-4 space-y-3.5 overflow-y-auto">
      {insumo && (
        <div className="bg-blue-50/40 border border-blue-100 rounded-lg p-2.5 flex items-start gap-2">
          <History size={13} className="text-blue-600 mt-0.5 shrink-0" />
          <p className="text-2xs text-blue-900 font-semibold leading-relaxed">
            Mudar o preço de referência acrescenta um ponto ao histórico automaticamente. Os orçamentos já
            existentes mantêm o preço que foi negociado neles.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase">Origem</label>
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as InsumoCatalogo['tipo'], precoFonte: e.target.value === 'SINAPI' ? 'SINAPI' : 'Manual' })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-medium">
            <option value="Proprio">Próprio</option>
            <option value="SINAPI">SINAPI</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase">Categoria</label>
          <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as InsumoCatalogo['categoria'] })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-medium">
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase" title="Insumo simples ou composição de vários insumos">Tipo</label>
          <select value={form.tipoItem} onChange={(e) => setForm({ ...form, tipoItem: e.target.value as InsumoCatalogo['tipoItem'] })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-medium">
            <option value="Insumo">Insumo</option>
            <option value="Composicao">Composição</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-2xs font-bold text-slate-500 uppercase">Descrição *</label>
        <input type="text" required placeholder="Ex: Cimento CP-II 50kg" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-medium" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className={`space-y-1 ${form.tipo !== 'SINAPI' && 'opacity-40'}`}>
          <label className="text-2xs font-bold text-slate-500 uppercase">Cód. SINAPI</label>
          <input type="text" disabled={form.tipo !== 'SINAPI'} placeholder="462230" value={form.codigoSINAPI} onChange={(e) => setForm({ ...form, codigoSINAPI: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-mono font-bold" />
        </div>
        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase">Unidade *</label>
          <input type="text" required placeholder="saco, m², h" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-mono" />
        </div>
        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase">
            {precoBloqueado ? 'Preço (calculado)' : `Preço ref. (R$)${form.tipoItem === 'Composicao' ? '' : ' *'}`}
          </label>
          <input
            type="number"
            required={!precoBloqueado && form.tipoItem !== 'Composicao'}
            readOnly={precoBloqueado}
            min={form.tipoItem === 'Composicao' ? '0' : '0.01'}
            step="any"
            value={precoBloqueado ? String(insumo!.precoReferencia) : form.precoRef}
            onChange={(e) => setForm({ ...form, precoRef: e.target.value })}
            title={precoBloqueado ? 'Soma dos componentes — editar aqui não tem efeito.' : undefined}
            className={`w-full border rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-mono font-bold ${
              precoBloqueado
                ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-white border-slate-200'
            }`}
          />
        </div>
      </div>

      {form.tipoItem === 'Composicao' && (
        <div className="flex items-start gap-1.5 bg-indigo-50/40 border border-indigo-100 rounded-lg p-2.5">
          <Sigma size={12} className="text-indigo-700 mt-0.5 shrink-0" />
          <p className="text-2xs text-indigo-900 font-semibold leading-relaxed">
            {precoBloqueado
              ? 'O preço desta composição é a soma dos componentes e é recalculado pelo servidor. Para mudá-lo, altere os coeficientes ou o preço dos insumos.'
              : 'Composição não tem preço digitado: crie-a e adicione os componentes com seus coeficientes. O preço passa a ser calculado a partir deles.'}
          </p>
        </div>
      )}

      {form.tipo === 'SINAPI' && (
        <div className="bg-amber-50/30 border border-amber-100 rounded-lg p-3 space-y-2.5">
          <div className="flex items-start gap-1.5">
            <Info size={12} className="text-amber-700 mt-0.5 shrink-0" />
            <p className="text-2xs text-amber-900 font-semibold leading-relaxed">
              Um preço SINAPI só é rastreável com UF, mês de referência e regime de desoneração — a mesma
              composição custa valores diferentes por estado e é republicada todo mês.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-2xs font-bold text-slate-500 uppercase">UF</label>
              <select value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })} className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 font-mono">
                <option value="">—</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-2xs font-bold text-slate-500 uppercase">Mês ref.</label>
              <input type="month" value={form.mesReferencia} onChange={(e) => setForm({ ...form, mesReferencia: e.target.value })} className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 font-mono" />
            </div>
            <div className="space-y-1">
              <label className="text-2xs font-bold text-slate-500 uppercase">Regime</label>
              <select value={form.desonerado ? 'sim' : 'nao'} onChange={(e) => setForm({ ...form, desonerado: e.target.value === 'sim' })} className="w-full bg-white border border-slate-200 rounded-md p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 font-medium">
                <option value="nao">Não desonerado</option>
                <option value="sim">Desonerado</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase">Fornecedor recomendado</label>
          <select value={form.fornecedorPadrao} onChange={(e) => setForm({ ...form, fornecedorPadrao: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-medium">
            <option value="">Nenhum</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>{f.empresa}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-2xs font-bold text-slate-500 uppercase" title="Registrado no histórico junto com o preço">Origem do preço</label>
          <select value={form.precoFonte} onChange={(e) => setForm({ ...form, precoFonte: e.target.value as InsumoCatalogo['precoFonte'] })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 font-medium">
            <option value="Manual">Manual</option>
            <option value="SINAPI">SINAPI</option>
            <option value="Fornecedor">Fornecedor</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        {/* Campo de texto livre — NÃO é a composição estruturada, que
            é a lista de componentes no drawer de detalhe. */}
        <label className="text-2xs font-bold text-slate-500 uppercase">Ficha técnica / especificação</label>
        <textarea rows={2} placeholder="Marca preferencial, aditivos, especificação..." value={form.composicao} onChange={(e) => setForm({ ...form, composicao: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600" />
      </div>

      <div className="space-y-1">
        <label className="text-2xs font-bold text-slate-500 uppercase">Aplicações recomendadas</label>
        <input type="text" placeholder="Ex: assentamento de blocos, contrapiso" value={form.aplicacao} onChange={(e) => setForm({ ...form, aplicacao: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600" />
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
        <button type="button" onClick={onClose} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-2 px-4 rounded-lg text-xs transition">
          Cancelar
        </button>
        <button type="submit" disabled={salvando} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-2 px-5 rounded-lg text-xs transition flex items-center gap-1.5">
          {salvando && <Spinner size={12} />}
          <span>{insumo ? 'Salvar alterações' : 'Cadastrar insumo'}</span>
        </button>
      </div>
    </form>
  );
}
