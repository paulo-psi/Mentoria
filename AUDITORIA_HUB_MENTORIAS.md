# Auditoria ampla do Hub de Mentorias

**Data:** 29 de setembro de 2026

**Escopo:** segurança, API, integridade dos dados, funcionamento, acessibilidade, uso móvel e qualidade.
**Restrição atendida:** a auditoria não alterou código do produto, dependências, dados, esquemas ou configuração de produção. Este relatório é o único arquivo criado.

## Resumo executivo

- Não foi confirmado bypass de autenticação ou autorização nas rotas privadas revisadas. Leituras exigem usuário autenticado, e-mail principal verificado e aprovado; alterações e consulta do histórico administrativo também exigem a função de administrador.
- Não foi confirmado achado de código pelo SAST ou pelo HoundDog. A auditoria de dependências, porém, reportou **2 avisos altos e 2 moderados**. A árvore de dependências localiza os pacotes apontados apenas em ferramentas de desenvolvimento do pacote `@workspace/api-spec`, sem caminho identificado para o runtime da API ou do Hub.
- Foram confirmados um caso de resposta de erro após uma gravação já ter sido confirmada no banco, uma falha de contraste em textos pequenos e lacunas no contrato OpenAPI e no tratamento uniforme de erros.
- Build, typecheck, testes de API, testes de interface e E2E passaram. Os testes E2E foram executados com o Chromium empacotado para este ambiente.
- Não houve teste com leitor de tela real, domínio publicado ou configuração Clerk de produção.

## Achados priorizados

### SEC-01 — Avisos de dependências em ferramentas de desenvolvimento

**Prioridade:** média para manutenção do projeto; o scanner classifica parte dos avisos como altos.

**Evidência**

- A auditoria de dependências encontrou `brace-expansion@5.0.9` com dois avisos altos e um moderado, além de `fast-uri@3.1.7` com um moderado.
- `pnpm list -r brace-expansion fast-uri --depth 50` localizou `brace-expansion` na cadeia `typedoc → minimatch` e `fast-uri` na cadeia `@scalar/openapi-parser → ajv`.
- As cadeias encontradas pertencem a dependências de desenvolvimento de `@workspace/api-spec` (Orval e ferramentas de parsing/documentação). `artifacts/api-server/package.json` não depende desse pacote.

**Impacto e contexto**

Os avisos são reais para o toolchain usado por quem gera ou analisa a especificação da API, mas a auditoria não identificou esses pacotes no runtime publicado. Portanto, não são evidência de uma vulnerabilidade explorável no app em produção. A exposição pode aumentar se ferramentas de geração forem executadas sobre entradas não confiáveis em CI.

**Recomendação**

Atualizar os pais diretos ou aplicar versões transitivas corrigidas compatíveis, revisar o lockfile e executar novamente a auditoria. Essa atualização foi deixada para depois, conforme o escopo da tarefa.

### REL-01 — Criação ou edição de equipe pode parecer malsucedida depois de gravada

**Prioridade:** média.

**Evidência**

- `artifacts/api-server/src/routes/team-maintenance.ts:205-249`: a criação da equipe e seus estudantes é confirmada na transação; em seguida, `readTeams(teamId)` executa novas consultas antes da resposta.
- `artifacts/api-server/src/routes/team-maintenance.ts:287-347`: a edição também é confirmada antes de `readTeams(result.id)`.
- Falhas gerais nessas consultas são relançadas; os `catch` locais tratam apenas códigos específicos de restrição. `artifacts/api-server/src/app.ts:47-49` não instala um tratador global de erros.
- `artifacts/hub-mentorias/src/pages/manage.tsx:250-255, 283-297`: a interface só atualiza sua relação local depois que a chamada da API retorna sucesso.

**Impacto e condição**

Se o banco aceitar a gravação e a conexão falhar durante a leitura posterior, o endpoint termina com erro embora a alteração esteja persistida. A pessoa administradora vê uma falha e a interface pode continuar com os dados antigos; ao atualizar, a equipe aparece ou a edição passa a conflitar com a versão já salva. É um caso de recuperação confusa, não evidência de perda da gravação.

**Recomendação**

