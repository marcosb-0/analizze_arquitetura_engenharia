/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Cliente, Proposta, Fornecedor, Projeto, ItemOrcamento, AlteracaoOrcamento, EtapaCronograma, Funcionario, MedicaoObra, Documento, ContaFinanceira, LancamentoFinanceiro } from './types';

export const CLIENTES_INICIAIS: Cliente[] = [
  {
    id: 'cli-1',
    nome: 'Construtora Alfa Ltda',
    cpfCnpj: '12.345.678/0001-90',
    telefone: '(11) 98765-4321',
    email: 'contato@construtoraalfa.com.br',
    endereco: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP',
    responsavel: 'Eng. Ricardo Silveira',
    observacoes: 'Cliente corporativo com recorrência mensal de obras industriais e corporativas.',
    documentos: ['Ficha_Cadastral_Alfa.pdf', 'Contrato_Social_Alfa.pdf']
  },
  {
    id: 'cli-2',
    nome: 'Dra. Sandra Regina Melo',
    cpfCnpj: '234.567.890-12',
    telefone: '(21) 97654-3210',
    email: 'sandra.melo@email.com',
    endereco: 'Rua das Palmeiras, 145 - Condomínio Bella Vista, Niterói - RJ',
    responsavel: 'Sandra Regina Melo',
    observacoes: 'Cliente pessoa física. Construção residencial unifamiliar de alto padrão.',
    documentos: ['RG_Sandra_Melo.pdf', 'Comprovante_Residencia.pdf']
  },
  {
    id: 'cli-3',
    nome: 'Incorporadora Horizonte S/A',
    cpfCnpj: '98.765.432/0001-10',
    telefone: '(31) 3456-7890',
    email: 'novosnegocios@horizonteinc.com',
    endereco: 'Av. do Contorno, 5500 - Savassi, Belo Horizonte - MG',
    responsavel: 'Arq. Mariana Lemos',
    observacoes: 'Incorporadora de grande porte. Foco em loteamentos e edifícios comerciais de grande escala.',
    documentos: ['Apresentacao_Horizonte.pdf']
  }
];

export const PROPOSTAS_INICIAIS: Proposta[] = [
  {
    id: 'prop-1',
    numero: 'PROP-2026-001',
    clienteId: 'cli-1',
    descricao: 'Reforma Comercial de Escritório Corporativo (Área Útil 450m²)',
    valorEstimado: 150000.00,
    prazoExecucao: '90 dias',
    dataValidade: '2026-08-30',
    status: 'Aprovada',
    revisoes: [
      {
        versao: 1,
        data: '2026-02-10',
        valor: 165000.00,
        alteracoes: 'Proposta inicial enviada com estimativa de drywall premium.'
      },
      {
        versao: 2,
        data: '2026-02-18',
        valor: 150000.00,
        alteracoes: 'Revisão com substituição de divisórias acústicas importadas por nacionais de alta qualidade.'
      }
    ]
  },
  {
    id: 'prop-2',
    numero: 'PROP-2026-002',
    clienteId: 'cli-2',
    descricao: 'Construção Completa de Residência Unifamiliar de Alto Padrão (320m²)',
    valorEstimado: 850000.00,
    prazoExecucao: '12 meses',
    dataValidade: '2026-09-15',
    status: 'Aprovada',
    revisoes: [
      {
        versao: 1,
        data: '2026-03-01',
        valor: 850000.00,
        alteracoes: 'Proposta detalhada de fundação, estrutura, instalações e acabamento fino.'
      }
    ]
  },
  {
    id: 'prop-3',
    numero: 'PROP-2026-003',
    clienteId: 'cli-3',
    descricao: 'Execução de Fundações Profundas (Estacas Hélice Contínua e Blocos de Coroamento) Edifício Skyline',
    valorEstimado: 1200000.00,
    prazoExecucao: '60 dias',
    dataValidade: '2026-10-01',
    status: 'Elaboração',
    revisoes: []
  },
  {
    id: 'prop-4',
    numero: 'PROP-2026-004',
    clienteId: 'cli-1',
    descricao: 'Instalação de Sistemas de Prevenção e Combate a Incêndio de Galpão Industrial de 1.200m²',
    valorEstimado: 280000.00,
    prazoExecucao: '45 dias',
    dataValidade: '2026-08-15',
    status: 'Enviada',
    revisoes: [
      {
        versao: 1,
        data: '2026-05-12',
        valor: 280000.00,
        alteracoes: 'Envio da proposta inicial contendo sprinklers, hidrantes e central de alarme.'
      }
    ]
  }
];

