import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Clock, Save } from 'lucide-react';
import { EmpresaConfig, RubricaEncargo } from '../../types';
import { totaisEncargos } from '../../lib/encargos';
import { formatBRL } from '../../lib/preco';
import { useValidacao } from '../../hooks/useValidacao';
import { useFeedback } from '../FeedbackContext';
import { Aviso, Button, Field, Input, Secao } from '../ui';
import TabelaEncargos from './TabelaEncargos';
import {
  aplicarRascunho,
  formatoPct,
  rascunhoDe,
  rascunhoInvalido,
  rubricasAlteradas,
  rubricasPendentes,
  type Nova,
  type Rascunho,
  type Rascunhos,
} from './rascunhoEncargos';

/**
 * Os parâmetros da empresa que convertem salário em custo por hora: de onde
 * vêm os encargos (percentual direto ou tabela de rubricas), a tabela em si e
 * a jornada.
 *
 * Moravam em Configurações, com DOIS botões Salvar — um para o modo e outro
 * para a tabela — sobre uma decisão só. O guarda do banco recusa ligar
 * 'Rubricas' com a tabela incompleta e recusa deixar a tabela incompleta com
 * 'Rubricas' ligado, então a ordem de gravação importa e não estava escrita em
 * lugar nenhum. Aqui um Salvar grava as duas, na ordem que o guarda aceita.
 *
 * Escreve `empresa_config` inteira (é upsert da linha única) a partir do objeto
 * carregado: os campos de timbre voltam como vieram.
 */

type CampoParametro = 'encargos' | 'jornadaMensal' | 'jornadaDiaria';

interface Props {
  empresa: EmpresaConfig | null;
  rubricas: RubricaEncargo[];
  editavel: boolean;
  onSaveEmpresa: (config: Omit<EmpresaConfig, 'id' | 'logoUrl'>) => Promise<EmpresaConfig | null>;
  onSaveRubricas: (rubricas: RubricaEncargo[]) => Promise<boolean>;
  onCreate: (nova: Nova) => Promise<boolean>;
  onDelete: (codigo: string) => Promise<boolean>;
}

const numeroOuNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

