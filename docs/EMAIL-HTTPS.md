# Ativar e-mail HTTPS no Render

Esta atualização usa a API da Brevo para recuperação de senha e notificações. Não altera o banco nem exige migrations. SMTP continua disponível com EMAIL_PROVIDER=smtp; sem EMAIL_PROVIDER, uma BREVO_API_KEY seleciona Brevo, caso contrário mantém SMTP. Selecionar Brevo não faz fallback SMTP.

1. Crie/accesse sua conta Brevo e habilite o envio transacional conforme as exigências da conta.
2. Cadastre e verifique um remetente. Configure a autenticação do domínio conforme as instruções da Brevo. Não presuma que qualquer endereço Gmail poderá ser usado livremente.
3. Gere uma chave API com permissão de envio transacional (não uma chave SMTP). Não coloque a chave no GitHub, Vercel ou chat.
4. No Render, configure:
   - EMAIL_PROVIDER=brevo
   - BREVO_API_KEY=sua chave privada
   - EMAIL_FROM=endereço do remetente verificado, sem nome ou sinais < >
   - EMAIL_FROM_NAME=API-PREDIAL
   - FRONTEND_URL=https://api-predial.vercel.app (ou o endereço real da interface)
5. Publique estes arquivos: lib/email.js, lib/email-brevo.js, tests/email-brevo.test.js, .env.example e este guia. Preserve seu .env e certificado local.
6. Faça deploy do commit novo no Render. Não precisa mudar a Vercel.
7. Cadastre no perfil de uma conta de teste um e-mail sob seu controle. Solicite a recuperação, confira os logs transacionais da Brevo, caixa de entrada e spam.
8. Abra o link, altere a senha, confirme o login e confirme que o mesmo link não pode ser usado novamente.

O link permanece válido por 30 minutos; um pedido novo substitui o anterior. Não altera a senha até o usuário concluir a redefinição. A resposta pública permanece genérica para não revelar contas.

O log “Mensagem aceita pela Brevo” confirma aceitação pelo provedor, não entrega na caixa de entrada. HTTP 401/403: confira chave, permissões e conta; 429: cota/limite; demais erros: confira remetente e logs. Não se registram chave, destinatário, corpo nem link.

Há timeout de 15 segundos e não há reenvio automático ou fila durável: se o processo reiniciar durante um envio, ou o provedor falhar, solicite outro link depois de corrigir a causa. A chave e o remetente reais ainda precisam ser configurados; testes automatizados usam respostas simuladas e não comprovam entrega real.

## Explicação didática

O SMTP é um protocolo usado para enviar e-mails. Ele funciona normalmente em servidores que permitem essa conexão. O problema do API-PREDIAL era uma restrição do plano gratuito do Render: ele bloqueia as portas 25, 465 e 587, usadas no envio SMTP. Por isso, mesmo com usuário e senha corretos, o sistema não conseguia se comunicar com o servidor de e-mail.

Na nova integração, o sistema envia o pedido de entrega para a Brevo por HTTPS, na porta 443, o mesmo tipo de conexão segura usado por sites. A Brevo recebe a solicitação autenticada por uma chave privada e cuida da entrega do e-mail.

O caminho passa a ser: usuário solicita recuperação → API-PREDIAL gera um link temporário → envia a mensagem à Brevo por HTTPS → Brevo encaminha o e-mail → usuário abre o link e cria uma nova senha.

A mudança é na conexão entre o sistema e o serviço de envio. O SMTP continua fazendo parte da infraestrutura de e-mail do provedor; apenas deixa de ser usado diretamente pelo aplicativo hospedado no Render. O funcionamento real depende de chave válida, remetente verificado, conta habilitada e cota disponível.

Fontes:
- https://render.com/docs/free
- https://developers.brevo.com/docs/send-a-transactional-email
- https://developers.brevo.com/docs/getting-started-with-senders-and-domains
