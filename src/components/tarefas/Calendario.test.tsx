/**
 * @vitest-environment jsdom
 *
 * O calendário — as quatro coisas que só quebram em runtime.
 *
 * 1. **O drop.** Mesma armadilha do quadro: sem `preventDefault` no `dragover` o
 *    navegador RECUSA o drop, o cursor mostra "proibido" e o `onDrop` nunca
 *    dispara. `tsc` não vê, o build não vê, a tela só "não funciona".
 * 2. **A volta para o trilho.** Soltar no "Sem data" TIRA o prazo, e isso é uma
 *    escrita com `undefined` — o valor que um `prazo || null` mal escrito
 *    transformaria em "não mudar nada".
 * 3. **O gating por papel.** `campo` não pode mexer em `prazo` (a trigger
 *    `trg_tarefa_campo_so_status` recusa). Oferecer o arraste a ele produz um
 *    toast de erro para um gesto que a tela nunca deveria ter oferecido.
 * 4. **O dia que o "+" propõe.** O botão da célula existe para não redigitar a
 *    data; se ele chamar `onNova()` sem o dia, ele deixa de ter razão de ser e
 *    nada na tela denuncia isso.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import type { Tarefa } from '../../types';
import { formatarDataBR, formatarISO } from '../../lib/data';
import Calendario from './Calendario';
import { MIME_TAREFA } from './constantes';

const onReagendar = vi.fn();
const onEditar = vi.fn();
const onNova = vi.fn();

/**
 * O calendário abre no MÊS CORRENTE, então as datas do teste têm de ser
 * relativas a hoje — uma data fixa passaria e o arquivo falharia em setembro.
 *
 * E os dois dias escolhidos NÃO PODEM SER HOJE: o painel do dia (a versão
 * estreita da grade) mostra hoje por padrão, e ele existe no DOM mesmo quando o
 * CSS o esconde — o jsdom não aplica media query. Um teste ancorado no dia de
 * hoje encontraria o mesmo título duas vezes e quebraria só nos dias 10 e 20 de
 * cada mês, que é o pior tipo de teste intermitente.
 *
 * Os quatro candidatos existem em todo mês (fevereiro inclusive) e caem em
 * semanas diferentes; no máximo um deles é hoje, então sobram três.
 */
const hoje = new Date();
const diaNoMes = (dia: number) => formatarISO(new Date(hoje.getFullYear(), hoje.getMonth(), dia));
const [primeiro, segundo] = [4, 11, 19, 26].filter((n) => n !== hoje.getDate());
const DIA_A = diaNoMes(primeiro);
const DIA_B = diaNoMes(segundo);

function tarefa(t: Partial<Tarefa> & { id: string }): Tarefa {
  return {
    titulo: `Tarefa ${t.id}`,
    status: 'A fazer',
    prioridade: 'Média',
    criadoPor: 'u-admin',
    createdAt: '2026-08-01T12:00:00Z',
    ...t,
  };
}

/** `DataTransfer` não existe no jsdom — o mesmo dublê de `Quadro.test.tsx`. */
function dataTransferFalso(dados: Record<string, string> = {}) {
  return {
    data: { ...dados },
    types: Object.keys(dados),
    effectAllowed: 'none',
    dropEffect: 'none',
    setData(tipo: string, valor: string) {
      this.data[tipo] = valor;
      this.types = Object.keys(this.data);
    },
    getData(tipo: string) {
      return this.data[tipo] ?? '';
    },
  };
}

function montar(tarefas: Tarefa[], props: Partial<React.ComponentProps<typeof Calendario>> = {}) {
  return render(
    <Calendario
      tarefas={tarefas}
      nomeObra={(id) => (id === 'obra-1' ? 'Residencial Vila Nova' : undefined)}
      podeReagendar
      podeEditar
      onReagendar={onReagendar}
      onEditar={onEditar}
      onNova={onNova}
      {...props}
    />
  );
}

/** A célula, pelo rótulo acessível que ela publica. */
function celula(dia: string) {
  return screen.getByRole('region', { name: new RegExp(`^${formatarDataBR(dia)}`) });
}

const trilho = () => screen.getByRole('region', { name: /^Sem data/ });

