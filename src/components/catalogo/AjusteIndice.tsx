import { useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { LinhaComposicaoExpandida } from '../../types';
import {
  coeficienteParaProdutividade,
  desvioDoIndice,
  produtividadeParaCoeficiente,
} from '../../lib/composicao';
import Spinner from '../Spinner';
import { Button, Field, IconButton, Input } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';

/**
 * Ajuste do índice pela produtividade da equipe.
 *
 * O SINAPI publica produtividade média nacional: 1,939 h de pedreiro por m² de
 * alvenaria. Uma equipe própria, conhecida e medida, rende diferente disso — e
 * quem orça precisa poder dizer o número da SUA obra sem perder de vista o de
 * referência. `coeficiente_referencia` guarda o publicado; `coeficiente` é o
 * que entra na conta.
 *
 * OS DOIS CAMPOS SÃO O MESMO NÚMERO visto de lados opostos. O SINAPI fala em
 * h/unidade; quem está em obra pensa "meu pedreiro faz 4 m² por dia". Digitar
 * num campo preenche o outro pela jornada diária. Isso é aritmética sobre
 * entradas do usuário e um parâmetro que ele configurou — não é uma segunda
 * cópia de número do servidor.
 */
interface AjusteIndiceProps {
  linha: LinhaComposicaoExpandida;
  unidadeTopo: string;
  jornadaDiaria: number;
  onSalvar: (coeficiente: number, motivo: string) => Promise<boolean>;
  onCancelar: () => void;
}

const numero = (v: number, casas = 4) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Aceita vírgula: o usuário digita em português, o `Number` só entende ponto. */
const paraNumero = (t: string) => Number(t.trim().replace(',', '.'));

export default function AjusteIndice({
  linha,
  unidadeTopo,
  jornadaDiaria,
  onSalvar,
  onCancelar,
}: AjusteIndiceProps) {
  const { erros, validar, limparErro, areaRef } = useValidacao<'coeficiente'>();
  const [coefTexto, setCoefTexto] = useState(String(linha.coeficiente));
  const [prodTexto, setProdTexto] = useState(() => {
    const p = coeficienteParaProdutividade(linha.coeficiente, jornadaDiaria);
    return p == null ? '' : p.toFixed(4);
  });
  const [motivo, setMotivo] = useState(linha.observacao ?? '');
  const [salvando, setSalvando] = useState(false);

  const coefAtual = paraNumero(coefTexto);
  const desvio = desvioDoIndice(coefAtual, linha.coeficienteReferencia);
  const prodReferencia =
    linha.coeficienteReferencia != null
      ? coeficienteParaProdutividade(linha.coeficienteReferencia, jornadaDiaria)
      : null;

  // Um campo escreve no outro, mas só o campo TOCADO é reformatado — reescrever
  // os dois a cada tecla apagaria o que a pessoa está digitando no meio.
  const digitarCoeficiente = (texto: string) => {
    setCoefTexto(texto);
    const prod = coeficienteParaProdutividade(paraNumero(texto), jornadaDiaria);
    setProdTexto(prod == null ? '' : prod.toFixed(4));
  };

  const digitarProdutividade = (texto: string) => {
    setProdTexto(texto);
    const coef = produtividadeParaCoeficiente(paraNumero(texto), jornadaDiaria);
    setCoefTexto(coef == null ? '' : coef.toFixed(6));
  };

  const voltarAoSinapi = () => {
    if (linha.coeficienteReferencia == null) return;
    digitarCoeficiente(String(linha.coeficienteReferencia));
    setMotivo('');
  };

  const salvar = async () => {
    if (
      !validar([
        {
          campo: 'coeficiente',
          invalido: !Number.isFinite(coefAtual) || coefAtual <= 0,
          erro: 'Informe um coeficiente maior que zero — é a quantidade por unidade da composição.',
        },
      ])
    ) return;
    setSalvando(true);
    const ok = await onSalvar(coefAtual, motivo.trim());
    setSalvando(false);
    if (ok) onCancelar();
  };

  return (
    <div className="bg-white border border-indigo-200 rounded-lg p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-2xs font-bold text-indigo-800 uppercase tracking-wider block">
            Ajustar índice
          </span>
          <span className="text-xs font-bold text-slate-800 truncate block" title={linha.descricao}>
            {linha.descricao}
          </span>
        </div>
        <IconButton rotulo="Fechar ajuste" onClick={onCancelar}>
          <X size={13} />
        </IconButton>
      </div>

      {linha.coeficienteReferencia != null ? (
        <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5">
          <span className="text-2xs text-slate-600">
            SINAPI:{' '}
            <strong className="font-mono text-slate-800">
              {numero(linha.coeficienteReferencia)} {linha.unidade}/{unidadeTopo}
            </strong>
            {prodReferencia != null && (
              <span className="text-slate-500"> · {numero(prodReferencia, 2)} {unidadeTopo}/dia</span>
            )}
          </span>
          <button
            type="button"
            onClick={voltarAoSinapi}
            className="text-2xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-indigo-50 transition shrink-0"
          >
            <RotateCcw size={10} /> Voltar ao SINAPI
          </button>
        </div>
      ) : (
        <p className="text-2xs text-slate-500 leading-relaxed">
          Índice próprio — não veio do SINAPI, então não há referência para comparar.
        </p>
      )}

      <div ref={areaRef as React.RefObject<HTMLDivElement>} className="grid grid-cols-2 gap-3">
        <Field className="space-y-1" id="ajuste-coef" label={<>Coeficiente ({linha.unidade}/{unidadeTopo})</>} erro={erros.coeficiente} required>
          {(props) => (
            <Input
              {...props}
              type="text"
              inputMode="decimal"
              autoFocus
              value={coefTexto}
              onChange={(e) => { digitarCoeficiente(e.target.value); limparErro('coeficiente'); }} mono
            />
          )}
        </Field>
        <Field className="space-y-1" id="ajuste-prod" label={<>Produtividade ({unidadeTopo}/dia)</>}>
          {(props) => (
            <Input
              {...props}
              type="text"
              inputMode="decimal"
              value={prodTexto}
              onChange={(e) => digitarProdutividade(e.target.value)} mono
            />
          )}
        </Field>
      </div>

      <p className="text-2xs text-slate-500 leading-relaxed">
        Os dois campos são o mesmo número: jornada de {numero(jornadaDiaria, 1)} h/dia por pessoa,
        configurada em Financeiro › Custo da mão de obra própria.
      </p>

      <Field className="space-y-1" id="ajuste-motivo" label="Motivo do ajuste">
        {(props) => (
          <Input
            {...props}
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="equipe própria, medido em out/26"
          />
        )}
      </Field>

      {desvio != null && Math.abs(desvio) > 0.01 && (
        <div className={`text-2xs font-bold rounded-md px-2.5 py-1.5 border ${
          desvio < 0
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          {desvio < 0
            ? `${numero(Math.abs(desvio), 1)}% abaixo do SINAPI — sua equipe rende mais.`
            : `${numero(desvio, 1)}% acima do SINAPI — esta atividade consome mais hora aqui.`}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variante="secundario" onClick={onCancelar}>Cancelar</Button>
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? <Spinner size={13} /> : <Check size={13} />}
          <span>Salvar índice</span>
        </Button>
      </div>
    </div>
  );
}
