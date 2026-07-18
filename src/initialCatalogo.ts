import { InsumoCatalogo } from './types';

export const CATALOGO_INICIAL: InsumoCatalogo[] = [
  {
    id: 'ins-1',
    codigoSINAPI: '462230100',
    descricao: 'Cimento Portland CP-II — 50kg',
    unidade: 'saco',
    precoReferencia: 29.00,
    categoria: 'Material',
    tipo: 'SINAPI',
    fornecedorPadraoId: 'for-1',
    ativo: true,
    dataAtualizacaoPreco: '2026-07-15',
    composicao: 'Cimento Portland composto com escória de alto-forno ou material pozolânico, ideal para rebocos e fundações.',
    aplicacao: 'Fundações, pilares, vigas, rebocos e contrapisos em geral.',
    historicoPrecos: [
      { data: '2026-05-10', preco: 27.50, fonte: 'SINAPI' },
      { data: '2026-06-12', preco: 28.20, fonte: 'SINAPI' },
      { data: '2026-07-15', preco: 29.00, fonte: 'SINAPI' }
    ],
    cotacoesFornecedores: [
      { fornecedorId: 'for-1', precoUnitario: 28.00, dataCotacao: '2026-07-15', prazoEntregaDias: 2, observacao: 'Preço promocional para compras acima de 100 sacos.' },
      { fornecedorId: 'for-4', precoUnitario: 30.50, dataCotacao: '2026-07-14', prazoEntregaDias: 3, observacao: 'Entrega CIF na obra.' },
      { fornecedorId: 'for-3', precoUnitario: 32.00, dataCotacao: '2026-07-10', prazoEntregaDias: 5, observacao: 'Faturamento mínimo R$ 1.500.' }
    ]
  },
  {
    id: 'ins-2',
    codigoSINAPI: '462210100',
    descricao: 'Areia média lavada para concreto e argamassa',
    unidade: 'm³',
    precoReferencia: 85.00,
    categoria: 'Material',
    tipo: 'SINAPI',
    fornecedorPadraoId: 'for-4',
    ativo: true,
    dataAtualizacaoPreco: '2026-07-15',
    composicao: 'Areia média quartzosa obtida de leito de rio, lavada e peneirada.',
    aplicacao: 'Preparação de argamassas de assentamento e concretos.',
    historicoPrecos: [
      { data: '2026-05-10', preco: 82.00, fonte: 'SINAPI' },
      { data: '2026-07-15', preco: 85.00, fonte: 'SINAPI' }
    ],
    cotacoesFornecedores: [
      { fornecedorId: 'for-4', precoUnitario: 82.00, dataCotacao: '2026-07-15', prazoEntregaDias: 1, observacao: 'Preço especial direto da pedreira.' },
      { fornecedorId: 'for-1', precoUnitario: 89.00, dataCotacao: '2026-07-13', prazoEntregaDias: 2, observacao: 'Sob consulta de frete.' }
    ]
  },
  {
    id: 'ins-3',
    codigoSINAPI: '462210300',
    descricao: 'Brita número 1 para concretagem',
    unidade: 'm³',
    precoReferencia: 95.00,
    categoria: 'Material',
    tipo: 'SINAPI',
    fornecedorPadraoId: 'for-4',
    ativo: true,
    dataAtualizacaoPreco: '2026-07-15',
    composicao: 'Pedra britada tipo 1 obtida por britagem de rochas basálticas ou graníticas.',
    aplicacao: 'Concretos estruturais para lajes, vigas e pilares.',
    historicoPrecos: [
      { data: '2026-05-10', preco: 93.00, fonte: 'SINAPI' },
      { data: '2026-07-15', preco: 95.00, fonte: 'SINAPI' }
    ],
    cotacoesFornecedores: [
      { fornecedorId: 'for-4', precoUnitario: 92.00, dataCotacao: '2026-07-15', prazoEntregaDias: 1, observacao: 'Direto da pedreira.' },
      { fornecedorId: 'for-3', precoUnitario: 99.00, dataCotacao: '2026-07-12', prazoEntregaDias: 3 }
    ]
  },
  {
    id: 'ins-4',
    codigoSINAPI: '462100100',
    descricao: 'Tijolo cerâmico de 8 furos 9x19x19cm',
    unidade: 'mil',
    precoReferencia: 850.00,
    categoria: 'Material',
    tipo: 'SINAPI',
    ativo: true,
    dataAtualizacaoPreco: '2026-07-15',
    composicao: 'Tijolo cerâmico para vedação, cozido e com furos prismáticos.',
    aplicacao: 'Alvenaria de vedação residencial ou comercial.',
    historicoPrecos: [
      { data: '2026-05-10', preco: 830.00, fonte: 'SINAPI' },
      { data: '2026-07-15', preco: 850.00, fonte: 'SINAPI' }
    ]
  },
  {
    id: 'ins-5',
    codigoSINAPI: '462400100',
    descricao: 'Vergalhão CA-50 Ø 10mm (3/8") em barras de 12m',
    unidade: 'kg',
    precoReferencia: 8.50,
    categoria: 'Material',
    tipo: 'SINAPI',
    ativo: true,
    dataAtualizacaoPreco: '2026-07-15',
    composicao: 'Aço carbono de alta resistência, superfície nervurada para melhor aderência ao concreto.',
    aplicacao: 'Armadura para concreto armado (sapatas, vigas, pilares e lajes).',
    historicoPrecos: [
      { data: '2026-05-10', preco: 8.90, fonte: 'SINAPI' },
      { data: '2026-06-12', preco: 8.70, fonte: 'SINAPI' },
      { data: '2026-07-15', preco: 8.50, fonte: 'SINAPI' }
    ]
  },
  {
    id: 'ins-6',
    codigoSINAPI: '462500100',
    descricao: 'Concreto usinado bombeável fck 25 MPa',
    unidade: 'm³',
    precoReferencia: 410.00,
    categoria: 'Material',
    tipo: 'SINAPI',
    ativo: true,
    dataAtualizacaoPreco: '2026-07-15',
    composicao: 'Concreto dosado em central, fck de 25 Megapascals, com brita 1 e abatimento ideal para bombeamento.',
    aplicacao: 'Lajes maciças, vigas de coroamento e fundações residenciais.',
    historicoPrecos: [
      { data: '2026-05-10', preco: 395.00, fonte: 'SINAPI' },
      { data: '2026-07-15', preco: 410.00, fonte: 'SINAPI' }
    ]
  },
  {
    id: 'ins-7',
    codigoSINAPI: '462700200',
    descricao: 'Tinta acrílica premium fosca branca — lata 18L',
    unidade: 'galão',
    precoReferencia: 220.00,
    categoria: 'Material',
    tipo: 'SINAPI',
    ativo: true,
    dataAtualizacaoPreco: '2026-07-15',
    composicao: 'Tinta acrílica de alta cobertura, lavável e com aditivos anti-mofo.',
    aplicacao: 'Pintura interna e externa de alvenarias ou gesso.',
    historicoPrecos: [
      { data: '2026-05-10', preco: 215.00, fonte: 'SINAPI' },
      { data: '2026-07-15', preco: 220.00, fonte: 'SINAPI' }
    ]
  },
  {
    id: 'ins-8',
    codigoSINAPI: '462800100',
    descricao: 'Porcelanato retificado 60x60cm padrão cinza acetinado',
    unidade: 'm²',
    precoReferencia: 85.00,
    categoria: 'Material',
    tipo: 'SINAPI',
    ativo: true,
    dataAtualizacaoPreco: '2026-07-15',
    composicao: 'Placa cerâmica de porcelanato de alta resistência e junta de assentamento de 2mm.',
    aplicacao: 'Revestimento de pisos internos em salas, escritórios e banheiros.',
    historicoPrecos: [
      { data: '2026-05-10', preco: 89.00, fonte: 'SINAPI' },
      { data: '2026-07-15', preco: 85.00, fonte: 'SINAPI' }
    ]
  },
  {
    id: 'ins-9',
    codigoSINAPI: '463400100',
    descricao: 'Mão de obra qualificada de pedreiro oficial',
    unidade: 'h',
    precoReferencia: 35.00,
    categoria: 'Mão de Obra',
    tipo: 'SINAPI',
    ativo: true,
    dataAtualizacaoPreco: '2026-07-15',
    composicao: 'Hora técnica de pedreiro com encargos sociais integrados na convenção coletiva.',
    aplicacao: 'Serviços gerais de alvenaria, assentamento de tijolos, rebocos e acabamentos.',
    historicoPrecos: [
      { data: '2026-05-10', preco: 34.00, fonte: 'SINAPI' },
      { data: '2026-07-15', preco: 35.00, fonte: 'SINAPI' }
    ]
  },
  {
    id: 'ins-10',
    codigoSINAPI: '463400200',
    descricao: 'Mão de obra auxiliar de servente',
    unidade: 'h',
    precoReferencia: 22.00,
    categoria: 'Mão de Obra',
    tipo: 'SINAPI',
    ativo: true,
    dataAtualizacaoPreco: '2026-07-15',
    composicao: 'Hora de ajudante geral canteiro de obras com encargos sociais inclusos.',
    aplicacao: 'Auxílio aos pedreiros, transporte de materiais, limpeza e mistura de massas.',
    historicoPrecos: [
      { data: '2026-05-10', preco: 21.50, fonte: 'SINAPI' },
      { data: '2026-07-15', preco: 22.00, fonte: 'SINAPI' }
    ]
  },
  {
    id: 'ins-11',
    codigoSINAPI: '463500200',
    descricao: 'Locação diária de betoneira elétrica de 400 Litros',
    unidade: 'dia',
    precoReferencia: 85.00,
    categoria: 'Equipamento',
    tipo: 'SINAPI',
    fornecedorPadraoId: 'for-3',
    ativo: true,
    dataAtualizacaoPreco: '2026-07-15',
    composicao: 'Equipamento mecânico para homogeneização de concretos e argamassas, motor trifásico.',
    aplicacao: 'Produção local de massa para assentamento ou contrapiso.',
    historicoPrecos: [
      { data: '2026-05-10', preco: 80.00, fonte: 'SINAPI' },
      { data: '2026-07-15', preco: 85.00, fonte: 'SINAPI' }
    ]
  },
  {
    id: 'ins-prop-1',
    descricao: 'Pacote de Parede em Drywall Acústico Completo (Gesso + Perfis + Lã)',
    unidade: 'm²',
    precoReferencia: 95.00,
    categoria: 'Serviço',
    tipo: 'Proprio',
    fornecedorPadraoId: 'for-2',
    ativo: true,
    dataAtualizacaoPreco: '2026-07-15',
    composicao: 'Kit fechamento interno drywall composto por estrutura metálica de 70mm, guias, montantes, placas de gesso acartonado e lã de vidro mineral acústica.',
    aplicacao: 'Divisões de salas de escritório e ambientes corporativos ou comerciais.',
    historicoPrecos: [
      { data: '2026-05-10', preco: 98.00, fonte: 'Manual' },
      { data: '2026-07-15', preco: 95.00, fonte: 'Manual' }
    ]
  },
  {
    id: 'ins-prop-2',
    descricao: 'Instalação Elétrica Básica Monofásica Residencial (Material + Mão de obra)',
    unidade: 'Serviço',
    precoReferencia: 3500.00,
    categoria: 'Serviço',
    tipo: 'Proprio',
    fornecedorPadraoId: 'for-2',
    ativo: true,
    dataAtualizacaoPreco: '2026-07-15',
    composicao: 'Pacote composto por fiação flexível antichama de 2.5mm² e 4.0mm², caixa de distribuição de embutir, disjuntores DIN termomagnéticos e tomadas simples.',
    aplicacao: 'Quadro elétrico básico de distribuição de kitnetes e casas de pequeno porte.',
    historicoPrecos: [
      { data: '2026-05-10', preco: 3400.00, fonte: 'Manual' },
      { data: '2026-07-15', preco: 3500.00, fonte: 'Manual' }
    ]
  }
];
