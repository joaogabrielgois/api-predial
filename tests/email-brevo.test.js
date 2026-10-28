const { test } = require('node:test');
const assert = require('node:assert/strict');
const { enviarBrevo } = require('../lib/email-brevo');
const env = { BREVO_API_KEY: 'chave-ficticia', EMAIL_FROM: 'sistema@example.com' };
const msg = { to: 'morador@example.com', subject: 'Redefinição', html: '<a href="https://example.com/reset?token=ficticio">Redefinir</a>' };
test('Brevo envia por HTTPS com autenticação, timeout e conteúdo correto', async () => {
  let chamadas = 0;
  const r = await enviarBrevo(msg, { env, fetchImpl: async (url, opts) => {
    chamadas++;
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(opts.method, 'POST');
    assert.equal(opts.redirect, 'error');
    assert.ok(opts.signal instanceof AbortSignal);
    assert.equal(opts.headers['api-key'], env.BREVO_API_KEY);
    const body = JSON.parse(opts.body);
    assert.deepEqual(body.to, [{ email: msg.to }]);
    assert.equal(body.sender.email, env.EMAIL_FROM);
    assert.equal(body.htmlContent, msg.html);
    return Response.json({ messageId: 'fake-id' }, { status: 201 });
  } });
  assert.deepEqual(r, { enviado: true });
  assert.equal(chamadas, 1);
});
test('Configuração incompleta ou destinatário ausente não faz requisição', async () => {
  const fetchImpl = async () => { assert.fail('Não deveria chamar a rede'); };
  for (const config of [{}, { BREVO_API_KEY: 'fake' }, { ...env, EMAIL_FROM: 'Inválido' }]) {
    assert.equal((await enviarBrevo(msg, { env: config, fetchImpl })).enviado, false);
  }
  assert.equal((await enviarBrevo({ ...msg, to: '' }, { env, fetchImpl })).enviado, false);
});
test('Erros HTTP não vazam conteúdo nem provocam reenvio automático', async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    let chamadas = 0;
    const r = await enviarBrevo(msg, { env, fetchImpl: async () => {
      chamadas++;
      return new Response('segredo-e-token-nao-devem-sair', { status });
    } });
    assert.equal(r.enviado, false);
    assert.equal(chamadas, 1);
    assert.ok(!JSON.stringify(r).includes('segredo-e-token'));
  }
});
test('Timeout, erro de rede e resposta inválida não derrubam aplicação', async () => {
  for (const fetchImpl of [
    async () => { throw new DOMException('segredo', 'TimeoutError'); },
    async () => { throw new Error('segredo'); },
    async () => Response.json({}),
    async () => new Response('não-json'),
  ]) {
    const r = await enviarBrevo(msg, { env, fetchImpl });
    assert.equal(r.enviado, false);
    assert.ok(!JSON.stringify(r).includes('segredo'));
  }
});
test('Módulo principal seleciona Brevo mesmo com SMTP antigo configurado', async () => {
  const antigo = { ...process.env };
  const fetchOriginal = globalThis.fetch;
  try {
    Object.assign(process.env, env, { EMAIL_PROVIDER: 'brevo', SMTP_HOST: 'invalid.example', SMTP_USER: 'fake', SMTP_PASS: 'fake' });
    globalThis.fetch = async (url, opts) => {
      assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
      assert.ok(JSON.parse(opts.body).htmlContent.includes('token=ficticio'));
      return Response.json({ messageId: 'fake' }, { status: 201 });
    };
    delete require.cache[require.resolve('../lib/email')];
    const email = require('../lib/email');
    assert.equal((await email.enviarEmailRedefinicaoSenha({ email: msg.to }, 'https://example.com/reset?token=ficticio')).enviado, true);
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const key of Object.keys(process.env)) if (!(key in antigo)) delete process.env[key];
    Object.assign(process.env, antigo);
    delete require.cache[require.resolve('../lib/email')];
  }
});
