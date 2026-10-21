# CLAUDE.md

Contexto del proyecto para Claude Code. Léelo antes de trabajar en este repositorio.

## Quién está detrás

**Especialista en adicciones y terapeuta**, que además es **adicto en recuperación rehabilitado**. Esa doble mirada, la profesional y la vivida en primera persona, es el corazón del proyecto: se cuenta con naturalidad, como fuente de credibilidad y esperanza.

## Qué hace

1. **Acompaña**: seguimiento cercano de personas en proceso de recuperación.
2. **Asesora**: orientación a personas con adicción y a sus familias (primeros pasos, recursos, tratamientos, cómo actuar).
3. **Informa**: divulgación sobre adicciones (con y sin sustancia), recaídas, codependencia, prevención.
4. **Charlas terapéuticas**: para personas con adicción y para **familiares**; posible ampliación a centros educativos, empresas y asociaciones.

## A quién se dirige

- Personas con una adicción, activa o en recuperación.
- Familiares y entorno cercano (padres, parejas, hijos), a menudo desbordados.
- Instituciones que quieran contratar charlas o formación.

## Tono y lenguaje

- **Cálido, cercano, honesto y sin juicios.** Tuteo por defecto.
- Esperanza realista: "la recuperación es posible", sin promesas ni garantías de resultados.
- El autor se define como "adicto en recuperación"; respetar esa voz cuando habla de sí mismo. Para el público en general, lenguaje no estigmatizante: "persona con adicción", "consumo problemático", "en recuperación" (evitar "drogadicto", "yonqui", "vicio", "limpio/sucio").
- Frases cortas y claras, pensadas para alguien que puede estar en un momento de crisis.
- Imágenes luminosas y humanas (naturaleza, manos, caminos, personas en calma). Nada morboso: ni jeringuillas, ni pastillas, ni personas derrumbadas.

## Identidad visual

Marca: **Salva Vidas**. Diseño limpio, de dos colores: azul marino y blanco.

### Paleta de colores

| Rol | Color | Hex | Uso |
|---|---|---|---|
| Principal | Azul marino | `#1A365D` | Portada, títulos, botones, pie |
| Principal oscuro | Azul noche | `#12263F` | Botones en hover |
| Fondo | Blanco | `#FFFFFF` | Fondo general, tarjetas |
| Fondo suave | Azul muy claro | `#E8EDF4` | Secciones alternas, iconos, avisos |
| Texto | Gris oscuro | `#1F2937` | Texto de cuerpo |
| Texto secundario | Gris medio | `#4B5563` | Descripciones, notas |

- No añadir más colores de marca. Los colores están definidos como variables CSS en `:root` de `styles.css`; usar siempre esas variables.
- Mantener el **contraste WCAG AA** (mínimo 4.5:1 en texto).

### Tipografía

- Sans-serif del sistema (`system-ui`, `-apple-system`, `Segoe UI`, `Roboto`…), sin cargar fuentes web, para que la página cargue rápido.
- Tamaños generosos, mucho espacio en blanco, bordes redondeados suaves.

## Código y rendimiento

- Web estática: `index.html`, `styles.css` y `script.js`. Solo HTML, CSS y JS puros, sin frameworks ni librerías.
- Secciones: portada con botón de llamada, servicios en tarjetas, galería de 6 fotos y formulario de contacto.
- SEO técnico: un solo H1, jerarquía H1>H2>H3, title y description únicos, alt descriptivo en toda imagen, schema.org `ProfessionalService` en `<head>`, `sitemap.xml` y `robots.txt`. Mantenerlo al añadir contenido.
- Prioridad: velocidad de carga. Iconos SVG en línea, JS con `defer`, imágenes WebP pequeñas con `width`/`height` y `loading="lazy"`.
- Responsive y mobile first, con botón de llamada fijo en móvil.

## Privacidad y ética

- Se tratan **datos de salud** (categoría especial): cumplir RGPD/LOPDGDD o la normativa del país. Consentimiento explícito y mínimo de datos necesarios.
- Testimonios solo con consentimiento por escrito y, preferiblemente, anonimizados.
- Dejar claro que la información orienta y **no sustituye** la atención médica ni de urgencias.
- Incluir **teléfonos de emergencia y ayuda** del país (p. ej. 112 en España/UE, 024 línea de atención a la conducta suicida en España). Confirmar el país de actuación.

## Datos pendientes

- [ ] Formación y titulaciones
- Web: https://www.salvavidasadicciones.es · Zona: Arcos de la Frontera (Cádiz)
- Contacto: teléfono y WhatsApp 604 887 687 · salvadorreinservida@icloud.com · Instagram y TikTok @salva.vidas.adicciones
- [ ] Servicio de formularios para el contacto (ahora abre el correo del visitante)
- [ ] Logo y fotos propias
- [ ] Tarifas o modalidades
- [ ] Imagen para compartir en redes (og:image, 1200×630)
