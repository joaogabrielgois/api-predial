> Atualização de e-mail: para Render gratuito, use a integração Brevo por HTTPS. Veja [configuração e validação](EMAIL-HTTPS.md). As instruções SMTP abaixo são uma alternativa para hospedagens que permitem essas portas.

# Configuração e implantação controlada

## Antes de tocar em produção

1. Compare esta pasta com o repositório atual e preserve alterações feitas depois do pacote recebido. Não substitua toda a pasta às cegas.
2. Faça backup do MySQL e teste a restauração em banco isolado. Registre a revisão atual do frontend/backend e guarde a configuração dos serviços em local seguro.
3. Configure homologação com usuários fictícios e recursos separados de e-mail/imagem.
4. Revise `prisma migrate status` e as migrations existentes. Se o banco já tiver alguma coluna sem a migration correspondente, reconcilie o histórico antes de executar; não rode os ALTER TABLE novamente nem marque uma migration como aplicada sem verificar o schema.

## Banco

O pacote contém duas migrations aditivas posteriores às migrations iniciais:

- `20260915000000_seguranca_perfil_foto_codigo`: recebida do trabalho anterior; adiciona data de alteração de senha, identificador de foto, expiração de código e índices.
- `20261018000000_sessoes`: adiciona `sessao_versao` para revogação confiável, inclusive para tokens emitidos no mesmo segundo da troca de senha.

**Não foram aplicadas a nenhum banco nesta sessão.** Teste em MySQL antes de autorizar a implantação real. `npm run db:migrate` é manual; build/start/deploy não aplicam migrations nem executam seed.

Use a configuração TLS recomendada para a sua conexão Aiven e mantenha a validação de certificado. Não use opções para ignorar erros de TLS. Nunca execute `migrate reset` ou apague tabelas para resolver divergência de histórico em produção.

## Backend no Render

- Build: `npm ci && npm run build`.
- Start: `npm start`.
- Health check: `/health`; `/ready` também consulta o banco e retorna 503 quando indisponível.
- `NODE_ENV=production`.
- `DATABASE_URL`: conexão privada do banco correto; não coloque no Git, em prints ou no chat.
- `JWT_SECRET`: segredo aleatório independente, com 32+ caracteres. Produção recusa inicialização sem ele. Trocá-lo desconecta as sessões.
- `FRONTEND_URL`: URL HTTPS da interface, sem barra final.
- `CORS_ORIGINS`: origens exatas separadas por vírgula, sem caminhos; inclua apenas domínios usados.
- `TRUST_PROXY_HOPS`: só configure a quantidade correta de proxies confiáveis da sua infraestrutura. Um valor incorreto permite falsificar o IP usado pelos limitadores. Zero é o padrão.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, ou `CLOUDINARY_URL`.
- Variáveis SMTP descritas abaixo.

O código não publica serviços nem altera configurações automaticamente. Confirme disponibilidade de saída SMTP no plano usado antes de depender da recuperação por e-mail.

## Frontend na Vercel

- Root Directory: `frontend`.
- Build: `npm run build`; saída: `dist`.
- `VITE_API_URL`: URL HTTPS do backend (sem `/api` no final).
- `frontend/vercel.json` contém fallback de navegação e cabeçalhos. A política CSP inclui `https://api-predial.onrender.com` em `connect-src`; altere esse endereço se o backend mudar, inclusive na homologação.
- Publique frontend e backend compatíveis na mesma janela: o frontend antigo não envia o novo token. As sessões antigas exigirão novo login.
- A PWA guarda somente o aplicativo estático. Dados de usuário, fotos e respostas da API não têm cache offline configurado. Validar atualização do service worker no dispositivo real.

## Gmail / SMTP

Configure diretamente no serviço de hospedagem:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-endereco-de-envio
SMTP_PASS=senha-de-aplicativo
SMTP_FROM=seu-endereco-de-envio
```

Use a senha de aplicativo gerada na conta Google com verificação em duas etapas, quando esse recurso estiver disponível para a conta. Não use a senha pessoal da conta. Porta 587 usa STARTTLS; 465 usa TLS direto. As opções podem depender das políticas da sua conta/organização e da rede do provedor.

Sem SMTP configurado, os e-mails não são enviados; links de recuperação não são impressos em log. A resposta pública é genérica para evitar revelar contas. Teste entrega e spam com um endereço controlado, valide expiração/uso único e verifique os logs de falha sem expor credenciais. O envio atual é assíncrono e não tem fila durável/retry; indisponibilidade de SMTP pode exigir um novo pedido de recuperação.

## Fotos e Cloudinary

- Limite por upload: 5 MB, uma foto, assinaturas JPEG/PNG/WEBP verificadas; extensões do nome original não são confiadas.
- Em desenvolvimento, nomes aleatórios são gravados em `uploads/`. Não há rota estática pública para essa pasta.
- A interface pede a imagem em `GET /api/demandas/:id/foto` com token. Backend exige dono, operário atribuído ou administrador.
- Novos recursos Cloudinary são enviados com tipo `authenticated` e entregues pelo backend. Validar suporte e transformação na conta real antes da publicação.
- Fotos antigas públicas continuam públicas no provedor até que sejam migradas/restritas lá. Alterar o código não revoga links Cloudinary já compartilhados.
- A ação “Remover foto” retira a referência da demanda. **O arquivo físico não é apagado automaticamente nesta versão.** Para limpeza manual, faça inventário das URLs/public IDs no banco e no armazenamento, preserve backup, confirme quais objetos estão sem referências e só então remova os objetos aprovados. Nunca apague toda a pasta do Cloudinary.
- A exclusão de demanda também não limpa automaticamente a imagem. Uploads recém-criados cuja validação/gravação falha tentam descartar somente aquele objeto recém-enviado.

## Homologação obrigatória

- Login dos três perfis, bloqueio/desbloqueio, revogação de sessão e troca/redefinição de senha.
- Cadastro simultâneo com o mesmo código; apenas uma conta deve ser criada.
- Abertura → triagem → início → impedimento → conclusão, conferindo histórico, SLA e notificações.
- Chat simultâneo à conclusão/reatribuição em MySQL real, confirmando a transação e o controle de acesso.
- Foto real em Cloudinary, falha do provedor, acesso por outro morador e remoção da referência.
- Exclusão de conta sem histórico e recusa de conta com registros; verificar chaves estrangeiras.
- PDF e Excel com volume realista e descrição longa; fuso/período (relatórios usam limites de mês em UTC).
- Refresh direto em rotas da Vercel, CORS, CSP, celular, teclado e PWA.

## Recuperação / rollback

As migrations adicionam campos. Para falha na nova versão, prefira corrigir ou colocar o serviço em manutenção; não volte para o backend antigo que confiava em `x-usuario-id`. Preserve o schema aditivo e os dados. Volte somente para uma revisão comprovadamente segura e compatível. Se restauração do banco for necessária, faça em nova instância, valide os dados e planeje a troca para não perder gravações posteriores ao backup. Não há rollback destrutivo automatizado neste pacote.
