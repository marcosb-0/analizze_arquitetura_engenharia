import { describe, it, expect } from 'vitest';
import { lerRota, montarRota, ROTA_INICIAL } from './rotas';
import { TAB_LABELS } from '../constants/abas';

const OBRA = '3f2b1c8a-9d4e-4a1b-8c6f-0e5d7a2b3c4d';

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
    expect(lerRota('/propostas')).toEqual({ aba: 'propostas', projetoId: null });
    // O caso que justifica a tabela de slugs existir: o id interno é `empresa`.
    expect(lerRota('/financeiro')).toEqual({ aba: 'empresa', projetoId: null });
  });

  it('lê a obra aberta no caminho', () => {
    expect(lerRota(`/projetos/${OBRA}`)).toEqual({ aba: 'projetos', projetoId: OBRA });
  });

  it('caminho desconhecido devolve null, para quem chama escolher o destino', () => {
    expect(lerRota('/empresa')).toBeNull(); // id interno não é endereço público
    expect(lerRota('/nao-existe')).toBeNull();
    expect(lerRota('/admin/tudo')).toBeNull();
  });

  it('id que não é uuid abre a lista, não um console vazio', () => {
    expect(lerRota('/projetos/lixo')).toEqual({ aba: 'projetos', projetoId: null });
    expect(lerRota('/projetos/')).toEqual({ aba: 'projetos', projetoId: null });
  });

  it('segmento sobrando em aba sem obra é ignorado, não invalida a rota', () => {
    expect(lerRota('/clientes/qualquer/coisa')).toEqual({ aba: 'clientes', projetoId: null });
  });

  it('tolera barra final, barra dupla e caixa alta', () => {
    expect(lerRota('/catalogo/')).toEqual({ aba: 'catalogo', projetoId: null });
    expect(lerRota('//catalogo//')).toEqual({ aba: 'catalogo', projetoId: null });
    expect(lerRota('/CATALOGO')).toEqual({ aba: 'catalogo', projetoId: null });
    expect(lerRota(`/projetos/${OBRA.toUpperCase()}`)).toEqual({
      aba: 'projetos',
      projetoId: OBRA.toUpperCase(),
    });
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
      expect(lerRota(caminho), `aba ${aba} sem endereço de volta`).toEqual({
        aba,
        projetoId: null,
      });
    }
  });

  it('o caminho da obra volta com a obra', () => {
    expect(lerRota(montarRota('projetos', OBRA))).toEqual({ aba: 'projetos', projetoId: OBRA });
  });
});
