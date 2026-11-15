/*
 * Motor de conversación de Salva Vidas.
 *
 * Es el mismo para los tres canales (chat de la web, Instagram y WhatsApp):
 * recibe el estado de la conversación y lo que escribe o pulsa la persona,
 * y devuelve el nuevo estado y los mensajes que hay que mostrar.
 * No guarda nada por sí mismo ni usa la red.
 */

var MAX_SALTOS = 20; // evita bucles infinitos si un paso apunta a otro sin parar

/** Quita tildes y pasa a minúsculas para comparar palabras clave. */
export function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿Contiene el texto alguna de las palabras o frases clave? */
export function contiene(texto, claves) {
  var t = ' ' + normalizar(texto) + ' ';
  return (claves || []).some(function (clave) {
    // Una clave terminada en * vale como prefijo: "suicid*" → suicidio, suicidarme…
    var prefijo = String(clave || '').trim().slice(-1) === '*';
    var c = normalizar(clave);
    if (!c) return false;
    return t.indexOf(' ' + c + (prefijo ? '' : ' ')) !== -1;
  });
}

/** Sustituye {{variable}} por su valor. */
export function rellenar(texto, vars) {
  return String(texto || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (_, nombre) {
    var v = vars && vars[nombre];
    return v == null ? '' : String(v);
  });
}

function soloDigitos(tel) {
  return String(tel || '').replace(/\D/g, '');
}

/** Convierte un botón del flujo en algo que cualquier canal sepa pintar. */
function resolverBoton(flujo, boton, vars) {
  var ajustes = flujo.settings || {};
  var etiqueta = rellenar(boton.label, vars);
  if (boton.next) return { label: etiqueta, payload: boton.next };
  if (boton.action === 'whatsapp') {
    var texto = rellenar(boton.text || '', vars);
    return {
      label: etiqueta,
      url: 'https://wa.me/' + soloDigitos(boton.phone || ajustes.whatsapp) + (texto ? '?text=' + encodeURIComponent(texto) : '')
    };
  }
  if (boton.action === 'call') {
    return { label: etiqueta, url: 'tel:+' + soloDigitos(boton.phone || ajustes.phone) };
  }
  if (boton.action === 'email') {
    var asunto = rellenar(boton.subject || '', vars);
    var cuerpo = rellenar(boton.text || '', vars);
    var q = [];
    if (asunto) q.push('subject=' + encodeURIComponent(asunto));
    if (cuerpo) q.push('body=' + encodeURIComponent(cuerpo));
    return { label: etiqueta, url: 'mailto:' + (boton.email || ajustes.email) + (q.length ? '?' + q.join('&') : '') };
  }
  if (boton.url) return { label: etiqueta, url: rellenar(boton.url, vars) };
  return { label: etiqueta, payload: '' };
}

/** Estado inicial de una conversación. */
export function estadoNuevo() {
  return { node: null, waiting: null, vars: {} };
}

/**
 * Entra en un paso y devuelve los mensajes que genera.
 * Si el paso tiene "next" y no tiene botones ni pregunta, sigue al siguiente.
 */
function entrar(flujo, estado, idPaso, salida) {
  var saltos = 0;
  var id = idPaso;
  while (id && saltos < MAX_SALTOS) {
    saltos++;
    var paso = flujo.nodes[id];
    if (!paso) {
      id = flujo.settings && flujo.settings.fallbackNode;
      if (!id || !flujo.nodes[id]) break;
      continue;
    }
    estado.node = id;
    estado.waiting = null;

    var mensajes = (paso.messages || []).map(function (m) { return rellenar(m, estado.vars); });
    var botones = (paso.buttons || []).map(function (b) { return resolverBoton(flujo, b, estado.vars); });

    mensajes.forEach(function (texto, i) {
      var ultimo = i === mensajes.length - 1;
      if (ultimo && botones.length) salida.push({ type: 'buttons', text: texto, buttons: botones });
      else salida.push({ type: 'text', text: texto });
    });
    if (!mensajes.length && botones.length) salida.push({ type: 'buttons', text: '', buttons: botones });

    if (paso.input) {
      estado.waiting = { var: paso.input.var, next: paso.input.next, validate: paso.input.validate || null };
      return estado;
    }
    if (botones.length || !paso.next) return estado;
    id = paso.next;
  }
  return estado;
}

