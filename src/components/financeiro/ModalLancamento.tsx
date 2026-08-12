import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  ContaFinanceira,
  Fornecedor,
  Funcionario,
  LancamentoFinanceiro,
  Projeto,
} from '../../types';
import { Field, Input, Modal, Select } from '../ui';
import { useFeedback } from '../FeedbackContext';
import { useValidacao } from '../../hooks/useValidacao';
import { naoEhNumero, naoEhPositivo, naoEscolhido, vazio } from '../../lib/validacao';
import { formatBRL } from '../../lib/preco';
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA } from './constantes';

const hojeIso = () => new Date().toISOString().split('T')[0];

/** Categoria que o atalho de criação já deixa escolhida. */
const categoriaPadrao = (tipo: 'Receita' | 'Despesa') => (tipo === 'Receita' ? 'Faturamento Obra' : 'Outros');

interface ModalLancamentoProps {
  open: boolean;
  /** Lançamento em edição; `null` = o diálogo está criando. */
  lancamento: LancamentoFinanceiro | null;
  /** Só vale na criação: o atalho que abriu o diálogo já diz se é entrada ou saída. */
  tipoInicial?: 'Receita' | 'Despesa';
  onClose: () => void;
  contasAtivas: ContaFinanceira[];
  projetos: Projeto[];
  funcionarios: Funcionario[];
  fornecedores: Fornecedor[];
  onAddLancamento: (lan: LancamentoFinanceiro) => Promise<boolean>;
  onUpdateLancamento: (id: string, patch: Partial<LancamentoFinanceiro>) => Promise<boolean>;
}

export default function ModalLancamento({ open, lancamento, ...resto }: ModalLancamentoProps) {
  return (
    <Modal
      open={open}
      onClose={resto.onClose}
      title={
        lancamento
          ? 'Editar Lançamento'
          : `Lançar ${resto.tipoInicial === 'Receita' ? 'Entrada (Receita)' : 'Saída (Despesa)'}`
      }
      size="lg"
    >
      <FormularioLancamento lancamento={lancamento} {...resto} />
    </Modal>
  );
}