Separar o resultado confirmado da gravação da leitura de dados agregados necessária para atualizar a tela. Retornar dados suficientes da transação ou indicar claramente que a gravação foi concluída, permitindo à interface atualizar a lista. Acrescentar testes que simulem a falha de leitura depois do commit para criação e edição.

### A11Y-01 — Texto pequeno em `zinc-400` não atinge o contraste AA

**Prioridade:** média.

**Evidência**

- `artifacts/hub-mentorias/src/components/team-dossier-drawer.tsx:85-88, 199-215, 226` usa `text-zinc-400` em rótulos e informações como “Diário de bordo”, “Registro” e “escala 0–10”, sobre superfícies brancas ou muito claras.
- `artifacts/hub-mentorias/src/components/session-registration-form.tsx:161, 452` aplica o mesmo tom a índices de seção e contadores de caracteres.
- `artifacts/hub-mentorias/src/components/mentors-table.tsx:79, 103, 110` usa o tom em dados como “Não informado”, “Sem avaliações” e “/ 10”.
- A cor padrão de Tailwind `zinc-400` tem contraste aproximado de **2,6:1** sobre branco. Para texto normal, WCAG 2.1 AA, critério 1.4.3, requer **4,5:1**.

**Impacto**

Esses textos são pequenos e podem ficar difíceis de ler para pessoas com baixa visão ou em telas com brilho reduzido. A falha se limita aos textos que usam esse tom; ícones decorativos na mesma cor não são o achado.

**Recomendação**

Usar um tom mais escuro para textos informativos e conferir o contraste final também sobre fundos `zinc-50`/cinza claro. Adicionar uma verificação automatizada de contraste para evitar regressão.

### API-01 — OpenAPI não descreve a autenticação aplicada pelo servidor

**Prioridade:** baixa.

**Evidência**

- Uma busca pela especificação completa `lib/api-spec/openapi.yaml` não encontrou `securitySchemes` nem declarações `security`.
- `lib/api-spec/openapi.yaml:109-123` documenta `GET /teams` sem respostas `401`/`403`, embora `artifacts/api-server/src/routes/teams.ts:8-13` aplique `requireApprovedUser`.
- `artifacts/api-server/src/middlewares/requireApprovedUser.ts:17-46` exige sessão Clerk, e-mail principal verificado e aprovação explícita.

**Impacto**

Isso não remove a proteção do servidor, mas leitores da especificação e clientes gerados não conseguem inferir de forma consistente quais credenciais são necessárias nem quais operações exigem aprovação administrativa.

**Recomendação**

Declarar o mecanismo de autenticação e os requisitos por operação no OpenAPI; documentar também os status 401/403 aplicáveis. Não é necessário alterar o controle de acesso do servidor para corrigir essa lacuna documental.

### API-02 — Exceções não tratadas não têm formato de erro JSON uniforme

**Prioridade:** baixa.

**Evidência**

- `artifacts/api-server/src/app.ts:47-49` monta os routers, mas não instala um middleware final que normalize exceções.
- Consultas em `artifacts/api-server/src/routes/teams.ts:8-13`, `access.ts:16-36` e `roster-audit.ts:16-29` podem rejeitar sem conversão local para uma resposta de erro da API. Em contraste, `/health` e a leitura do histórico de sessões têm tratamento explícito de falha.
- O cliente em `lib/api-client-react/src/custom-fetch.ts:365-367` tenta interpretar respostas de erro, mas um retorno padrão do Express não garante o formato JSON `ErrorResponse`.

**Impacto**

Erros não previstos podem chegar com status e corpo diferentes dos contratos usados pelos clientes, dificultando mensagens consistentes e integração de outros consumidores. Isso não expõe, por si só, detalhes de erro em produção; não foi observado vazamento de segredo ou de conteúdo de sessão nos logs revisados.

**Recomendação**

Adicionar um tratador global seguro para erros não previstos e mapear falhas conhecidas de banco para respostas JSON estáveis. Manter detalhes internos apenas nos logs e incluir testes de falha para as rotas de leitura.

## Controles que funcionaram como esperado

