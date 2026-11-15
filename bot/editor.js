/*
 * Editor visual de los flujos del asistente.
 * Todo ocurre en el navegador: los cambios se guardan como borrador aquí
 * y, para publicarlos, se descarga flows.json y se sube a GitHub (carpeta bot/).
 */
import * as motor from './engine.mjs';

var BORRADOR = 'sv-editor-borrador';
var TIPOS_BOTON = [
  ['next', 'Ir a un paso'],
  ['whatsapp', 'Abrir WhatsApp'],
  ['call', 'Llamar'],
  ['email', 'Enviar correo'],
  ['url', 'Abrir enlace']
];
var VALIDACIONES = [
  ['', 'Cualquier texto'],
  ['phone', 'Teléfono'],
  ['email', 'Email'],
  ['contact', 'Teléfono o email']
];

var flujo = null;
var publicado = null;
var pestana = 'pasos';
var seleccionado = null;

var $ = function (sel) { return document.querySelector(sel); };
var zona = $('#zona');
var lista = $('#lista-pasos');
var estadoTxt = $('#estado');

/* ---------- utilidades ---------- */

function h(tag, attrs, hijos) {
  var n = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function (k) {
    var v = attrs[k];
    if (v == null || v === false) return;
    if (k === 'text') n.textContent = v;
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
    else if (k === 'value') n.value = v;
    else if (k === 'checked') n.checked = v;
    else n.setAttribute(k, v === true ? '' : v);
  });
  (hijos || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return n;
}

var uid = 0;
function campo(etiqueta, control, ayuda) {
  var id = control.id || ('f' + (++uid));
  control.id = id;
  return h('div', {}, [h('label', { for: id, text: etiqueta }), control, ayuda ? h('p', { class: 'ed-help', text: ayuda }) : null]);
}

function selectorPaso(valor, alCambiar, vacio) {
  var s = h('select', { onchange: function () { alCambiar(s.value); } });
  if (vacio) s.appendChild(h('option', { value: '', text: vacio }));
  Object.keys(flujo.nodes).forEach(function (id) {
    s.appendChild(h('option', { value: id, text: id }));
  });
  s.value = valor || '';
  return s;
}

function aviso(texto) { estadoTxt.textContent = texto; }

var temporizador = null;
function cambiado() {
  clearTimeout(temporizador);
  temporizador = setTimeout(function () {
    try { localStorage.setItem(BORRADOR, JSON.stringify(flujo)); } catch (e) { /* sin almacenamiento */ }
    var p = motor.validar(flujo);
    var errores = p.filter(function (x) { return x.level === 'error'; }).length;
    $('#num-problemas').textContent = p.length ? '(' + p.length + ')' : '';
    aviso('Borrador guardado en este navegador. ' +
      (errores ? errores + ' error(es) por revisar. ' : p.length ? p.length + ' aviso(s). ' : 'Sin problemas. ') +
      'Cuando esté listo, descarga flows.json y súbelo a GitHub.');
    pintarLista();
  }, 300);
}

/* ---------- lista de pasos ---------- */

function destinos(paso) {
  var d = [];
  (paso.buttons || []).forEach(function (b) { if (b.next) d.push(b.next); });
  if (paso.next) d.push(paso.next);
  if (paso.input && paso.input.next) d.push(paso.input.next);
  return d.filter(function (x, i) { return d.indexOf(x) === i; });
}

function pintarLista() {
  lista.innerHTML = '';
  var ajustes = flujo.settings;
  Object.keys(flujo.nodes).forEach(function (id) {
    var paso = flujo.nodes[id];
    var marcas = [];
    if (id === ajustes.startNode) marcas.push('inicio');
    if (id === ajustes.crisisNode) marcas.push('crisis');
    if (id === ajustes.fallbackNode) marcas.push('por defecto');
    var d = destinos(paso);
    var sub = (marcas.length ? '★ ' + marcas.join(', ') + ' · ' : '') + (d.length ? '→ ' + d.join(', ') : paso.input ? 'pregunta' : 'fin');
    lista.appendChild(h('li', {}, [
      h('button', {
        type: 'button',
        'aria-current': pestana === 'pasos' && id === seleccionado ? 'true' : 'false',
        onclick: function () { irAPestana('pasos'); seleccionado = id; pintar(); }
      }, [h('span', { text: id }), h('small', { text: sub })])
    ]));
  });
}