export const FORNECEDORES_INICIAIS: Fornecedor[] = [
  {
    id: 'for-1',
    empresa: 'Cimento Forte do Brasil S/A',
    cnpj: '45.678.901/0001-22',
    contato: 'Marcos Rezende (Comercial)',
    telefone: '(11) 3214-5678',
    email: 'vendas@cementoforte.com.br',
    categoria: 'Material',
    documentos: ['Certificado_ISO_9001.pdf', 'Ficha_Tecnica_CP-II.pdf'],
    avaliacao: 5,
    historicoCompras: [
      { id: 'comp-1', data: '2026-03-05', item: '500 sacos de Cimento CP-II', valor: 14500.00, pago: true },
      { id: 'comp-2', data: '2026-04-12', item: '300 sacos de Cimento CP-II e areia lavada', valor: 9800.00, pago: true }
    ]
  },
  {
    id: 'for-2',
    empresa: 'Instaladora Elétrica Centauro',
    cnpj: '12.987.654/0001-33',
    contato: 'Ricardo Wagner (Técnico)',
    telefone: '(11) 99123-4567',
    email: 'contato@eletricacentauro.com.br',
    categoria: 'Serviços Terceirizados',
    documentos: ['Seguro_Responsabilidade_Civil.pdf', 'PPRA_NR10.pdf'],
    avaliacao: 4,
    historicoCompras: [
      { id: 'comp-3', data: '2026-04-20', item: 'Mão de obra passagem de fiação e quadros', valor: 18000.00, pago: false }
    ]
  },
  {
    id: 'for-3',
    empresa: 'Andaimes & Cia Locações',
    cnpj: '33.444.555/0001-66',
    contato: 'Luciana Mello',
    telefone: '(11) 4004-9876',
    email: 'atendimento@andaimesecia.com.br',
    categoria: 'Equipamentos',
    documentos: ['ART_Fabricacao_Andaimes.pdf'],
    avaliacao: 5,
    historicoCompras: [
      { id: 'comp-4', data: '2026-03-10', item: 'Locação de andaimes de fachada (mensal)', valor: 4200.00, pago: true },
      { id: 'comp-5', data: '2026-04-10', item: 'Renovação locação de andaimes', valor: 4200.00, pago: true }
    ]
  },
  {
    id: 'for-4',
    empresa: 'Pedreiras Reunidas do Vale',
    cnpj: '22.333.444/0001-55',
    contato: 'Cláudio Duarte',
    telefone: '(11) 98111-2222',
    email: 'faturamento@pedreirasreunidas.com.br',
    categoria: 'Material',
    documentos: ['Licenca_DNPM_Mineracao.pdf'],
    avaliacao: 3,
    historicoCompras: []
  }
];

export const FUNCIONARIOS_INICIAIS: Funcionario[] = [
  {
    id: 'fun-1',
    nome: 'Eng. Roberto Albuquerque',
    cargo: 'Gerente de Obras / Coordenador',
    cpf: '123.456.789-01',
    telefone: '(11) 99887-7665',
    email: 'roberto.albuquerque@email.com',
    dataAdmissao: '2023-01-15',
    documentos: ['Carteira_CREA.pdf', 'Contrato_Trabalho.pdf', 'Atestado_ASO.pdf'],
    status: 'Ativo',
    observacoes: 'Profissional sênior, com 10 anos de experiência em reformas corporativas e certificação PMI.',
    salarioBase: 9500.00
  },
  {
    id: 'fun-2',
    nome: 'Valdir dos Santos Ramos',
    cargo: 'Mestre de Obras',
    cpf: '987.654.321-09',
    telefone: '(11) 97766-5544',
    email: 'valdir.mestre@email.com',
    dataAdmissao: '2024-05-10',
    documentos: ['Contrato_Trabalho.pdf', 'Ficha_EPI_Assinada.pdf'],
    status: 'Ativo',
    observacoes: 'Especialista em alvenaria estrutural, drywall e coordenação direta de canteiro.',
    salarioBase: 6200.00
  },
  {
    id: 'fun-3',
    nome: 'Carlos Oliveira da Silva',
    cargo: 'Oficial Pedreiro',
    cpf: '456.789.123-55',
    telefone: '(11) 96655-4433',
    email: 'carlos.pedreiro@email.com',
    dataAdmissao: '2025-02-01',
    documentos: ['Contrato_Trabalho.pdf', 'Atestado_ASO.pdf'],
    status: 'Ativo',
    observacoes: 'Excelente desempenho em acabamento fino e assentamento de porcelanatos.',
    salarioBase: 3100.00
  },
  {
    id: 'fun-4',
    nome: 'Marcos Lima de Carvalho',
    cargo: 'Eletricista Instalador',
    cpf: '789.123.456-88',
    telefone: '(11) 95544-3322',
    email: 'marcos.eletricista@email.com',
    dataAdmissao: '2025-06-15',
    documentos: ['Contrato_Trabalho.pdf', 'Certificado_NR10.pdf'],
    status: 'Ativo',
    observacoes: 'Eletricista certificado NR10. Encarregado de infraestrutura elétrica e montagem de painéis.',
    salarioBase: 3400.00
  },
  {
    id: 'fun-5',
    nome: 'Eng. Larissa Fernandes Costa',
    cargo: 'Engenheira Residente Júnior',
    cpf: '321.654.987-12',
    telefone: '(21) 98822-1100',
    email: 'larissa.eng@email.com',
    dataAdmissao: '2025-11-01',
    documentos: ['Carteira_CREA.pdf', 'Contrato_Trabalho.pdf'],
    status: 'Ativo',
    observacoes: 'Auxilia no controle diário de produção, medições e elaboração de relatórios técnicos.',
    salarioBase: 4800.00
  }
];

