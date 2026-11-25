# StageHub 0.2.1 — Actualización móvil

Partiendo del ZIP StageHub-Supabase-Render 0.2.0, esta versión modifica la interfaz y no cambia el esquema, las rutas del servidor ni las credenciales de Supabase.

## Instalar sobre el despliegue existente

1. Extraer este ZIP. En la carpeta `stagehub` está el proyecto completo.
2. En el repositorio GitHub existente, actualizar `public/css/app.css`, `public/js/ui.js`, `public/js/pages/item-form.js`, `public/js/main.js`, `public/js/api.js`, `public/index.html` y `package.json` (versión 0.2.1). El resto se mantiene igual. No subir un archivo .env ni credenciales.
3. Confirmar el commit. Render puede desplegarlo automáticamente; si no, usar Manual Deploy > Deploy latest commit.
4. Mantener las variables de entorno y el proyecto/bucket Supabase actuales. No borrar tablas, equipos ni fotografías.
5. Abrir la URL actual en el móvil. Si se conserva la interfaz antigua, cerrar y volver a abrir la página o recargar sin caché.

## Cambios

- Formulario de alta y edición a pantalla completa en móviles pequeños, con cabecera y pie de acciones fuera de la zona de scroll.
- Altura de ventana basada en viewport dinámico y visualViewport, con adaptación al teclado y áreas seguras del dispositivo.
- Sin apertura automática del teclado al mostrar los diálogos en móviles.
- Botones táctiles de mayor tamaño, campos de 16 px, filtros y características adaptables a ancho reducido.
- Estado de carga de fotografía y guardado, bloqueo de envíos concurrentes, desplazamiento al campo inválido.
- Ajustes compartidos para diálogos de unidades, categorías y contraseña.

## Validación

Las 24 pruebas automatizadas existentes pasan. Comprobación de sintaxis de los módulos JS modificados. La prueba visual en Chromium no se pudo ejecutar debido al bloqueo de navegación del entorno. No se ha comprobado en dispositivos físicos ni conectado a la base de datos de producción. Tras desplegar, verificar crear/editar equipo con y sin foto, validación de nombre requerido, agregar unidades y rotar el dispositivo; no usar datos de prueba que no se deseen conservar en producción.
