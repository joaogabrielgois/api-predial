const nodemailer = require('nodemailer');
const { enviarBrevo } = require('./email-brevo');
const provedor = (process.env.EMAIL_PROVIDER || (process.env.BREVO_API_KEY ? 'brevo' : 'smtp')).trim().toLowerCase();
const escapar = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ==========================================
   ENVIO DE E-MAIL (BREVO HTTPS OU SMTP)
   Configurável via variáveis de ambiente (.env):
   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
   Brevo: EMAIL_PROVIDER=brevo, BREVO_API_KEY, EMAIL_FROM e EMAIL_FROM_NAME.
   Conteúdo, destinatários e links de recuperação não são registrados nos logs.
========================================== */

const smtpConfigurado = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;

if (provedor === 'smtp' && smtpConfigurado) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    connectionTimeout: 10000,
    socketTimeout: 15000,
    requireTLS: Number(process.env.SMTP_PORT) !== 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// Traduz os erros mais comuns do nodemailer numa dica acionável, em vez de
// só repetir a mensagem técnica do provedor SMTP.
function dicaParaErro(error) {
  const codigo = error?.code || '';
  const msg = (error?.message || '').toLowerCase();

  if (codigo === 'EAUTH' || msg.includes('invalid login') || msg.includes('username and password not accepted')) {
    return 'Falha de autenticação. Se estiver usando Gmail, SMTP_USER/SMTP_PASS precisa ser uma "Senha de app" '
      + '(16 dígitos, gerada em myaccount.google.com/apppasswords com a verificação em duas etapas ativada) — '
      + 'a senha normal da conta Google não funciona aqui.';
  }
  if (codigo === 'ECONNECTION' || codigo === 'ETIMEDOUT' || codigo === 'ESOCKET') {
    return 'Não foi possível conectar ao servidor SMTP. Confira SMTP_HOST e SMTP_PORT, e se o serviço onde a API '
      + 'roda (ex: Render) não está bloqueando a porta configurada.';
  }
  return null;
}

/**
 * Envia um e-mail. Nunca lança exceção para não quebrar o fluxo principal
 * (ex: atualização de status de uma demanda) caso o envio falhe.
 */
async function enviarEmail({ to, subject, html }) {
  if (provedor === 'brevo') return enviarBrevo({ to, subject, html });
  if (provedor !== 'smtp') {
    console.error('[EMAIL] EMAIL_PROVIDER inválido. Use brevo ou smtp.');
    return { enviado: false, motivo: 'Provedor de e-mail inválido.' };
  }
  if (!to) return { enviado: false, motivo: 'Destinatário sem e-mail cadastrado.' };

  if (!smtpConfigurado) {
    console.warn('[EMAIL] SMTP não configurado. Mensagem não enviada; conteúdo omitido.');
    return { enviado: false, motivo: 'SMTP não configurado (envio desativado).' };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    });
    console.log('[EMAIL] Mensagem entregue ao servidor SMTP.');
    return { enviado: true };
  } catch (error) {
    const dica = dicaParaErro(error);
    console.error('[EMAIL] Falha de envio:', error.code || 'SMTP_ERROR');
    if (dica) console.error(`[EMAIL] Dica: ${dica}`);
    return { enviado: false, motivo: error.message, dica };
  }
}

/**
 * Testa a conexão/autenticação SMTP e imprime um resultado claro no log.
 * Feito para ser chamado uma vez na inicialização do servidor, para que o
 * status do e-mail apareça de cara nos logs do Render (não escondido,
 * só quando alguém pedir recuperação de senha).
 */