/* ---------- edición de un paso ---------- */

function renombrar(viejo, nuevo) {
  if (!nuevo || nuevo === viejo) return true;
  if (!/^[a-z0-9_-]+$/i.test(nuevo)) { alert('El nombre solo puede tener letras sin tildes, números, - y _.'); return false; }
  if (flujo.nodes[nuevo]) { alert('Ya hay un paso con ese nombre.'); return false; }
  var nodos = {};
  Object.keys(flujo.nodes).forEach(function (id) { nodos[id === viejo ? nuevo : id] = flujo.nodes[id]; });
  flujo.nodes = nodos;
  function cambia(x) { return x === viejo ? nuevo : x; }
  Object.keys(nodos).forEach(function (id) {
    var p = nodos[id];
    (p.buttons || []).forEach(function (b) { if (b.next) b.next = cambia(b.next); });
    if (p.next) p.next = cambia(p.next);
    if (p.input) p.input.next = cambia(p.input.next);
  });
  ['startNode', 'fallbackNode', 'crisisNode'].forEach(function (k) { flujo.settings[k] = cambia(flujo.settings[k]); });
  (flujo.triggers || []).concat(flujo.commentTriggers || []).forEach(function (t) { t.node = cambia(t.node); });
  seleccionado = nuevo;
  return true;
}

function tipoBoton(b) {
  if (b.next) return 'next';
  if (b.action) return b.action;
  return 'url';
}

function filaBoton(paso, b, i) {
  var tipo = tipoBoton(b);
  var contador = h('span', { class: 'ed-count' });
  function contar() {
    contador.textContent = ' ' + (b.label || '').length + '/20';
    contador.classList.toggle('is-over', (b.label || '').length > 20);
  }
  contar();

  var texto = h('input', { type: 'text', value: b.label || '', oninput: function () { b.label = texto.value; contar(); cambiado(); } });
  var selTipo = h('select', {
    onchange: function () {
      var nuevo = { label: b.label };
      if (selTipo.value === 'next') nuevo.next = Object.keys(flujo.nodes)[0];
      else if (selTipo.value === 'url') nuevo.url = 'https://';
      else nuevo.action = selTipo.value;
      paso.buttons[i] = nuevo;
      cambiado();
      pintar();
    }
  }, TIPOS_BOTON.map(function (t) { return h('option', { value: t[0], text: t[1] }); }));
  selTipo.value = tipo;

  var destino;
  if (tipo === 'next') {
    destino = campo('Paso', selectorPaso(b.next, function (v) { b.next = v; cambiado(); }));
  } else if (tipo === 'whatsapp' || tipo === 'email') {
    var msg = h('textarea', { rows: 2, value: b.text || '', oninput: function () { b.text = msg.value; cambiado(); } });
    destino = campo('Mensaje ya escrito', msg);
  } else if (tipo === 'url') {
    var url = h('input', { type: 'text', value: b.url || '', oninput: function () { b.url = url.value.trim(); cambiado(); } });
    destino = campo('Dirección (https://, tel:…)', url);
  } else {
    destino = h('p', { class: 'ed-help', text: 'Llama al teléfono de Ajustes.' });
  }

  var etiqueta = h('label', {}, ['Texto del botón', contador]);
  texto.id = 'f' + (++uid);
  etiqueta.setAttribute('for', texto.id);

  return h('div', { class: 'ed-row ed-row--btn' }, [
    h('div', {}, [etiqueta, texto]),
    campo('Qué hace', selTipo),
    destino,
    herramientas(paso.buttons, i)
  ]);
}