function FormularioLancamento({
  lancamento,
  tipoInicial = 'Despesa',
  onClose,
  contasAtivas,
  projetos,
  funcionarios,
  fornecedores,
  onAddLancamento,
  onUpdateLancamento,
}: Omit<ModalLancamentoProps, 'open'>) {
  const { toast } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<'descricao' | 'valor' | 'conta' | 'funcionario'>();

  const [tipo, setTipo] = useState<'Receita' | 'Despesa'>(lancamento?.tipo ?? tipoInicial);
  const [descricao, setDescricao] = useState(lancamento?.descricao ?? '');
  const [valor, setValor] = useState(lancamento ? String(lancamento.valor) : '');
  const [data, setData] = useState(lancamento?.data ?? hojeIso());
  const [vencimento, setVencimento] = useState(lancamento?.dataVencimento ?? hojeIso());
  const [categoria, setCategoria] = useState<string>(lancamento?.categoria ?? categoriaPadrao(tipoInicial));
  /** Contas chegam por fetch; cair na primeira ativa evita o campo em branco. */
  const [contaId, setContaId] = useState(lancamento?.contaId ?? contasAtivas[0]?.id ?? '');
  const [projetoId, setProjetoId] = useState(lancamento?.projetoId ?? '');
  const [funcionarioId, setFuncionarioId] = useState(lancamento?.funcionarioId ?? '');
  const [fornecedorId, setFornecedorId] = useState(lancamento?.fornecedorId ?? '');
  const [pago, setPago] = useState(lancamento?.pago ?? true);

  /** Faturamento de medição: o fato financeiro é imutável (ver trg_lancamento_protege_faturamento). */
  const camposFinanceirosTravados = !!lancamento?.medicaoId;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !validar([
        { campo: 'descricao', invalido: vazio(descricao), erro: 'Descreva o lançamento.' },
        { campo: 'valor', invalido: vazio(valor), erro: 'Informe o valor.' },
        { campo: 'valor', invalido: naoEhNumero(valor), erro: 'O valor precisa ser um número (use ponto decimal).' },
        { campo: 'valor', invalido: naoEhPositivo(valor), erro: 'O valor deve ser maior que zero.' },
        { campo: 'conta', invalido: naoEscolhido(contaId), erro: 'Escolha a conta que será movimentada.' },
        {
          campo: 'funcionario',
          invalido: categoria === 'Salários' && naoEscolhido(funcionarioId),
          // Sem o vínculo a Folha não identifica o pagamento — o erro fica no
          // campo que o resolve, e não num toast que some antes de o usuário
          // achar o seletor lá embaixo.
          erro: 'Salário exige o colaborador — sem ele a Folha não reconhece o pagamento.',
        },
      ])
    ) return;
    const valorNum = parseFloat(valor);

    // Competência estruturada sustenta a restrição de unicidade no banco e a
    // checagem de "já pago" da Folha — vale também para o salário digitado à mão.
    const competencia = categoria === 'Salários' ? data.slice(0, 7) : undefined;

    if (lancamento) {
      // Num faturamento de medição os campos travados nem entram no patch — o
      // banco recusaria (trg_lancamento_protege_faturamento) e o usuário levaria
      // um erro por um campo que a tela nem deixou ele editar.
      const patch: Partial<LancamentoFinanceiro> = camposFinanceirosTravados
        ? { descricao, data, dataVencimento: vencimento || data, contaId }
        : {
            tipo,
            descricao,
            valor: valorNum,
            data,
            dataVencimento: vencimento || data,
            categoria: categoria as LancamentoFinanceiro['categoria'],
            contaId,
            projetoId: projetoId || undefined,
            funcionarioId: funcionarioId || undefined,
            fornecedorId: fornecedorId || undefined,
            competencia,
          };
      if (!(await onUpdateLancamento(lancamento.id, patch))) return;
      onClose();
      toast.success('Lançamento atualizado.');
      return;
    }

    const novo: LancamentoFinanceiro = {
      id: crypto.randomUUID(),
      tipo,
      descricao,
      valor: valorNum,
      data,
      dataVencimento: vencimento || data,
      categoria: categoria as LancamentoFinanceiro['categoria'],
      pago,
      contaId,
      projetoId: projetoId || undefined,
      funcionarioId: funcionarioId || undefined,
      fornecedorId: fornecedorId || undefined,
      competencia,
    };
    if (!(await onAddLancamento(novo))) return;

    onClose();
    toast.success('Lançamento registrado com sucesso.');
  };

  return (
    <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={salvar} className="p-5 space-y-4 overflow-y-auto">
      {camposFinanceirosTravados && (
        <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-3 flex gap-2.5 text-xs text-blue-900">
          <AlertTriangle size={14} className="text-blue-600 shrink-0 mt-0.5" />
          <span>
            Este lançamento veio do faturamento de uma medição. Valor, tipo, categoria e obra
            ficam travados para não desfazer o elo com a execução da obra — corrija descrição,
            datas ou conta. Para mudar o valor, exclua o lançamento e fature a medição de novo.
          </span>
        </div>
      )}

      {/* Type Switch */}
      <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-bold w-full">
        <button
          type="button"
          disabled={camposFinanceirosTravados}
          onClick={() => {
            setTipo('Despesa');
            setCategoria(categoriaPadrao('Despesa'));
          }}
          className={`flex-1 py-2 text-center rounded-md transition-all ${tipo === 'Despesa' ? 'bg-white text-rose-600 shadow-xs' : 'text-slate-500'}`}
        >
          Saída (Despesa)
        </button>
        <button
          type="button"
          disabled={camposFinanceirosTravados}
          onClick={() => {
            setTipo('Receita');
            setCategoria(categoriaPadrao('Receita'));
          }}
          className={`flex-1 py-2 text-center rounded-md transition-all ${tipo === 'Receita' ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-500'}`}
        >
          Entrada (Receita)
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Description */}
        <Field label="Descrição do Lançamento" erro={erros.descricao} required>
          {(props) => (
            <Input
              {...props}
              type="text"
              placeholder="Ex: Pagamento mensalidade escritório, etc"
              value={descricao}
              onChange={(e) => { setDescricao(e.target.value); limparErro('descricao'); }} fundo="suave"
            />
          )}
        </Field>

        {/* Category */}
        <Field label="Categoria">
          {(props) => (
            <Select
              {...props}
              value={categoria}
              disabled={camposFinanceirosTravados}
              onChange={(e) => { setCategoria(e.target.value); limparErro('funcionario'); }} fundo="suave" className="font-medium disabled:bg-slate-100"
            >
              {(tipo === 'Despesa' ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Value */}
        <Field label="Valor (R$)" erro={erros.valor} required>
          {(props) => (
            <Input
              {...props}
              type="number"
              step="any"
              min="0.01"
              placeholder="0.00"
              value={valor}
              disabled={camposFinanceirosTravados}
              onChange={(e) => { setValor(e.target.value); limparErro('valor'); }} mono fundo="suave" className="font-bold disabled:bg-slate-100"
            />
          )}
        </Field>

        {/* Date */}
        <Field label="Data da Operação" required>
          {(props) => (
          <Input
            {...props}
            type="date"
            value={data}
            onChange={(e) => {
              // Vencimento acompanha a data enquanto o usuário não o move
              // por conta própria — o caso comum é serem iguais.
              if (vencimento === data) setVencimento(e.target.value);
              setData(e.target.value);
            }} fundo="suave"
          />
          )}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Vencimento */}
        <Field label="Vencimento" hint="Usado no painel de vencidos e a vencer." required>
          {(props) => (
            <Input
              {...props}
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)} fundo="suave"
            />
          )}
        </Field>
        <div />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Account */}
        <Field label="Conta para Movimentar" erro={erros.conta} required>
          {(props) => (
            <Select
              {...props}
              value={contaId}
              onChange={(e) => { setContaId(e.target.value); limparErro('conta'); }} fundo="suave" className="font-medium"
            >
              <option value="">Selecione a conta...</option>
              {contasAtivas.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.nome} (Saldo: {formatBRL(acc.saldoAtual)})</option>
              ))}
            </Select>
          )}
        </Field>

        {/* Optional Project Connection */}
        <Field label="Vincular a uma Obra / Projeto (Opcional)">
          {(props) => (
            <Select
              {...props}
              value={projetoId}
              disabled={camposFinanceirosTravados}
              onChange={(e) => setProjetoId(e.target.value)} fundo="suave" className="font-medium disabled:bg-slate-100"
            >
              <option value="">Nenhum projeto vinculado</option>
              {projetos.map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {/* Advanced Connections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Employee association — obrigatório só quando a categoria é Salários. */}
        <Field
          label={categoria === 'Salários' ? 'Colaborador Associado' : 'Colaborador Associado (Opcional)'}
          erro={erros.funcionario}
          required={categoria === 'Salários'}
        >
          {(props) => (
            <Select
              {...props}
              value={funcionarioId}
              onChange={(e) => { setFuncionarioId(e.target.value); limparErro('funcionario'); }} fundo="suave" className="font-medium"
            >
              <option value="">Ninguém associado</option>
              {funcionarios.map(f => (
                <option key={f.id} value={f.id}>{f.nome} ({f.cargo})</option>
              ))}
            </Select>
          )}
        </Field>

        {/* Supplier association */}
        <Field label="Fornecedor Associado (Opcional)">
          {(props) => (
            <Select
              {...props}
              value={fornecedorId}
              onChange={(e) => setFornecedorId(e.target.value)} fundo="suave" className="font-medium"
            >
              <option value="">Nenhum fornecedor</option>
              {fornecedores.map(f => (
                <option key={f.id} value={f.id}>{f.empresa}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {/* Payment checkbox toggle */}
      <div className="pt-2 flex items-center gap-2">
        <input
          type="checkbox"
          id="chk-pago"
          checked={pago}
          onChange={(e) => setPago(e.target.checked)}
          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="chk-pago" className="text-xs font-bold text-slate-700 cursor-pointer">
          Compensado / {tipo === 'Receita' ? 'Recebido em conta' : 'Pago de imediato'}
        </label>
      </div>

      <button
        type="submit"
        className={`w-full font-extrabold py-2.5 rounded-lg text-xs transition mt-2 shadow-sm text-white ${
          tipo === 'Receita' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {lancamento ? 'Salvar Alterações' : 'Salvar Lançamento Financeiro'}
      </button>
    </form>
  );
}