async function verificarConexaoSmtp() {
  if (provedor !== 'smtp') return { ok: false, motivo: 'SMTP não selecionado; esta verificação não testa HTTPS.' };
  if (!smtpConfigurado) {
    console.log('[EMAIL] SMTP não configurado (SMTP_HOST/SMTP_USER/SMTP_PASS ausentes) — e-mails não serão enviados.');
    return { ok: false, motivo: 'SMTP não configurado.' };
  }

  try {
    await transporter.verify();
    console.log('[EMAIL] Conexão SMTP verificada.');
    return { ok: true };
  } catch (error) {
    const dica = dicaParaErro(error);
    console.error('[EMAIL] Falha na verificação SMTP:', error.code || 'SMTP_ERROR');
    if (dica) console.error(`[EMAIL] Dica: ${dica}`);
    console.error('[EMAIL] Enquanto isso não for corrigido, "esqueci minha senha" e as notificações por e-mail não serão entregues.');
    return { ok: false, motivo: error.message, dica };
  }
}

/* ==========================================
   TEMPLATES DE E-MAIL
========================================== */

function templateBase(titulo, mensagem) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background:#0f172a; color:#e2e8f0; padding: 24px; border-radius: 16px;">
      <h2 style="color:#60a5fa; margin-top:0;">🏢 Sistema de Manutenção Predial</h2>
      <h3 style="color:#ffffff;">${titulo}</h3>
      <p style="line-height:1.6; color:#cbd5e1;">${mensagem}</p>
      <hr style="border:none; border-top:1px solid #334155; margin: 20px 0;" />
      <p style="font-size:12px; color:#64748b;">Esta é uma mensagem automática, não é necessário responder este e-mail.</p>
    </div>
  `;
}

async function notificarInicioServico(usuario, demanda) {
  return enviarEmail({
    to: usuario.email,
    subject: `Serviço iniciado - Demanda #${demanda.id}`,
    html: templateBase(
      `O operário iniciou o atendimento da sua demanda #${demanda.id}`,
      `Setor: <strong>${demanda.setor}</strong><br/>Descrição: ${escapar(demanda.descricao)}<br/><br/>Você pode acompanhar o andamento pelo sistema.`
    ),
  });
}

async function notificarConclusaoServico(usuario, demanda) {
  return enviarEmail({
    to: usuario.email,
    subject: `Serviço concluído - Demanda #${demanda.id}`,
    html: templateBase(
      `Sua demanda #${demanda.id} foi concluída! ✅`,
      `Setor: <strong>${demanda.setor}</strong><br/>Descrição: ${escapar(demanda.descricao)}<br/><br/>Obrigado por utilizar o sistema de manutenção predial.`
    ),
  });
}

async function notificarImpedimento(usuario, demanda) {
  return enviarEmail({
    to: usuario.email,
    subject: `Atenção - Demanda #${demanda.id} com impedimento`,
    html: templateBase(
      `Houve um impedimento no atendimento da sua demanda #${demanda.id}`,
      `Motivo relatado pelo operário: <strong>${escapar(demanda.motivo_impedimento || 'Não informado')}</strong>`
    ),
  });
}

async function notificarAtribuicao(usuario, demanda) {
  return enviarEmail({
    to: usuario.email,
    subject: `Demanda #${demanda.id} atribuída a um operário`,
    html: templateBase(
      `Sua demanda #${demanda.id} já está na fila de atendimento`,
      `Um operário foi designado para atender sua solicitação. Prazo estimado de atendimento (SLA): <strong>${demanda.sla_prazo ? new Date(demanda.sla_prazo).toLocaleString('pt-BR') : 'a definir'}</strong>.`
    ),
  });
}

async function enviarEmailRedefinicaoSenha(usuario, link) {
  return enviarEmail({
    to: usuario.email,
    subject: 'Redefinição de senha - Sistema de Manutenção Predial',
    html: templateBase(
      'Redefinição de senha solicitada',
      `Recebemos uma solicitação para redefinir sua senha. Clique no link abaixo para criar uma nova senha (válido por 30 minutos):<br/><br/>
      <a href="${escapar(link)}" style="color:#60a5fa;">${escapar(link)}</a><br/><br/>
      Se você não solicitou essa alteração, ignore este e-mail.`
    ),
  });
}

module.exports = {
  enviarEmail,
  verificarConexaoSmtp,
  notificarInicioServico,
  notificarConclusaoServico,
  notificarImpedimento,
  notificarAtribuicao,
  enviarEmailRedefinicaoSenha,
};
