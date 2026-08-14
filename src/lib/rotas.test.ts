import { describe, it, expect } from 'vitest';
import { lerRota, montarRota, ROTA_INICIAL, SECAO_INICIAL } from './rotas';
import { TAB_LABELS } from '../constants/abas';
import { MENU_OBRA } from '../constants/menu';

const OBRA = '3f2b1c8a-9d4e-4a1b-8c6f-0e5d7a2b3c4d';

/** Fora da aba `projetos` a rota não tem obra nem seção. */
const semObra = (aba: string) => ({ aba, projetoId: null, secao: null });

/**
 * O que estes testes protegem é um contrato com o mundo de fora: link salvo,
 * favorito, mensagem no WhatsApp. Diferente do resto do app, uma mudança aqui
 * quebra endereço que já existe na mão de alguém — e o efeito só aparece quando
 * o link é aberto, não quando o código muda.
 */
describe('lerRota', () => {
  it('a raiz é o painel', () => {
    expect(lerRota('/')).toEqual(ROTA_INICIAL);
    expect(lerRota('')).toEqual(ROTA_INICIAL);
  });

  it('traduz o slug para o id interno da aba', () => {
    expect(lerRota('/propostas')).toEqual(semObra('propostas'));
    // O caso que justifica a tabela de slugs existir: o id interno é `empresa`.
    expect(lerRota('/financeiro')).toEqual(semObra('empresa'));
  });

  it('lê a obra aberta no caminho', () => {
    expect(lerRota(`/projetos/${OBRA}`)).toEqual({
      aba: 'projetos',
      projetoId: OBRA,
      secao: SECAO_INICIAL,
    });
  });

  it('caminho desconhecido devolve null, para quem chama escolher o destino', () => {
    expect(lerRota('/empresa')).toBeNull(); // id interno não é endereço público
    expect(lerRota('/nao-existe')).toBeNull();
    expect(lerRota('/admin/tudo')).toBeNull();
  });

  it('id que não é uuid abre a lista, não um console vazio', () => {
    expect(lerRota('/projetos/lixo')).toEqual(semObra('projetos'));
    expect(lerRota('/projetos/')).toEqual(semObra('projetos'));
  });

  it('segmento sobrando em aba sem obra é ignorado, não invalida a rota', () => {
    expect(lerRota('/clientes/qualquer/coisa')).toEqual(semObra('clientes'));
  });

  it('tolera barra final, barra dupla e caixa alta', () => {
    expect(lerRota('/catalogo/')).toEqual(semObra('catalogo'));
    expect(lerRota('//catalogo//')).toEqual(semObra('catalogo'));
    expect(lerRota('/CATALOGO')).toEqual(semObra('catalogo'));
    expect(lerRota(`/projetos/${OBRA.toUpperCase()}`)).toEqual({
      aba: 'projetos',
      projetoId: OBRA.toUpperCase(),
      secao: SECAO_INICIAL,
    });
  });
});

/**
 * O terceiro nível: a seção do console da obra.
 *
 * Ela vivia num `useState` do `ProjetoConsole` — o cronograma de uma obra não
 * tinha endereço, recarregar largava o usuário em "Geral" e o botão voltar saía
 * da obra inteira.
 */
describe('a seção da obra no caminho', () => {
  it('lê a seção do terceiro segmento', () => {
    expect(lerRota(`/projetos/${OBRA}/cronograma`)).toEqual({
      aba: 'projetos',
      projetoId: OBRA,
      secao: 'cronograma',
    });
    expect(lerRota(`/projetos/${OBRA}/MEDICOES/`)).toEqual({
      aba: 'projetos',
      projetoId: OBRA,
      secao: 'medicoes',
    });
  });

  /**
   * O link que já existe na mão de alguém continua valendo. Este é o teste que
   * justifica `geral` não aparecer na URL: o wizard de conversão, os "próximos
   * passos" do painel e todo favorito salvo produzem `/projetos/<id>`.
   */
  it('obra sem seção no caminho abre em Geral, e volta ao mesmo caminho', () => {
    expect(lerRota(`/projetos/${OBRA}`)?.secao).toBe(SECAO_INICIAL);
    expect(montarRota('projetos', OBRA, SECAO_INICIAL)).toBe(`/projetos/${OBRA}`);
    expect(montarRota('projetos', OBRA, null)).toBe(`/projetos/${OBRA}`);
  });

  /**
   * Seção desconhecida não derruba no painel: o usuário pediu uma OBRA que
   * existe, e trocar "não achei essa seção" por "não achei a obra" é pior.
   */
  it('seção desconhecida cai em Geral em vez de invalidar a rota', () => {
    expect(lerRota(`/projetos/${OBRA}/inventada`)).toEqual({
      aba: 'projetos',
      projetoId: OBRA,
      secao: SECAO_INICIAL,
    });
  });

  it('seção sem obra não existe — nem no caminho, nem no estado', () => {
    expect(montarRota('projetos', null, 'cronograma')).toBe('/projetos');
    expect(lerRota('/projetos/lixo/cronograma')?.secao).toBeNull();
  });
});

describe('montarRota', () => {
  it('o painel é a raiz — e é para lá que vai o que não tem endereço', () => {
    expect(montarRota('dashboard', null)).toBe('/');
    expect(montarRota('aba-que-nao-existe', null)).toBe('/');
  });

  it('a obra só entra na URL da aba que tem obra', () => {
    expect(montarRota('projetos', OBRA)).toBe(`/projetos/${OBRA}`);
    expect(montarRota('projetos', null)).toBe('/projetos');
    // O atalho da sidebar mantém a obra selecionada ao trocar de aba; a URL da
    // outra aba não a carrega, senão `/financeiro/<uuid>` viraria um endereço
    // que `lerRota` descarta e que não significa nada.
    expect(montarRota('empresa', OBRA)).toBe('/financeiro');
    expect(montarRota('empresa', OBRA, 'cronograma')).toBe('/financeiro');
  });

  it('seção desconhecida não inventa segmento', () => {
    expect(montarRota('projetos', OBRA, 'nao-existe')).toBe(`/projetos/${OBRA}`);
  });
});

describe('as duas funções são inversas', () => {
  /**
   * Sem esta varredura, uma aba nova entra em `TAB_LABELS` e some da URL: a
   * navegação continua funcionando, o endereço fica em `/`, e o defeito só
   * aparece quando alguém tenta compartilhar a tela nova.
   */
  it('toda aba conhecida tem endereço, e o endereço volta para ela', () => {
    for (const aba of Object.keys(TAB_LABELS)) {
      const caminho = montarRota(aba, null);
      expect(lerRota(caminho), `aba ${aba} sem endereço de volta`).toEqual(semObra(aba));
    }
  });

  it('o caminho da obra volta com a obra', () => {
    expect(lerRota(montarRota('projetos', OBRA))).toEqual({
      aba: 'projetos',
      projetoId: OBRA,
      secao: SECAO_INICIAL,
    });
  });

  /** O mesmo risco do teste acima, um nível abaixo: seção nova no menu da obra
   *  que não ganha slug some da URL sem nenhum sintoma até alguém compartilhar. */
  it('toda seção do menu da obra tem endereço, e o endereço volta para ela', () => {
    for (const { aba: secao } of MENU_OBRA) {
      const caminho = montarRota('projetos', OBRA, secao);
      expect(lerRota(caminho), `seção ${secao} sem endereço de volta`).toEqual({
        aba: 'projetos',
        projetoId: OBRA,
        secao,
      });
    }
  });
});
