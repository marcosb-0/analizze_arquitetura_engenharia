import { EmpresaConfig } from '../types';

/**
 * Rede de segurança para o papel timbrado.
 *
 * A identidade da empresa passou a viver em `empresa_config` — linha única no
 * banco, editável na aba Empresa. Antes eram constantes aqui, opcionalmente
 * sobrescritas por variáveis de build: trocar um telefone no documento
 * entregue ao cliente exigia deploy, e logotipo não existia.
 *
 * O que sobrou é só o fallback usado enquanto a configuração não chegou do
 * servidor, ou num ambiente que rodou as migrations sem a semente. Este não é
 * mais o lugar de manter dados reais — o que estiver no banco sempre vence.
 */
export const EMPRESA_FALLBACK: EmpresaConfig = {
  id: '',
  razaoSocial: 'Sua empresa',
  cnpj: '',
  crea: '',
  endereco: '',
  telefone: '',
  email: '',
  site: '',
  responsavelTecnico: '',
  // Encargos nulos no fallback é o comportamento seguro: um ambiente sem
  // configuração não deve fazer a mão de obra própria parecer barata.
  encargosSociaisPercentual: null,
  jornadaMensalHoras: 220,
  jornadaDiariaHoras: 8,
  logoPath: '',
  logoUrl: '',
};
