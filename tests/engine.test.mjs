// Ejecutar con: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { iniciar, responder, validar, contiene, normalizar, pasoParaComentario } from '../bot/engine.mjs';

const flujo = JSON.parse(readFileSync(new URL('../bot/flows.json', import.meta.url), 'utf8'));
const texto = (r) => r.messages.map((m) => m.text).join('\n');

test('el flujo publicado no tiene errores', () => {
  const errores = validar(flujo).filter((p) => p.level === 'error');
  assert.deepEqual(errores, []);
});

test('el flujo publicado no tiene avisos', () => {
  assert.deepEqual(validar(flujo), []);
});

test('normaliza tildes y mayúsculas', () => {
  assert.equal(normalizar('¡MENÚ, Recaída!'), 'menu recaida');
  assert.ok(contiene('Tuve una RECAÍDA ayer', ['recaida*']));
  assert.ok(!contiene('videojuegos', ['juego']));
});

test('empieza en el paso de inicio con botones', () => {
  const r = iniciar(flujo);
  assert.equal(r.state.node, 'inicio');
  const ultimo = r.messages.at(-1);
  assert.equal(ultimo.type, 'buttons');
  assert.ok(ultimo.buttons.length >= 4);
});

test('las señales de crisis llevan siempre al 112 y al 024', () => {
  const frases = [
    'no quiero vivir más',
    'Estoy pensando en el SUICIDIO',
    'creo que me quiero morir',
    'ha tenido una sobredosis',
    'me voy a quitar la vida'
  ];
  for (const frase of frases) {
    let r = iniciar(flujo);
    // incluso a mitad de una pregunta (p. ej. cuando pide el nombre)
    r = responder(flujo, r.state, { type: 'button', payload: 'pedir_nombre' });
    r = responder(flujo, r.state, { type: 'text', text: frase });
    assert.equal(r.crisis, true, frase);
    assert.match(texto(r), /112/, frase);
    assert.match(texto(r), /024/, frase);
  }
});

test('no confunde frases normales con crisis', () => {
  const r = responder(flujo, iniciar(flujo).state, { type: 'text', text: 'quiero vivir tranquilo' });
  assert.notEqual(r.crisis, true);
});

test('las palabras clave llevan al paso correcto', () => {
  const casos = {
    'mi hijo bebe mucho': 'familia',
    'Hola, busco una charla para el instituto': 'charlas',
    'he tenido una recaída': 'info_mas', // recaídas se encadena a «¿algo más?»
    'tengo problemas con las apuestas': 'persona',
    'menú': 'inicio',
    'asdfgh': 'no_entiendo'
  };
  for (const [frase, paso] of Object.entries(casos)) {
    const r = responder(flujo, iniciar(flujo).state, { type: 'text', text: frase });
    assert.equal(r.state.node, paso, frase);
  }
});

test('los pasos encadenados se muestran seguidos', () => {
  const r = responder(flujo, iniciar(flujo).state, { type: 'button', payload: 'persona_sustancia' });
  assert.equal(r.state.node, 'persona_pasos');
  assert.match(texto(r), /médico/);
  assert.match(texto(r), /Cómo prefieres seguir/);
});

test('pide nombre y hora y prepara el WhatsApp con esos datos', () => {
  let r = responder(flujo, iniciar(flujo).state, { type: 'button', payload: 'pedir_nombre' });
  assert.ok(r.state.waiting);
  r = responder(flujo, r.state, { type: 'text', text: '   ' });
  assert.equal(r.state.node, 'pedir_nombre', 'una respuesta vacía no avanza');
  r = responder(flujo, r.state, { type: 'text', text: 'Ana' });
  assert.match(texto(r), /Gracias, Ana/);
  r = responder(flujo, r.state, { type: 'text', text: 'por las tardes' });
  const boton = r.messages.at(-1).buttons[0];
  assert.ok(boton.url.startsWith('https://wa.me/34604887687?text='));
  assert.match(decodeURIComponent(boton.url), /soy Ana.*por las tardes/);
});

test('un botón a un paso que no existe va al paso por defecto', () => {
  const r = responder(flujo, iniciar(flujo).state, { type: 'button', payload: 'no_existe' });
  assert.equal(r.state.node, 'no_entiendo');
});

test('no muta el estado que recibe', () => {
  const inicial = iniciar(flujo).state;
  const copia = JSON.stringify(inicial);
  responder(flujo, inicial, { type: 'button', payload: 'pedir_nombre' });
  assert.equal(JSON.stringify(inicial), copia);
});

test('no entra en bucle infinito si dos pasos se apuntan entre sí', () => {
  const bucle = {
    settings: { startNode: 'a' },
    nodes: { a: { messages: ['a'], next: 'b' }, b: { messages: ['b'], next: 'a' } }
  };
  const r = iniciar(bucle);
  assert.ok(r.messages.length <= 20);
});

test('validar detecta enlaces rotos y botones largos', () => {
  const roto = {
    settings: { startNode: 'a' },
    nodes: { a: { messages: ['hola'], buttons: [{ label: 'Un texto de botón demasiado largo', next: 'zzz' }] } }
  };
  const p = validar(roto);
  assert.ok(p.some((x) => x.level === 'error' && /zzz/.test(x.text)));
  assert.ok(p.some((x) => x.level === 'aviso' && /20 caracteres/.test(x.text)));
});

test('comentarios de Instagram: solo responde con palabra clave', () => {
  assert.equal(pasoParaComentario(flujo, 'FAMILIA 🙏'), 'familia');
  assert.equal(pasoParaComentario(flujo, 'Qué buen vídeo'), null);
});

test('escribir el texto o el número de un botón cuenta como pulsarlo', () => {
  const inicio = iniciar(flujo).state;
  assert.equal(responder(flujo, inicio, { type: 'text', text: 'soy FAMILIAR' }).state.node, 'familia');
  assert.equal(responder(flujo, inicio, { type: 'text', text: '3' }).state.node, 'info');
  const r = responder(flujo, inicio, { type: 'text', text: '99' });
  assert.equal(r.fallback, true);
});

test('un número que corresponde a un enlace devuelve el enlace', () => {
  const hablar = responder(flujo, iniciar(flujo).state, { type: 'button', payload: 'hablar' }).state;
  const r = responder(flujo, hablar, { type: 'text', text: '1' });
  assert.ok(r.messages[0].buttons[0].url.startsWith('https://wa.me/'));
});