function copiar(estado) {
  var e = estado || estadoNuevo();
  return {
    node: e.node || null,
    waiting: e.waiting ? Object.assign({}, e.waiting) : null,
    vars: Object.assign({}, e.vars || {})
  };
}

function buscarDisparador(flujo, texto) {
  var lista = flujo.triggers || [];
  for (var i = 0; i < lista.length; i++) {
    if (contiene(texto, lista[i].keywords)) return lista[i].node;
  }
  return null;
}

function botonEscrito(flujo, estado, texto) {
  var actual = flujo.nodes[estado.node];
  if (!actual || !(actual.buttons || []).length) return null;
  var botones = actual.buttons.map(function (b) { return resolverBoton(flujo, b, estado.vars); });
  var t = normalizar(texto);
  var i = /^\d{1,2}$/.test(t)
    ? parseInt(t, 10) - 1
    : botones.findIndex(function (b) { return normalizar(b.label) === t; });
  return i >= 0 && i < botones.length ? botones[i] : null;
}

function valido(tipo, texto) {
  var t = String(texto || '').trim();
  if (!t) return false;
  if (tipo === 'phone') return soloDigitos(t).length >= 9;
  if (tipo === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  if (tipo === 'contact') return soloDigitos(t).length >= 9 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  return true;
}

/** Empieza (o reinicia) la conversación. */
export function iniciar(flujo, estado) {
  var e = copiar(estado);
  e.node = null;
  e.waiting = null;
  var salida = [];
  entrar(flujo, e, flujo.settings.startNode, salida);
  return { state: e, messages: salida };
}

/**
 * Procesa lo que hace la persona.
 * entrada = { type: 'button', payload: 'idPaso' } o { type: 'text', text: '...' }
 */
export function responder(flujo, estado, entrada) {
  var e = copiar(estado);
  var salida = [];
  var ajustes = flujo.settings || {};

  if (entrada.type === 'button') {
    var destino = entrada.payload;
    if (!flujo.nodes[destino]) destino = ajustes.fallbackNode;
    entrar(flujo, e, destino, salida);
    return { state: e, messages: salida };
  }

  var texto = String(entrada.text || '').trim();

  // 1. Seguridad primero: si hay señales de crisis, se muestra ayuda urgente siempre.
  if (ajustes.crisisNode && contiene(texto, ajustes.crisisKeywords)) {
    entrar(flujo, e, ajustes.crisisNode, salida);
    return { state: e, messages: salida, crisis: true };
  }

  // 2. Palabras para volver al principio.
  if (contiene(texto, ajustes.restartKeywords)) {
    return iniciar(flujo, e);
  }

  // 3. Si estábamos esperando una respuesta (nombre, teléfono…), se guarda.
  if (e.waiting) {
    if (!valido(e.waiting.validate, texto)) {
      salida.push({ type: 'text', text: ajustes.invalidInputMessage || 'No lo he entendido bien. ¿Puedes escribirlo otra vez?' });
      return { state: e, messages: salida };
    }
    var siguiente = e.waiting.next;
    e.vars[e.waiting.var] = texto.slice(0, 300);
    e.waiting = null;
    entrar(flujo, e, siguiente, salida);
    return { state: e, messages: salida };
  }

  // 4. Si escribe el texto de un botón del paso actual, o su número ("1", "2"…), cuenta como pulsarlo.
  var boton = botonEscrito(flujo, e, texto);
  if (boton) {
    if (boton.payload) entrar(flujo, e, boton.payload, salida);
    else salida.push({ type: 'buttons', text: boton.label + ':', buttons: [boton] });
    return { state: e, messages: salida };
  }

  // 5. Palabras clave (como en los comentarios de Instagram: "INFO", "FAMILIA"…).
  var paso = buscarDisparador(flujo, texto);
  if (paso) {
    entrar(flujo, e, paso, salida);
    return { state: e, messages: salida };
  }

  // 6. Si no se entiende, paso por defecto.
  entrar(flujo, e, ajustes.fallbackNode || ajustes.startNode, salida);
  return { state: e, messages: salida, fallback: true };
}

/** Respuesta a un comentario público (Instagram): solo si contiene una palabra clave. */
export function pasoParaComentario(flujo, texto) {
  var lista = (flujo.commentTriggers && flujo.commentTriggers.length) ? flujo.commentTriggers : flujo.triggers;
  for (var i = 0; i < (lista || []).length; i++) {
    if (contiene(texto, lista[i].keywords)) return lista[i].node;
  }
  return null;
}

/**
 * Revisa el flujo y devuelve una lista de problemas.
 * nivel "error" = algo roto; "aviso" = funciona pero conviene mirarlo.
 */
export function validar(flujo) {
  var problemas = [];
  function p(nivel, texto) { problemas.push({ level: nivel, text: texto }); }

  if (!flujo || typeof flujo !== 'object') return [{ level: 'error', text: 'El flujo no es un objeto JSON.' }];
  var nodes = flujo.nodes || {};
  var ajustes = flujo.settings || {};
  var ids = Object.keys(nodes);
  if (!ids.length) p('error', 'No hay ningún paso.');

  function existe(id, donde) {
    if (!id) return;
    if (!nodes[id]) p('error', donde + ' apunta a un paso que no existe: "' + id + '".');
  }

  if (!ajustes.startNode) p('error', 'Falta el paso de inicio.');
  existe(ajustes.startNode, 'El inicio');
  existe(ajustes.fallbackNode, 'El paso por defecto');
  existe(ajustes.crisisNode, 'El paso de crisis');
  if (!ajustes.crisisNode) p('aviso', 'No hay paso de crisis: conviene tener uno con el 112 y el 024.');

  var alcanzables = {};
  function marcar(id) {
    if (!id || alcanzables[id] || !nodes[id]) return;
    alcanzables[id] = true;
    var n = nodes[id];
    (n.buttons || []).forEach(function (b) { marcar(b.next); });
    if (n.next) marcar(n.next);
    if (n.input) marcar(n.input.next);
  }
  marcar(ajustes.startNode);
  marcar(ajustes.fallbackNode);
  marcar(ajustes.crisisNode);
  (flujo.triggers || []).concat(flujo.commentTriggers || []).forEach(function (t) {
    existe(t.node, 'La palabra clave "' + (t.keywords || []).join(', ') + '"');
    marcar(t.node);
  });

  ids.forEach(function (id) {
    var n = nodes[id];
    if (!/^[a-z0-9_-]+$/i.test(id)) p('error', 'El nombre del paso "' + id + '" solo puede tener letras, números, - y _.');
    if (!(n.messages || []).length && !(n.buttons || []).length) p('aviso', 'El paso "' + id + '" no tiene mensajes.');
    (n.buttons || []).forEach(function (b, i) {
      var donde = 'El botón ' + (i + 1) + ' del paso "' + id + '"';
      if (!b.label) p('error', donde + ' no tiene texto.');
      if (b.label && b.label.length > 20) p('aviso', donde + ' ("' + b.label + '") tiene más de 20 caracteres: Instagram y WhatsApp lo cortan.');
      if (!b.next && !b.url && !b.action) p('error', donde + ' no lleva a ningún sitio.');
      existe(b.next, donde);
    });
    if ((n.buttons || []).length > 13) p('aviso', 'El paso "' + id + '" tiene más de 13 botones: Instagram solo muestra 13.');
    if (n.input) {
      if (!n.input.var) p('error', 'La pregunta del paso "' + id + '" no dice dónde guardar la respuesta.');
      if (!n.input.next) p('error', 'La pregunta del paso "' + id + '" no dice a qué paso ir después.');
      existe(n.input.next, 'La pregunta del paso "' + id + '"');
    }
    existe(n.next, 'El paso "' + id + '"');
    if (!alcanzables[id]) p('aviso', 'Nadie llega al paso "' + id + '".');
  });

  return problemas;
}