- `/api/healthz` e `/api/health` são públicos e retornam apenas estado do serviço e da conexão, sem dados da relação.
- As rotas privadas revisadas usam `requireApprovedUser`; operações de escrita e auditoria do histórico também exigem `requireAdministrator`.
- As decisões de função usam o e-mail principal verificado no Clerk, normalizado contra listas explícitas de acesso e administração.
- E-mails de mentores são retornados apenas a usuários aprovados; a interface também os apresenta como contatos.
- As alterações de equipes e estudantes usam transações, bloqueio de escrita e verificações de versão/dados esperados. A exclusão de equipes com sessões é recusada, evitando apagar histórico como efeito colateral.
- As verificações SAST e HoundDog não encontraram achados. Isso não substitui revisão de configuração de produção nem prova ausência de vulnerabilidades.

## Acessibilidade e comportamento móvel

**Verificado**

- Os principais fluxos E2E cobrem larguras móveis, formulários, rolagem horizontal das tabelas, estados de carregamento/erro e ações principais.
- O dossiê usa semântica de diálogo com título e descrição associados. Testes de interface confirmam fechamento por Escape e backdrop e retorno do foco ao botão que abriu o diálogo (`artifacts/hub-mentorias/src/App.test.tsx:555-579`).
- Os formulários revisados associam rótulos aos campos; botões sem texto visível têm nomes acessíveis.
- Os estados assíncronos de carregamento, erro e sucesso revisados têm anúncios `status` ou `alert`.

**Não verificado ou pendente**

- Não havia leitor de tela/dispositivo real disponível; o resultado de leitura com tecnologia assistiva permanece não verificado.
- Não foi feita uma sessão dedicada de zoom do navegador a 200%.
- Os testes existentes não exercitam por teclado a ativação dos botões de nova tentativa em todos os estados de erro. Há uma tarefa de follow-up já aberta para esse ponto; ela não foi duplicada.
- Não há uma verificação automatizada de contraste integrada à suíte.

## Validações executadas

| Verificação | Resultado |
|---|---|
| `pnpm test` | Passou: 58 testes de API e 38 testes do Hub. A suíte da API usou banco descartável isolado; mensagens de pane simulada fazem parte dos testes. |
| `PORT=5000 BASE_PATH=/mockup-sandbox/ pnpm run build` | Passou: typecheck e builds do API, Hub e sandbox. O bundle principal do Hub excedeu 500 kB e gerou aviso do Vite; não impediu o build. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/repl/tools/bin/chromium pnpm --filter @workspace/hub-mentorias run test:e2e` | Passou: 10 testes. O Chromium baixado pelo Playwright falhou primeiro por falta de `libglib-2.0.so.0`; o navegador empacotado disponível no ambiente iniciou corretamente. |
| Auditoria de dependências | 2 altos e 2 moderados; cadeias e escopo detalhados em SEC-01. |
| SAST | Concluído: 0 achados. |
| HoundDog | Concluído: 0 achados. |

## Limitações e riscos não confirmados

- Os E2E interceptam `/api/**` com dados de teste (`artifacts/hub-mentorias/e2e/critical-flows.spec.ts:11-15, 71-99`); validam os fluxos do navegador, não uma sessão Clerk real, o proxy Clerk publicado nem a integração de produção entre API e banco.
- Os logs do preview usam chaves Clerk de desenvolvimento. As respostas 401/403 observadas no preview não foram tratadas como falha de produção, pois a configuração de usuários aprovados e a identidade real de produção não foram verificadas.
- `clerkProxyMiddleware.ts:45-52, 74-80` usa cabeçalhos encaminhados para formar a URL pública enviada ao Clerk. A proteção contra falsificação depende de o proxy de produção substituir/sanitizar esses cabeçalhos; sem acesso à configuração publicada, não é possível confirmar nem descartar esse risco.
- A auditoria não consultou dados de produção nem publicou alterações.
- A falta de uma regra `prefers-reduced-motion` explícita foi observada como oportunidade de melhoria; não foi classificada como falha WCAG AA confirmada nesta revisão.

## Escopo preservado

Nenhum achado foi corrigido durante a auditoria. As correções de contraste, as atualizações das dependências e os testes para falhas após commit foram deixados como follow-ups, separados deste relatório.