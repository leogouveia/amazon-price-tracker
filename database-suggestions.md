# Relatório de sugestões de banco de dados

## 1. Diagnóstico atual

### Banco em uso

**SQLite** via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3), operando de forma síncrona sobre o arquivo `prices.db` na raiz do projeto.

### Schema atual

```
users           — autenticação e controle de limite por usuário
products        — produtos canônicos deduplicados por ASIN
user_items      — vínculo entre usuário e produto (com soft delete)
price_history   — histórico de preços por user_item_id
schema_migrations
```

O modelo de dados é bem projetado: produto canônico compartilhado entre usuários, soft delete em `users` e `user_items`, índices nas colunas de busca frequente.

### Problemas identificados na configuração atual

**Crítico — WAL mode desativado**

SQLite usa journal mode por padrão. Isso significa que qualquer escrita (inclusive o monitor gravando histórico de preços) adquire um lock exclusivo sobre o arquivo inteiro e bloqueia todas as leituras simultâneas. Durante uma execução do monitor com muitos produtos, a API fica inoperante para o frontend.

Correção de uma linha em `database.ts`:
```typescript
db.pragma('journal_mode = WAL');
```

**Importante — Foreign keys não estão ativas**

SQLite não aplica constraints de chave estrangeira por padrão. O `ON DELETE CASCADE` em `price_history → user_items` não funciona sem:
```typescript
db.pragma('foreign_keys = ON');
```

Na prática não causa problema imediato porque o sistema nunca faz hard delete — mas qualquer acesso direto ao banco via SQL quebraria a integridade referencial silenciosamente.

**Performance — Consulta principal com N subqueries correlacionadas**

O SQL de listagem de produtos (`PRODUCT_PRICE_SUMMARY_SQL` em `database.ts`) executa 4 subqueries correlacionadas por linha para calcular `previous_price`, `previous_checked_at`, `lowest_price` e `lowest_checked_at`. Com 50 produtos por usuário, isso são 200 subqueries adicionais por request. Pode ser reescrito com window functions/CTEs sem mudar o banco.

**Performance — N+1 queries na listagem de usuários**

`listActiveUsersWithStats` faz uma query por usuário para contar seus itens ativos. 50 usuários = 51 queries. Pode ser resolvido com um JOIN e GROUP BY.

**Ausência de configuração de tamanho de página e cache**

SQLite usa page size de 4096 bytes e cache padrão por default. Para uma carga leve como esta não é problema prático, mas `PRAGMA cache_size = -8000` (8 MB) e `PRAGMA temp_store = MEMORY` são ajustes simples.

---

## 2. Sugestões de banco de dados

### Opção A — SQLite (atual) com configuração adequada ⭐ Recomendado

**Por que faz sentido:**
SQLite é a escolha ideal para este projeto. A carga de dados é baixa (dezenas a centenas de produtos, histórico de preços acumulado ao longo do tempo), a implantação é em uma única VPS sem necessidade de replicação, e o gargalo real da aplicação é o scraping com Playwright, não o banco. SQLite síncrono com `better-sqlite3` evita toda a complexidade de connection pooling e é mais rápido para leituras simples do que qualquer banco em rede.

**Prós:**
- Zero infraestrutura adicional — arquivo local, backup com `cp`
- `better-sqlite3` é síncrono, sem callback hell ou pooling
- WAL mode resolve o problema de concorrência leitura/escrita
- Toda a lógica já está escrita e funcionando
- Performance mais do que suficiente para este volume

**Contras:**
- Não escala para múltiplos servidores (não é o caso aqui)
- Concorrência de escrita ainda é serializada mesmo com WAL (única thread escreve por vez, mas não há múltiplos escritores simultâneos neste projeto)
- Ferramentas de administração menos ricas que PostgreSQL

**O que falta apenas configurar (não mudar o banco):**
```typescript
// Em database.ts, logo após new Database(...)
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -8000');   // 8 MB de cache
db.pragma('temp_store = MEMORY');
db.pragma('synchronous = NORMAL'); // seguro com WAL, mais rápido que FULL
```

---

### Opção B — PostgreSQL

**Por que faria sentido:**
Se o projeto crescer para múltiplos usuários ativos simultaneamente, múltiplas instâncias da API (load balancer), ou necessidade de acesso concorrente de ferramentas externas (analytics, dashboards), PostgreSQL seria a escolha natural.

**Prós:**
- Suporte real a múltiplos escritores simultâneos
- Window functions nativas tornam a query de histórico de preços mais eficiente
- Ecossistema rico (pgAdmin, Grafana, replicação, backup incremental com pgBackRest)
- `pg` e `postgres` são bibliotecas maduras para Node.js
- JSONB para dados semi-estruturados se necessário

