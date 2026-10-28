async function enviarBrevo({ to, subject, html }, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!to) return { enviado: false, motivo: 'Destinatário sem e-mail cadastrado.' };
  if (!env.BREVO_API_KEY?.trim() || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.EMAIL_FROM || '')) {
    console.warn('[EMAIL] Brevo: configure BREVO_API_KEY e EMAIL_FROM com o remetente verificado.');
    return { enviado: false, motivo: 'Configuração Brevo incompleta.' };
  }
  try {
    const resposta = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'api-key': env.BREVO_API_KEY.trim(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME || 'API-PREDIAL' },
        to: [{ email: to }], subject, htmlContent: html }),
    });
    if (!resposta.ok) {
      // Nunca registrar o corpo de erro: pode conter dados privados.
      await resposta.body?.cancel();
      const dica = resposta.status === 401 || resposta.status === 403
        ? 'Confira chave API, permissões e liberação da conta Brevo.'
        : resposta.status === 429 ? 'Limite de envio atingido; confira a cota da conta Brevo.'
          : 'Confira remetente verificado e logs transacionais na Brevo.';
      console.error('[EMAIL] Brevo HTTP ' + resposta.status + '. ' + dica);
      return { enviado: false, motivo: 'Brevo HTTP ' + resposta.status, dica };
    }
    const dados = await resposta.json();
    if (typeof dados.messageId !== 'string' || !dados.messageId) throw new Error('Resposta inválida');
    console.log('[EMAIL] Mensagem aceita pela Brevo; entrega deve ser conferida no provedor.');
    return { enviado: true };
  } catch {
    console.error('[EMAIL] Brevo: falha de rede, timeout ou resposta inválida.');
    return { enviado: false, motivo: 'Falha de comunicação com a Brevo.' };
  }
}
module.exports = { enviarBrevo };
