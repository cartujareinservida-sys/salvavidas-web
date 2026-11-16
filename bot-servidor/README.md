# Servidor del asistente: Instagram y WhatsApp

Es tu propio "ManyChat". Responde automáticamente a los mensajes privados de Instagram y de WhatsApp con los mismos flujos que el chat de la web.

## Qué hace

- **Mensajes privados de Instagram y WhatsApp**: responde con botones, igual que en la web.
- **Comentarios con palabra clave en Instagram**: si alguien comenta «FAMILIA», «AYUDA», «INFO» o «CHARLA» en una publicación, le escribe por privado y contesta al comentario («Te acabo de escribir por mensaje privado 💙»). Las palabras se cambian en el editor (pestaña «Palabras clave»).
- **Crisis**: si detecta frases como «no quiero vivir», responde siempre con el 112 y el 024, aunque el bot esté en pausa.
- **No molesta**: si no entiende dos veces seguidas, se calla para que contestes tú en persona.
- **Paso a persona en WhatsApp**: el botón «Hablar por WhatsApp» pausa el bot 24 horas con esa persona y le dice que vas a leer la conversación.
- **Fotos, audios y stickers**: no los contesta; los ves tú.

## Lo que cuesta

| Servicio | Para qué | Coste |
|---|---|---|
| Cloudflare Workers + KV | Donde vive el bot | Gratis hasta 100.000 avisos y 1.000 conversaciones guardadas al día |
| Instagram (API de Meta) | Mensajes y comentarios | Gratis |
| WhatsApp Cloud API (opcional) | Mensajes de WhatsApp | Las respuestas dentro de las 24 h después de que la persona te escriba son gratis con la tarifa actual de Meta. Revísala antes de activarlo |

## Antes de empezar: lo que pide Meta

- La cuenta de Instagram tiene que ser **profesional** (empresa o creador).
- Necesitas una **app de Meta for Developers** (es gratis).
- Mientras la app esté «en desarrollo», el bot **solo te responde a ti** y a las cuentas que añadas como probadoras. Para que responda a cualquier persona, Meta pide pasar la **revisión de la app** (App Review) y a veces **verificar el negocio**. Es gratis, pero lleva papeleo y unos días. Es lo mismo que hace ManyChat por ti.
- **WhatsApp**: la Cloud API necesita un número dado de alta en Meta. Si quieres usar tu número actual (604 887 687), mira si Meta te ofrece la «coexistencia» con la app WhatsApp Business; si no, hace falta otro número. **Puedes empezar solo con Instagram** y dejar WhatsApp para más adelante.

## Puesta en marcha (unos 30-45 minutos)

### 1. Publicar el bot en Cloudflare

1. Crea una cuenta gratis en <https://dash.cloudflare.com>.
2. Instala Node.js (<https://nodejs.org>) en tu ordenador.
3. Abre una terminal en la carpeta del proyecto y escribe:

   ```bash
   cd bot-servidor
   npx wrangler login
   npx wrangler kv namespace create SESIONES
   ```

4. Copia el `id` que te devuelve y pégalo en `wrangler.toml`, en lugar de `PEGA_AQUI_EL_ID`.
5. Inventa una palabra secreta para Meta (por ejemplo `salvavidas-2026-xyz`) y guárdala:

   ```bash
   npx wrangler secret put VERIFY_TOKEN
   ```

6. Publica:

   ```bash
   npx wrangler deploy
   ```

   Te dará una dirección del tipo `https://salvavidas-bot.TU-USUARIO.workers.dev`. Si la abres y ves «Asistente de Salva: funcionando», está bien.

### 2. Conectar Instagram

1. Entra en <https://developers.facebook.com>, «Mis apps» → «Crear app» → tipo **Empresa**.
2. Añade el producto **Instagram** → «API con inicio de sesión de Instagram».
3. En «Generar tokens de acceso», conecta tu cuenta @salva.vidas.adicciones y copia el token:

   ```bash
   npx wrangler secret put IG_TOKEN
   ```

4. Copia la **clave secreta de la app de Instagram** (en la misma pantalla, «Configuración de la app») y guárdala:

   ```bash
   npx wrangler secret put APP_SECRET
   ```

5. En «Configurar webhooks»:
   - **URL de devolución de llamada**: `https://salvavidas-bot.TU-USUARIO.workers.dev/webhook`
   - **Token de verificación**: la palabra del paso 1.5
   - Pulsa «Verificar y guardar» y suscríbete a **messages**, **messaging_postbacks** y **comments**.
6. En la app de Instagram del móvil: Configuración → Mensajes y respuestas a historias → Herramientas conectadas → activa **Permitir acceso a los mensajes**.
7. Pruébalo: escribe «hola» a tu cuenta desde otra cuenta que hayas añadido como probadora.
8. Cuando funcione, pide en «Revisión de la app» los permisos `instagram_business_manage_messages` e `instagram_business_manage_comments` para que responda a todo el mundo.

### 3. Conectar WhatsApp (opcional)

1. En la misma app de Meta, añade el producto **WhatsApp** y sigue el asistente para dar de alta el número.
2. Guarda el token permanente (de un «usuario del sistema» en el Business Manager) y el identificador del número:

   ```bash
   npx wrangler secret put WA_TOKEN
   npx wrangler secret put WA_PHONE_ID
   ```

3. Si la app de WhatsApp es otra distinta de la de Instagram, guarda también su clave secreta: `npx wrangler secret put WA_APP_SECRET`.
4. En WhatsApp → Configuración → Webhook: la misma URL y el mismo token de verificación. Suscríbete a **messages**.

## Cambiar lo que dice el bot

No hace falta tocar nada aquí. Edita los flujos en `https://cartujareinservida-sys.github.io/salvavidas-web/bot/editor.html`, descarga `flows.json` y súbelo a la carpeta `bot/` de GitHub. El bot lo lee de la web (tarda unos 5 minutos en notarlo). Si el archivo publicado tuviera errores, el bot usa la última versión que se publicó con él en Cloudflare, para no quedarse sin responder.

Si cambias la web de dirección (al comprar el dominio), cambia `FLOWS_URL` en `wrangler.toml` y vuelve a hacer `npx wrangler deploy`.

## Privacidad

- Se guarda en Cloudflare, durante un máximo de 30 días, en qué paso va cada conversación y las respuestas que la persona escribe en las preguntas (nombre, hora para llamar). Nada más.
- Los mensajes en sí los guardan Instagram y WhatsApp, como siempre.
- Está explicado en `privacidad.html`. Si añades preguntas nuevas al flujo, pide solo lo imprescindible.

## Probar sin Meta

```bash
npm test
```

Ejecuta las pruebas del motor y del servidor con Instagram y WhatsApp simulados.
