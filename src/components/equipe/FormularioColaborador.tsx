import React, { useMemo, useState } from 'react';
import { AlertTriangle, UserCheck } from 'lucide-react';
import { CentroCusto, Funcionario, InsumoCatalogo, RegimeEncargos, TipoChavePix, TipoConta } from '../../types';
import SeletorCentroCusto from '../financeiro/SeletorCentroCusto';
import { catalogoService } from '../../services/catalogoService';
import { custoColaborador, type ParametrosCusto } from '../../lib/custoHora';
import { formatBRL } from '../../lib/preco';
import { onlyDigits, maskCpf, maskTelefone, isValidCpf } from '../../utils/format';
import { mensagemDeErro } from '../../lib/erros';
import { useFeedback } from '../FeedbackContext';
import { useValidacao } from '../../hooks/useValidacao';
import { Checagem, vazio } from '../../lib/validacao';
import { Aviso, Button, Field, Input, ModalForm, Select, Textarea } from '../ui';
import { parseDinheiro, parseOpcional } from './regras';

/** Mesmas opções dos checks de funcionarios.pix_tipo e tipo_conta. */
const TIPOS_CHAVE_PIX: TipoChavePix[] = ['CPF', 'CNPJ', 'E-mail', 'Telefone', 'Aleatória'];
const TIPOS_CONTA: TipoConta[] = ['Corrente', 'Poupança', 'Pagamento'];

const PLACEHOLDER_PIX: Record<TipoChavePix | '', string> = {
  CPF: '000.000.000-00',
  CNPJ: '00.000.000/0001-00',
  Telefone: '(11) 90000-0000',
  'E-mail': 'nome@email.com',
  Aleatória: 'Chave gerada pelo banco',
  '': 'Escolha o tipo ao lado',
};

/** Campos da ficha que a validação nomeia, na ordem em que aparecem na tela. */
type CampoFicha = 'nome' | 'cargo' | 'cpf' | 'maoDeObra' | 'salario' | 'encargos' | 'jornada' | 'vt' | 'va' | 'saude' | 'outros';

/**
 * Os quatro benefícios numa lista só, com o nome do campo junto do rótulo: a
 * tela e a validação percorrem a MESMA lista, então um benefício novo não pode
 * entrar num lugar e faltar no outro.
 */
const BENEFICIOS = [
  { campo: 'vt', rotulo: 'Vale-transporte' },
  { campo: 'va', rotulo: 'Vale-alimentação/refeição' },
  { campo: 'saude', rotulo: 'Plano de saúde' },
  { campo: 'outros', rotulo: 'Outros benefícios' },
] as const satisfies readonly { campo: CampoFicha; rotulo: string }[];

type CampoBeneficio = (typeof BENEFICIOS)[number]['campo'];

/**
 * O número gravado de volta ao campo, na grafia que o usuário digitaria.
 * Dinheiro sai com milhar E centavos ("2.500,00"): sem a vírgula, "2.500" seria
 * lido como dois e meio. Percentual e horas saem sem milhar pelo mesmo motivo.
 */
const texto = (n: number | null | undefined, dinheiro = false) =>
  n == null ? ''
  : dinheiro ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : n.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 4 });

/**
 * Um bloco do formulário com título. Não é `<fieldset>`: a `<legend>` de um
 * fieldset com borda superior assenta EM CIMA da borda, e o divisor é o que
 * separa os blocos numa janela desta altura.
 */
function Bloco({ id, titulo, descricao, children }: { id: string; titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} className="space-y-3 border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
      <div>
        <h3 id={id} className="text-sm font-bold text-slate-900">{titulo}</h3>
        {descricao && <p className="mt-0.5 text-2xs text-slate-500 leading-relaxed">{descricao}</p>}
      </div>
      {children}
    </div>
  );
}

interface Props {
  /** A ficha em edição; ausente = cadastro novo. */
  funcionario?: Funcionario;
  funcionarios: Funcionario[];
  centrosCusto: CentroCusto[];
  parametros: ParametrosCusto | null;
  insumosMaoDeObra: InsumoCatalogo[];
  /** O cargo novo nasceu no catálogo: a lista do seletor ficou velha. */
  onInsumosMudaram: () => void;
  salvando: boolean;
  setSalvando: (v: boolean) => void;
  onSalvar: (func: Funcionario) => Promise<Funcionario | null>;
  onSalvo: (salvo: Funcionario) => void;
  onCancelar: () => void;
}

