/*
 * Chat de Salva González para la web.
 *
 * Al cargar la página solo pinta el botón "¿Hablamos?". El motor y los flujos
 * se descargan la primera vez que alguien abre el chat, para no frenar la web.
 * La conversación se guarda solo en el navegador de la persona (sessionStorage)
 * y se borra al cerrar la pestaña. No se envía nada a ningún servidor.
 */
(function () {
  var script = document.currentScript;
  var BASE = script ? script.src.replace(/[^/]*$/, '') : 'bot/';
  var CLAVE = 'sv-chat-v1';
  var lento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ICONO_CHAT = '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/></svg>';
  var ICONO_CERRAR = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICONO_REINICIAR = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
  var ICONO_ENVIAR = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>';

  function leer() {
    try { return JSON.parse(sessionStorage.getItem(CLAVE)); } catch (e) { return null; }
  }
  function guardar(datos) {
    try { sessionStorage.setItem(CLAVE, JSON.stringify(datos)); } catch (e) { /* modo privado: no pasa nada */ }
  }
  function borrar() {
    try { sessionStorage.removeItem(CLAVE); } catch (e) { /* nada */ }
  }

  function el(tag, clase, texto) {
    var n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }

  /**
   * Crea un chat dentro de "contenedor".
   * opciones.cargar() → Promise<{ motor, flujo }>
   * opciones.persistir: guardar la conversación en sessionStorage
   * opciones.alCerrar: función para el botón de cerrar (si no hay, no se muestra)
   */
  function crearChat(contenedor, opciones) {
    var motor = null;
    var flujo = null;
    var estado = null;
    var historial = []; // [{ from: 'bot'|'user', text, buttons? }]
    var cola = Promise.resolve();
    var listo = null;
    var ronda = 0; // cambia al reiniciar: los mensajes pendientes de antes se descartan

    var titulo = el('p', 'chat__title', 'Asistente de Salva');
    titulo.id = 'chat-title-' + Math.random().toString(36).slice(2, 8);
    contenedor.setAttribute('aria-labelledby', titulo.id);

    var cabecera = el('div', 'chat__header');
    var avatar = el('span', 'chat__avatar', 'SV');
    avatar.setAttribute('aria-hidden', 'true');
    var textos = el('div', 'chat__heading');
    textos.appendChild(titulo);
    textos.appendChild(el('p', 'chat__subtitle', 'Orienta y acompaña. No sustituye la atención urgente.'));
    var reiniciar = el('button', 'chat__icon-btn');
    reiniciar.type = 'button';
    reiniciar.innerHTML = ICONO_REINICIAR;
    reiniciar.setAttribute('aria-label', 'Empezar de nuevo');
    reiniciar.title = 'Empezar de nuevo';
    cabecera.appendChild(avatar);
    cabecera.appendChild(textos);
    cabecera.appendChild(reiniciar);
    if (opciones.alCerrar) {
      var cerrar = el('button', 'chat__icon-btn');
      cerrar.type = 'button';
      cerrar.innerHTML = ICONO_CERRAR;
      cerrar.setAttribute('aria-label', 'Cerrar el chat');
      cerrar.addEventListener('click', opciones.alCerrar);
      cabecera.appendChild(cerrar);
    }

    var log = el('div', 'chat__log');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    log.setAttribute('aria-relevant', 'additions');
    log.tabIndex = 0;

    var form = el('form', 'chat__form');
    var campo = el('input', 'chat__input');
    campo.type = 'text';
    campo.autocomplete = 'off';
    campo.maxLength = 300;
    campo.placeholder = 'Escribe aquí…';
    campo.setAttribute('aria-label', 'Escribe tu mensaje');
    var enviar = el('button', 'chat__send');
    enviar.type = 'submit';
    enviar.innerHTML = ICONO_ENVIAR;
    enviar.setAttribute('aria-label', 'Enviar');
    form.appendChild(campo);
    form.appendChild(enviar);

    var aviso = el('p', 'chat__emergency');
    aviso.innerHTML = 'Urgencias: <a href="tel:112">112</a> · Conducta suicida: <a href="tel:024">024</a> (24 h, gratuito)';

    contenedor.appendChild(cabecera);
    contenedor.appendChild(log);
    contenedor.appendChild(form);
    contenedor.appendChild(aviso);

    function bajar() { log.scrollTop = log.scrollHeight; }

    function pintarBotones(botones) {
      var caja = el('div', 'chat__buttons');
      botones.forEach(function (b) {
        var n;
        if (b.url) {
          n = el('a', 'chat__choice chat__choice--link', b.label);
          n.href = b.url;
          if (/^https?:/.test(b.url)) { n.target = '_blank'; n.rel = 'noopener'; }
        } else {
          n = el('button', 'chat__choice', b.label);
          n.type = 'button';
          n.addEventListener('click', function () { pulsar(b); });
        }
        caja.appendChild(n);
      });
      return caja;
    }

    function pintar(m) {
      var fila = el('div', 'chat__row chat__row--' + m.from);
      var burbuja = el('p', 'chat__bubble', m.text);
      if (m.text) fila.appendChild(burbuja);
      if (m.buttons && m.buttons.length) fila.appendChild(pintarBotones(m.buttons));
      log.appendChild(fila);
      bajar();
    }

    /** Quita los botones de pasos anteriores que llevan a otro paso (los enlaces se quedan). */
    function limpiarBotones() {
      historial.forEach(function (m) {
        if (m.buttons) m.buttons = m.buttons.filter(function (b) { return b.url; });
      });
      Array.prototype.forEach.call(log.querySelectorAll('button.chat__choice'), function (b) { b.remove(); });
      Array.prototype.forEach.call(log.querySelectorAll('.chat__buttons'), function (c) {
        if (!c.children.length) c.remove();
      });
    }

    function persistir() {
      if (opciones.persistir) guardar({ state: estado, history: historial });
    }

    function escribiendo() {
      var fila = el('div', 'chat__row chat__row--bot chat__typing');
      fila.setAttribute('aria-hidden', 'true');
      fila.innerHTML = '<p class="chat__bubble"><span></span><span></span><span></span></p>';
      log.appendChild(fila);
      bajar();
      return fila;
    }

    function esperar(ms) {
      return new Promise(function (ok) { setTimeout(ok, lento ? 0 : ms); });
    }

    /** Muestra los mensajes del bot uno a uno, con un pequeño "escribiendo…". */
    function decir(resultado) {
      estado = resultado.state;
      var mia = ronda;
      campo.placeholder = estado.waiting ? 'Escribe tu respuesta…' : 'Escribe aquí…';
      resultado.messages.forEach(function (m) {
        cola = cola.then(function () {
          if (mia !== ronda) return;
          var puntos = escribiendo();
          return esperar(Math.min(1200, 300 + m.text.length * 8)).then(function () {
            puntos.remove();
            if (mia !== ronda) return;
            var registro = { from: 'bot', text: m.text, buttons: m.buttons || null };
            historial.push(registro);
            pintar(registro);
          });
        });
      });
      cola = cola.then(function () {
        if (mia !== ronda) return;
        persistir();
        if (estado.waiting) campo.focus({ preventScroll: true });
      });
      return cola;
    }

    function decirPersona(texto) {
      limpiarBotones();
      var registro = { from: 'user', text: texto };
      historial.push(registro);
      pintar(registro);
    }

    function pulsar(boton) {
      decirPersona(boton.label);
      decir(motor.responder(flujo, estado, { type: 'button', payload: boton.payload }));
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var texto = campo.value.trim();
      if (!texto || !motor) return;
      campo.value = '';
      decirPersona(texto);
      decir(motor.responder(flujo, estado, { type: 'text', text: texto }));
    });

    reiniciar.addEventListener('click', function () {
      if (!motor) return;
      ronda++;
      historial = [];
      log.innerHTML = '';
      cola = Promise.resolve();
      if (opciones.persistir) borrar();
      decir(motor.iniciar(flujo));
    });

    function error() {
      log.innerHTML = '';
      pintar({
        from: 'bot',
        text: 'Ahora mismo no puedo cargar el asistente. Puedes escribir o llamar a Salva directamente.',
        buttons: [
          { label: 'WhatsApp', url: 'https://wa.me/34604887687' },
          { label: 'Llamar', url: 'tel:+34604887687' }
        ]
      });
    }

    /** Carga motor y flujo (solo la primera vez) y arranca o recupera la conversación. */
    function arrancar() {
      if (listo) return listo;
      listo = opciones.cargar().then(function (r) {
        motor = r.motor;
        flujo = r.flujo;
        var guardado = opciones.persistir ? leer() : null;
        if (guardado && guardado.state && guardado.history && guardado.history.length) {
          estado = guardado.state;
          historial = guardado.history;
          historial.forEach(pintar);
          campo.placeholder = estado.waiting ? 'Escribe tu respuesta…' : 'Escribe aquí…';
          return;
        }
        return decir(motor.iniciar(flujo));
      }).catch(function (e) {
        listo = null;
        if (window.console) console.error('Chat Salva González:', e);
        error();
      });
      return listo;
    }

    /** Para el editor: cambiar el flujo y empezar de cero. */
    function cambiarFlujo(nuevo) {
      flujo = nuevo;
      if (!motor) return arrancar();
      ronda++;
      historial = [];
      log.innerHTML = '';
      cola = Promise.resolve();
      decir(motor.iniciar(flujo));
    }

    return { arrancar: arrancar, campo: campo, cambiarFlujo: cambiarFlujo };
  }

  function cargarDesdeWeb() {
    return Promise.all([
      import(BASE + 'engine.mjs'),
      fetch(BASE + 'flows.json', { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('flows.json: ' + r.status);
        return r.json();
      })
    ]).then(function (r) { return { motor: r[0], flujo: r[1] }; });
  }

  /** Botón flotante + ventana de chat en la web pública. */
  function montarEnWeb() {
    var lanzador = el('button', 'chat-launcher');
    lanzador.type = 'button';
    lanzador.setAttribute('aria-expanded', 'false');
    lanzador.setAttribute('aria-controls', 'chat');
    lanzador.innerHTML = ICONO_CHAT + '<span class="chat-launcher__text">¿Hablamos?</span>';
    lanzador.setAttribute('aria-label', 'Abrir el chat de ayuda');

    var panel = el('section', 'chat');
    panel.id = 'chat';
    panel.setAttribute('role', 'dialog');
    panel.hidden = true;

    function abrir() {
      panel.hidden = false;
      document.documentElement.classList.add('chat-open');
      lanzador.setAttribute('aria-expanded', 'true');
      chat.arrancar().then(function () {
        if (!panel.hidden) chat.campo.focus({ preventScroll: true });
      });
    }
    function cerrar() {
      panel.hidden = true;
      document.documentElement.classList.remove('chat-open');
      lanzador.setAttribute('aria-expanded', 'false');
      lanzador.focus();
    }

    var chat = crearChat(panel, { cargar: cargarDesdeWeb, persistir: true, alCerrar: cerrar });

    lanzador.addEventListener('click', function () { panel.hidden ? abrir() : cerrar(); });
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrar(); });
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-chat-open]');
      if (t) { e.preventDefault(); abrir(); }
    });

    document.body.appendChild(lanzador);
    document.body.appendChild(panel);

    // Un enlace a la web terminado en #chat abre el chat directamente
    // (útil para la bio de Instagram o TikTok).
    if (location.hash === '#chat') abrir();
    window.addEventListener('hashchange', function () { if (location.hash === '#chat') abrir(); });
  }

  window.SalvaVidasChat = { crear: crearChat };

  if (!script || script.dataset.mode !== 'embed') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarEnWeb);
    else montarEnWeb();
  }
})();
