# StageHub 0.5.5 — Selector móvil
- Filas con altura intrínseca, sin compresión vertical y con texto multilínea.
- Casillas de 24 px, altura mínima de 92 px en pantallas táctiles, espaciado y desplazamiento único en el modal.
- Ocultar el editor de cantidades mientras la lista está abierta; conservar selección y guardado por lote.
- Metadatos opcionales tratados por joinText, sin valores nulos.
- URLs de recursos actualizadas a 0.5.5 para evitar reutilizar el CSS anterior.
- Sin cambios de backend, esquema, credenciales o permisos.

Actualización: reemplazar public/ y package.json (o subir el proyecto completo), y desplegar el último commit. Comprobar la versión y recargar el acceso web móvil. Si la aplicación instalada conserva una versión anterior, cerrarla completamente y reabrirla; si persiste, probar desde Safari/Chrome.

Validación: prueba de geometría en Chromium con el CSS real y marcado de muestra, a 320, 390, 430, 768 y 1024 px: seis filas, sin solapamiento, texto contenido dentro de las filas y pie de acciones visible. Navegación al sitio de prueba bloqueada por el entorno; no se verificó el flujo completo en navegador ni Safari/iOS físico.