function herramientas(arr, i) {
  return h('div', { class: 'ed-tools' }, [
    h('button', { class: 'ed-mini', type: 'button', 'aria-label': 'Subir', disabled: i === 0, onclick: function () { mover(arr, i, -1); } }, ['↑']),
    h('button', { class: 'ed-mini', type: 'button', 'aria-label': 'Bajar', disabled: i === arr.length - 1, onclick: function () { mover(arr, i, 1); } }, ['↓']),
    h('button', { class: 'ed-mini ed-mini--danger', type: 'button', 'aria-label': 'Quitar', onclick: function () { arr.splice(i, 1); cambiado(); pintar(); } }, ['✕'])
  ]);
}

function mover(arr, i, d) {
  var j = i + d;
  if (j < 0 || j >= arr.length) return;
  var x = arr[i]; arr[i] = arr[j]; arr[j] = x;
  cambiado();
  pintar();
}

function continuacion(paso) {
  if (paso.input) return 'pregunta';
  if ((paso.buttons || []).length) return 'botones';
  if (paso.next) return 'seguir';
  return 'fin';
}

function pintarPaso() {
  var id = seleccionado;
  var paso = flujo.nodes[id];
  if (!paso) { zona.appendChild(h('p', { text: 'Elige un paso de la lista o crea uno nuevo.' })); return; }

  var nombre = h('input', { type: 'text', value: id });
  nombre.addEventListener('change', function () {
    var nuevo = nombre.value.trim();
    if (renombrar(id, nuevo)) { cambiado(); pintar(); } else nombre.value = id;
  });

  zona.appendChild(h('h2', { text: 'Paso: ' + id }));
  zona.appendChild(campo('Nombre del paso', nombre, 'Solo para ti, la persona no lo ve. Al cambiarlo se actualizan todos los enlaces.'));

  zona.appendChild(h('h3', { text: 'Mensajes' }));
  zona.appendChild(h('p', { class: 'ed-help', text: 'Cada caja es una burbuja. Frases cortas. Usa {{nombre}} para poner lo que la persona respondió en una pregunta.' }));
  paso.messages = paso.messages || [];
  paso.messages.forEach(function (m, i) {
    var t = h('textarea', { 'aria-label': 'Mensaje ' + (i + 1), value: m, oninput: function () { paso.messages[i] = t.value; cambiado(); } });
    zona.appendChild(h('div', { class: 'ed-row ed-row--msg' }, [t, herramientas(paso.messages, i)]));
  });
  zona.appendChild(h('button', { class: 'ed-mini', type: 'button', onclick: function () { paso.messages.push(''); cambiado(); pintar(); } }, ['+ Añadir mensaje']));

  zona.appendChild(h('h3', { text: 'Y después…' }));
  var actual = continuacion(paso);
  var opciones = [['botones', 'Mostrar botones'], ['pregunta', 'Hacer una pregunta'], ['seguir', 'Pasar a otro paso'], ['fin', 'Terminar aquí']];
  var grupo = h('div', { class: 'ed-radios', role: 'radiogroup', 'aria-label': 'Qué pasa después' });
  opciones.forEach(function (o) {
    grupo.appendChild(h('label', {}, [
      h('input', {
        type: 'radio', name: 'cont', value: o[0], checked: actual === o[0],
        onchange: function () {
          delete paso.input; delete paso.next;
          if (o[0] !== 'botones') delete paso.buttons;
          var primero = Object.keys(flujo.nodes).filter(function (x) { return x !== id; })[0] || id;
          if (o[0] === 'botones') paso.buttons = paso.buttons && paso.buttons.length ? paso.buttons : [{ label: 'Volver al inicio', next: flujo.settings.startNode }];
          if (o[0] === 'pregunta') paso.input = { var: 'respuesta', next: primero };
          if (o[0] === 'seguir') paso.next = primero;
          cambiado();
          pintar();
        }
      }),
      o[1]
    ]));
  });
  zona.appendChild(grupo);

  if (actual === 'botones') {
    zona.appendChild(h('p', { class: 'ed-help', text: 'Máximo 20 caracteres por botón (Instagram y WhatsApp los cortan). WhatsApp muestra 3 como botones; si hay más, salen en una lista.' }));
    paso.buttons.forEach(function (b, i) { zona.appendChild(filaBoton(paso, b, i)); });
    zona.appendChild(h('button', {
      class: 'ed-mini', type: 'button',
      onclick: function () { paso.buttons.push({ label: 'Nuevo botón', next: flujo.settings.startNode }); cambiado(); pintar(); }
    }, ['+ Añadir botón']));
  }

  if (actual === 'pregunta') {
    var variable = h('input', { type: 'text', value: paso.input.var, oninput: function () { paso.input.var = variable.value.trim().replace(/[^\w]/g, ''); cambiado(); } });
    zona.appendChild(campo('Guardar la respuesta como', variable, 'Luego puedes usarla en mensajes: {{' + (paso.input.var || 'nombre') + '}}'));
    var val = h('select', { onchange: function () { if (val.value) paso.input.validate = val.value; else delete paso.input.validate; cambiado(); } },
      VALIDACIONES.map(function (v) { return h('option', { value: v[0], text: v[1] }); }));
    val.value = paso.input.validate || '';
    zona.appendChild(campo('Qué se espera', val));
    zona.appendChild(campo('Después, ir a', selectorPaso(paso.input.next, function (v) { paso.input.next = v; cambiado(); })));
    zona.appendChild(h('p', { class: 'ed-help', text: 'Pide solo los datos imprescindibles: son datos de salud y cuanto menos, mejor.' }));
  }

  if (actual === 'seguir') {
    zona.appendChild(campo('Siguiente paso', selectorPaso(paso.next, function (v) { paso.next = v; cambiado(); })));
  }

  var usos = Object.keys(flujo.nodes).filter(function (x) { return destinos(flujo.nodes[x]).indexOf(id) !== -1; });
  zona.appendChild(h('h3', { text: 'Llegan aquí desde' }));
  zona.appendChild(h('p', { class: 'ed-help', text: usos.length ? usos.join(', ') : 'Ningún paso (quizá desde una palabra clave).' }));

  zona.appendChild(h('h3', { text: 'Zona peligrosa' }));
  zona.appendChild(h('button', {
    class: 'ed-mini ed-mini--danger', type: 'button',
    onclick: function () {
      if (usos.length && !confirm('Hay pasos que llevan aquí (' + usos.join(', ') + '). ¿Borrarlo igualmente?')) return;
      if (!usos.length && !confirm('¿Borrar el paso "' + id + '"?')) return;
      delete flujo.nodes[id];
      seleccionado = Object.keys(flujo.nodes)[0];
      cambiado();
      pintar();
    }
  }, ['Borrar este paso']));
}