export const PROJETOS_INICIAIS: Projeto[] = [
  {
    id: 'proj-1',
    nome: 'Reforma Escritório Alfa (Av. Paulista)',
    clienteId: 'cli-1',
    propostaId: 'prop-1',
    responsavelInterno: 'Eng. Roberto Albuquerque',
    enderecoObra: 'Av. Paulista, 1000 - 14º Andar - Bela Vista, São Paulo - SP',
    dataInicio: '2026-03-01',
    dataFim: '2026-06-30',
    situacao: 'Em Execução'
  },
  {
    id: 'proj-2',
    nome: 'Residência Bella Vista (Dra. Sandra)',
    clienteId: 'cli-2',
    propostaId: 'prop-2',
    responsavelInterno: 'Eng. Larissa Fernandes Costa',
    enderecoObra: 'Rua das Palmeiras, 145 - Condomínio Bella Vista, Niterói - RJ',
    dataInicio: '2026-08-01',
    dataFim: '2027-07-31',
    situacao: 'Planejamento'
  }
];

export const ORCAMENTOS_INICIAIS: ItemOrcamento[] = [
  // Projeto 1: Reforma Escritório Alfa (Orcado 150000)
  { id: 'orc-1-1', projetoId: 'proj-1', categoria: 'Materiais', descricao: 'Forro de Drywall, divisórias acústicas, perfis e placas cimentícias', valorOrcado: 45000.00, valorContratado: 43200.00, valorExecutado: 38000.00 },
  { id: 'orc-1-2', projetoId: 'proj-1', categoria: 'Materiais', descricao: 'Cabos elétricos, luminárias LED, tomadas e disjuntores', valorOrcado: 15000.00, valorContratado: 14800.00, valorExecutado: 14500.00 },
  { id: 'orc-1-3', projetoId: 'proj-1', categoria: 'Mão de Obra', descricao: 'Equipe civil (pedreiro, servente, pintor) para alvenaria e revestimento', valorOrcado: 35000.00, valorContratado: 35000.00, valorExecutado: 30000.00 },
  { id: 'orc-1-4', projetoId: 'proj-1', categoria: 'Mão de Obra', descricao: 'Equipe de gesseiros e montadores de drywall', valorOrcado: 25000.00, valorContratado: 25000.00, valorExecutado: 25000.00 },
  { id: 'orc-1-5', projetoId: 'proj-1', categoria: 'Equipamentos', descricao: 'Locação de andaimes de rodízio, marteletes e caçambas de entulho', valorOrcado: 10000.00, valorContratado: 9200.00, valorExecutado: 8500.00 },
  { id: 'orc-1-6', projetoId: 'proj-1', categoria: 'Terceiros', descricao: 'Serviço especializado de climatização e dutos de ar-condicionado', valorOrcado: 12000.00, valorContratado: 11000.00, valorExecutado: 8000.00 },
  { id: 'orc-1-7', projetoId: 'proj-1', categoria: 'Deslocamentos', descricao: 'Combustível, fretes de pequenas entregas e alimentação externa', valorOrcado: 3000.00, valorContratado: 2800.00, valorExecutado: 2400.00 },
  { id: 'orc-1-8', projetoId: 'proj-1', categoria: 'Administração', descricao: 'Segurança do trabalho (EPIs, exames) e taxa administrativa', valorOrcado: 3000.00, valorContratado: 3000.00, valorExecutado: 3000.00 },
  { id: 'orc-1-9', projetoId: 'proj-1', categoria: 'Contingências', descricao: 'Fundo para imprevistos técnicos ou refações', valorOrcado: 2000.00, valorContratado: 0.00, valorExecutado: 0.00 },

  // Projeto 2: Residência Bella Vista (Orcado 850000)
  { id: 'orc-2-1', projetoId: 'proj-2', categoria: 'Materiais', descricao: 'Blocos estruturais, concreto usinado, ferragens armada e cimento', valorOrcado: 250000.00, valorContratado: 0.00, valorExecutado: 0.00 },
  { id: 'orc-2-2', projetoId: 'proj-2', categoria: 'Materiais', descricao: 'Acabamentos nobres, mármores, granitos e louças sanitárias', valorOrcado: 220000.00, valorContratado: 0.00, valorExecutado: 0.00 },
  { id: 'orc-2-3', projetoId: 'proj-2', categoria: 'Mão de Obra', descricao: 'Contratação empreiteiro geral de fundação e superestrutura', valorOrcado: 230000.00, valorContratado: 230000.00, valorExecutado: 0.00 },
  { id: 'orc-2-4', projetoId: 'proj-2', categoria: 'Equipamentos', descricao: 'Locação de escavadeira, betoneira e formas metálicas para laje', valorOrcado: 60000.00, valorContratado: 0.00, valorExecutado: 0.00 },
  { id: 'orc-2-5', projetoId: 'proj-2', categoria: 'Terceiros', descricao: 'Paisagismo externo, piscina de vinil armada e energia fotovoltaica', valorOrcado: 50000.00, valorContratado: 0.00, valorExecutado: 0.00 },
  { id: 'orc-2-6', projetoId: 'proj-2', categoria: 'Deslocamentos', descricao: 'Logística de entrega de materiais pesados e viagens de supervisão', valorOrcado: 15000.00, valorContratado: 0.00, valorExecutado: 0.00 },
  { id: 'orc-2-7', projetoId: 'proj-2', categoria: 'Administração', descricao: 'Projetos complementares estrutural/hidráulica e alvará de construção', valorOrcado: 15000.00, valorContratado: 12000.00, valorExecutado: 0.00 },
  { id: 'orc-2-8', projetoId: 'proj-2', categoria: 'Contingências', descricao: 'Fundo para contingências estruturais', valorOrcado: 10000.00, valorContratado: 0.00, valorExecutado: 0.00 }
];

