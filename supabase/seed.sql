-- Seed data ported from src/initialData.ts / src/initialCatalogo.ts, adapted to
-- the new relational schema. IDs are fixed literal UUIDs (not gen_random_uuid())
-- so cross-table references can be written directly and the seed is reproducible.
--
-- NOTE on etapa_orcamento_vinculo: the old prototype linked etapa->orcamento by
-- guessing from the etapa's name string (the ETAPA_CATEGORIA_MAP bug this schema
-- fixes). That map is gone, so the vinculo weights below are illustrative starting
-- data for the demo project, not a byte-for-byte reproduction of old (arbitrary)
-- numbers — editable by a 'gestao' user in the UI like any other vinculo.
--
-- NOTE on documento_versoes.storage_path: seed rows point at placeholder paths
-- with no real object behind them (no real file was ever uploaded for this demo
-- data) — download will 404 until a real file is uploaded through the app.

-- ============================================================
-- FUNCIONARIOS
-- ============================================================
insert into public.funcionarios (id, nome, cargo, cpf, telefone, email, data_admissao, status, observacoes, salario_base, documentos) values
('00000000-0000-0000-0004-000000000001', 'Eng. Roberto Albuquerque', 'Gerente de Obras / Coordenador', '123.456.789-01', '(11) 99887-7665', 'roberto.albuquerque@email.com', '2023-01-15', 'Ativo', 'Profissional sênior, com 10 anos de experiência em reformas corporativas e certificação PMI.', 9500.00, array['Carteira_CREA.pdf','Contrato_Trabalho.pdf','Atestado_ASO.pdf']),
('00000000-0000-0000-0004-000000000002', 'Valdir dos Santos Ramos', 'Mestre de Obras', '987.654.321-09', '(11) 97766-5544', 'valdir.mestre@email.com', '2024-05-10', 'Ativo', 'Especialista em alvenaria estrutural, drywall e coordenação direta de canteiro.', 6200.00, array['Contrato_Trabalho.pdf','Ficha_EPI_Assinada.pdf']),
('00000000-0000-0000-0004-000000000003', 'Carlos Oliveira da Silva', 'Oficial Pedreiro', '456.789.123-55', '(11) 96655-4433', 'carlos.pedreiro@email.com', '2025-02-01', 'Ativo', 'Excelente desempenho em acabamento fino e assentamento de porcelanatos.', 3100.00, array['Contrato_Trabalho.pdf','Atestado_ASO.pdf']),
('00000000-0000-0000-0004-000000000004', 'Marcos Lima de Carvalho', 'Eletricista Instalador', '789.123.456-88', '(11) 95544-3322', 'marcos.eletricista@email.com', '2025-06-15', 'Ativo', 'Eletricista certificado NR10. Encarregado de infraestrutura elétrica e montagem de painéis.', 3400.00, array['Contrato_Trabalho.pdf','Certificado_NR10.pdf']),
('00000000-0000-0000-0004-000000000005', 'Eng. Larissa Fernandes Costa', 'Engenheira Residente Júnior', '321.654.987-12', '(21) 98822-1100', 'larissa.eng@email.com', '2025-11-01', 'Ativo', 'Auxilia no controle diário de produção, medições e elaboração de relatórios técnicos.', 4800.00, array['Carteira_CREA.pdf','Contrato_Trabalho.pdf']);

