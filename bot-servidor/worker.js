/*
 * Servidor del asistente de Salva Vidas para Instagram y WhatsApp.
 * Funciona en Cloudflare Workers (plan gratuito). Ver README.md de esta carpeta.
 *
 * Qué hace:
 *  - Responde a los mensajes privados de Instagram y de WhatsApp con los mismos
 *    flujos que el chat de la web (bot/flows.json).
 *  - Cuando alguien comenta una palabra clave en una publicación de Instagram
 *    ("FAMILIA", "AYUDA"…), le escribe por privado.
 *  - Si detecta señales de crisis, responde siempre con el 112 y el 024.
 *  - Si no entiende dos veces seguidas, se calla para que Salva conteste en persona.
 *  - En WhatsApp, "Hablar con Salva" pausa el bot 24 h con esa persona.
 */
import * as motor from '../bot/engine.mjs';
import flujoIncluido from '../bot/flows.json' with { type: 'json' };

var VERSION_API = 'v21.0';
var DIAS_GUARDADO = 30;
var PAUSA_HUMANO_MS = 24 * 60 * 60 * 1000;
var CADUCA_CONVERSACION_MS = 24 * 60 * 60 * 1000; // pasado un día sin hablar, se empieza de nuevo

/* ---------- utilidades ---------- */

