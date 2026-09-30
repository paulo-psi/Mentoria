# Auditoria de design e UX — Hub de Mentorias

**Data:** 30 de setembro de 2026  
**Escopo:** telas públicas, área autenticada, manutenção administrativa e configurações da conta, em desktop e celular. Esta auditoria registra recomendações; não altera o aplicativo.

## Resumo executivo

O Hub tem uma identidade visual coerente definida por tokens de cor creme, verde-petróleo e dourado, com Manrope para interface e Playfair Display para títulos. A página pública foi observada em desktop e celular e permaneceu simples e utilizável nos tamanhos testados. A interface de cadastro também continuou utilizável em 320 px.

As prioridades são:

1. **Contraste:** dois usos de texto secundário medidos ficam abaixo do mínimo WCAG 2.2 AA para texto normal.
2. **Tabelas no celular:** as tabelas de equipes e mentores têm largura mínima maior que a tela. Os testes confirmam rolagem interna, mas não confirmam se as pessoas percebem ou conseguem usar o gesto.
3. **Cadastro:** um placeholder de senha aparece em inglês apesar da interface em português; o navegador também registrou avisos sobre atributos `autocomplete`.

As telas privadas de usuário, administração e conta não puderam ser inspecionadas visualmente com uma sessão real. As recomendações dessas áreas são limitadas às evidências do código e dos testes automatizados, e não devem ser interpretadas como uma validação visual completa.

## Cobertura e limites da inspeção

| Área | Evidência disponível | Limite |
|---|---|---|
| Entrada pública | Capturas em 1440 × 1000 e 390 × 844 | Estados autenticados não se aplicam a esta página. |
| Entrar | Captura em 1440 × 900 | Não foi capturada em viewport móvel. |
| Criar conta | Capturas em 390 × 844 e 320 × 740 | A interface permaneceu utilizável em 320 px; não foi feita uma avaliação assistiva completa. |
| Painel autenticado (`/user-portal`) | Revisão de código e testes E2E com shim de autenticação; testes cobrem viewports de 320, 360, 390 e 430 px para rolagem interna da tabela e ajuste de modais | Sem captura com sessão real; hierarquia visual, estados reais e foco não foram confirmados visualmente. |
| Manutenção (`/manage`) | Revisão de código disponível | Sem captura com sessão administrativa real; comportamento visual em desktop e celular não confirmado. |
| Conta (`/account`) | Rota e integração de conta identificadas no código | Sem captura com sessão real; conteúdo e comportamento responsivo não confirmados visualmente. |
| Teclado e leitor de tela | Inspeção estática de parte da interface e evidências dos testes existentes | Não foi feita uma sessão completa de navegação por teclado nem teste com leitor de tela real. |

As telas privadas nos testes usam um shim de autenticação. Isso ajuda a verificar fluxos e estados implementados, mas não substitui a conferência visual com uma conta real. Estados de carregamento, erro e vazio existem em componentes do painel; sua aparência não foi validada em todos os tamanhos de tela.

## Achados priorizados

### P1 — Aumentar o contraste de textos secundários

**Impacto:** Alto · **Esforço:** Baixo a médio · **Tipo:** Melhoria rápida  
**Confiança:** Medição dos tokens; a aplicação de cada token varia conforme a tela.

O token `muted-foreground` apresenta contraste de aproximadamente **4,19:1** sobre o fundo de cartão e **3,94:1** sobre o fundo da página no tema claro. Ambos ficam abaixo de **4,5:1**, o mínimo WCAG 2.2 AA para texto normal. Também foi identificado texto `zinc-400` com aproximadamente **2,57:1** sobre branco em uma superfície clara. Texto secundário pequeno é usado em contagens, instruções e informações auxiliares, onde a leitura já depende de tamanho e contexto.

**Recomendação:** escurecer os tons usados em texto secundário ou escolher cores específicas por superfície. Conferir também tema escuro, estados de foco, badges e mensagens de estado; não assumir que mudar apenas o token claro resolve todas as combinações.

**Critério de aceite:** texto normal atinge pelo menos 4,5:1 e texto grande pelo menos 3:1 nas combinações efetivamente usadas; medições documentadas para temas claro e escuro; informação de estado continua compreensível sem depender somente da cor.

### P2 — Tornar as tabelas largas mais fáceis de usar no celular

**Impacto:** Médio a alto · **Esforço:** Médio a alto · **Tipo:** Mudança estrutural  
**Confiança:** Larguras e rolagem confirmadas por código/testes; facilidade de descoberta não foi testada com pessoas.

As tabelas autenticadas de equipes e mentores têm larguras mínimas de **1040 px** e **850 px**. Em telas estreitas, os testes confirmam rolagem horizontal dentro da tabela e verificam viewports de 320, 360, 390 e 430 px. Isso evita que a página inteira precise crescer horizontalmente, mas não demonstra que o gesto de rolar seja óbvio nem que os dados importantes permaneçam fáceis de acompanhar.

A rolagem bidimensional de uma tabela não é, por si só, uma violação automática de reflow: algumas tabelas precisam preservar suas relações em duas dimensões. A oportunidade aqui é melhorar a descoberta e a leitura móvel sem remover a semântica tabular.