/* ---------- palabras clave ---------- */

function listaClaves(titulo, ayuda, arr) {
  zona.appendChild(h('h3', { text: titulo }));
  zona.appendChild(h('p', { class: 'ed-help', text: ayuda }));
  arr.forEach(function (t, i) {
    var kw = h('input', { type: 'text', value: (t.keywords || []).join(', '), oninput: function () {
      t.keywords = kw.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      cambiado();
    } });
    zona.appendChild(h('div', { class: 'ed-row ed-row--kw' }, [
      campo('Palabras (separadas por comas)', kw),
      campo('Lleva a', selectorPaso(t.node, function (v) { t.node = v; cambiado(); })),
      herramientas(arr, i)
    ]));
  });
  zona.appendChild(h('button', { class: 'ed-mini', type: 'button', onclick: function () { arr.push({ keywords: [], node: flujo.settings.startNode }); cambiado(); pintar(); } }, ['+ Añadir']));
}

function areaLista(etiqueta, arr, ayuda, alCambiar) {
  var t = h('textarea', { rows: 5, value: arr.join('\n'), oninput: function () {
    alCambiar(t.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean));
    cambiado();
  } });
  return campo(etiqueta, t, ayuda);
}

function pintarClaves() {
  flujo.triggers = flujo.triggers || [];
  flujo.commentTriggers = flujo.commentTriggers || [];
  zona.appendChild(h('h2', { text: 'Palabras clave' }));
  zona.appendChild(h('p', { class: 'ed-help', text: 'No importan tildes ni mayúsculas. Termina una palabra en * para que valga cualquier final: recai* → recaída, recaí, recaer. Se revisan en orden: la primera que coincide gana.' }));
  listaClaves('En mensajes (web, Instagram y WhatsApp)', 'Cuando alguien escribe en vez de pulsar un botón.', flujo.triggers);
  listaClaves('En comentarios de Instagram', 'Si alguien comenta una de estas palabras en tus publicaciones, el bot le escribe por privado (como “Comenta FAMILIA y te envío la guía”).', flujo.commentTriggers);

  zona.appendChild(h('h3', { text: 'Señales de crisis' }));
  zona.appendChild(areaLista('Una frase por línea', flujo.settings.crisisKeywords || [],
    'Si aparecen, el bot muestra el paso de crisis (112 y 024) siempre, aunque esté a mitad de otra cosa. Mejor que sobren a que falten.',
    function (v) { flujo.settings.crisisKeywords = v; }));
  zona.appendChild(areaLista('Palabras para volver al inicio', flujo.settings.restartKeywords || [], '',
    function (v) { flujo.settings.restartKeywords = v; }));
}

