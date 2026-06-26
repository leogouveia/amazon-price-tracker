# releases/

Cada subpasta representa uma versão que exige passos manuais em produção além do `deploy.sh` padrão — migrações de banco, novas variáveis de ambiente, registros externos (webhooks, etc.).

## Estrutura

```
releases/
  YYYY-MM-DD-slug/
    CHANGES.md   — o que mudou, pré-requisitos e pós-passos
    deploy.sh    — script de migração idempotente para esta versão
```

## Como usar

```bash
# 1. Leia o CHANGES.md da versão antes de qualquer coisa
# 2. Execute o script de migração
bash releases/YYYY-MM-DD-slug/deploy.sh
# 3. Execute o deploy normal
bash deploy.sh
```

O script de migração de cada versão é idempotente — pode ser rodado mais de uma vez sem efeitos colaterais.
