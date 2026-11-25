# StageHub 0.4.0 — Inicio de empresas, cuentas y permisos

## Actualizar el despliegue existente
1. Realiza un respaldo privado de PostgreSQL y las fotografías antes de actualizar. El comando `npm run backup` puede ejecutarse en tu PC con las variables existentes configuradas (no las subas al repositorio).
2. Extrae este ZIP y sube todo el contenido interior de `stagehub/` a la raíz del repositorio GitHub existente. Reemplaza los archivos con el mismo nombre; incluye `server/migrations/004_usuarios.sql`, `server/routes/users.js`, `public/js/pages/users.js` y el esquema actualizado `supabase/migrations/202611250001_stagehub_schema.sql`. No subas `.env`, bases de datos, certificados privados ni respaldos.
3. Haz commit y despliega en el servicio Render existente. Mantén las variables de PostgreSQL, Storage y administrador sin cambios. La migración aditiva se aplica al arrancar, tanto en PostgreSQL como en SQLite. No ejecutes scripts que reinicien o borren la base de datos.
4. Inicia sesión con tu usuario y contraseña existentes. En el menú aparecerá Administración de usuarios si eras administrador histórico; ahora eres Master. Recarga la página si el navegador conserva archivos antiguos.
5. Registra una cuenta de prueba en una ventana privada. El Master puede buscarla, comprobar el correo y aprobarla. La cuenta podrá ver todas las empresas y sus inventarios. Comprueba que no pueda editar hasta cambiar su rol a Administrador.

## Permisos
- Usuario (`user`): lectura de todas las empresas, estadísticas e inventarios. No crea, modifica ni elimina inventario.
- Administrador (`admin`): también crea, edita, elimina y duplica inventario, gestiona unidades, fotografías y categorías compartidas, y consulta auditoría de inventario. No gestiona empresas, traslados entre empresas ni usuarios.
- Master (`master`): permisos anteriores, además de creación/edición de empresas, traslados entre empresas y gestión de usuarios. Puede aprobar, rechazar, desactivar y cambiar roles, incluso nombrar otros Masters. No puede cambiar su propia cuenta desde el panel; al cambiar roles o desactivar una cuenta se revocan sus sesiones.

Los roles históricos se migran sin cambiar contraseñas: admin → Master; bodega → Administrador; supervisor/tecnico/consulta → Usuario. Se conserva la columna histórica `role` por compatibilidad; `access_role` contiene el rol efectivo. Las cuentas nuevas siempre se registran como Usuario pendiente; los permisos son comprobados en cada endpoint del backend. No hay aislamiento de visibilidad por empresa: todos los usuarios aprobados ven todas las empresas, tal como se solicitó.

## Registro y correo válido
Por defecto no hace falta configurar ningún servicio extra: se valida el formato del correo y se exige aprobación del Master. El Master debe comprobar manualmente que la persona controla la dirección antes de aprobar; la aplicación no puede comprobar propiedad del buzón por el formato del correo. No concede acceso inmediato a visitantes desconocidos.

Para comprobación automática de propiedad del correo, crea una cuenta en https://resend.com/, verifica un dominio remitente que controles en Domains y crea una API key con permiso de envío. En Render > Environment agrega **ambas** variables:

- `RESEND_API_KEY`: clave privada real de Resend (no subir a GitHub).
- `STAGEHUB_MAIL_FROM`: por ejemplo `StageHub <no-reply@tu-dominio.cl>`; reemplaza por un remitente de tu dominio verificado.

Guarda y despliega. Las nuevas cuentas reciben un código de un solo uso, válido por 24 horas, que se copia en Verificar correo. Pueden solicitar un nuevo código. La aprobación queda bloqueada hasta confirmar el correo. Las cuentas ya registradas sin proveedor pueden solicitar código después de activarlo o seguir el procedimiento manual. Resend es un servicio de envío, no un inicio de sesión de terceros. Para envío general debes verificar tu dominio y revisar los límites de tu plan. Las claves permanecen exclusivamente en el servidor. La recuperación de contraseña por correo no forma parte de esta actualización.

## Validación y límites
30 pruebas automatizadas locales pasan (27 anteriores + registro/permisos, verificación HTTP simulada y migración de usuarios). Se verificó sintaxis JavaScript. No se realizó una conexión a tu PostgreSQL ni envío real por Resend ni prueba visual en dispositivo móvil; comprueba estos casos tras desplegar. Los límites de registro y verificación se aplican por IP del socket y se reinician con el proceso, pudiendo compartir cuota detrás de proxy. No es una auditoría de seguridad completa.