/* ---------- ajustes ---------- */

function pintarAjustes() {
  var a = flujo.settings;
  zona.appendChild(h('h2', { text: 'Ajustes' }));
  function texto(etiqueta, clave, ayuda) {
    var i = h('input', { type: 'text', value: a[clave] || '', oninput: function () { a[clave] = i.value.trim(); cambiado(); } });
    zona.appendChild(campo(etiqueta, i, ayuda));
  }
  texto('WhatsApp (con prefijo, sin +)', 'whatsapp', 'Ejemplo: 34604887687');
  texto('Teléfono para llamar (con prefijo, sin +)', 'phone');
  texto('Correo', 'email');
  zona.appendChild(campo('Paso de inicio', selectorPaso(a.startNode, function (v) { a.startNode = v; cambiado(); })));
  zona.appendChild(campo('Paso cuando no se entiende', selectorPaso(a.fallbackNode, function (v) { a.fallbackNode = v; cambiado(); })));
  zona.appendChild(campo('Paso de crisis', selectorPaso(a.crisisNode, function (v) { a.crisisNode = v; cambiado(); })));
  texto('Mensaje si la respuesta no vale', 'invalidInputMessage');
  texto('Respuesta pública a comentarios de Instagram', 'commentReply', 'Se publica debajo del comentario. No pongas nada personal: lo ve todo el mundo.');
}

/* ---------- revisar ---------- */

function pintarRevisar() {
  var p = motor.validar(flujo);
  zona.appendChild(h('h2', { text: 'Revisar' }));
  if (!p.length) { zona.appendChild(h('p', { text: '✓ Todo en orden. Puedes descargar flows.json.' })); }
  var ul = h('ul', { class: 'ed-issues' });
  p.forEach(function (x) {
    ul.appendChild(h('li', { class: x.level === 'error' ? 'is-error' : '', text: (x.level === 'error' ? 'Error: ' : 'Aviso: ') + x.text }));
  });
  zona.appendChild(ul);
  zona.appendChild(h('h3', { text: 'Cómo publicar los cambios' }));
  zona.appendChild(h('ol', {}, [
    h('li', { text: 'Pulsa «Descargar flows.json».' }),
    h('li', { text: 'En GitHub, entra en la carpeta bot/ del repositorio salvavidas-web.' }),
    h('li', { text: 'Pulsa «Add file» → «Upload files», arrastra el archivo y confirma («Commit changes»).' }),
    h('li', { text: 'En un par de minutos el chat de la web usa los flujos nuevos. Si tienes el servidor de Instagram/WhatsApp, también.' })
  ]));
}

/* ---------- navegación ---------- */

function irAPestana(t) {
  pestana = t;
  Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
    b.setAttribute('aria-pressed', b.dataset.tab === t ? 'true' : 'false');
  });
}