**Contras:**
- Requer instalação e configuração de servidor PostgreSQL na VPS
- Adiciona complexidade operacional: connection string, usuário/senha, backup separado do código
- Precisa de connection pooling (PgBouncer ou pool interno) porque Node.js não é thread-per-request
- Migração de `better-sqlite3` para um driver async (ex: `postgres` de Adria Pedersen ou `pg`) exige refatorar todas as queries para async/await — o código atual usa a API síncrona do `better-sqlite3` extensivamente
- Custo extra na VPS se não incluído no plano atual
- Overhead completamente desnecessário para o volume atual

**Quando considerar:** Se o número de usuários ativos passar de ~100 ou se o histórico de preços acumular dezenas de milhões de registros.

---

### Opção C — libSQL / Turso

**Por que faria sentido:**
[Turso](https://turso.tech) é SQLite distribuído — usa o mesmo wire protocol e dialeto SQL do SQLite, mas pode rodar como servidor embarcado ou na nuvem. A biblioteca `@libsql/client` substitui `better-sqlite3` com compatibilidade alta.

**Prós:**
- Mantém a familiaridade com SQLite (mesmo SQL, mesmas queries)
- Suporta modo embarcado local (comportamento idêntico ao atual) e modo servidor (para múltiplas instâncias)
- Versão cloud oferece replicação automática e backups gerenciados
- Migração mais simples que para PostgreSQL

**Contras:**
- `@libsql/client` é async — exigiria refatorar todo o código síncrono de `better-sqlite3` para async/await (mesmo problema da opção B)
- Ainda relativamente novo comparado ao SQLite puro
- Versão cloud tem custo; versão local não adiciona nada que WAL mode já não resolve
- Adiciona dependência de um serviço externo (se usar Turso cloud)

**Quando considerar:** Se o projeto precisar de backup automático na nuvem sem gerenciar isso manualmente, ou se precisar de replicação entre regiões.

---

## 3. Considerações de migração

### Se migrar de SQLite para PostgreSQL

**Esforço estimado: alto (2–4 dias)**

1. **Driver:** Substituir `better-sqlite3` por `postgres` ou `pg`. Todo o código usa a API síncrona — cada `db.prepare(...).get(...)` viraria `await sql\`...\`` ou similar. Isso afeta `database.ts`, `users.ts`, `migrate-multi-user.ts` e todos os testes futuros.

2. **SQL:** A maioria das queries é ANSI SQL e funcionaria sem modificação. Exceções:
   - `PRAGMA` statements não existem em PostgreSQL
   - `AUTOINCREMENT` vira `SERIAL` ou `GENERATED ALWAYS AS IDENTITY`
   - `CURRENT_TIMESTAMP` em SQLite retorna sem fuso; PostgreSQL retorna com timezone
   - Índices parciais (`WHERE deleted_at IS NULL`) são suportados em PostgreSQL, sem mudança
   - `ON DELETE CASCADE` funciona por padrão em PostgreSQL (sem necessidade de pragma)

3. **Migração de dados:** Exportar `prices.db` para SQL e importar no PostgreSQL. Ferramentas como `pgloader` automatizam isso.

4. **Infraestrutura:** Instalar PostgreSQL na VPS, criar usuário/banco, configurar `.env` com `DATABASE_URL`.

5. **Hono + PostgreSQL:** Hono não tem ORM acoplado; integração é direta via driver de sua escolha.

### Se migrar de SQLite para libSQL/Turso

**Esforço estimado: médio (1–2 dias)**

Mesmo SQL, mas a API muda de síncrona para async. O número de arquivos afetados é o mesmo, mas as mudanças por arquivo são menores (sem reescrever SQL).

---

## 4. Próximos passos sugeridos

**Imediato (sem trocar o banco):**

1. Ativar os pragmas de configuração em `database.ts` — resolve o problema de bloqueio durante o monitor e ativa foreign keys. Mudança de 5 linhas, impacto imediato.

2. Reescrever `listActiveUsersWithStats` para usar um JOIN com GROUP BY — elimina o N+1.

3. Avaliar se a query `PRODUCT_PRICE_SUMMARY_SQL` precisa ser otimizada — só vale a pena se o número de produtos por usuário for grande (50+).

**Médio prazo:**

4. Implementar backup automático do `prices.db`. SQLite com WAL pode ser copiado com segurança usando `sqlite3 prices.db ".backup prices.backup.db"` ou simplesmente `cp` com WAL ativo. Um script de cron diário é suficiente.

5. Monitorar o tamanho do banco e o tempo de resposta das queries. Se o `price_history` crescer para milhões de linhas, considere uma política de retenção (ex: manter apenas os últimos 6 meses de histórico por item).

**Quando reconsiderar o banco:**

6. Se o projeto crescer para dezenas de usuários ativos simultâneos ou se você precisar acessar os dados de múltiplas instâncias da aplicação, considere PostgreSQL.

**Conclusão:** O banco atual (SQLite) é a escolha certa para este projeto. O problema não é o banco — é a configuração. Ativar WAL mode e foreign keys resolve os problemas práticos sem nenhuma migração.