-- ============================================================
-- CLIENTES
-- ============================================================
insert into public.clientes (id, nome, cpf_cnpj, telefone, email, endereco, responsavel, observacoes, documentos) values
('00000000-0000-0000-0001-000000000001', 'Construtora Alfa Ltda', '12.345.678/0001-90', '(11) 98765-4321', 'contato@construtoraalfa.com.br', 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP', 'Eng. Ricardo Silveira', 'Cliente corporativo com recorrência mensal de obras industriais e corporativas.', array['Ficha_Cadastral_Alfa.pdf','Contrato_Social_Alfa.pdf']),
('00000000-0000-0000-0001-000000000002', 'Dra. Sandra Regina Melo', '234.567.890-12', '(21) 97654-3210', 'sandra.melo@email.com', 'Rua das Palmeiras, 145 - Condomínio Bella Vista, Niterói - RJ', 'Sandra Regina Melo', 'Cliente pessoa física. Construção residencial unifamiliar de alto padrão.', array['RG_Sandra_Melo.pdf','Comprovante_Residencia.pdf']),
('00000000-0000-0000-0001-000000000003', 'Incorporadora Horizonte S/A', '98.765.432/0001-10', '(31) 3456-7890', 'novosnegocios@horizonteinc.com', 'Av. do Contorno, 5500 - Savassi, Belo Horizonte - MG', 'Arq. Mariana Lemos', 'Incorporadora de grande porte. Foco em loteamentos e edifícios comerciais de grande escala.', array['Apresentacao_Horizonte.pdf']);

-- ============================================================
-- FORNECEDORES
-- ============================================================
insert into public.fornecedores (id, empresa, cnpj, contato, telefone, email, categoria, avaliacao, documentos) values
('00000000-0000-0000-0003-000000000001', 'Cimento Forte do Brasil S/A', '45.678.901/0001-22', 'Marcos Rezende (Comercial)', '(11) 3214-5678', 'vendas@cementoforte.com.br', 'Material', 5, array['Certificado_ISO_9001.pdf','Ficha_Tecnica_CP-II.pdf']),
('00000000-0000-0000-0003-000000000002', 'Instaladora Elétrica Centauro', '12.987.654/0001-33', 'Ricardo Wagner (Técnico)', '(11) 99123-4567', 'contato@eletricacentauro.com.br', 'Serviços Terceirizados', 4, array['Seguro_Responsabilidade_Civil.pdf','PPRA_NR10.pdf']),
('00000000-0000-0000-0003-000000000003', 'Andaimes & Cia Locações', '33.444.555/0001-66', 'Luciana Mello', '(11) 4004-9876', 'atendimento@andaimesecia.com.br', 'Equipamentos', 5, array['ART_Fabricacao_Andaimes.pdf']),
('00000000-0000-0000-0003-000000000004', 'Pedreiras Reunidas do Vale', '22.333.444/0001-55', 'Cláudio Duarte', '(11) 98111-2222', 'faturamento@pedreirasreunidas.com.br', 'Material', 3, array['Licenca_DNPM_Mineracao.pdf']);

-- ============================================================
-- PROPOSTAS + REVISOES
-- ============================================================
insert into public.propostas (id, numero, cliente_id, descricao, valor_estimado, prazo_execucao, data_validade, status) values
('00000000-0000-0000-0002-000000000001', 'PROP-2026-001', '00000000-0000-0000-0001-000000000001', 'Reforma Comercial de Escritório Corporativo (Área Útil 450m²)', 150000.00, '90 dias', '2026-08-30', 'Aprovada'),
('00000000-0000-0000-0002-000000000002', 'PROP-2026-002', '00000000-0000-0000-0001-000000000002', 'Construção Completa de Residência Unifamiliar de Alto Padrão (320m²)', 850000.00, '12 meses', '2026-09-15', 'Aprovada'),
('00000000-0000-0000-0002-000000000003', 'PROP-2026-003', '00000000-0000-0000-0001-000000000003', 'Execução de Fundações Profundas (Estacas Hélice Contínua e Blocos de Coroamento) Edifício Skyline', 1200000.00, '60 dias', '2026-10-01', 'Elaboração'),
('00000000-0000-0000-0002-000000000004', 'PROP-2026-004', '00000000-0000-0000-0001-000000000001', 'Instalação de Sistemas de Prevenção e Combate a Incêndio de Galpão Industrial de 1.200m²', 280000.00, '45 dias', '2026-08-15', 'Enviada');

insert into public.revisoes_proposta (proposta_id, versao, data, valor, alteracoes) values
('00000000-0000-0000-0002-000000000001', 1, '2026-02-10', 165000.00, 'Proposta inicial enviada com estimativa de drywall premium.'),
('00000000-0000-0000-0002-000000000001', 2, '2026-02-18', 150000.00, 'Revisão com substituição de divisórias acústicas importadas por nacionais de alta qualidade.'),
('00000000-0000-0000-0002-000000000002', 1, '2026-03-01', 850000.00, 'Proposta detalhada de fundação, estrutura, instalações e acabamento fino.'),
('00000000-0000-0000-0002-000000000004', 1, '2026-05-12', 280000.00, 'Envio da proposta inicial contendo sprinklers, hidrantes e central de alarme.');

-- ============================================================
-- CONTAS FINANCEIRAS
-- ============================================================
insert into public.contas_financeiras (id, nome, banco, tipo, saldo_inicial) values
('00000000-0000-0000-000b-000000000001', 'Conta Corrente PJ', 'Banco do Brasil', 'Corrente', 150000.00),
('00000000-0000-0000-000b-000000000002', 'Conta Investimento', 'Itaú Unibanco', 'Corrente', 100000.00),
('00000000-0000-0000-000b-000000000003', 'Caixinha Escritório', 'Caixa Interno', 'Caixa Interno', 5000.00);

-- ============================================================
-- CATALOGO DE INSUMOS
-- ============================================================
insert into public.catalogo_insumos (id, codigo_sinapi, descricao, unidade, preco_referencia, categoria, tipo, fornecedor_padrao_id, composicao, aplicacao, ativo, data_atualizacao_preco) values
('00000000-0000-0000-000d-000000000001', '462230100', 'Cimento Portland CP-II — 50kg', 'saco', 29.00, 'Material', 'SINAPI', '00000000-0000-0000-0003-000000000001', 'Cimento Portland composto com escória de alto-forno ou material pozolânico, ideal para rebocos e fundações.', 'Fundações, pilares, vigas, rebocos e contrapisos em geral.', true, '2026-07-15'),
('00000000-0000-0000-000d-000000000002', '462210100', 'Areia média lavada para concreto e argamassa', 'm³', 85.00, 'Material', 'SINAPI', '00000000-0000-0000-0003-000000000004', 'Areia média quartzosa obtida de leito de rio, lavada e peneirada.', 'Preparação de argamassas de assentamento e concretos.', true, '2026-07-15'),
('00000000-0000-0000-000d-000000000003', '462210300', 'Brita número 1 para concretagem', 'm³', 95.00, 'Material', 'SINAPI', '00000000-0000-0000-0003-000000000004', 'Pedra britada tipo 1 obtida por britagem de rochas basálticas ou graníticas.', 'Concretos estruturais para lajes, vigas e pilares.', true, '2026-07-15'),
('00000000-0000-0000-000d-000000000004', '462100100', 'Tijolo cerâmico de 8 furos 9x19x19cm', 'mil', 850.00, 'Material', 'SINAPI', null, 'Tijolo cerâmico para vedação, cozido e com furos prismáticos.', 'Alvenaria de vedação residencial ou comercial.', true, '2026-07-15'),
('00000000-0000-0000-000d-000000000005', '462400100', 'Vergalhão CA-50 Ø 10mm (3/8") em barras de 12m', 'kg', 8.50, 'Material', 'SINAPI', null, 'Aço carbono de alta resistência, superfície nervurada para melhor aderência ao concreto.', 'Armadura para concreto armado (sapatas, vigas, pilares e lajes).', true, '2026-07-15'),
('00000000-0000-0000-000d-000000000006', '462500100', 'Concreto usinado bombeável fck 25 MPa', 'm³', 410.00, 'Material', 'SINAPI', null, 'Concreto dosado em central, fck de 25 Megapascals, com brita 1 e abatimento ideal para bombeamento.', 'Lajes maciças, vigas de coroamento e fundações residenciais.', true, '2026-07-15'),
('00000000-0000-0000-000d-000000000007', '462700200', 'Tinta acrílica premium fosca branca — lata 18L', 'galão', 220.00, 'Material', 'SINAPI', null, 'Tinta acrílica de alta cobertura, lavável e com aditivos anti-mofo.', 'Pintura interna e externa de alvenarias ou gesso.', true, '2026-07-15'),
('00000000-0000-0000-000d-000000000008', '462800100', 'Porcelanato retificado 60x60cm padrão cinza acetinado', 'm²', 85.00, 'Material', 'SINAPI', null, 'Placa cerâmica de porcelanato de alta resistência e junta de assentamento de 2mm.', 'Revestimento de pisos internos em salas, escritórios e banheiros.', true, '2026-07-15'),
('00000000-0000-0000-000d-000000000009', '463400100', 'Mão de obra qualificada de pedreiro oficial', 'h', 35.00, 'Mão de Obra', 'SINAPI', null, 'Hora técnica de pedreiro com encargos sociais integrados na convenção coletiva.', 'Serviços gerais de alvenaria, assentamento de tijolos, rebocos e acabamentos.', true, '2026-07-15'),
('00000000-0000-0000-000d-000000000010', '463400200', 'Mão de obra auxiliar de servente', 'h', 22.00, 'Mão de Obra', 'SINAPI', null, 'Hora de ajudante geral canteiro de obras com encargos sociais inclusos.', 'Auxílio aos pedreiros, transporte de materiais, limpeza e mistura de massas.', true, '2026-07-15'),
('00000000-0000-0000-000d-000000000011', '463500200', 'Locação diária de betoneira elétrica de 400 Litros', 'dia', 85.00, 'Equipamento', 'SINAPI', '00000000-0000-0000-0003-000000000003', 'Equipamento mecânico para homogeneização de concretos e argamassas, motor trifásico.', 'Produção local de massa para assentamento ou contrapiso.', true, '2026-07-15'),
('00000000-0000-0000-000d-000000000012', null, 'Pacote de Parede em Drywall Acústico Completo (Gesso + Perfis + Lã)', 'm²', 95.00, 'Serviço', 'Proprio', '00000000-0000-0000-0003-000000000002', 'Kit fechamento interno drywall composto por estrutura metálica de 70mm, guias, montantes, placas de gesso acartonado e lã de vidro mineral acústica.', 'Divisões de salas de escritório e ambientes corporativos ou comerciais.', true, '2026-07-15'),
('00000000-0000-0000-000d-000000000013', null, 'Instalação Elétrica Básica Monofásica Residencial (Material + Mão de obra)', 'Serviço', 3500.00, 'Serviço', 'Proprio', '00000000-0000-0000-0003-000000000002', 'Pacote composto por fiação flexível antichama de 2.5mm² e 4.0mm², caixa de distribuição de embutir, disjuntores DIN termomagnéticos e tomadas simples.', 'Quadro elétrico básico de distribuição de kitnetes e casas de pequeno porte.', true, '2026-07-15');

insert into public.catalogo_historico_precos (catalogo_id, data, preco, fonte) values
('00000000-0000-0000-000d-000000000001', '2026-05-10', 27.50, 'SINAPI'),
('00000000-0000-0000-000d-000000000001', '2026-06-12', 28.20, 'SINAPI'),
('00000000-0000-0000-000d-000000000001', '2026-07-15', 29.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000002', '2026-05-10', 82.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000002', '2026-07-15', 85.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000003', '2026-05-10', 93.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000003', '2026-07-15', 95.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000004', '2026-05-10', 830.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000004', '2026-07-15', 850.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000005', '2026-05-10', 8.90, 'SINAPI'),
('00000000-0000-0000-000d-000000000005', '2026-06-12', 8.70, 'SINAPI'),
('00000000-0000-0000-000d-000000000005', '2026-07-15', 8.50, 'SINAPI'),
('00000000-0000-0000-000d-000000000006', '2026-05-10', 395.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000006', '2026-07-15', 410.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000007', '2026-05-10', 215.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000007', '2026-07-15', 220.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000008', '2026-05-10', 89.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000008', '2026-07-15', 85.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000009', '2026-05-10', 34.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000009', '2026-07-15', 35.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000010', '2026-05-10', 21.50, 'SINAPI'),
('00000000-0000-0000-000d-000000000010', '2026-07-15', 22.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000011', '2026-05-10', 80.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000011', '2026-07-15', 85.00, 'SINAPI'),
('00000000-0000-0000-000d-000000000012', '2026-05-10', 98.00, 'Manual'),
('00000000-0000-0000-000d-000000000012', '2026-07-15', 95.00, 'Manual'),
('00000000-0000-0000-000d-000000000013', '2026-05-10', 3400.00, 'Manual'),
('00000000-0000-0000-000d-000000000013', '2026-07-15', 3500.00, 'Manual');

insert into public.cotacoes_fornecedores (catalogo_id, fornecedor_id, preco_unitario, data_cotacao, prazo_entrega_dias, observacao) values
('00000000-0000-0000-000d-000000000001', '00000000-0000-0000-0003-000000000001', 28.00, '2026-07-15', 2, 'Preço promocional para compras acima de 100 sacos.'),
('00000000-0000-0000-000d-000000000001', '00000000-0000-0000-0003-000000000004', 30.50, '2026-07-14', 3, 'Entrega CIF na obra.'),
('00000000-0000-0000-000d-000000000001', '00000000-0000-0000-0003-000000000003', 32.00, '2026-07-10', 5, 'Faturamento mínimo R$ 1.500.'),
('00000000-0000-0000-000d-000000000002', '00000000-0000-0000-0003-000000000004', 82.00, '2026-07-15', 1, 'Preço especial direto da pedreira.'),
('00000000-0000-0000-000d-000000000002', '00000000-0000-0000-0003-000000000001', 89.00, '2026-07-13', 2, 'Sob consulta de frete.'),
('00000000-0000-0000-000d-000000000003', '00000000-0000-0000-0003-000000000004', 92.00, '2026-07-15', 1, 'Direto da pedreira.'),
('00000000-0000-0000-000d-000000000003', '00000000-0000-0000-0003-000000000003', 99.00, '2026-07-12', 3, null);

-- ============================================================
-- PROJETOS
-- ============================================================
insert into public.projetos (id, nome, cliente_id, proposta_id, responsavel_interno_id, endereco_obra, data_inicio, data_fim, situacao) values
('00000000-0000-0000-0005-000000000001', 'Reforma Escritório Alfa (Av. Paulista)', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0004-000000000001', 'Av. Paulista, 1000 - 14º Andar - Bela Vista, São Paulo - SP', '2026-03-01', '2026-06-30', 'Em Execução'),
('00000000-0000-0000-0005-000000000002', 'Residência Bella Vista (Dra. Sandra)', '00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0004-000000000005', 'Rua das Palmeiras, 145 - Condomínio Bella Vista, Niterói - RJ', '2026-08-01', '2027-07-31', 'Planejamento');

-- ============================================================
-- ITENS DE ORCAMENTO
-- ============================================================
insert into public.itens_orcamento (id, projeto_id, categoria, descricao, valor_orcado, valor_contratado, fornecedor_id) values
('00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0005-000000000001', 'Materiais', 'Forro de Drywall, divisórias acústicas, perfis e placas cimentícias', 45000.00, 43200.00, null),
('00000000-0000-0000-0006-000000000002', '00000000-0000-0000-0005-000000000001', 'Materiais', 'Cabos elétricos, luminárias LED, tomadas e disjuntores', 15000.00, 14800.00, null),
('00000000-0000-0000-0006-000000000003', '00000000-0000-0000-0005-000000000001', 'Mão de Obra', 'Equipe civil (pedreiro, servente, pintor) para alvenaria e revestimento', 35000.00, 35000.00, null),
('00000000-0000-0000-0006-000000000004', '00000000-0000-0000-0005-000000000001', 'Mão de Obra', 'Equipe de gesseiros e montadores de drywall', 25000.00, 25000.00, null),
('00000000-0000-0000-0006-000000000005', '00000000-0000-0000-0005-000000000001', 'Equipamentos', 'Locação de andaimes de rodízio, marteletes e caçambas de entulho', 10000.00, 9200.00, '00000000-0000-0000-0003-000000000003'),
('00000000-0000-0000-0006-000000000006', '00000000-0000-0000-0005-000000000001', 'Terceiros', 'Serviço especializado de climatização e dutos de ar-condicionado', 12000.00, 11000.00, null),
('00000000-0000-0000-0006-000000000007', '00000000-0000-0000-0005-000000000001', 'Deslocamentos', 'Combustível, fretes de pequenas entregas e alimentação externa', 3000.00, 2800.00, null),
('00000000-0000-0000-0006-000000000008', '00000000-0000-0000-0005-000000000001', 'Administração', 'Segurança do trabalho (EPIs, exames) e taxa administrativa', 3000.00, 3000.00, null),
('00000000-0000-0000-0006-000000000009', '00000000-0000-0000-0005-000000000001', 'Contingências', 'Fundo para imprevistos técnicos ou refações', 2000.00, 0.00, null),
('00000000-0000-0000-0006-000000000010', '00000000-0000-0000-0005-000000000002', 'Materiais', 'Blocos estruturais, concreto usinado, ferragens armada e cimento', 250000.00, 0.00, null),
('00000000-0000-0000-0006-000000000011', '00000000-0000-0000-0005-000000000002', 'Materiais', 'Acabamentos nobres, mármores, granitos e louças sanitárias', 220000.00, 0.00, null),
('00000000-0000-0000-0006-000000000012', '00000000-0000-0000-0005-000000000002', 'Mão de Obra', 'Contratação empreiteiro geral de fundação e superestrutura', 230000.00, 230000.00, null),
('00000000-0000-0000-0006-000000000013', '00000000-0000-0000-0005-000000000002', 'Equipamentos', 'Locação de escavadeira, betoneira e formas metálicas para laje', 60000.00, 0.00, null),
('00000000-0000-0000-0006-000000000014', '00000000-0000-0000-0005-000000000002', 'Terceiros', 'Paisagismo externo, piscina de vinil armada e energia fotovoltaica', 50000.00, 0.00, null),
('00000000-0000-0000-0006-000000000015', '00000000-0000-0000-0005-000000000002', 'Deslocamentos', 'Logística de entrega de materiais pesados e viagens de supervisão', 15000.00, 0.00, null),
('00000000-0000-0000-0006-000000000016', '00000000-0000-0000-0005-000000000002', 'Administração', 'Projetos complementares estrutural/hidráulica e alvará de construção', 15000.00, 12000.00, null),
('00000000-0000-0000-0006-000000000017', '00000000-0000-0000-0005-000000000002', 'Contingências', 'Fundo para contingências estruturais', 10000.00, 0.00, null);

insert into public.alteracoes_orcamento (projeto_id, data, item, descricao, tipo, valor) values
('00000000-0000-0000-0005-000000000001', '2026-04-05', 'Instalação elétrica e luminárias', 'Adição de 12 spots LED extras solicitados pelo cliente no salão central.', 'Aumento', 1800.00),
('00000000-0000-0000-0005-000000000001', '2026-05-10', 'Acabamentos e drywall', 'Desconto comercial negociado direto com distribuidor de placas de gesso.', 'Redução', 1200.00);

-- ============================================================
-- CRONOGRAMA
-- ============================================================
insert into public.etapas_cronograma (id, projeto_id, nome, data_inicio, data_fim, responsavel_id) values
('00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0005-000000000001', 'Fundação / Demolição', '2026-03-01', '2026-03-20', '00000000-0000-0000-0004-000000000002'),
('00000000-0000-0000-0007-000000000002', '00000000-0000-0000-0005-000000000001', 'Estrutura / Drywall', '2026-03-21', '2026-04-25', '00000000-0000-0000-0004-000000000002'),
('00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0005-000000000001', 'Instalações Hidro/Elétricas', '2026-04-26', '2026-05-25', '00000000-0000-0000-0004-000000000004'),
('00000000-0000-0000-0007-000000000004', '00000000-0000-0000-0005-000000000001', 'Acabamentos e Pintura', '2026-05-26', '2026-06-20', '00000000-0000-0000-0004-000000000003'),
('00000000-0000-0000-0007-000000000005', '00000000-0000-0000-0005-000000000001', 'Entrega e Limpeza Pós-Obra', '2026-06-21', '2026-06-30', '00000000-0000-0000-0004-000000000001'),
('00000000-0000-0000-0007-000000000006', '00000000-0000-0000-0005-000000000002', 'Fundação / Terraplanagem', '2026-08-01', '2026-09-30', '00000000-0000-0000-0004-000000000002'),
('00000000-0000-0000-0007-000000000007', '00000000-0000-0000-0005-000000000002', 'Estrutura / Alvenaria', '2026-10-01', '2027-01-31', '00000000-0000-0000-0004-000000000002'),
('00000000-0000-0000-0007-000000000008', '00000000-0000-0000-0005-000000000002', 'Instalações', '2027-02-01', '2027-03-31', '00000000-0000-0000-0004-000000000004'),
('00000000-0000-0000-0007-000000000009', '00000000-0000-0000-0005-000000000002', 'Acabamentos', '2027-04-01', '2027-06-30', '00000000-0000-0000-0004-000000000003'),
('00000000-0000-0000-0007-000000000010', '00000000-0000-0000-0005-000000000002', 'Entrega / Vistoria', '2027-07-01', '2027-07-31', '00000000-0000-0000-0004-000000000001');

-- Illustrative etapa<->orcamento weights (see header note) — must exist BEFORE
-- medicoes_obra is seeded, so the fn_apply_medicao trigger fans out correctly.
insert into public.etapa_orcamento_vinculo (etapa_id, item_orcamento_id, peso_percentual) values
('00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0006-000000000005', 100.00),
('00000000-0000-0000-0007-000000000002', '00000000-0000-0000-0006-000000000004', 60.00),
('00000000-0000-0000-0007-000000000002', '00000000-0000-0000-0006-000000000001', 40.00),
('00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0006-000000000002', 50.00),
('00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0006-000000000006', 50.00),
('00000000-0000-0000-0007-000000000004', '00000000-0000-0000-0006-000000000003', 100.00),
('00000000-0000-0000-0007-000000000005', '00000000-0000-0000-0006-000000000008', 100.00),
('00000000-0000-0000-0007-000000000006', '00000000-0000-0000-0006-000000000010', 40.00),
('00000000-0000-0000-0007-000000000006', '00000000-0000-0000-0006-000000000012', 60.00),
('00000000-0000-0000-0007-000000000007', '00000000-0000-0000-0006-000000000012', 40.00),
('00000000-0000-0000-0007-000000000008', '00000000-0000-0000-0006-000000000013', 50.00),
('00000000-0000-0000-0007-000000000008', '00000000-0000-0000-0006-000000000016', 50.00),
('00000000-0000-0000-0007-000000000009', '00000000-0000-0000-0006-000000000011', 100.00),
('00000000-0000-0000-0007-000000000010', '00000000-0000-0000-0006-000000000014', 100.00);

-- Fires fn_apply_medicao() per row, auto-populating medicao_item_orcamento.
insert into public.medicoes_obra (projeto_id, etapa_id, data_medicao, percentual_medido, observacoes) values
('00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0007-000000000001', '2026-03-20', 100.00, 'Toda a demolição de divisórias antigas e retirada de piso foi executada sem acidentes.'),
('00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0007-000000000002', '2026-04-25', 100.00, 'Montagem dos perfis metálicos e fechamento com placas de gesso acartonado acústicas concluído conforme memorial.'),
('00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0007-000000000003', '2026-05-20', 60.00, 'Passagem dos circuitos de tomadas e infraestrutura lógica e climatização avançados.');

-- ============================================================
-- DOCUMENTOS
-- ============================================================
insert into public.documentos (id, projeto_id, nome, tipo) values
('00000000-0000-0000-000a-000000000001', '00000000-0000-0000-0005-000000000001', 'Contrato_Reforma_Alfa_Assinado.pdf', 'Contrato'),
('00000000-0000-0000-000a-000000000002', '00000000-0000-0000-0005-000000000001', 'Projeto_Arquitetura_Layout_V3.pdf', 'Projeto Técnico'),
('00000000-0000-0000-000a-000000000003', '00000000-0000-0000-0005-000000000001', 'ART_Projeto_Execucao_Albuquerque.pdf', 'ART/RRT'),
('00000000-0000-0000-000a-000000000004', '00000000-0000-0000-0005-000000000001', 'Alvara_Reforma_Paulista_Prefeitura.pdf', 'Licença'),
('00000000-0000-0000-000a-000000000005', '00000000-0000-0000-0005-000000000001', 'Relatorio_Fotografico_Medicao_02.pdf', 'Relatório'),
('00000000-0000-0000-000a-000000000006', '00000000-0000-0000-0005-000000000001', 'Nota_Fiscal_Cimento_Fornecedor1.pdf', 'Nota Fiscal'),
('00000000-0000-0000-000a-000000000007', '00000000-0000-0000-0005-000000000002', 'Alvara_Construcao_BellaVista_Niteroi.pdf', 'Licença');

insert into public.documento_versoes (documento_id, versao, storage_path, tamanho_bytes, created_at) values
('00000000-0000-0000-000a-000000000001', '1.0', 'seed/placeholder/Contrato_Reforma_Alfa_Assinado.pdf', 4404019, '2026-02-25'),
('00000000-0000-0000-000a-000000000002', '3.0', 'seed/placeholder/Projeto_Arquitetura_Layout_V3.pdf', 19293798, '2026-02-20'),
('00000000-0000-0000-000a-000000000003', '1.0', 'seed/placeholder/ART_Projeto_Execucao_Albuquerque.pdf', 1258291, '2026-02-28'),
('00000000-0000-0000-000a-000000000004', '1.0', 'seed/placeholder/Alvara_Reforma_Paulista_Prefeitura.pdf', 2621440, '2026-02-28'),
('00000000-0000-0000-000a-000000000005', '1.0', 'seed/placeholder/Relatorio_Fotografico_Medicao_02.pdf', 8493465, '2026-04-25'),
('00000000-0000-0000-000a-000000000006', '1.0', 'seed/placeholder/Nota_Fiscal_Cimento_Fornecedor1.pdf', 665600, '2026-03-05'),
('00000000-0000-0000-000a-000000000007', '1.0', 'seed/placeholder/Alvara_Construcao_BellaVista_Niteroi.pdf', 3984588, '2026-07-10');

-- ============================================================
-- LANCAMENTOS FINANCEIROS (fix #2: also serves as fornecedor purchase history
-- via v_compras_fornecedor; fix #7: competencia set on payroll entries)
-- ============================================================
insert into public.lancamentos_financeiros (tipo, descricao, valor, data, categoria, pago, conta_id, projeto_id, funcionario_id, fornecedor_id, competencia) values
('Receita', 'Aporte Inicial de Capital', 100000.00, '2026-01-10', 'Aporte Capital', true, '00000000-0000-0000-000b-000000000002', null, null, null, null),
('Receita', 'Faturamento Medição 01 - Reforma Alfa', 15000.00, '2026-03-20', 'Faturamento Obra', true, '00000000-0000-0000-000b-000000000001', '00000000-0000-0000-0005-000000000001', null, null, null),
('Receita', 'Faturamento Medição 02 - Reforma Alfa', 45000.00, '2026-04-25', 'Faturamento Obra', true, '00000000-0000-0000-000b-000000000001', '00000000-0000-0000-0005-000000000001', null, null, null),
('Despesa', 'Aluguel de Escritório - Julho', 4800.00, '2026-07-05', 'Aluguel Escritório', true, '00000000-0000-0000-000b-000000000002', null, null, null, null),
('Despesa', 'Serviços de Utilidades (Água, Energia, Internet)', 1200.00, '2026-07-10', 'Energia/Água/Internet', true, '00000000-0000-0000-000b-000000000003', null, null, null, null),
('Despesa', 'Salário de Engenheiro Roberto - Junho', 9500.00, '2026-07-05', 'Salários', true, '00000000-0000-0000-000b-000000000001', null, '00000000-0000-0000-0004-000000000001', null, '2026-07'),
('Despesa', 'Salário de Mestre Valdir - Junho', 6200.00, '2026-07-05', 'Salários', true, '00000000-0000-0000-000b-000000000001', null, '00000000-0000-0000-0004-000000000002', null, '2026-07'),
('Despesa', 'Compra de Cimento CP-II - Material Obra Alfa', 14500.00, '2026-03-05', 'Fornecedores', true, '00000000-0000-0000-000b-000000000001', '00000000-0000-0000-0005-000000000001', null, '00000000-0000-0000-0003-000000000001', null),
('Despesa', 'Licenciamento Prefeitura Niterói - Bella Vista', 3800.00, '2026-07-12', 'Impostos/Taxas', true, '00000000-0000-0000-000b-000000000002', '00000000-0000-0000-0005-000000000002', null, null, null),
('Despesa', 'Campanha de Tráfego Pago Google Ads', 1500.00, '2026-07-25', 'Marketing/Vendas', false, '00000000-0000-0000-000b-000000000002', null, null, null, null),
-- Extra entries reflecting historical fornecedor purchases from the old
-- Fornecedor.historicoCompras seed (fix #2 — now unified into this one ledger).
('Despesa', '300 sacos de Cimento CP-II e areia lavada', 9800.00, '2026-04-12', 'Fornecedores', true, '00000000-0000-0000-000b-000000000001', '00000000-0000-0000-0005-000000000001', null, '00000000-0000-0000-0003-000000000001', null),
('Despesa', 'Mão de obra passagem de fiação e quadros', 18000.00, '2026-04-20', 'Fornecedores', false, '00000000-0000-0000-000b-000000000001', '00000000-0000-0000-0005-000000000001', null, '00000000-0000-0000-0003-000000000002', null),
('Despesa', 'Locação de andaimes de fachada (mensal)', 4200.00, '2026-03-10', 'Fornecedores', true, '00000000-0000-0000-000b-000000000001', '00000000-0000-0000-0005-000000000001', null, '00000000-0000-0000-0003-000000000003', null),
('Despesa', 'Renovação locação de andaimes', 4200.00, '2026-04-10', 'Fornecedores', true, '00000000-0000-0000-000b-000000000001', '00000000-0000-0000-0005-000000000001', null, '00000000-0000-0000-0003-000000000003', null);