export const ALTERACOES_ORCAMENTO_INICIAIS: AlteracaoOrcamento[] = [
  {
    id: 'alt-1',
    projetoId: 'proj-1',
    data: '2026-04-05',
    item: 'Instalação elétrica e luminárias',
    descricao: 'Adição de 12 spots LED extras solicitados pelo cliente no salão central.',
    tipo: 'Aumento',
    valor: 1800.00
  },
  {
    id: 'alt-2',
    projetoId: 'proj-1',
    data: '2026-05-10',
    item: 'Acabamentos e drywall',
    descricao: 'Desconto comercial negociado direto com distribuidor de placas de gesso.',
    tipo: 'Redução',
    valor: 1200.00
  }
];

export const ETAPAS_INICIAIS: EtapaCronograma[] = [
  // Projeto 1: Reforma Escritório Alfa
  { id: 'eta-1-1', projetoId: 'proj-1', nome: 'Fundação / Demolição', dataInicio: '2026-03-01', dataFim: '2026-03-20', responsavelId: 'fun-2', percentualExecutado: 100, status: 'Concluído' },
  { id: 'eta-1-2', projetoId: 'proj-1', nome: 'Estrutura / Drywall', dataInicio: '2026-03-21', dataFim: '2026-04-25', responsavelId: 'fun-2', percentualExecutado: 100, status: 'Concluído' },
  { id: 'eta-1-3', projetoId: 'proj-1', nome: 'Instalações Hidro/Elétricas', dataInicio: '2026-04-26', dataFim: '2026-05-25', responsavelId: 'fun-4', percentualExecutado: 85, status: 'Em Andamento' },
  { id: 'eta-1-4', projetoId: 'proj-1', nome: 'Acabamentos e Pintura', dataInicio: '2026-05-26', dataFim: '2026-06-20', responsavelId: 'fun-3', percentualExecutado: 40, status: 'Em Andamento' },
  { id: 'eta-1-5', projetoId: 'proj-1', nome: 'Entrega e Limpeza Pós-Obra', dataInicio: '2026-06-21', dataFim: '2026-06-30', responsavelId: 'fun-1', percentualExecutado: 0, status: 'Não Iniciado' },

  // Projeto 2: Residência Bella Vista
  { id: 'eta-2-1', projetoId: 'proj-2', nome: 'Fundação / Terraplanagem', dataInicio: '2026-08-01', dataFim: '2026-09-30', responsavelId: 'fun-2', percentualExecutado: 0, status: 'Não Iniciado' },
  { id: 'eta-2-2', projetoId: 'proj-2', nome: 'Estrutura / Alvenaria', dataInicio: '2026-10-01', dataFim: '2027-01-31', responsavelId: 'fun-2', percentualExecutado: 0, status: 'Não Iniciado' },
  { id: 'eta-2-3', projetoId: 'proj-2', nome: 'Instalações', dataInicio: '2027-02-01', dataFim: '2027-03-31', responsavelId: 'fun-4', percentualExecutado: 0, status: 'Não Iniciado' },
  { id: 'eta-2-4', projetoId: 'proj-2', nome: 'Acabamentos', dataInicio: '2027-04-01', dataFim: '2027-06-30', responsavelId: 'fun-3', percentualExecutado: 0, status: 'Não Iniciado' },
  { id: 'eta-2-5', projetoId: 'proj-2', nome: 'Entrega / Vistoria', dataInicio: '2027-07-01', dataFim: '2027-07-31', responsavelId: 'fun-1', percentualExecutado: 0, status: 'Não Iniciado' }
];