beforeEach(() => vi.clearAllMocks());
// `cleanup()` à mão: o vitest deste projeto não roda com `globals`, então o RTL
// não tem onde pendurar o `afterEach` automático — ver Quadro.test.tsx.
afterEach(cleanup);

describe('Calendário — a grade', () => {
  it('põe cada tarefa no dia do prazo dela', () => {
    montar([
      tarefa({ id: 'a', titulo: 'Renovar seguro', prazo: DIA_A }),
      tarefa({ id: 'b', titulo: 'Levar ART', prazo: DIA_B }),
    ]);

    expect(within(celula(DIA_A)).getByText('Renovar seguro')).toBeDefined();
    expect(within(celula(DIA_B)).getByText('Levar ART')).toBeDefined();
  });

  it('manda a tarefa sem prazo para o trilho, não para o lixo', () => {
    montar([tarefa({ id: 'a', titulo: 'Cobrar medição' })]);
    expect(within(trilho()).getByText('Cobrar medição')).toBeDefined();
  });

  /**
   * Sem o corte, um dia com doze tarefas estica a linha inteira da semana e a
   * grade deixa de ser grade. Com ele, o "+N" tem de REVELAR o que ficou de
   * fora — senão o corte vira omissão silenciosa.
   */
  it('corta o dia cheio em três e revela o resto sob demanda', () => {
    montar([1, 2, 3, 4, 5].map((n) => tarefa({ id: `t${n}`, titulo: `Item ${n}`, prazo: DIA_A })));

    // Pela CONTAGEM e não por um título específico: as cinco têm o mesmo prazo
    // e a mesma prioridade, então qual delas fica de fora é decisão da ordenação
    // — e este teste não é sobre ela.
    const dia = celula(DIA_A);
    expect(within(dia).getAllByRole('listitem')).toHaveLength(3);

    fireEvent.click(within(dia).getByRole('button', { name: '+ 2 tarefas' }));
    expect(within(celula(DIA_A)).getAllByRole('listitem')).toHaveLength(5);
  });
});

describe('Calendário — arrastar para outro dia', () => {
  it('soltar num dia grava o prazo daquele dia', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro', prazo: DIA_A })]);

    const dt = dataTransferFalso();
    fireEvent.dragStart(screen.getByText('Renovar seguro').closest('li')!, { dataTransfer: dt });
    expect(dt.getData(MIME_TAREFA)).toBe('a');

    const alvo = celula(DIA_B);
    fireEvent.dragOver(alvo, { dataTransfer: dt });
    fireEvent.drop(alvo, { dataTransfer: dt });

    expect(onReagendar).toHaveBeenCalledWith('a', DIA_B);
  });

  /** Do trilho para a grade: é assim que uma tarefa ganha prazo sem formulário. */
  it('soltar uma tarefa sem data num dia dá prazo a ela', () => {
    montar([tarefa({ id: 'a', titulo: 'Cobrar medição' })]);

    const dt = dataTransferFalso({ [MIME_TAREFA]: 'a' });
    const alvo = celula(DIA_A);
    fireEvent.dragOver(alvo, { dataTransfer: dt });
    fireEvent.drop(alvo, { dataTransfer: dt });

    expect(onReagendar).toHaveBeenCalledWith('a', DIA_A);
  });

  /** E o caminho de volta, que grava `undefined` de propósito. */
  it('soltar no trilho tira o prazo', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro', prazo: DIA_A })]);

    const dt = dataTransferFalso({ [MIME_TAREFA]: 'a' });
    fireEvent.dragOver(trilho(), { dataTransfer: dt });
    fireEvent.drop(trilho(), { dataTransfer: dt });

    expect(onReagendar).toHaveBeenCalledWith('a', undefined);
  });

  /**
   * Sem esta guarda, todo arraste em que a pessoa desiste no meio e solta de
   * volta vira uma escrita no servidor — e um piscar do cartão, por causa do
   * otimista.
   */
  it('soltar no próprio dia não escreve nada', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro', prazo: DIA_A })]);

    const dt = dataTransferFalso({ [MIME_TAREFA]: 'a' });
    fireEvent.dragOver(celula(DIA_A), { dataTransfer: dt });
    fireEvent.drop(celula(DIA_A), { dataTransfer: dt });

    expect(onReagendar).not.toHaveBeenCalled();
  });

  it('soltar uma tarefa já sem data no trilho também não escreve', () => {
    montar([tarefa({ id: 'a', titulo: 'Cobrar medição' })]);

    const dt = dataTransferFalso({ [MIME_TAREFA]: 'a' });
    fireEvent.dragOver(trilho(), { dataTransfer: dt });
    fireEvent.drop(trilho(), { dataTransfer: dt });

    expect(onReagendar).not.toHaveBeenCalled();
  });

  it('ignora um arraste que não carrega tarefa nossa', () => {
    montar([tarefa({ id: 'a', prazo: DIA_A })]);

    const dt = dataTransferFalso({ 'text/plain': 'qualquer coisa' });
    fireEvent.dragOver(celula(DIA_B), { dataTransfer: dt });
    fireEvent.drop(celula(DIA_B), { dataTransfer: dt });

    expect(onReagendar).not.toHaveBeenCalled();
  });
});

