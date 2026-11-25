# StageHub v0.3.0 — Empresas

## Actualizar un despliegue existente

1. Antes de actualizar, exporta un respaldo privado de la base y fotografías con `npm run backup` desde una copia local configurada para Supabase, o usa las opciones de respaldo de Supabase disponibles en tu plan. Nunca subas el respaldo ni el `.env` a GitHub.
2. Descomprime el ZIP y sube el contenido de la carpeta `stagehub` a la raíz de tu repositorio existente, conservando los subdirectorios y reemplazando los archivos de la versión anterior. El archivo `package.json` debe quedar en la raíz. No subas el ZIP sin extraerlo.
3. Haz commit. Render puede desplegar automáticamente; si no, selecciona Manual Deploy > Deploy latest commit. Conserva todas las variables de entorno actuales.
4. La migración PostgreSQL se ejecuta automáticamente dentro de una transacción al arrancar. No ejecutes SQL manualmente. Espera a que Render muestre `StageHub en marcha` y `Your service is live`.
5. Abre StageHub y recarga. En Empresas aparecerá `Empresa principal` con los equipos existentes. Edita su nombre y crea otras empresas.
6. Selecciona `Administrar inventario` o utiliza el selector Empresa activa. Crea un equipo de prueba y verifica que solo aparezca en la empresa activa. El administrador puede trasladar una referencia completa desde su ficha con el botón Trasladar.

## Comportamiento

- Una empresa por referencia de equipo; sus unidades individuales pertenecen a esa misma referencia. El traslado conserva IDs, números de serie, existencias, fotos e historial; no divide cantidades ni duplica registros.
- Cada empresa tiene listado, búsqueda, filtros, indicadores, actividad y evolución del stock propios. Las instantáneas históricas existentes se asignan a Empresa principal. El historial del equipo se conserva al trasladarlo.
- Solo el administrador crea/edita empresas y traslada referencias. Los otros roles mantienen sus permisos globales de la fase anterior. Todos los usuarios autenticados con lectura de inventario pueden cambiar de empresa: **esto no es un sistema multiinquilino con acceso restringido por empresa**. Categorías y subcategorías, códigos únicos, usuarios y el bucket de fotos son compartidos. No se incluye eliminación de empresas para evitar pérdida accidental de registros.
- Los datos actuales, usuarios, fotos y credenciales de Render se conservan. La migración es aditiva y crea `stagehub.companies`, `stagehub.company_stock_snapshots`, y `company_id` en `stagehub.items` y `stagehub.audit_log`. La tabla de snapshots antigua se conserva como referencia histórica. No se requieren nuevas variables de entorno.
- Se conserva el diseño móvil v0.2.1. Se agregaron selector de empresa, tarjetas de empresas y diálogos adaptables.
- Validación: 27 pruebas automáticas aprobadas (SQLite local, traducción SQL y Storage HTTP simulado). No se verificó la migración contra el Supabase de producción ni la interfaz en un teléfono físico. Si falla el despliegue, guarda el log de Render, sin claves, antes de hacer cambios manuales en las tablas.