function respuesta(texto, estado) {
  return new Response(texto, { status: estado || 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

async function firmaValida(cuerpo, cabecera, secreto) {
  if (!secreto) return false;
  if (!cabecera || cabecera.indexOf('sha256=') !== 0) return false;
  var clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  var firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(cuerpo));
  var hex = Array.from(new Uint8Array(firma)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  var esperada = cabecera.slice(7);
  if (hex.length !== esperada.length) return false;
  var dif = 0;
  for (var i = 0; i < hex.length; i++) dif |= hex.charCodeAt(i) ^ esperada.charCodeAt(i);
  return dif === 0;
}

/** Usa los flujos publicados en la web (así el editor manda); si fallan, los incluidos. */
async function cargarFlujo(env) {
  if (!env.FLOWS_URL) return flujoIncluido;
  try {
    var r = await fetch(env.FLOWS_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!r.ok) throw new Error(r.status);
    var f = await r.json();
    var errores = motor.validar(f).filter(function (p) { return p.level === 'error'; });
    if (errores.length) throw new Error('flows.json con errores: ' + errores[0].text);
    return f;
  } catch (e) {
    console.log('Uso los flujos incluidos:', e.message);
    return flujoIncluido;
  }
}

async function leerSesion(env, clave) {
  var s = await env.SESIONES.get(clave, 'json');
  if (!s || Date.now() - (s.t || 0) > CADUCA_CONVERSACION_MS) {
    return { state: null, fallos: 0, humanoHasta: s && s.humanoHasta || 0, t: 0 };
  }
  return s;
}

function guardarSesion(env, clave, s) {
  s.t = Date.now();
  return env.SESIONES.put(clave, JSON.stringify(s), { expirationTtl: DIAS_GUARDADO * 24 * 3600 });
}

/** Mensajes de texto para canales sin enlaces en botones. */
function lineaEnlace(b) {
  if (b.url.indexOf('tel:') === 0) {
    var n = b.url.replace(/^tel:\+?/, '');
    return '📞 ' + b.label + ': ' + (n.length > 6 ? '+' + n : n);
  }
  // En Instagram/WhatsApp el texto ya escrito de la web ("te escribo desde la web") no encaja: enlace corto.
  if (b.url.indexOf('https://wa.me/') === 0) return '💬 ' + b.label + ': ' + b.url.split('?')[0];
  return '🔗 ' + b.label + ': ' + b.url;
}

function corta(texto, max) {
  texto = String(texto || '');
  return texto.length > max ? texto.slice(0, max - 1) + '…' : texto;
}

/**
 * Decide qué hacer con un mensaje entrante y devuelve los mensajes a enviar.
 * canal: 'ig' | 'wa'
 */
async function conversar(env, flujo, canal, usuario, entrada) {
  var clave = canal + ':' + usuario;
  var s = await leerSesion(env, clave);
  var resultado;

  // Botón especial de WhatsApp: pasar con Salva y pausar el bot.
  if (entrada.type === 'button' && entrada.payload === '__humano') {
    s.humanoHasta = Date.now() + PAUSA_HUMANO_MS;
    await guardarSesion(env, clave, s);
    return [{ type: 'text', text: flujo.settings.handoffMessage || 'Perfecto. Salva leerá esta conversación y te responderá en cuanto pueda. Si es urgente, llama al 112.' }];
  }

  var esCrisis = entrada.type === 'text' && motor.contiene(entrada.text, flujo.settings.crisisKeywords);

  // Si Salva está atendiendo en persona, el bot no interrumpe (salvo crisis).
  if (s.humanoHasta > Date.now() && !esCrisis) return [];

  if (!s.state) {
    // Primera vez (o tras un día sin hablar): si ya escribe algo con sentido, se atiende; si no, bienvenida.
    var inicio = motor.iniciar(flujo);
    resultado = motor.responder(flujo, inicio.state, entrada);
    if (resultado.fallback) resultado = inicio;
  } else {
    resultado = motor.responder(flujo, s.state, entrada);
  }

  if (resultado.fallback) {
    s.fallos = (s.fallos || 0) + 1;
    s.state = resultado.state;
    await guardarSesion(env, clave, s);
    // A la segunda vez que no entiende, se calla: lo verá Salva.
    return s.fallos >= 2 ? [] : resultado.messages;
  }

  s.fallos = 0;
  s.state = resultado.state;
  await guardarSesion(env, clave, s);
  return resultado.messages;
}

/* ---------- Instagram ---------- */

async function igLlamar(env, ruta, cuerpo) {
  var r = await fetch('https://graph.instagram.com/' + VERSION_API + '/' + ruta, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.IG_TOKEN },
    body: JSON.stringify(cuerpo)
  });
  if (!r.ok) console.log('Instagram', ruta, r.status, await r.text());
  return r.ok;
}

function igMensajes(mensajes) {
  // Instagram: botones de paso como respuestas rápidas (máx. 13); enlaces dentro del texto.
  return mensajes.map(function (m) {
    var texto = m.text || '';
    var rapidas = [];
    (m.buttons || []).forEach(function (b) {
      if (b.payload) rapidas.push({ content_type: 'text', title: corta(b.label, 20), payload: b.payload });
      else if (b.url) texto += (texto ? '\n' : '') + lineaEnlace(b);
    });
    var msg = { text: corta(texto || '👇', 1000) };
    if (rapidas.length) msg.quick_replies = rapidas.slice(0, 13);
    return msg;
  });
}

async function igEnviar(env, destinatario, mensajes) {
  var lista = igMensajes(mensajes);
  for (var i = 0; i < lista.length; i++) {
    await igLlamar(env, 'me/messages', { recipient: destinatario, message: lista[i] });
  }
}

/** Texto de respuesta privada a un comentario: un solo mensaje, con opciones numeradas. */
function textoParaComentario(mensajes) {
  var partes = [];
  var n = 0;
  mensajes.forEach(function (m) {
    if (m.text) partes.push(m.text);
    (m.buttons || []).forEach(function (b) {
      n++;
      partes.push(b.payload ? n + '. ' + b.label : n + '. ' + lineaEnlace(b).replace(/^\S+ /, ''));
    });
  });
  if (n) partes.push('Responde con el número o con lo que quieras contarme.');
  return corta(partes.join('\n'), 1000);
}

async function igProcesar(env, flujo, cuerpo) {
  for (var entry of cuerpo.entry || []) {
    var miCuenta = entry.id;

    for (var ev of entry.messaging || []) {
      if (!ev.sender || ev.sender.id === miCuenta) continue; // mis propios mensajes
      if (ev.message && ev.message.is_echo) continue;
      if (ev.read || ev.reaction) continue;
      var entrada = null;
      if (ev.message && ev.message.quick_reply) entrada = { type: 'button', payload: ev.message.quick_reply.payload };
      else if (ev.postback && ev.postback.payload) entrada = { type: 'button', payload: ev.postback.payload };
      else if (ev.message && ev.message.text) entrada = { type: 'text', text: ev.message.text };
      if (!entrada) continue; // fotos, audios, stickers: los ve Salva
      var mensajes = await conversar(env, flujo, 'ig', ev.sender.id, entrada);
      if (mensajes.length) await igEnviar(env, { id: ev.sender.id }, mensajes);
    }

    for (var cambio of entry.changes || []) {
      if (cambio.field !== 'comments' || !cambio.value) continue;
      var c = cambio.value;
      if (!c.id || !c.from || c.from.id === miCuenta) continue;
      var paso = motor.pasoParaComentario(flujo, c.text);
      if (!paso) continue;

      // Para no repetir si Instagram reenvía el aviso.
      var hecho = 'comentario:' + c.id;
      if (await env.SESIONES.get(hecho)) continue;
      await env.SESIONES.put(hecho, '1', { expirationTtl: 7 * 24 * 3600 });

      var inicio = motor.iniciar(flujo);
      var r = motor.responder(flujo, inicio.state, { type: 'button', payload: paso });
      await igLlamar(env, 'me/messages', { recipient: { comment_id: c.id }, message: { text: textoParaComentario(r.messages) } });
      await guardarSesion(env, 'ig:' + c.from.id, { state: r.state, fallos: 0, humanoHasta: 0 });
      if (flujo.settings.commentReply) {
        await igLlamar(env, c.id + '/replies', { message: flujo.settings.commentReply });
      }
    }
  }
}

/* ---------- WhatsApp ---------- */

async function waEnviar(env, para, mensajes, flujo) {
  var propio = String(flujo.settings.whatsapp || '').replace(/\D/g, '');
  for (var m of mensajes) {
    var texto = m.text || '';
    var botones = [];
    (m.buttons || []).forEach(function (b) {
      // En WhatsApp, "Hablar por WhatsApp" con el propio número = pasar con Salva.
      if (b.url && propio && b.url.indexOf('https://wa.me/' + propio) === 0) botones.push({ id: '__humano', title: b.label });
      else if (b.payload) botones.push({ id: b.payload, title: b.label });
      else if (b.url) texto += (texto ? '\n' : '') + lineaEnlace(b);
    });
    texto = corta(texto || '👇', 1024);

    var cuerpo;
    if (!botones.length) {
      cuerpo = { type: 'text', text: { body: texto, preview_url: false } };
    } else if (botones.length <= 3) {
      cuerpo = { type: 'interactive', interactive: { type: 'button', body: { text: texto }, action: {
        buttons: botones.map(function (b) { return { type: 'reply', reply: { id: b.id, title: corta(b.title, 20) } }; })
      } } };
    } else {
      cuerpo = { type: 'interactive', interactive: { type: 'list', body: { text: texto }, action: {
        button: 'Ver opciones',
        sections: [{ title: 'Elige una opción', rows: botones.slice(0, 10).map(function (b) { return { id: b.id, title: corta(b.title, 24) }; }) }]
      } } };
    }
    cuerpo.messaging_product = 'whatsapp';
    cuerpo.to = para;

    var r = await fetch('https://graph.facebook.com/' + VERSION_API + '/' + env.WA_PHONE_ID + '/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.WA_TOKEN },
      body: JSON.stringify(cuerpo)
    });
    if (!r.ok) console.log('WhatsApp', r.status, await r.text());
  }
}