export default function ParametrosMaoDeObra({ empresa, rubricas, editavel, onSaveEmpresa, onSaveRubricas, onCreate, onDelete }: Props) {
  const { toast } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<CampoParametro>();

  // Texto e não número: vazio (não configurado, desliga a fonte Folha) é
  // diferente de "0" (encargo zero, resposta válida).
  const [encargos, setEncargos] = useState('');
  const [modo, setModo] = useState<'Direto' | 'Rubricas'>('Direto');
  const [jornadaMensal, setJornadaMensal] = useState('220');
  const [jornadaDiaria, setJornadaDiaria] = useState('8');
  const [rascunho, setRascunho] = useState<Rascunhos>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!empresa) return;
    setEncargos(empresa.encargosSociaisPercentual == null ? '' : String(empresa.encargosSociaisPercentual));
    setModo(empresa.encargosModo);
    setJornadaMensal(String(empresa.jornadaMensalHoras));
    setJornadaDiaria(String(empresa.jornadaDiariaHoras));
  }, [empresa]);
  useEffect(() => { setRascunho(rascunhoDe(rubricas)); }, [rubricas]);

  const editadas = useMemo(() => aplicarRascunho(rubricas, rascunho), [rubricas, rascunho]);
  const totais = useMemo(() => totaisEncargos(editadas), [editadas]);
  const pendentes = rubricasPendentes(editadas);
  const tabelaInvalida = rascunhoInvalido(rubricas, rascunho);
  const tabelaAlterada = rubricasAlteradas(rubricas, editadas);
  // Mesma pergunta do guarda do banco: há rubrica ativa E os dois totais existem.
  const tabelaCompleta = editadas.some((r) => r.ativo) && totais.total.horista != null && totais.total.mensalista != null;

  const encargosNum = numeroOuNull(encargos);
  const jornadaMensalNum = Number(jornadaMensal.replace(',', '.'));
  const jornadaDiariaNum = Number(jornadaDiaria.replace(',', '.'));
  const parametrosAlterados = !!empresa && (
    modo !== empresa.encargosModo ||
    encargosNum !== empresa.encargosSociaisPercentual ||
    jornadaMensalNum !== empresa.jornadaMensalHoras ||
    jornadaDiariaNum !== empresa.jornadaDiariaHoras
  );
  const alterado = tabelaAlterada || parametrosAlterados;

  /** Por que o Salvar está travado, dito na tela e não num erro do guarda. */
  const bloqueio =
    !empresa ? 'Preencha a identidade da empresa em Configurações antes dos parâmetros de custo.'
    : tabelaInvalida ? 'Corrija os campos destacados na tabela.'
    : modo === 'Rubricas' && !tabelaCompleta
      ? `Para usar a tabela, complete ${pendentes.length === 1 ? 'a rubrica pendente' : `as ${pendentes.length} rubricas pendentes`} — ou marque "não incide", ou desative.`
    : null;

  const editarRubrica = (codigo: string, patch: Partial<Rascunho>) =>
    setRascunho((prev) => ({ ...prev, [codigo]: { ...prev[codigo], ...patch } }));

  const salvarEmpresa = async () => {
    if (!empresa || !parametrosAlterados) return true;
    const { id, logoUrl, ...resto } = empresa;
    return !!(await onSaveEmpresa({
      ...resto,
      encargosSociaisPercentual: encargosNum,
      encargosModo: modo,
      jornadaMensalHoras: jornadaMensalNum,
      jornadaDiariaHoras: jornadaDiariaNum,
    }));
  };
  const salvarTabela = async () => (tabelaAlterada ? onSaveRubricas(editadas) : true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alterado || bloqueio || salvando) return;
    if (!validar([
      {
        campo: 'encargos',
        invalido: encargosNum !== null && (!Number.isFinite(encargosNum) || encargosNum < 0 || encargosNum > 300),
        erro: 'Informe um percentual entre 0 e 300, ou deixe em branco.',
      },
      {
        campo: 'jornadaMensal',
        invalido: !Number.isFinite(jornadaMensalNum) || jornadaMensalNum <= 0,
        erro: 'Precisa ser maior que zero — o padrão CLT é 220 horas.',
      },
      {
        campo: 'jornadaDiaria',
        invalido: !Number.isFinite(jornadaDiariaNum) || jornadaDiariaNum <= 0 || jornadaDiariaNum > 24,
        erro: 'Informe um valor entre 0 e 24 horas.',
      },
    ])) return;
    setSalvando(true);
    // A ordem que o guarda aceita: ligando 'Rubricas', a tabela completa vai
    // antes; voltando a 'Direto', o modo vai antes e só então a tabela pode
    // ficar incompleta.
    const ok = modo === 'Rubricas'
      ? (await salvarTabela()) && (await salvarEmpresa())
      : (await salvarEmpresa()) && (await salvarTabela());
    setSalvando(false);
    if (ok) toast.success('Parâmetros de custo salvos.', 'O custo-hora das fichas e do catálogo já foi recalculado.');
  };

  const campo = (id: string, label: string, valor: string, setter: (v: string) => void, nome: CampoParametro, sufixo: string, placeholder: string, hint?: string) => (
    <Field id={id} label={label} erro={erros[nome]} hint={hint}>
      {(props) => (
        <Input {...props} type="text" inputMode="decimal" value={valor} placeholder={placeholder} sufixo={sufixo} mono fundo="suave"
          disabled={!editavel} onChange={(e) => { setter(e.target.value); limparErro(nome); }} />
      )}
    </Field>
  );

  return (
    <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={handleSubmit} className="space-y-6">
      <Secao
        icone={<Calculator size={15} />}
        titulo="Encargos sociais"
        descricao="O percentual que incide sobre o salário da ficha. Cada ficha pode sobrescrever o que for diferente."
      >
        <div className="space-y-5">
          <fieldset className="space-y-2" disabled={!editavel}>
            <legend className="text-xs font-semibold text-slate-700">De onde vêm os encargos</legend>
            <div className="flex flex-wrap gap-6">
              {(
                [
                  ['Rubricas', 'Tabela de rubricas', 'Os grupos A, B, C e D, pela coluna do regime de cada ficha.'],
                  ['Direto', 'Percentual direto', 'Um número só, para todas as fichas.'],
                ] as const
              ).map(([valor, rotulo, ajuda]) => (
                <label key={valor} className="flex items-start gap-2 text-xs text-slate-700 max-w-xs">
                  <input type="radio" name="encargos-modo" value={valor} checked={modo === valor}
                    onChange={() => setModo(valor)} className="mt-0.5 size-4 accent-blue-600" />
                  <span>
                    <span className="font-semibold">{rotulo}</span>
                    <span className="block text-slate-600">{ajuda}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {modo === 'Rubricas' ? (
            <>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                {(['horista', 'mensalista'] as const).map((regime) => (
                  <div key={regime} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-slate-600">{regime === 'horista' ? 'Horista' : 'Mensalista'}</p>
                    <p className="font-mono text-base font-bold text-slate-900">{formatoPct(totais.total[regime])}</p>
                  </div>
                ))}
              </div>
              <TabelaEncargos
                rubricas={rubricas}
                editadas={editadas}
                rascunho={rascunho}
                totais={totais}
                pendentes={pendentes}
                alterado={alterado}
                editavel={editavel}
                onEditar={editarRubrica}
                onCreate={onCreate}
                onDelete={onDelete}
              />
            </>
          ) : (
            <div className="space-y-3">
              <div className="max-w-xs">
                {campo('par-encargos', 'Encargos sociais', encargos, setEncargos, 'encargos', '%', 'ex.: 80')}
              </div>
              {encargosNum === null ? (
                <Aviso tom="atencao" icone={<AlertTriangle size={14} />}>
                  <p className="text-2xs font-semibold leading-relaxed">
                    Sem encargos, o custo da mão de obra continua vindo do preço de cadastro do catálogo mesmo para
                    cargos com funcionário contratado. Em branco não vira zero de propósito: mão de obra sem encargos
                    parece bem mais barata do que é, e o número entraria em toda composição e proposta.
                  </p>
                </Aviso>
              ) : (
                <p className="text-2xs text-slate-600 leading-relaxed">
                  Um salário de <strong className="text-slate-800">R$ 3.000</strong> sai a{' '}
                  <strong className="font-mono text-slate-800">
                    {formatBRL((3000 * (1 + encargosNum / 100)) / (jornadaMensalNum || 220))}
                  </strong>{' '}
                  por hora, antes dos benefícios da ficha.
                </p>
              )}
              {tabelaCompleta && (
                <p className="text-2xs text-slate-600">
                  A tabela de rubricas está completa ({formatoPct(totais.total.horista)} horista ·{' '}
                  {formatoPct(totais.total.mensalista)} mensalista) e fica guardada para quando voltar a usá-la.
                </p>
              )}
            </div>
          )}
        </div>
      </Secao>

      <Secao
        icone={<Clock size={15} />}
        titulo="Jornada"
        descricao="A mensal divide o custo do mês em horas; a diária converte horas de composição em dias de cronograma."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
          {campo('par-jornada-mes', 'Jornada mensal', jornadaMensal, setJornadaMensal, 'jornadaMensal', 'h', '220', 'Padrão CLT: 220 h, repouso semanal incluído.')}
          {campo('par-jornada-dia', 'Jornada diária', jornadaDiaria, setJornadaDiaria, 'jornadaDiaria', 'h', '8')}
        </div>
      </Secao>

      {editavel && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {bloqueio ? <span role="alert" className="text-2xs text-rose-600 max-w-prose text-right">{bloqueio}</span>
            : alterado && <span className="text-2xs text-slate-600">Alterações não salvas</span>}
          <Button type="submit" carregando={salvando} disabled={!alterado || !!bloqueio}>
            <Save size={14} /><span>Salvar parâmetros de custo</span>
          </Button>
        </div>
      )}
    </form>
  );
}
