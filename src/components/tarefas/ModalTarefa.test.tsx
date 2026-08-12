/**
 * @vitest-environment jsdom
 *
 * A TAREFA QUE SOME — o contrato entre o padrão do formulário e o filtro da lista.
 *
 * `minhasDoDia` mostra só o que tem VOCÊ como responsável (`lib/tarefas.ts`), e
 * o formulário nascia em "Sem responsável". As duas decisões são defensáveis
 * sozinhas e, juntas, produziam o defeito relatado: criar uma tarefa pelo quadro
 * e ela não aparecer na sua lista. Ia para o quadro, sumia da pauta, e nada na
 * tela explicava.
 *
 * O teste é do PAR, não de cada lado: ele cria a tarefa com o padrão do
 * formulário e pergunta se ela cai na pauta de quem criou. Testar só o `useState`
 * deixaria passar a próxima mudança em `minhasDoDia`, e testar só o filtro
 * deixaria passar a volta do padrão vazio — que é exatamente o que aconteceu.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ModalTarefa from './ModalTarefa';
import { FeedbackProvider } from '../FeedbackContext';
import { minhasDoDia } from '../../lib/tarefas';
import type { DadosTarefa } from '../../services/tarefasService';
import type { PessoaAtribuivel, Projeto, Tarefa } from '../../types';

const EU = 'perfil-de-quem-cria';
const OUTRO = 'perfil-de-outra-pessoa';

const PESSOAS: PessoaAtribuivel[] = [
  { id: EU, nome: 'Quem Cria', role: 'admin' },
  { id: OUTRO, nome: 'Outra Pessoa', role: 'gestao' },
];
const PROJETOS: Projeto[] = [];

/** Monta o diálogo de CRIAÇÃO e devolve o que ele mandaria salvar. */
function criarPeloFormulario(titulo: string, meuId?: string): DadosTarefa {
  const onSalvar = vi.fn<(d: DadosTarefa) => Promise<boolean>>().mockResolvedValue(true);
  render(
    <FeedbackProvider>
      <ModalTarefa
        open
        tarefa={null}
        pessoas={PESSOAS}
        projetos={PROJETOS}
        meuId={meuId}
        onClose={() => {}}
        onSalvar={onSalvar}
      />
    </FeedbackProvider>
  );

  fireEvent.change(screen.getByLabelText(/o que precisa ser feito/i), { target: { value: titulo } });
  fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

  expect(onSalvar).toHaveBeenCalledTimes(1);
  return onSalvar.mock.calls[0][0];
}

/** A tarefa como o banco a devolveria depois do insert. */
function comoGravada(dados: DadosTarefa): Tarefa {
  return {
    id: 'tarefa-nova',
    titulo: dados.titulo,
    descricao: dados.descricao,
    status: dados.status,
    prioridade: dados.prioridade,
    responsavelId: dados.responsavelId,
    projetoId: dados.projetoId,
    prazo: dados.prazo,
    criadoPor: EU,
    createdAt: '2026-08-12T10:00:00Z',
  } as Tarefa;
}

afterEach(cleanup);

describe('tarefa criada aparece na pauta de quem criou', () => {
  it('o formulário nasce com quem está criando como responsável', () => {
    const dados = criarPeloFormulario('Comprar cimento', EU);
    expect(dados.responsavelId).toBe(EU);
  });

  it('e por isso ela cai em "minhas do dia" — que é o defeito relatado', () => {
    const dados = criarPeloFormulario('Comprar cimento', EU);
    const blocos = minhasDoDia([comoGravada(dados)], EU);
    const total = Object.values(blocos).reduce((n, b) => n + b.length, 0);
    expect(total, 'a tarefa recém-criada sumiu da pauta de quem a criou').toBe(1);
  });

  it('delegar continua possível — o padrão não trava a escolha', () => {
    const onSalvar = vi.fn<(d: DadosTarefa) => Promise<boolean>>().mockResolvedValue(true);
    render(
      <FeedbackProvider>
        <ModalTarefa
          open
          tarefa={null}
          pessoas={PESSOAS}
          projetos={PROJETOS}
          meuId={EU}
          onClose={() => {}}
          onSalvar={onSalvar}
        />
      </FeedbackProvider>
    );
    fireEvent.change(screen.getByLabelText(/o que precisa ser feito/i), { target: { value: 'Delegada' } });
    fireEvent.change(screen.getByLabelText(/respons/i), { target: { value: OUTRO } });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    expect(onSalvar.mock.calls[0][0].responsavelId).toBe(OUTRO);
  });

  it('sem sessão o campo fica vazio em vez de inventar um dono', () => {
    const dados = criarPeloFormulario('Sem sessão', undefined);
    expect(dados.responsavelId).toBeUndefined();
  });

  it('EDIÇÃO preserva o dono gravado — o padrão vale só na criação', () => {
    const onSalvar = vi.fn<(d: DadosTarefa) => Promise<boolean>>().mockResolvedValue(true);
    const existente = {
      id: 't1',
      titulo: 'Já existia',
      status: 'A fazer',
      prioridade: 'Média',
      responsavelId: OUTRO,
      criadoPor: OUTRO,
      createdAt: '2026-08-01T10:00:00Z',
    } as Tarefa;

    render(
      <FeedbackProvider>
        <ModalTarefa
          open
          tarefa={existente}
          pessoas={PESSOAS}
          projetos={PROJETOS}
          meuId={EU}
          onClose={() => {}}
          onSalvar={onSalvar}
        />
      </FeedbackProvider>
    );
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    expect(
      onSalvar.mock.calls[0][0].responsavelId,
      'editar uma tarefa de outra pessoa a roubou para quem abriu o diálogo'
    ).toBe(OUTRO);
  });
});
