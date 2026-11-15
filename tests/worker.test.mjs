// Pruebas del servidor de Instagram/WhatsApp con Meta simulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../bot-servidor/worker.js';

function kv() {
  const m = new Map();
  return {
    async get(k, tipo) { const v = m.get(k); return v == null ? null : tipo === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
    m
  };
}

function entorno() {
  return { SESIONES: kv(), APP_SECRET: 'secreto', VERIFY_TOKEN: 'tok', IG_TOKEN: 'ig', WA_TOKEN: 'wa', WA_PHONE_ID: '123' };
}

let enviados = [];
globalThis.fetch = async (url, opts) => {
  enviados.push({ url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null });
  return new Response('{}', { status: 200 });
};

async function aviso(env, cuerpo, firmaMala) {
  const crudo = JSON.stringify(cuerpo);
  const firma = 'sha256=' + createHmac('sha256', firmaMala ? 'otro' : env.APP_SECRET).update(crudo).digest('hex');
  const pendientes = [];
  const res = await worker.fetch(
    new Request('https://bot.example/webhook', { method: 'POST', body: crudo, headers: { 'x-hub-signature-256': firma } }),
    env,
    { waitUntil: (p) => pendientes.push(p) }
  );
  await Promise.all(pendientes);
  return res;
}

const igTexto = (texto, de = '555') => ({ object: 'instagram', entry: [{ id: '999', messaging: [{ sender: { id: de }, recipient: { id: '999' }, message: { mid: 'm', text: texto } }] }] });
const waTexto = (texto) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ from: '34600000000', type: 'text', text: { body: texto } }] } }] }] });
const waBoton = (id) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ from: '34600000000', type: 'interactive', interactive: { button_reply: { id, title: 'x' } } }] } }] }] });

test('verificación del webhook', async () => {
  const env = entorno();
  const ok = await worker.fetch(new Request('https://b/webhook?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=42'), env, {});
  assert.equal(await ok.text(), '42');
  const mal = await worker.fetch(new Request('https://b/webhook?hub.mode=subscribe&hub.verify_token=no&hub.challenge=42'), env, {});
  assert.equal(mal.status, 403);
});

test('rechaza avisos sin firma válida', async () => {
  enviados = [];
  const res = await aviso(entorno(), igTexto('hola'), true);
  assert.equal(res.status, 401);
  assert.equal(enviados.length, 0);
});

test('Instagram: saluda con respuestas rápidas', async () => {
  enviados = [];
  await aviso(entorno(), igTexto('hola'));
  const ultimo = enviados.at(-1).body;
  assert.equal(ultimo.recipient.id, '555');
  assert.ok(ultimo.message.quick_replies.length >= 4);
  assert.ok(ultimo.message.quick_replies.every((q) => q.title.length <= 20));
});

test('Instagram: crisis siempre responde con 112 y 024', async () => {
  enviados = [];
  await aviso(entorno(), igTexto('no quiero vivir'));
  const textos = enviados.map((e) => e.body.message.text).join('\n');
  assert.match(textos, /112/);
  assert.match(textos, /024/);
});

test('Instagram: si no entiende dos veces, se calla para que conteste Salva', async () => {
  const env = entorno();
  await aviso(env, igTexto('hola'));
  enviados = [];
  await aviso(env, igTexto('blablabla'));
  assert.ok(enviados.length > 0, 'primera vez: explica que no ha entendido');
  enviados = [];
  await aviso(env, igTexto('otra cosa rara'));
  assert.equal(enviados.length, 0, 'segunda vez: silencio');
});

test('Instagram: comentario con palabra clave → mensaje privado y respuesta pública', async () => {
  const env = entorno();
  enviados = [];
  const comentario = { object: 'instagram', entry: [{ id: '999', changes: [{ field: 'comments', value: { id: 'c1', text: 'FAMILIA', from: { id: '777' } } }] }] };
  await aviso(env, comentario);
  assert.equal(enviados[0].body.recipient.comment_id, 'c1');
  assert.match(enviados[0].body.message.text, /1\. Hablar por WhatsApp: https:\/\/wa\.me\/34604887687\n2\. Que me llame Salva/);
  assert.match(enviados[1].url, /c1\/replies/);
  // si Instagram lo reenvía, no se repite
  enviados = [];
  await aviso(env, comentario);
  assert.equal(enviados.length, 0);
  // y si luego responde "2", sigue la conversación
  await aviso(env, igTexto('2', '777'));
  assert.ok(enviados.length > 0);
});

test('Instagram: comentarios sin palabra clave se ignoran', async () => {
  enviados = [];
  await aviso(entorno(), { object: 'instagram', entry: [{ id: '999', changes: [{ field: 'comments', value: { id: 'c2', text: 'Qué bonito', from: { id: '777' } } }] }] });
  assert.equal(enviados.length, 0);
});

test('WhatsApp: botones (máx. 3) o lista, y "Hablar por WhatsApp" pasa con Salva', async () => {
  const env = entorno();
  enviados = [];
  await aviso(env, waTexto('hola'));
  const inicio = enviados.at(-1).body;
  assert.equal(inicio.interactive.type, 'list');
  enviados = [];
  await aviso(env, waBoton('hablar'));
  const hablar = enviados.at(-1).body;
  // WhatsApp + Que me llame + Volver = 3 botones; "Llamar" va en el texto
  assert.equal(hablar.interactive.type, 'button');
  const ids = hablar.interactive.action.buttons.map((b) => b.reply.id);
  assert.ok(ids.includes('__humano'));
  assert.match(hablar.interactive.body.text, /Llamar a Salva: \+34604887687/);
  enviados = [];
  await aviso(env, waBoton('__humano'));
  assert.match(enviados[0].body.text.body, /Salva leerá/);
  // bot en pausa…
  enviados = [];
  await aviso(env, waTexto('hola otra vez'));
  assert.equal(enviados.length, 0);
  // …salvo crisis
  await aviso(env, waTexto('creo que me quiero morir'));
  assert.match(JSON.stringify(enviados), /024/);
});
