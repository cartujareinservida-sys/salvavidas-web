(function () {
  // Menú móvil
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');

  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  });

  function cerrarMenu() {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menú');
  }

  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) cerrarMenu();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      cerrarMenu();
      toggle.focus();
    }
  });

  // Año del pie
  document.getElementById('year').textContent = new Date().getFullYear();

  // Formulario de contacto
  var form = document.querySelector('.form');
  var status = form.querySelector('.form__status');

  function setStatus(text, type) {
    status.textContent = text;
    status.className = 'form__status' + (type ? ' is-' + type : '');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var invalid = null;
    Array.prototype.forEach.call(form.querySelectorAll('[required]'), function (field) {
      var ok = field.type === 'checkbox' ? field.checked : field.value.trim() !== '';
      field.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok && !invalid) invalid = field;
    });

    if (invalid) {
      setStatus('Por favor, completa los campos marcados y acepta la privacidad.', 'error');
      invalid.focus();
      return;
    }

    var data = new FormData(form);
    var endpoint = form.dataset.endpoint;

    // Sin servicio de formularios configurado: abrir el correo del usuario
    if (!endpoint) {
      var body =
        'Nombre: ' + data.get('nombre') + '\n' +
        'Contacto: ' + data.get('contacto') + '\n' +
        'Soy: ' + data.get('perfil') + '\n\n' +
        data.get('mensaje');
      window.location.href = 'mailto:' + form.dataset.mailto +
        '?subject=' + encodeURIComponent('Consulta desde la web') +
        '&body=' + encodeURIComponent(body);
      setStatus('Se abrirá tu programa de correo con el mensaje listo para enviar. Si no se abre, escríbeme por WhatsApp o llámame al 604 887 687.', 'ok');
      return;
    }

    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus('Enviando…');

    fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        form.reset();
        setStatus('Gracias. He recibido tu mensaje y te responderé pronto.', 'ok');
      })
      .catch(function () {
        setStatus('No se pudo enviar. Llámame o escríbeme directamente.', 'error');
      })
      .finally(function () {
        button.disabled = false;
      });
  });
})();
