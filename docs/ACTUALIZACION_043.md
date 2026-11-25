# StageHub 0.4.3 — Accesos por empresa

## Antes de actualizar
1. Haz un respaldo de PostgreSQL y Storage. Si usas `npm run backup`, hazlo con la versión desplegada y tus variables privadas en tu equipo; no publiques el respaldo.
2. Sube el contenido de `stagehub/` a la raíz de GitHub, reemplazando archivos. Render → Manual Deploy → Deploy latest commit.
3. Verifica en logs `stagehub@0.4.3`, `Datos: Supabase PostgreSQL + Storage` y `Your service is live`.
4. No cambies las variables actuales ni ejecutes SQL a mano. El esquema PostgreSQL es aditivo y crea `company_members`, `company_invitations`, `company_photo_uploads`; SQLite tiene la migración 006.

## Cambio de acceso importante
Master conserva acceso global. Los demás usuarios históricos ya no tienen acceso automático a ninguna empresa, incluso con el antiguo rol Administrador. Sus cuentas, inventarios y fotos se conservan. Desde Administración de usuarios → Asignar empresas, selecciona un permiso para cada empresa y pulsa Guardar en cada fila. Los usuarios pueden crear empresas tras la aprobación de su cuenta; el creador queda como propietario. No se impone límite de empresas por usuario. No se otorga Master global al crear una empresa.

## Permisos locales
- Solo lectura (`reader`): consulta inventario, estadísticas.
- Inventario (`inventory`): consulta y modifica equipos, unidades y fotos.
- Usuarios (`members`): consulta inventario y administra miembros de nivel lectura/inventario; no modifica inventario.
- Inventario y usuarios (`manager`): ambas capacidades. Puede invitar y modificar miembros de nivel lectura/inventario, no otros gestores ni propietarios.
- Propietario (`owner`): administra inventario, miembros, invitaciones y datos básicos de su empresa. Puede otorgar todos los permisos locales salvo propietario. El Master global puede asignar propietarios, recuperar empresas sin propietario y gestionar todas las empresas. Si se elimina una cuenta propietaria, su empresa se conserva y el Master puede asignar otro propietario.
- Logos, edición del catálogo global compartido y traslado de equipos entre empresas siguen reservados al Master global. Todas las categorías pueden consultarse dentro de las empresas autorizadas.

## Invitaciones
En una empresa → Gestionar miembros → correo y permiso → Enviar solicitud. Se requiere una cuenta existente, activa y aprobada; el destinatario recibe la invitación en Solicitudes (también hay contador en el inicio). No se envía un email: el correo identifica la cuenta. La invitación queda ligada al ID de esa cuenta. Aceptar añade la empresa al dashboard, rechazar no concede acceso. Se valida de nuevo el permiso de quien invitó al aceptar. El propietario puede retirar miembros y cancelar invitaciones pendientes. La pérdida de acceso se aplica en la próxima petición al backend.

## Comprobación después del despliegue
Usa un usuario normal con dos empresas, con distintos permisos, y otra cuenta sin acceso. Verifica que la cuenta no autorizada no vea las empresas, equipos o fotos ajenas. Crea una empresa nueva e invita al segundo usuario; acepta desde su bandeja. Cambia su permiso y retíralo. Verifica desde móvil que los formularios se puedan guardar.

## Validación
Pruebas automatizadas locales con SQLite y comprobaciones de compilación de SQL para PostgreSQL. No se ha probado una conexión a la instancia real de Supabase ni la interfaz en un teléfono físico. Mantén el repositorio y el respaldo privados. Nunca publiques `.env`.