function pintar() {
  zona.innerHTML = '';
  if (pestana === 'pasos') pintarPaso();
  if (pestana === 'claves') pintarClaves();
  if (pestana === 'ajustes') pintarAjustes();
  if (pestana === 'revisar') pintarRevisar();
  pintarLista();
}

document.querySelector('.ed-tabs').addEventListener('click', function (e) {
  var b = e.target.closest('[data-tab]');
  if (!b) return;
  irAPestana(b.dataset.tab);
  pintar();
});

$('#nuevo-paso').addEventListener('click', function () {
  var n = 1;
  while (flujo.nodes['paso_' + n]) n++;
  var id = 'paso_' + n;
  flujo.nodes[id] = { messages: ['Escribe aquí el mensaje.'], buttons: [{ label: 'Volver al inicio', next: flujo.settings.startNode }] };
  seleccionado = id;
  irAPestana('pasos');
  cambiado();
  pintar();
});

$('#descargar').addEventListener('click', function () {
  var errores = motor.validar(flujo).filter(function (x) { return x.level === 'error'; });
  if (errores.length && !confirm('Hay ' + errores.length + ' error(es). Si lo publicas así, el chat puede fallar. ¿Descargar igualmente?')) return;
  flujo.meta = flujo.meta || {};
  flujo.meta.updated = new Date().toISOString().slice(0, 10);
  var blob = new Blob([JSON.stringify(flujo, null, 2) + '\n'], { type: 'application/json' });
  var a = h('a', { href: URL.createObjectURL(blob), download: 'flows.json' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  aviso('Descargado. Súbelo a GitHub en la carpeta bot/ (pestaña «Revisar» para ver cómo).');
});

$('#importar').addEventListener('change', function (e) {
  var archivo = e.target.files[0];
  if (!archivo) return;
  archivo.text().then(function (t) {
    var nuevo = JSON.parse(t);
    if (!nuevo.nodes || !nuevo.settings) throw new Error('formato');
    flujo = nuevo;
    seleccionado = flujo.settings.startNode;
    cambiado();
    pintar();
    vista.cambiarFlujo(flujo);
  }).catch(function () { alert('Ese archivo no es un flows.json válido.'); });
  e.target.value = '';
});

$('#restaurar').addEventListener('click', function () {
  if (!confirm('Se perderán los cambios del borrador. ¿Volver a lo que está publicado?')) return;
  flujo = JSON.parse(JSON.stringify(publicado));
  try { localStorage.removeItem(BORRADOR); } catch (e) { /* nada */ }
  seleccionado = flujo.settings.startNode;
  cambiado();
  pintar();
  vista.cambiarFlujo(flujo);
});

/* ---------- vista previa ---------- */

var vista = null;
function copiaCon(inicio) {
  var f = JSON.parse(JSON.stringify(flujo));
  if (inicio) f.settings.startNode = inicio;
  return f;
}
$('#probar-inicio').addEventListener('click', function () { vista.cambiarFlujo(copiaCon()); });
$('#probar-paso').addEventListener('click', function () {
  if (pestana === 'pasos' && seleccionado) vista.cambiarFlujo(copiaCon(seleccionado));
  else vista.cambiarFlujo(copiaCon());
});

/* ---------- arranque ---------- */

fetch('flows.json', { cache: 'no-cache' })
  .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(function (f) {
    publicado = f;
    var borrador = null;
    try { borrador = JSON.parse(localStorage.getItem(BORRADOR)); } catch (e) { /* nada */ }
    flujo = borrador && borrador.nodes ? borrador : JSON.parse(JSON.stringify(f));
    seleccionado = flujo.settings.startNode;
    vista = window.SalvaVidasChat.crear($('#preview'), {
      cargar: function () { return Promise.resolve({ motor: motor, flujo: copiaCon() }); },
      persistir: false
    });
    vista.arrancar();
    pintar();
    cambiado();
    if (borrador) setTimeout(function () { aviso('Has recuperado tu borrador. «Volver a lo publicado» lo descarta.'); }, 400);
  })
  .catch(function (e) {
    aviso('No se pudo cargar flows.json (' + e.message + '). Si abriste el archivo directamente, usa la web publicada o un servidor local.');
  });
