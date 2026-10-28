> Atualização de e-mail: para Render gratuito, use a integração Brevo por HTTPS. Veja [configuração e validação](docs/EMAIL-HTTPS.md). As instruções SMTP abaixo são uma alternativa para hospedagens que permitem essas portas.

# Predial — gestão de manutenção

Versão de continuidade preparada em 18/10/2026 a partir do pacote `api-predial-wip.tar.gz` e dos quatro módulos recuperados dos textos enviados. Preserva React/Vite, Express, Prisma 6.19.3 e MySQL. O pacote não foi comparado com o HEAD atual do GitHub: faça a comparação antes de substituir seu repositório.

**Status:** versão para homologação. Build, lint, validação do schema e 29 testes locais passaram. Banco MySQL, migrations, SMTP e Cloudinary reais ainda precisam de homologação. Nenhum deploy ou acesso ao banco de produção foi realizado.

## O que mudou

- Servidor modular integrado às rotas de autenticação, administração, demandas, notificações e relatórios.
- Sessão assinada de 8 horas; o antigo `x-usuario-id` não autentica. Alterar senha ou bloquear a conta revoga tokens antigos.
- Seleção explícita de dados de usuário, validação de entradas, limitação de tentativas, erros sem detalhes internos e CORS por origem.
- Recuperação de senha com token aleatório, hash no banco, validade de 30 minutos e uso único. E-mails não aparecem nos logs.
- Cadastro com códigos de uso único; códigos administrativos recusados no cadastro público.
- Chat protegido por participante e bloqueado após conclusão, com atualização condicional em transação.
- Fotos locais acessíveis somente pela rota autorizada. Novos uploads Cloudinary usam recursos autenticados. Ver as ressalvas sobre fotos antigas em `docs/IMPLANTACAO.md`.
- Tela de perfil, troca de senha, histórico das demandas, tema claro/escuro, navegação mobile, login redesenhado, resumo do morador e filtros/paginação visual no administrador.
- Relatórios PDF/Excel mantidos e protegidos; health check e readiness separados.
- Seed manual, sem senha fixa, sem sobrescrever conta existente e fora do comando de deploy.

## Executar localmente

Requisitos: Node.js 22.12+ (verificado com 24.14.1), npm e MySQL separado de produção.

1. Extraia em uma pasta nova. Preserve seu projeto anterior e seus arquivos de ambiente fora do pacote.
2. Na raiz, copie `.env.example` para `.env` e configure um banco **local/de homologação**. Gere um `JWT_SECRET` aleatório com pelo menos 32 caracteres.
3. Execute:

```sh
npm ci
npm run build
npm run db:migrate
```

O terceiro comando modifica o banco apontado por `DATABASE_URL`. Verifique o destino antes de executar. Não use produção nesta etapa.

4. Se o banco estiver vazio, configure `ADMIN_PASSWORD`, `ADMIN_EMAIL` e opcionalmente `ADMIN_CODE`/`ADMIN_NAME`; execute `npm run db:seed` uma única vez e remova `ADMIN_PASSWORD` do ambiente depois. Não há senha padrão de administrador.
5. Execute `npm run dev` na raiz.
6. Em outro terminal:

```sh
cd frontend
npm ci
npm run dev
```

O frontend usa `http://localhost:3000` por padrão. Configure `frontend/.env` com `VITE_API_URL` se a API estiver em outro endereço. Use `http://localhost:5173` no navegador para coincidir com o CORS de exemplo.

## Verificações

```sh
# Raiz
npm test
npm run check
npm audit
# Frontend
cd frontend
npm run lint
npm run build
npm audit
```

Os testes abrem uma API HTTP local com adaptador de banco em memória. Não precisam de credenciais e não acessam o Aiven. Eles verificam contratos e permissões; não substituem testes das chaves estrangeiras, isolamento/concorrrência ou migrations no MySQL. `npm run check` exige uma `DATABASE_URL` sintaticamente válida, mas não conecta ao banco.

## Estrutura

- `app.js`: fábrica da aplicação, segurança HTTP e tratamento de erros.
- `server.js`: inicialização, conexão ao banco e encerramento.
- `routes/`: regras dos endpoints.
- `lib/`: autenticação, validação, domínio, upload, e-mail e relatórios.
- `prisma/`: schema, migrations e seed manual.
- `frontend/`: aplicativo React e configuração Vercel.
- `tests/`: testes locais e dados fictícios.
- `docs/IMPLANTACAO.md`: configuração, homologação, publicação e recuperação.
- `docs/API.md`: contratos e permissões.
- `docs/VALIDACAO.md`: evidências, checklist e limitações.

## Limitações importantes

A remoção de foto nesta entrega **desvincula a imagem da demanda**, mas não executa limpeza física automática dos arquivos existentes. Uma proposta de limpeza automática foi bloqueada pela revisão de aprovação do ambiente. Também não foi acrescentado um novo botão de exclusão definitiva de usuários; o bloqueio de acesso existente permanece. As rotas de exclusão já presentes nos trechos recuperados foram mantidas, com recusa para usuários com histórico.

Não há certificação de prontidão para produção. Leia o roteiro de homologação antes de publicar. `MELHORIAS.md` foi preservado como documento histórico do pacote recebido; o estado desta entrega é descrito neste README e em `docs/VALIDACAO.md`.

