import React, { useState } from 'react';
import { CentroCusto, NovoCentroCusto, PatchCentroCusto } from '../../types';
import { Button, Field, Input, Modal, Select } from '../ui';
import { useFeedback } from '../FeedbackContext';
import { useValidacao } from '../../hooks/useValidacao';
import { naoEscolhido, vazio } from '../../lib/validacao';

interface ModalCentroCustoProps {
  open: boolean;
  /** Centro em edição; `null` = o diálogo está criando. */
  centro: CentroCusto | null;
  /** A árvore inteira — alimenta o seletor de pai. */
  centros: CentroCusto[];
  onClose: () => void;
  onAdd: (centro: NovoCentroCusto) => Promise<boolean>;
  onUpdate: (id: string, patch: PatchCentroCusto) => Promise<boolean>;
}

const NATUREZAS: CentroCusto['natureza'][] = ['Administrativo', 'Operacional', 'Comercial', 'Obra'];

/**
 * O corpo do `Modal` só é montado enquanto ele está aberto, então o estado
 * nasce do centro recebido a cada abertura — sem helper de limpeza.
 */
export default function ModalCentroCusto({ open, centro, ...resto }: ModalCentroCustoProps) {
  return (
    <Modal
      open={open}
      onClose={resto.onClose}
      title={centro ? `Editar centro — ${centro.codigo} ${centro.nome}` : 'Novo centro de custo'}
      description={
        centro
          ? undefined
          : 'Um centro sintético apenas agrupa; só o analítico recebe lançamento.'
      }
      size="md"
    >
      <FormularioCentro centro={centro} {...resto} />
    </Modal>
  );
}

function FormularioCentro({
  centro,
  centros,
  onClose,
  onAdd,
  onUpdate,
}: Omit<ModalCentroCustoProps, 'open'>) {
  const { toast } = useFeedback();
  const { erros, validar, limparErro, areaRef } =
    useValidacao<'codigo' | 'nome' | 'pai'>();

  const [codigo, setCodigo] = useState(centro?.codigo ?? '');
  const [nome, setNome] = useState(centro?.nome ?? '');
  const [paiId, setPaiId] = useState(centro?.paiId ?? '');
  const [tipo, setTipo] = useState<CentroCusto['tipo']>(centro?.tipo ?? 'Analitico');
  const [natureza, setNatureza] = useState<CentroCusto['natureza']>(
    centro?.natureza ?? 'Administrativo'
  );

  /**
   * O centro de uma obra é estrutura gerada: código, tipo, natureza e posição
   * na árvore vêm dela, e a trigger do banco recusa alterá-los. A tela mostra
   * em vez de deixar tentar.
   */
  const daObra = !!centro?.projetoId;

  /**
   * Um centro só pode nascer sob um agrupador, e nunca sob si mesmo. Os
   * descendentes seguem na lista porque quem os filtraria aqui teria de
   * recalcular a árvore — o banco já recusa o ciclo, com mensagem própria.
   */
  const paisPossiveis = centros.filter(
    (c) => c.tipo === 'Sintetico' && c.ativo && c.id !== centro?.id
  );

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !validar([
        { campo: 'codigo', invalido: vazio(codigo), erro: 'Dê um código ao centro.' },
        { campo: 'nome', invalido: vazio(nome), erro: 'Dê um nome ao centro.' },
        { campo: 'pai', invalido: naoEscolhido(paiId), erro: 'Escolha onde o centro entra na árvore.' },
      ])
    ) return;

    if (centro) {
      const patch = daObra
        ? { nome: nome.trim() }
        : { codigo: codigo.trim(), nome: nome.trim(), paiId, tipo, natureza };
      if (!(await onUpdate(centro.id, patch))) return;
      onClose();
      toast.success('Centro de custo atualizado.');
      return;
    }

    if (!(await onAdd({ codigo: codigo.trim(), nome: nome.trim(), paiId, tipo, natureza }))) return;
    onClose();
    toast.success('Centro de custo criado.');
  };

  return (
    <form
      ref={areaRef as React.RefObject<HTMLFormElement>}
      onSubmit={salvar}
      className="p-5 space-y-4 overflow-y-auto"
    >
      {daObra && (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
          Este centro nasceu junto com a obra <strong>{centro?.projetoNome}</strong>. Código, tipo,
          natureza e posição na árvore acompanham a obra — aqui só o nome é editável.
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
        <Field label="Código" erro={erros.codigo} required>
          {(props) => (
            <Input
              {...props}
              type="text"
              placeholder="1150"
              value={codigo}
              disabled={daObra}
              onChange={(e) => { setCodigo(e.target.value); limparErro('codigo'); }}
              mono
              fundo="suave"
            />
          )}
        </Field>

        <Field label="Nome" erro={erros.nome} required>
          {(props) => (
            <Input
              {...props}
              type="text"
              placeholder="Ex: Manutenção predial"
              value={nome}
              onChange={(e) => { setNome(e.target.value); limparErro('nome'); }}
              fundo="suave"
            />
          )}
        </Field>
      </div>

      <Field label="Entra sob" erro={erros.pai} required>
        {(props) => (
          <Select
            {...props}
            value={paiId}
            disabled={daObra}
            onChange={(e) => { setPaiId(e.target.value); limparErro('pai'); }}
            fundo="suave"
            className="font-medium"
          >
            <option value="">Escolha o agrupador</option>
            {paisPossiveis.map((c) => (
              <option key={c.id} value={c.id}>
                {'   '.repeat(Math.max(0, c.nivel - 1))}
                {c.codigo} {c.nome}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Tipo"
          hint={tipo === 'Sintetico' ? 'Só agrupa: não recebe lançamento.' : 'Recebe lançamento.'}
        >
          {(props) => (
            <Select
              {...props}
              value={tipo}
              disabled={daObra}
              onChange={(e) => setTipo(e.target.value as CentroCusto['tipo'])}
              fundo="suave"
              className="font-medium"
            >
              <option value="Analitico">Analítico</option>
              <option value="Sintetico">Sintético (agrupador)</option>
            </Select>
          )}
        </Field>

        <Field label="Natureza">
          {(props) => (
            <Select
              {...props}
              value={natureza}
              disabled={daObra}
              onChange={(e) => setNatureza(e.target.value as CentroCusto['natureza'])}
              fundo="suave"
              className="font-medium"
            >
              {NATUREZAS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Button type="submit" bloco className="mt-2">
        {centro ? 'Salvar alterações' : 'Criar centro de custo'}
      </Button>
    </form>
  );
}
