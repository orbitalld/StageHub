# Actualización 0.4.5

1. Respalda PostgreSQL y Storage antes de actualizar.
2. Reemplaza los archivos del repositorio por el contenido de este ZIP.
3. Despliega el último commit en Render y verifica los logs. No se requieren nuevas variables de entorno ni SQL manual.
4. Entra con una cuenta Master global y verifica las empresas, usuarios e inventarios.

## Sesiones
Cambiar roles globales mantiene las sesiones activas si la cuenta sigue aprobada y habilitada. Los permisos del servidor se consultan en cada petición. La interfaz se actualiza al navegar o recargar. Desactivar o rechazar cuentas, eliminar usuarios y cerrar sesiones manualmente conserva el comportamiento de revocación.

## Jerarquía de empresa
- reader: lectura.
- inventory: lectura y escritura de inventario, sin gestionar usuarios.
- members: lectura y gestión de miembros de rol reader o members; no puede gestionar ni conceder inventory o manager.
- manager: inventario y miembros, puede gestionar reader, inventory, members y manager.
- owner: control de su empresa; puede gestionar los roles anteriores, pero no otros propietarios.
- master: administración global.
No se permite editar el propio rol de empresa. La gestión de miembros nunca concede acceso global.

## Papelera
Propietarios y Master global pueden enviar una empresa a la papelera desde su tarjeta. La eliminación lógica preserva el ID, inventarios, unidades, fotos, logo, historial y membresías existentes. Se oculta de las listas y se bloquean sus rutas normales. Solo el Master global accede a Empresas > Papelera y puede restaurarla. Las invitaciones pendientes se cancelan y deben enviarse nuevamente después de restaurar. Los nombres se mantienen reservados para evitar conflictos. No hay vaciado automático ni borrado físico. Si una cuenta se elimina globalmente mientras la empresa está archivada, su membresía no se restaura (no se recrean cuentas eliminadas). Esta función no reemplaza una copia de seguridad ni revierte cambios de inventario previos al borrado.

## Validación
Pruebas locales SQLite, compilación de SQL y Storage simulado. No se ha ejecutado una prueba contra la instancia de Supabase de producción ni una prueba visual en móvil real.
