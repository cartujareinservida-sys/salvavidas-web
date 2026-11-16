# Salva González · Acompañamiento en adicciones · web y asistente

- `index.html`, `styles.css`, `script.js`: la web (GitHub Pages).
- `privacidad.html`: privacidad y aviso legal.
- `bot/`: el asistente propio y gratuito (alternativa a ManyChat).
  - `flows.json`: lo que dice el asistente. Se edita con el editor.
  - `editor.html`: editor visual → `https://cartujareinservida-sys.github.io/salvavidas-web/bot/editor.html`
  - `widget.js`: el chat de la web (botón «¿Hablamos?»). Un enlace a la web terminado en `#chat` lo abre directamente: útil para la bio de Instagram y TikTok.
  - `engine.mjs`: el motor, común a web, Instagram y WhatsApp.
- `bot-servidor/`: respuestas automáticas en Instagram y WhatsApp (Cloudflare Workers). Guía en `bot-servidor/README.md`.
- `tests/`: pruebas (`npm test`).