/**
 * A ficha funcional, criar e editar.
 *
 * É componente próprio, montado só enquanto o `<Modal>` está aberto: o estado
 * nasce da ficha (ou vazio) a cada abertura, e os 25 `set…('')` do reset que a
 * aba carregava deixaram de existir — um campo novo não pode mais ser esquecido
 * no reset e reaparecer preenchido na ficha seguinte.
 */
export default function FormularioColaborador({
  funcionario: f,
  funcionarios,
  centrosCusto,
  parametros,
  insumosMaoDeObra,
  onInsumosMudaram,
  salvando,
  setSalvando,
  onSalvar,
  onSalvo,
  onCancelar,
}: Props) {
  const { toast } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<CampoFicha>();

  const [nome, setNome] = useState(f?.nome ?? '');
  const [cargo, setCargo] = useState(f?.cargo ?? '');
  /**
   * "É mão de obra direta" não é coluna no banco: o que persiste é
   * `catalogo_mao_de_obra_id`. A marca existe porque a pergunta era circular —
   * o que declarava mão de obra direta era justamente o vínculo que não dava
   * para fazer sem o cargo já existir no catálogo.
   */
  const [ehMaoDeObra, setEhMaoDeObra] = useState(f?.catalogoMaoDeObraId != null);
  const [cargoModo, setCargoModo] = useState<'criar' | 'existente'>(f?.catalogoMaoDeObraId != null ? 'existente' : 'criar');
  const [maoDeObraId, setMaoDeObraId] = useState(f?.catalogoMaoDeObraId ?? '');
  const [cpf, setCpf] = useState(f?.cpf ?? '');
  const [telefone, setTelefone] = useState(f?.telefone ?? '');
  const [email, setEmail] = useState(f?.email ?? '');
  const [admissao, setAdmissao] = useState(f?.dataAdmissao ?? '');
  const [centroCustoId, setCentroCustoId] = useState(f?.centroCustoId ?? '');
  const [obs, setObs] = useState(f?.observacoes ?? '');

  /**
   * Custo além do salário. Todos em `string`, e não em `number | undefined`,
   * porque é o vazio que carrega a informação: campo em branco significa
   * "herda a empresa" (encargos e jornada) ou "não recebe" (benefícios), e um
   * estado numérico não distingue isso de zero.
   */
  const [salarioBase, setSalarioBase] = useState(texto(f?.salarioBase, true));
  const [encargos, setEncargos] = useState(texto(f?.encargosPercentual));
  const [regime, setRegime] = useState<RegimeEncargos>(f?.regimeEncargos ?? 'Mensalista');
  const [jornada, setJornada] = useState(texto(f?.jornadaMensalHoras));
  const [beneficios, setBeneficios] = useState<Record<CampoBeneficio, string>>({
    vt: texto(f?.beneficios?.valeTransporte, true),
    va: texto(f?.beneficios?.valeAlimentacao, true),
    saude: texto(f?.beneficios?.planoSaude, true),
    outros: texto(f?.beneficios?.outros, true),
  });

  // Para onde o salário é transferido. A folha já calculava o valor e gerava o
  // lançamento, mas o dado que executa o pagamento vivia numa planilha à parte.
  const pg = f?.dadosPagamento;
  const [pixTipo, setPixTipo] = useState<TipoChavePix | ''>(pg?.pixTipo ?? '');
  const [pixChave, setPixChave] = useState(pg?.pixChave ?? '');
  const [banco, setBanco] = useState(pg?.banco ?? '');
  const [agencia, setAgencia] = useState(pg?.agencia ?? '');
  const [conta, setConta] = useState(pg?.conta ?? '');
  const [tipoConta, setTipoConta] = useState<TipoConta | ''>(pg?.tipoConta ?? '');
  const [titular, setTitular] = useState(pg?.titular ?? '');

  /**
   * O % que um campo de encargos em branco herda, pelo MESMO caminho de
   * `custoColaborador`: a coluna do regime da tabela (modo 'Rubricas') e, se
   * ela não responde, o número digitado da empresa.
   */
  const parametrosRegime =
    parametros?.encargosModo === 'Rubricas'
      ? regime === 'Horista' ? parametros.encargosRubricas.horista : parametros.encargosRubricas.mensalista
      : null;
  const encargosPadrao = parametrosRegime ?? parametros?.encargosPercentual ?? null;
  const jornadaPadrao = parametros?.jornadaMensalHoras ?? 220;

  /**
   * O custo/hora que os campos ABERTOS produzem, para o usuário ver o efeito de
   * um vale-refeição antes de salvar. Monta uma ficha de mentira com o que está
   * digitado em vez de duplicar a fórmula — a conta continua vivendo só em
   * `custoColaborador`, que é o espelho testado da função do banco.
   */
  const custoPrevisto = useMemo(() => {
    const numero = (v: string) => parseOpcional(v) ?? undefined;
    const dinheiro = (v: string) => parseDinheiro(v) ?? undefined;
    const salario = dinheiro(salarioBase);
    if (salario == null) return null;
    return custoColaborador(
      {
        ...f,
        id: f?.id ?? 'previsao',
        nome, cargo,
        cpf: '', telefone: '', email: '', dataAdmissao: '', observacoes: '',
        status: 'Ativo',
        dadosPagamento: {},
        salarioBase: salario,
        encargosPercentual: numero(encargos),
        regimeEncargos: regime,
        jornadaMensalHoras: numero(jornada),
        beneficios: {
          valeTransporte: dinheiro(beneficios.vt),
          valeAlimentacao: dinheiro(beneficios.va),
          planoSaude: dinheiro(beneficios.saude),
          outros: dinheiro(beneficios.outros),
        },
      },
      parametros
    );
  }, [f, nome, cargo, salarioBase, encargos, regime, jornada, beneficios, parametros]);

  const cargosConhecidos = useMemo(
    () => Array.from(new Set(funcionarios.map((x) => x.cargo).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [funcionarios]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // O índice único do banco compara só os dígitos, então a checagem local
    // precisa fazer o mesmo para avisar antes de o insert estourar.
    const cpfDigitos = onlyDigits(cpf);
    const duplicado = funcionarios.find((x) => x.id !== f?.id && onlyDigits(x.cpf) === cpfDigitos);

    const salario = parseDinheiro(salarioBase);
    const encargosNum = parseOpcional(encargos);
    const jornadaNum = parseOpcional(jornada);
    const valores = BENEFICIOS.map(({ campo }) => parseDinheiro(beneficios[campo]));

    if (
      !validar([
        { campo: 'nome', invalido: vazio(nome), erro: 'Informe o nome completo.' },
        { campo: 'cargo', invalido: vazio(cargo), erro: 'Informe a função ou cargo.' },
        { campo: 'cpf', invalido: vazio(cpf), erro: 'Informe o CPF.' },
        { campo: 'cpf', invalido: !isValidCpf(cpf), erro: 'CPF inválido — confira os dígitos.' },
        { campo: 'cpf', invalido: !!duplicado, erro: `CPF já cadastrado na ficha de ${duplicado?.nome ?? ''}.` },
        {
          // Marcado como mão de obra direta e sem cargo escolhido: gravar assim
          // deixaria a pessoa "direta" sem vínculo nenhum, que é o estado que a
          // marca existe para impedir.
          campo: 'maoDeObra',
          invalido: ehMaoDeObra && cargoModo === 'existente' && vazio(maoDeObraId),
          erro: 'Escolha o cargo no catálogo, ou use o da função.',
        },
        {
          campo: 'salario',
          invalido: salario === null || (salario !== undefined && salario < 0),
          erro: 'Informe um salário válido, ou deixe em branco.',
        },
        // Mesma faixa do check de `funcionarios.encargos_percentual`: o banco
        // recusaria de qualquer forma, e recusar aqui devolve o motivo em vez de
        // um erro cru de constraint.
        {
          campo: 'encargos',
          invalido: encargosNum === null || (encargosNum !== undefined && (encargosNum < 0 || encargosNum > 300)),
          erro: 'Informe um percentual entre 0 e 300, ou deixe em branco.',
        },
        {
          campo: 'jornada',
          invalido: jornadaNum === null || (jornadaNum !== undefined && jornadaNum <= 0),
          erro: 'Informe as horas por mês, ou deixe em branco.',
        },
        ...BENEFICIOS.map(({ campo }, i): Checagem<CampoFicha> => ({
          campo,
          invalido: valores[i] === null || (valores[i] !== undefined && (valores[i] as number) < 0),
          erro: 'Valor mensal em reais, ou em branco.',
        })),
      ])
    ) return;

    setSalvando(true);

    // O cargo no catálogo é resolvido ANTES de a ficha ser gravada: sem o id, o
    // vínculo sairia vazio e a pessoa ficaria marcada como mão de obra direta
    // sem estar ligada a nada. Falhar aqui aborta o salvamento inteiro.
    let vinculo = ehMaoDeObra ? maoDeObraId : '';
    if (ehMaoDeObra && cargoModo === 'criar') {
      try {
        vinculo = await catalogoService.cargoNoCatalogo(cargo.trim());
        onInsumosMudaram();
      } catch (err) {
        setSalvando(false);
        toast.error('Não foi possível criar o cargo no catálogo.', mensagemDeErro(err));
        return;
      }
    }

    const [vt, va, saude, outros] = valores;
    const func: Funcionario = {
      id: f?.id ?? crypto.randomUUID(),
      nome: nome.trim(),
      cargo: cargo.trim(),
      catalogoMaoDeObraId: vinculo || undefined,
      cpf: cpf.trim(),
      telefone: telefone.trim(),
      email: email.trim(),
      dataAdmissao: admissao || new Date().toISOString().split('T')[0],
      status: f?.status ?? 'Ativo',
      observacoes: obs,
      // `?? undefined` só troca de nome o que a validação já barrou: `null` é o
      // "não consegui ler este número", e nenhum deles chega aqui.
      salarioBase: salario ?? undefined,
      centroCustoId: centroCustoId || undefined,
      encargosPercentual: encargosNum ?? undefined,
      regimeEncargos: regime,
      jornadaMensalHoras: jornadaNum ?? undefined,
      beneficios: {
        valeTransporte: vt ?? undefined,
        valeAlimentacao: va ?? undefined,
        planoSaude: saude ?? undefined,
        outros: outros ?? undefined,
      },
      dadosPagamento: {
        pixTipo: pixTipo || undefined,
        pixChave: pixChave.trim() || undefined,
        banco: banco.trim() || undefined,
        agencia: agencia.trim() || undefined,
        conta: conta.trim() || undefined,
        tipoConta: tipoConta || undefined,
        titular: titular.trim() || undefined,
      },
    };

    const salvo = await onSalvar(func);
    setSalvando(false);
    // O hook já mostrou a falha — a janela fica aberta para nada se perder.
    if (salvo) onSalvo(salvo);
  };

  return (
    <ModalForm
      ref={areaRef as React.RefObject<HTMLFormElement>}
      onSubmit={handleSubmit}
      className="space-y-5"
      footer={
        <>
          <Button variante="fantasma" disabled={salvando} onClick={onCancelar}>
            Cancelar
          </Button>
          <Button id="submit-add-employee-btn" type="submit" carregando={salvando}>
            {!salvando && <UserCheck size={14} />}
            {salvando ? 'Salvando…' : f ? 'Salvar ficha' : 'Cadastrar colaborador'}
          </Button>
        </>
      }
    >
      <Bloco id="ficha-bloco-identificacao" titulo="Identificação">
        <Field id="add-func-nome" label="Nome completo" erro={erros.nome} required>
          {(props) => (
            <Input
              {...props}
              autoFocus={!f}
              disabled={salvando}
              placeholder="Ex.: Carlos Roberto Albuquerque"
              value={nome}
              onChange={(e) => { setNome(e.target.value); limparErro('nome'); }}
            />
          )}
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id="add-func-cargo" label="Função / cargo" erro={erros.cargo} required>
            {(props) => (
              <Input
                {...props}
                disabled={salvando}
                list="func-cargo-options"
                placeholder="Ex.: Pedreiro"
                value={cargo}
                onChange={(e) => { setCargo(e.target.value); limparErro('cargo'); }}
              />
            )}
          </Field>
          <datalist id="func-cargo-options">
            {cargosConhecidos.map((c) => <option key={c} value={c} />)}
          </datalist>
          <Field id="add-func-cpf" label="CPF" erro={erros.cpf} required>
            {(props) => (
              <Input
                {...props}
                inputMode="numeric"
                disabled={salvando}
                placeholder="000.000.000-00"
                mono
                value={cpf}
                onChange={(e) => { setCpf(maskCpf(e.target.value)); limparErro('cpf'); }}
              />
            )}
          </Field>
          <Field id="add-func-tel" label="Telefone">
            {(props) => (
              <Input
                {...props}
                type="tel"
                disabled={salvando}
                placeholder="(11) 90000-0000"
                value={telefone}
                onChange={(e) => setTelefone(maskTelefone(e.target.value))}
              />
            )}
          </Field>
          <Field id="add-func-email" label="E-mail">
            {(props) => (
              <Input
                {...props}
                type="email"
                disabled={salvando}
                placeholder="nome@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Field id="add-func-admissao" label="Data de admissão" hint={f ? undefined : 'Em branco, vale a data de hoje.'}>
            {(props) => (
              <Input {...props} type="date" disabled={salvando} value={admissao} onChange={(e) => setAdmissao(e.target.value)} />
            )}
          </Field>
        </div>
      </Bloco>

      {/* A versão anterior escondia este bloco quando o catálogo não tinha
          insumo de mão de obra. O efeito era um beco sem saída: o único jeito
          de criar o cargo era a aba Catálogo. Agora o cargo nasce daqui. */}
      <Bloco
        id="ficha-bloco-mao-de-obra"
        titulo="Mão de obra direta"
        descricao="Liga o colaborador a um cargo do catálogo — é o que faz o custo/hora dele virar preço de orçamento. Administrativo e engenharia ficam de fora."
      >
        <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={ehMaoDeObra}
            disabled={salvando}
            onChange={(e) => { setEhMaoDeObra(e.target.checked); limparErro('maoDeObra'); }}
            className="size-4 accent-blue-600"
          />
          É mão de obra direta
        </label>

        {ehMaoDeObra && (
          <div className="ml-6 space-y-2.5">
            <div role="radiogroup" aria-label="Cargo no catálogo" className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="radio"
                  name="func-cargo-modo"
                  checked={cargoModo === 'criar'}
                  disabled={salvando}
                  onChange={() => { setCargoModo('criar'); limparErro('maoDeObra'); }}
                  className="size-4 accent-blue-600"
                />
                <span>
                  Usar o cargo <strong className="text-slate-900">{cargo.trim() || '(preencha a função acima)'}</strong> (h)
                </span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="radio"
                  name="func-cargo-modo"
                  checked={cargoModo === 'existente'}
                  disabled={salvando || insumosMaoDeObra.length === 0}
                  onChange={() => { setCargoModo('existente'); limparErro('maoDeObra'); }}
                  className="size-4 accent-blue-600"
                />
                <span>
                  Escolher outro do catálogo
                  {insumosMaoDeObra.length === 0 && <span className="text-slate-500"> (nenhum cadastrado ainda)</span>}
                </span>
              </label>
            </div>

            {cargoModo === 'existente' && (
              <Field id="add-func-mao-de-obra" label="Cargo no catálogo" erro={erros.maoDeObra}>
                {(props) => (
                  <Select
                    {...props}
                    disabled={salvando}
                    value={maoDeObraId}
                    onChange={(e) => { setMaoDeObraId(e.target.value); limparErro('maoDeObra'); }}
                  >
                    <option value="">Selecione…</option>
                    {insumosMaoDeObra.map((i) => (
                      <option key={i.id} value={i.id}>{i.descricao} ({i.unidade})</option>
                    ))}
                  </Select>
                )}
              </Field>
            )}

            <p className="text-2xs text-slate-500 leading-relaxed">
              Colaboradores com o mesmo cargo compartilham um insumo só. Havendo mais de um, o orçamento usa o{' '}
              <strong className="text-slate-700">maior</strong> custo/hora entre os ativos.
            </p>
          </div>
        )}
      </Bloco>

      {/* Custo além do salário. Vive na ficha porque varia por pessoa — meio
          período, PJ, quem recebe vale e quem não recebe. O padrão da empresa
          fica em Equipe › Custo da mão de obra; aqui só se escreve o que difere. */}
      <Bloco
        id="ficha-bloco-custo"
        titulo="Remuneração e custo"
        descricao="Em branco, encargos e jornada herdam o padrão da empresa."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id="add-func-salario" label="Salário base mensal" erro={erros.salario} hint="Necessário para a folha e para o custo/hora.">
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                disabled={salvando}
                placeholder="0,00"
                icone={<span className="text-2xs font-bold">R$</span>}
                mono
                value={salarioBase}
                onChange={(e) => { setSalarioBase(e.target.value); limparErro('salario'); }}
              />
            )}
          </Field>
          <Field
            id="add-func-centro-custo"
            label="Centro de custo da folha"
            hint="Em branco, a folha pede um centro na rodada."
          >
            {(props) => (
              <SeletorCentroCusto
                {...props}
                centros={centrosCusto}
                valor={centroCustoId}
                disabled={salvando}
                rotuloVazio="Definir na folha"
                onChange={setCentroCustoId}
              />
            )}
          </Field>
          <Field
            id="add-func-regime"
            label="Regime de encargos"
            hint={parametros?.encargosModo === 'Rubricas' ? 'Escolhe a coluna da tabela de encargos.' : 'Só vale com a tabela de encargos ligada.'}
          >
            {(props) => (
              <Select {...props} disabled={salvando} value={regime} onChange={(e) => setRegime(e.target.value as RegimeEncargos)}>
                <option value="Mensalista">Mensalista</option>
                <option value="Horista">Horista</option>
              </Select>
            )}
          </Field>
          <Field
            id="add-func-encargos"
            label="Encargos sociais"
            erro={erros.encargos}
            hint={
              encargosPadrao != null
                ? `Em branco: ${encargosPadrao.toLocaleString('pt-BR')}% ${parametros?.encargosModo === 'Rubricas' && parametrosRegime != null ? `da tabela (${regime})` : 'da empresa'}.`
                : 'A empresa ainda não definiu um padrão.'
            }
          >
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                disabled={salvando}
                placeholder={encargosPadrao != null ? encargosPadrao.toLocaleString('pt-BR') : 'ex.: 80'}
                sufixo="%"
                mono
                value={encargos}
                onChange={(e) => { setEncargos(e.target.value); limparErro('encargos'); }}
              />
            )}
          </Field>
          <Field
            id="add-func-jornada"
            label="Jornada mensal"
            erro={erros.jornada}
            hint={`Em branco: ${jornadaPadrao.toLocaleString('pt-BR')} h da empresa.`}
          >
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                disabled={salvando}
                placeholder={jornadaPadrao.toLocaleString('pt-BR')}
                sufixo="h"
                mono
                value={jornada}
                onChange={(e) => { setJornada(e.target.value); limparErro('jornada'); }}
              />
            )}
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {BENEFICIOS.map(({ campo, rotulo }) => (
            <Field key={campo} id={`add-func-${campo}`} label={rotulo} erro={erros[campo]}>
              {(props) => (
                <Input
                  {...props}
                  inputMode="decimal"
                  disabled={salvando}
                  placeholder="0,00"
                  icone={<span className="text-2xs font-bold">R$</span>}
                  mono
                  value={beneficios[campo]}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBeneficios((b) => ({ ...b, [campo]: v }));
                    limparErro(campo);
                  }}
                />
              )}
            </Field>
          ))}
        </div>

        {/* Prévia, não campo: mostra o efeito do que está digitado antes de
            salvar, para o vale-refeição não virar surpresa no orçamento. */}
        <div aria-live="polite" className="grid grid-cols-2 gap-3 rounded-xl bg-slate-100 px-4 py-3">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-slate-500">Custo mensal</p>
            <p className="mt-1 font-mono text-lg font-bold text-slate-900">{custoPrevisto ? formatBRL(custoPrevisto.custoMensal) : '—'}</p>
          </div>
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-slate-500">Custo por hora</p>
            <p className="mt-1 font-mono text-lg font-bold text-slate-900">{custoPrevisto ? formatBRL(custoPrevisto.custoHora) : '—'}</p>
          </div>
          <p className="col-span-2 text-2xs text-slate-600">
            {custoPrevisto
              ? `Encargos de ${custoPrevisto.encargosPercentual.toLocaleString('pt-BR')}% e ${custoPrevisto.jornada.toLocaleString('pt-BR')} h/mês.`
              : salarioBase.trim()
                ? 'Sem encargos definidos, não há custo por hora — informe aqui ou no padrão da empresa.'
                : 'Informe o salário para ver o custo.'}
          </p>
        </div>

        {/* A armadilha do regime horista, medida na própria ficha. `salarioBase`
            é MENSAL e a jornada de 220 h já inclui o repouso semanal, então
            somar a coluna horista cobra repouso, feriado e chuva duas vezes. O
            aviso dispara pela GEOMETRIA (jornada alta demais para ser de horas
            efetivas), não pela escolha em si: horista com ~190 h é coerente. */}
        {regime === 'Horista' && (custoPrevisto?.jornada ?? jornadaPadrao) >= 200 && (
          <Aviso tom="atencao" icone={<AlertTriangle size={14} />}>
            <p className="text-2xs leading-relaxed">
              Horista com jornada de {(custoPrevisto?.jornada ?? jornadaPadrao).toLocaleString('pt-BR')} h/mês cobra repouso,
              feriados e dias de chuva duas vezes (cerca de 25% a mais). Se a pessoa é paga por hora trabalhada, informe
              a jornada efetiva (~190 h). Se recebe salário mensal, o regime é <strong>Mensalista</strong>.
            </p>
          </Aviso>
        )}
      </Bloco>

      {/* Dados de pagamento. Ficam na ficha, e não na folha, porque são cadastro
          do colaborador: a folha só os consome na hora de transferir. Tudo
          opcional — quem é pago em espécie não fica travado no cadastro. */}
      <Bloco id="ficha-bloco-pagamento" titulo="Dados para pagamento" descricao="Opcional. A folha usa na hora de transferir.">
        <div className="grid grid-cols-3 gap-3">
          <Field id="add-func-pix-tipo" label="Tipo da chave">
            {(props) => (
              <Select {...props} disabled={salvando} value={pixTipo} onChange={(e) => setPixTipo(e.target.value as TipoChavePix | '')}>
                <option value="">Sem PIX</option>
                {TIPOS_CHAVE_PIX.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            )}
          </Field>
          <Field id="add-func-pix-chave" label="Chave PIX" className="col-span-2">
            {(props) => (
              <Input {...props} disabled={salvando} placeholder={PLACEHOLDER_PIX[pixTipo]} mono value={pixChave} onChange={(e) => setPixChave(e.target.value)} />
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field id="add-func-banco" label="Banco" className="col-span-2">
            {(props) => <Input {...props} disabled={salvando} placeholder="Ex.: 341 - Itaú" value={banco} onChange={(e) => setBanco(e.target.value)} />}
          </Field>
          <Field id="add-func-agencia" label="Agência">
            {(props) => <Input {...props} disabled={salvando} placeholder="0000" mono value={agencia} onChange={(e) => setAgencia(e.target.value)} />}
          </Field>
          <Field id="add-func-conta" label="Conta">
            {(props) => <Input {...props} disabled={salvando} placeholder="00000-0" mono value={conta} onChange={(e) => setConta(e.target.value)} />}
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field id="add-func-tipo-conta" label="Tipo de conta">
            {(props) => (
              <Select {...props} disabled={salvando} value={tipoConta} onChange={(e) => setTipoConta(e.target.value as TipoConta | '')}>
                <option value="">Não informado</option>
                {TIPOS_CONTA.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            )}
          </Field>
          <Field id="add-func-titular" label="Titular da conta" className="col-span-2" hint="Só se não for o próprio colaborador.">
            {(props) => <Input {...props} disabled={salvando} value={titular} onChange={(e) => setTitular(e.target.value)} />}
          </Field>
        </div>
      </Bloco>

      <Bloco id="ficha-bloco-obs" titulo="Observações">
        <Field id="add-func-obs" label="Observações e capacitações" labelOculto>
          {(props) => (
            <Textarea
              {...props}
              disabled={salvando}
              placeholder="Saúde ocupacional, treinamentos, restrições…"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={3}
            />
          )}
        </Field>
        <p className="text-2xs text-slate-500 leading-relaxed">
          Documentos (ASO, NR, contrato) são anexados na ficha depois de salvar, com a validade para o aviso de vencimento.
        </p>
      </Bloco>
    </ModalForm>
  );
}