async function waProcesar(env, flujo, cuerpo) {
  for (var entry of cuerpo.entry || []) {
    for (var cambio of entry.changes || []) {
      var v = cambio.value || {};
      for (var msg of v.messages || []) {
        var entrada = null;
        if (msg.type === 'text') entrada = { type: 'text', text: msg.text.body };
        else if (msg.type === 'interactive' && msg.interactive.button_reply) entrada = { type: 'button', payload: msg.interactive.button_reply.id };
        else if (msg.type === 'interactive' && msg.interactive.list_reply) entrada = { type: 'button', payload: msg.interactive.list_reply.id };
        else if (msg.type === 'button' && msg.button) entrada = { type: 'text', text: msg.button.text };
        if (!entrada) continue;
        var mensajes = await conversar(env, flujo, 'wa', msg.from, entrada);
        if (mensajes.length) await waEnviar(env, msg.from, mensajes, flujo);
      }
    }
  }
}

/* ---------- entrada ---------- */

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);

    if (url.pathname !== '/webhook') {
      return respuesta('Asistente de Salva Vidas: funcionando.');
    }

    // Meta comprueba la dirección al configurar el webhook.
    if (request.method === 'GET') {
      if (url.searchParams.get('hub.mode') === 'subscribe' && env.VERIFY_TOKEN &&
          url.searchParams.get('hub.verify_token') === env.VERIFY_TOKEN) {
        return respuesta(url.searchParams.get('hub.challenge') || '');
      }
      return respuesta('Token de verificación incorrecto', 403);
    }

    if (request.method !== 'POST') return respuesta('Método no permitido', 405);

    var crudo = await request.text();
    var firma = request.headers.get('x-hub-signature-256');
    var ok = await firmaValida(crudo, firma, env.APP_SECRET) ||
             (env.WA_APP_SECRET && await firmaValida(crudo, firma, env.WA_APP_SECRET));
    if (!ok) return respuesta('Firma no válida', 401);

    var cuerpo;
    try { cuerpo = JSON.parse(crudo); } catch (e) { return respuesta('JSON no válido', 400); }

    // Se responde enseguida a Meta y se trabaja después (si no, Meta reintenta).
    ctx.waitUntil((async function () {
      try {
        var flujo = await cargarFlujo(env);
        if (cuerpo.object === 'instagram' && env.IG_TOKEN) await igProcesar(env, flujo, cuerpo);
        if (cuerpo.object === 'whatsapp_business_account' && env.WA_TOKEN) await waProcesar(env, flujo, cuerpo);
      } catch (e) {
        console.log('Error procesando el aviso:', e && e.stack || e);
      }
    })());

    return respuesta('EVENT_RECEIVED');
  }
};

// Para las pruebas.
export var _interno = { conversar: conversar, igMensajes: igMensajes, textoParaComentario: textoParaComentario, firmaValida: firmaValida };
