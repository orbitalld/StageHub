# StageHub v0.5.2 — Estabilidad visual y actualización de pantallas

Base: v0.5.1. No cambia el servidor, el esquema de datos, los permisos ni la lógica de reservas. No requiere variables de entorno nuevas.

- `appendSafe`, `replaceSafe` y `joinText` omiten valores opcionales nulos, indefinidos y marcadores literales vacíos, sin eliminar el cero. Se aplican a las páginas, incluidos eventos y solicitudes, donde `append(null)` introducía texto visible. Los textos compuestos de campos opcionales de eventos se unen sin separadores huérfanos.
- Guardar en Eventos, Solicitudes, Miembros y Empresas (edición, logo, recuperación) actualiza la vista mediante el router sin recargar el documento completo. El contenido anterior permanece visible durante la consulta en la misma ruta y contexto; el nuevo se prepara en un árbol separado y se sustituye en una sola operación. Se descartan respuestas anteriores y se conserva el scroll, los filtros del calendario y los checklists expandidos. Si se cambia realmente de ruta, se vuelve arriba. Se mantiene la recarga al cambiar de empresa activa para no mezclar contextos.
- El router consulta autorización y empresas en paralelo, actualiza los permisos antes de pintar y no conserva una vista si la respuesta indica que no está autorizada o ya no existe. Los errores temporales de actualización conservan la última vista y muestran aviso.
- Inventario descarta respuestas de filtros desactualizadas. Listados y paneles sustituyen contenido ya preparado en lugar de vaciarlo primero. Los diálogos recuperan el desplazamiento al cerrarse; ajustes de altura natural, viewport dinámico y estabilización de la barra de desplazamiento en escritorio.
- Los recursos del frontend se versionan en 0.5.2 para invalidar caché.

## Instalación

Respaldar Supabase, reemplazar archivos en GitHub, desplegar el último commit y volver a abrir la web. No ejecutar SQL ni modificar las variables de entorno. Si un acceso directo instalado mantiene recursos anteriores, cerrarlo por completo y abrirlo de nuevo; recargar la página del navegador.

## Validación

62 pruebas Node.js aprobadas (58 anteriores y 4 nuevas). Las nuevas pruebas verifican el DOM simulado, la sección de solicitudes, conservación del scroll/controles y el router real con peticiones demoradas y respuestas fuera de orden. Se comprobó la sintaxis de JavaScript. Chromium no terminó de iniciar en el entorno de trabajo; falta la prueba visual en navegador y dispositivo real, y la verificación contra PostgreSQL de producción.