export const MEDICOES_INICIAIS: MedicaoObra[] = [
  {
    id: 'med-1',
    projetoId: 'proj-1',
    dataMedicao: '2026-03-20',
    etapaId: 'eta-1-1',
    percentualMedido: 100,
    valorMedido: 15000.00,
    fotos: ['demolicao_sala_principal.jpg', 'retirada_entulho.jpg'],
    observacoes: 'Toda a demolição de divisórias antigas e retirada de piso foi executada sem acidentes.'
  },
  {
    id: 'med-2',
    projetoId: 'proj-1',
    dataMedicao: '2026-04-25',
    etapaId: 'eta-1-2',
    percentualMedido: 100,
    valorMedido: 45000.00,
    fotos: ['drywall_concluido.jpg', 'perfis_montados.jpg'],
    observacoes: 'Montagem dos perfis metálicos e fechamento com placas de gesso acartonado acústicas concluído conforme memorial.'
  },
  {
    id: 'med-3',
    projetoId: 'proj-1',
    dataMedicao: '2026-05-20',
    etapaId: 'eta-1-3',
    percentualMedido: 60,
    valorMedido: 22000.00,
    fotos: ['eletrica_fios_concluido.jpg'],
    observacoes: 'Passagem dos circuitos de tomadas e infraestrutura lógica e climatização avançados.'
  }
];

export const DOCUMENTOS_INICIAIS: Documento[] = [
  { id: 'doc-1', nome: 'Contrato_Reforma_Alfa_Assinado.pdf', tipo: 'Contrato', projetoId: 'proj-1', dataCriacao: '2026-02-25', versao: '1.0', tamanho: '4.2 MB' },
  { id: 'doc-2', nome: 'Projeto_Arquitetura_Layout_V3.pdf', tipo: 'Projeto Técnico', projetoId: 'proj-1', dataCriacao: '2026-02-20', versao: '3.0', tamanho: '18.4 MB' },
  { id: 'doc-3', nome: 'ART_Projeto_Execucao_Albuquerque.pdf', tipo: 'ART/RRT', projetoId: 'proj-1', dataCriacao: '2026-02-28', versao: '1.0', tamanho: '1.2 MB' },
  { id: 'doc-4', nome: 'Alvara_Reforma_Paulista_Prefeitura.pdf', tipo: 'Licença', projetoId: 'proj-1', dataCriacao: '2026-02-28', versao: '1.0', tamanho: '2.5 MB' },
  { id: 'doc-5', nome: 'Relatorio_Fotografico_Medicao_02.pdf', tipo: 'Relatório', projetoId: 'proj-1', dataCriacao: '2026-04-25', versao: '1.0', tamanho: '8.1 MB' },
  { id: 'doc-6', nome: 'Nota_Fiscal_Cimento_Fornecedor1.pdf', tipo: 'Nota Fiscal', projetoId: 'proj-1', dataCriacao: '2026-03-05', versao: '1.0', tamanho: '650 KB' },
  { id: 'doc-7', nome: 'Alvara_Construcao_BellaVista_Niteroi.pdf', tipo: 'Licença', projetoId: 'proj-2', dataCriacao: '2026-07-10', versao: '1.0', tamanho: '3.8 MB' }
];

