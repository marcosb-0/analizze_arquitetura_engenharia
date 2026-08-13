import { useState } from 'react';
import { AlertCircle, ArrowRight, FileText, Lock, Printer, Trash2 } from 'lucide-react';
import {
  ClausulaContrato, Cliente, Contrato, EmpresaConfig, ModeloTexto, Projeto, StatusContrato,
} from '../../types';
import { formatarDataBR, hojeISO } from '../../lib/data';
import { formatarPrazoCurto } from '../../lib/prazo';
import { formatBRL } from '../../lib/preco';
import PainelClausulas from './PainelClausulas';
import DocumentoContrato from './DocumentoContrato';
import { Button, Card, CardHeader, IconButton, Select } from '../ui';

interface Props {
  contrato: Contrato;
  clausulas: ClausulaContrato[];
  modelos: ModeloTexto[];
  cliente?: Cliente;
  /** A obra que executa este contrato, quando já existe. */
  obra?: Projeto;
  timbre: EmpresaConfig;
  carregando: boolean;
  onMudarStatus: (id: string, status: StatusContrato, dataAssinatura?: string) => Promise<boolean>;
  onEditar: () => void;
  onExcluir: () => void;
  onAbrirObra: (projetoId: string) => void;
  clausulasProps: Omit<
    Parameters<typeof PainelClausulas>[0],
    'contratoId' | 'clausulas' | 'modelos' | 'carregando' | 'bloqueado' | 'motivoBloqueio'
  >;
}

/**
 * Coluna direita: tudo sobre o contrato selecionado.
 *
 * A regra de bloqueio é mais dura que a da proposta, e por um motivo diferente:
 * proposta aprovada congela para o valor de venda não mudar retroativamente;
 * contrato ASSINADO congela porque é o documento que as duas partes têm em
 * mãos. Editar a cláusula quarta de um contrato já assinado produziria duas
 * versões da mesma obrigação — a do papel e a do sistema.
 */
export default function DetalheContrato({
  contrato,
  clausulas,
  modelos,
  cliente,
  obra,
  timbre,
  carregando,
  onMudarStatus,
  onEditar,
  onExcluir,
  onAbrirObra,
  clausulasProps,
}: Props) {
  const [mostrarDocumento, setMostrarDocumento] = useState(false);

  const bloqueado = contrato.status === 'Assinado' || contrato.status === 'Encerrado';
  const motivoBloqueio = bloqueado
    ? contrato.status === 'Assinado'
      ? 'Contrato assinado. As cláusulas ficam congeladas como registro do que foi acordado — para alterá-las, volte a situação para Minuta.'
      : 'Contrato encerrado. O texto fica preservado como histórico.'
    : undefined;

  const semClausulas = contrato.qtdClausulas === 0;

  const mudarStatus = async (novo: StatusContrato) => {
    if (novo === 'Assinado' && !contrato.dataAssinatura) {
      // A data é a prova da assinatura, e o banco roda em UTC — quem sabe o dia
      // local é o cliente. Ver o mesmo cuidado em fn_registrar_revisao_proposta.
      await onMudarStatus(contrato.id, novo, hojeISO());
      return;
    }
    await onMudarStatus(contrato.id, novo);
  };

  return (
    <div id="contrato-detail-view" className="space-y-4 text-left">
      <Card className="space-y-3">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <span className="font-mono text-blue-600">{contrato.numero}</span>
              {contrato.propostaNumero && (
                <span className="text-2xs font-normal text-slate-500">
                  originado da proposta {contrato.propostaNumero}
                </span>
              )}
            </span>
          }
          description={cliente?.nome ?? 'Cliente não encontrado'}
          actions={
            <>
              <Select
                value={contrato.status}
                aria-label="Situação do contrato"
                onChange={(e) => void mudarStatus(e.target.value as StatusContrato)}
                tamanho="sm"
                largura="automatica"
              >
                <option value="Minuta">Minuta</option>
                <option value="Emitido">Emitido</option>
                <option value="Assinado">Assinado</option>
                <option value="Encerrado">Encerrado</option>
              </Select>
              <Button variante="secundario" tamanho="sm" onClick={onEditar}>
                Editar
              </Button>
              <IconButton rotulo="Excluir este contrato" tom="perigo" onClick={onExcluir}>
                <Trash2 size={13} />
              </IconButton>
            </>
          }
        />

        <p className="text-xs text-slate-700 leading-relaxed">{contrato.objeto}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1 border-t border-slate-100">
          {[
            ['Valor', formatBRL(contrato.valorTotal)],
            ['Prazo', formatarPrazoCurto(contrato.prazoExecucaoDias)],
            ['Início', contrato.dataInicio ? formatarDataBR(contrato.dataInicio) : '—'],
            [
              'Assinatura',
              contrato.dataAssinatura ? formatarDataBR(contrato.dataAssinatura) : '—',
            ],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} className="pt-2">
              <p className="text-2xs font-bold text-slate-500 uppercase tracking-wider">{rotulo}</p>
              <p className="text-xs font-semibold text-slate-900 mt-0.5">{valor}</p>
            </div>
          ))}
        </div>
      </Card>

      {bloqueado && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5">
          <Lock size={14} className="text-slate-500 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600 leading-relaxed">{motivoBloqueio}</p>
        </div>
      )}

      {semClausulas && !carregando && !bloqueado && (
        <div className="p-3 bg-blue-50/50 border border-blue-200/70 rounded-lg flex items-start gap-2.5">
          <AlertCircle size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 leading-relaxed">
            Este contrato ainda não tem cláusulas com texto — o documento sairia só com o
            quadro-resumo.
          </p>
        </div>
      )}

      {obra && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            Executado pela obra <strong className="text-slate-900">{obra.nome}</strong>.
          </p>
          <button
            onClick={() => onAbrirObra(obra.id)}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1.5 rounded transition active:scale-95 flex items-center gap-1 shrink-0"
          >
            Abrir obra <ArrowRight size={12} />
          </button>
        </div>
      )}

      <PainelClausulas
        contratoId={contrato.id}
        clausulas={clausulas}
        modelos={modelos}
        carregando={carregando}
        bloqueado={bloqueado}
        motivoBloqueio={motivoBloqueio}
        {...clausulasProps}
      />

      <div className="p-3 bg-slate-900 text-slate-100 rounded-lg flex items-center justify-between text-left shadow-md">
        <div>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Printer size={14} className="text-blue-400" />
            <span>Emissão do Contrato</span>
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            Monta o instrumento para assinatura. Na janela de impressão, escolha "Salvar como PDF"
            para gerar o arquivo.
          </p>
        </div>
        <Button
          id="generate-contract-pdf-btn"
          onClick={() => setMostrarDocumento(true)}
          className="shrink-0"
        >
          <FileText size={13} />
          <span>Visualizar contrato</span>
        </Button>
      </div>

      <DocumentoContrato
        aberto={mostrarDocumento}
        onFechar={() => setMostrarDocumento(false)}
        contrato={contrato}
        clausulas={clausulas}
        cliente={cliente}
        timbre={timbre}
      />
    </div>
  );
}
