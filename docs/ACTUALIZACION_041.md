# StageHub v0.4.1 – Administración de cuentas

Actualización sobre v0.4.0. En Administración de usuarios (solo Master), cada cuenta ajena ofrece editar el nombre, guardar permisos y estado, cerrar todas las sesiones y eliminar definitivamente. Los filtros distinguen cuentas pendientes, aprobadas, rechazadas, con acceso y desactivadas.

- Desactivar: conserva la cuenta, pero bloquea su acceso y revoca las sesiones.
- Cerrar sesiones: revoca todos sus tokens actuales; puede volver a entrar si está autorizado.
- Eliminar: borra las credenciales y sesiones de la cuenta. El inventario, empresas, fotos y auditoría se conservan; las referencias de autor en equipos y auditoría pasan a NULL cuando corresponda. El historial puede conservar el nombre original como texto. Un correo eliminado puede volver a solicitar registro, siempre pendiente de aprobación.
- Un Master no puede ejecutar estas acciones sobre su propia cuenta. Debe quedar al menos un Master activo. Otros Masters sí pueden ser administrados. Usuario y Administrador no tienen permiso para administrar cuentas.
- La interfaz solicita confirmación para eliminación y cierre de sesiones. El servidor verifica permisos y realiza las operaciones dentro de transacciones.

## Instalación
Respalda la base de datos antes de actualizar. Sube el contenido de stagehub/ a la raíz del repositorio existente, reemplazando archivos; conserva las variables secretas de Render. Despliega el último commit y recarga el navegador. No requiere nuevas variables, cambios de esquema ni SQL manual. No subas .env con credenciales.

## Validación
Pruebas automatizadas locales con SQLite y pruebas de compilación SQL/Storage simuladas heredadas. No se conectó a la instancia real de Supabase ni se comprobó la interfaz en un teléfono real. Comprueba primero con una cuenta de prueba sin valor operativo.