export const CONTAS_INICIAIS: ContaFinanceira[] = [
  {
    id: 'con-1',
    nome: 'Conta Corrente PJ',
    banco: 'Banco do Brasil',
    tipo: 'Corrente',
    saldoInicial: 150000.00,
    saldoAtual: 125000.00
  },
  {
    id: 'con-2',
    nome: 'Conta Investimento',
    banco: 'Itaú Unibanco',
    tipo: 'Corrente',
    saldoInicial: 100000.00,
    saldoAtual: 84300.00
  },
  {
    id: 'con-3',
    nome: 'Caixinha Escritório',
    banco: 'Caixa Interno',
    tipo: 'Caixa Interno',
    saldoInicial: 5000.00,
    saldoAtual: 4500.00
  }
];

export const LANCAMENTOS_INICIAIS: LancamentoFinanceiro[] = [
  {
    id: 'lan-1',
    tipo: 'Receita',
    descricao: 'Aporte Inicial de Capital',
    valor: 100000.00,
    data: '2026-01-10',
    categoria: 'Aporte Capital',
    pago: true,
    contaId: 'con-2'
  },
  {
    id: 'lan-2',
    tipo: 'Receita',
    descricao: 'Faturamento Medição 01 - Reforma Alfa',
    valor: 15000.00,
    data: '2026-03-20',
    categoria: 'Faturamento Obra',
    pago: true,
    contaId: 'con-1',
    projetoId: 'proj-1'
  },
  {
    id: 'lan-3',
    tipo: 'Receita',
    descricao: 'Faturamento Medição 02 - Reforma Alfa',
    valor: 45000.00,
    data: '2026-04-25',
    categoria: 'Faturamento Obra',
    pago: true,
    contaId: 'con-1',
    projetoId: 'proj-1'
  },
  {
    id: 'lan-4',
    tipo: 'Despesa',
    descricao: 'Aluguel de Escritório - Julho',
    valor: 4800.00,
    data: '2026-07-05',
    categoria: 'Aluguel Escritório',
    pago: true,
    contaId: 'con-2'
  },
  {
    id: 'lan-5',
    tipo: 'Despesa',
    descricao: 'Serviços de Utilidades (Água, Energia, Internet)',
    valor: 1200.00,
    data: '2026-07-10',
    categoria: 'Energia/Água/Internet',
    pago: true,
    contaId: 'con-3'
  },
  {
    id: 'lan-6',
    tipo: 'Despesa',
    descricao: 'Salário de Engenheiro Roberto - Junho',
    valor: 9500.00,
    data: '2026-07-05',
    categoria: 'Salários',
    pago: true,
    contaId: 'con-1',
    funcionarioId: 'fun-1'
  },
  {
    id: 'lan-7',
    tipo: 'Despesa',
    descricao: 'Salário de Mestre Valdir - Junho',
    valor: 6200.00,
    data: '2026-07-05',
    categoria: 'Salários',
    pago: true,
    contaId: 'con-1',
    funcionarioId: 'fun-2'
  },
  {
    id: 'lan-8',
    tipo: 'Despesa',
    descricao: 'Compra de Cimento CP-II - Material Obra Alfa',
    valor: 14500.00,
    data: '2026-03-05',
    categoria: 'Fornecedores',
    pago: true,
    contaId: 'con-1',
    fornecedorId: 'for-1',
    projetoId: 'proj-1'
  },
  {
    id: 'lan-9',
    tipo: 'Despesa',
    descricao: 'Licenciamento Prefeitura Niterói - Bella Vista',
    valor: 3800.00,
    data: '2026-07-12',
    categoria: 'Impostos/Taxas',
    pago: true,
    contaId: 'con-2',
    projetoId: 'proj-2'
  },
  {
    id: 'lan-10',
    tipo: 'Despesa',
    descricao: 'Campanha de Tráfego Pago Google Ads',
    valor: 1500.00,
    data: '2026-07-25',
    categoria: 'Marketing/Vendas',
    pago: false,
    contaId: 'con-2'
  }
];