describe('Calendário — o que o papel `campo` não pode', () => {
  /**
   * A trigger do banco recusa qualquer coluna que não seja `status` para ele.
   * Um cartão arrastável aqui seria um gesto que sempre volta — o jeito de
   * ensinar que a tela está quebrada.
   */
  it('sem permissão de reagendar, o cartão não é arrastável', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro', prazo: DIA_A })], { podeReagendar: false });
    const item = screen.getByText('Renovar seguro').closest('li')!;
    expect(item.getAttribute('draggable')).toBe('false');
  });

  it('sem permissão de pautar, não há "+" na célula nem botão no cartão', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro', prazo: DIA_A })], { podeEditar: false });
    expect(screen.queryByRole('button', { name: /^Nova tarefa em/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Renovar seguro' })).toBeNull();
  });
});

describe('Calendário — criar e abrir', () => {
  it('o "+" da célula propõe o dia dela', () => {
    montar([]);
    fireEvent.click(screen.getByRole('button', { name: `Nova tarefa em ${formatarDataBR(DIA_A)}` }));
    expect(onNova).toHaveBeenCalledWith(DIA_A);
  });

  it('clicar no cartão abre a tarefa para edição', () => {
    const t = tarefa({ id: 'a', titulo: 'Renovar seguro', prazo: DIA_A });
    montar([t]);
    fireEvent.click(screen.getByRole('button', { name: 'Renovar seguro' }));
    expect(onEditar).toHaveBeenCalledWith(t);
  });
});

describe('Calendário — navegação de mês', () => {
  it('o mês seguinte troca a grade, e "Hoje" traz de volta', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro', prazo: DIA_A })]);

    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(screen.queryByText('Renovar seguro')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(screen.getByText('Renovar seguro')).toBeDefined();
  });
});

describe('Calendário — a grade estreita (abaixo de sm)', () => {
  /**
   * O CSS esconde este caminho no desktop, mas o jsdom não aplica media query —
   * então aqui ele é testável, e é a única leitura do calendário que sobra no
   * telefone: a célula de 46 px virou pontos, e quem diz QUAL é a tarefa é o
   * painel de baixo.
   */
  it('tocar um dia troca o painel que lista as tarefas dele', () => {
    montar([
      tarefa({ id: 'a', titulo: 'Renovar seguro', prazo: DIA_A }),
      tarefa({ id: 'b', titulo: 'Levar ART', prazo: DIA_B }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: `Ver as tarefas de ${formatarDataBR(DIA_A)}` }));
    const painel = screen.getByRole('region', { name: `Tarefas de ${formatarDataBR(DIA_A)}` });
    expect(within(painel).getByText('Renovar seguro')).toBeDefined();
    expect(within(painel).queryByText('Levar ART')).toBeNull();
  });

  it('o painel começa em hoje, e diz quando o dia está livre', () => {
    montar([tarefa({ id: 'a', titulo: 'Renovar seguro', prazo: DIA_A })]);
    const painel = screen.getByRole('region', { name: `Tarefas de ${formatarDataBR(formatarISO(hoje))}` });
    expect(within(painel).getByText('Nada marcado para este dia.')).toBeDefined();
  });
});