**Recomendação:** testar com usuários uma indicação visível de conteúdo lateral e, se necessário, manter a coluna identificadora visível durante a rolagem. Avaliar uma apresentação compacta por cartões apenas se ela preservar rótulos, relações e ações da tabela.

**Critério de aceite:** em 320–430 px, a pessoa consegue identificar que há mais colunas, percorrer todos os dados e associar cada valor à equipe ou mentor correto; a página não ganha rolagem horizontal global; navegação por teclado e semântica da tabela permanecem utilizáveis.

### P2 — Uniformizar idioma e preenchimento automático no cadastro

**Impacto:** Médio · **Esforço:** Baixo · **Tipo:** Melhoria rápida  
**Confiança:** Observado na tela de cadastro e no console do navegador.

Na tela de cadastro, o placeholder **“Create a password”** aparece em inglês enquanto o restante do fluxo está em português. O navegador também registrou avisos relacionados aos atributos `autocomplete` dos campos. O fluxo continuou utilizável em 320 px, mas esses detalhes podem reduzir a confiança e dificultar o preenchimento por gerenciadores de senha.

**Recomendação:** conferir a tradução efetiva dos campos e mensagens do Clerk, inclusive placeholders; validar os valores de `autocomplete` apropriados para cada campo e o comportamento do preenchimento automático. Repetir a verificação em entrar e criar conta, em desktop e celular.

**Critério de aceite:** rótulos, placeholders e mensagens do fluxo estão em português; os campos relevantes oferecem semântica de preenchimento automático apropriada; os avisos observados deixam de ocorrer; cadastro e login continuam legíveis em 320 px.

### P3 — Explicar visualmente a ação desabilitada “Novo Registro”

**Impacto:** Baixo a médio · **Esforço:** Baixo · **Tipo:** Melhoria rápida  
**Confiança:** Revisão do código do painel; a renderização privada não foi inspecionada com sessão real.

Para quem não tem permissão de gestão, “Novo Registro” aparece desabilitado e seu nome acessível explica que a opção estará disponível em uma próxima etapa. Essa explicação não está visível junto ao botão, então a pessoa pode não saber se a ação está indisponível por permissão, por contexto ou por uma falha.

**Recomendação:** manter a restrição de permissão e acrescentar uma explicação visível e curta, próxima ao botão ou em um mecanismo de ajuda acessível, sem sugerir que a pessoa tente executar uma ação que não pode concluir.

**Critério de aceite:** pessoas com e sem permissão entendem por que a ação está ou não disponível; o estado continua claro por teclado e leitor de tela; nenhuma permissão ou comportamento de gravação é alterado por esta melhoria visual.

## Plano recomendado

### Melhorias rápidas

1. Ajustar e medir novamente o contraste dos textos secundários em todas as superfícies e temas.
2. Corrigir a localização e validar `autocomplete` nos formulários Clerk de entrar e criar conta.
3. Explicar visualmente por que “Novo Registro” está desabilitado para pessoas sem permissão.

### Mudanças estruturais e validação

1. Fazer uma avaliação de uso das tabelas em celular, mantendo a tabela semântica e adicionando pistas de rolagem ou outra apresentação apenas se os testes justificarem.
2. Repetir a inspeção visual de `/user-portal`, `/manage` e `/account` com sessões reais apropriadas, em desktop e celular.
3. Complementar a inspeção com teclado e leitor de tela, incluindo foco de entrada e retorno em diálogos, rótulos e anúncios de estados.

## Referências

- W3C, WCAG 2.2, critério 1.4.3 — Contrast (Minimum: <https://www.w3.org/TR/WCAG22/#contrast-minimum>).
- W3C, WCAG 2.2, critério 1.4.10 — Reflow: <https://www.w3.org/TR/WCAG22/#reflow>.

Esta é uma auditoria heurística com evidência parcial; não é uma declaração de conformidade WCAG nem substitui validação com pessoas usuárias.

## Atualização: validação de contraste após correção

Após esta auditoria, os tokens de texto secundário, badges e estados de erro foram ajustados. Os cálculos abaixo usam a fórmula de luminância relativa WCAG e as cores já compostas nas superfícies indicadas:

| Combinação final | Contraste mínimo medido | Critério |
|---|---:|---|
| `muted-foreground` no tema claro, sobre `muted` | 5,32:1 | Passa 4,5:1 para texto normal |
| `muted-foreground` no tema escuro, sobre `muted` | 5,00:1 | Passa 4,5:1 para texto normal |
| Texto e placeholders `zinc-500` nas superfícies `white` e `zinc-50` | 4,63:1 | Passa 4,5:1 para texto normal |
| Texto de badge `primary` sobre `primary/10`, nos dois temas e superfícies | 4,62:1 | Passa 4,5:1 para texto normal |
| Texto de alerta `destructive` sobre `destructive/5`, nos dois temas e superfícies | 4,55:1 | Passa 4,5:1 para texto normal |
| Texto dos botões `destructive` nos temas claro e escuro | 4,95:1 | Passa 4,5:1 para texto normal |

Os rótulos de status continuam apresentando texto explícito e, quando aplicável, ícones; o significado não depende apenas da cor. As mensagens de erro e status mantêm seus papéis semânticos (`alert`/`status`). Os usos de `zinc-400` em textos, placeholders e ícones de baixa ênfase foram substituídos por `zinc-500`.