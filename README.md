# StageHub 0.2 — Supabase + Render

Migración de toda la aplicación **Fase 1** a PostgreSQL y Supabase Storage, con modo SQLite local conservado para desarrollo. La interfaz y los endpoints existentes se mantienen. Incluye autenticación propia (no Supabase Auth), sesiones persistentes, roles, categorías, inventario, numeración individual, stock por cantidad, fotos, historial y panel de control. La gestión de eventos/reservas de Fase 2 aún no existía en el código original; esta migración no la implementa.

## Despliegue en 3 partes

### 1. Supabase

1. Abre tu proyecto Supabase. En **Connect**, elige **Session pooler** (puerto 5432) y copia la URI PostgreSQL. Sustituye `[YOUR-PASSWORD]` por la contraseña de la base (no tu contraseña de inicio de sesión Supabase). Codifica los caracteres especiales de la contraseña para una URI, por ejemplo `@` → `%40`, `#` → `%23`, `%` → `%25`. No compartas esa URI.
2. En **Connect** o **Settings → API Keys**, copia la URL del proyecto (`https://...supabase.co`) y una **Secret key** `sb_secret_...`. El código acepta también la clave antigua service_role mediante `SUPABASE_SERVICE_ROLE_KEY`; se recomienda la nueva secret key. No uses la publishable/anon key. No subas estos secretos a GitHub.
3. En **Database Settings / SSL Configuration**, descarga el certificado CA. Abre el archivo con un editor de texto y copia el contenido PEM completo para `SUPABASE_DB_CA`. La conexión verifica TLS; no desactives la validación.
4. En **Storage**, crea un bucket `stagehub-photos`, **privado** (Public bucket desactivado). Puedes limitar a 6 MB y los tipos `image/jpeg`, `image/png`, `image/webp`. No crees políticas públicas. El backend comprueba el bucket al arrancar.
5. No hace falta crear tablas manualmente: el servidor ejecuta `supabase/migrations/202611250001_stagehub_schema.sql` al arrancar. Si quieres anticipar este paso, pega el contenido en SQL Editor y pulsa Run. Es idempotente y crea el esquema `stagehub`, separado de `public`. No expongas el esquema en Data API.

### 2. GitHub

Extrae el ZIP. Abre la carpeta `stagehub` y sube **su contenido** (no el ZIP ni la carpeta contenedora) a la raíz del repositorio privado. Deben verse `package.json`, `render.yaml`, `server/`, `public/`, `supabase/`, `scripts/` y `tests/`. No subas `.env`, `data`, ni credenciales. Incluye `.gitignore` y `.env.example` si puedes. Puedes usar GitHub Desktop o la opción Add file → Upload files. Confirma los cambios en la rama `main`.

### 3. Render

1. Crea un **Web Service** en https://dashboard.render.com/ y conecta tu repositorio GitHub privado. Autoriza Render solo para el repositorio que corresponda.
2. Nombre `stagehub`, rama `main`, runtime Node, Root Directory vacío, Build Command `npm install`, Start Command `npm start`, Instance Type Free. Si es posible elige la región más cercana al proyecto Supabase. Health Check Path `/healthz`.
3. Añade las variables de entorno **en Render** (no en GitHub):

| Variable | Valor |
|---|---|
| `NODE_VERSION` | `22.16.0` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | URI Session pooler completa, puerto 5432 |
| `SUPABASE_URL` | URL HTTPS del proyecto |
| `SUPABASE_SECRET_KEY` | Clave `sb_secret_...` |
| `SUPABASE_DB_CA` | Certificado CA PEM completo |
| `SUPABASE_STORAGE_BUCKET` | `stagehub-photos` |
| `ADMIN_USERNAME` | `admin` o el usuario que elijas |
| `ADMIN_NAME` | `Administrador` |
| `ADMIN_PASSWORD` | Contraseña propia fuerte, mínimo 8 caracteres, preferiblemente 16 o más |
| `SECURE_COOKIES` | `1` |

No configures `PORT` (Render lo asigna). También se incluye `render.yaml` para desplegar como Blueprint; usa solo un método de despliegue, manual o Blueprint.

4. Pulsa Deploy Web Service. Revisa los logs. Si arranca, debe aparecer `Datos: Supabase PostgreSQL + Storage`. La primera ejecución crea el catálogo y la cuenta inicial desde las variables. No se habilita una creación pública de administrador. Los arranques posteriores no modifican la contraseña existente.
5. Entra a la URL `https://<tu-servicio>.onrender.com` y autentícate con el usuario/contraseña que configuraste. Comprueba que puedes agregar una referencia de inventario, unidades y una fotografía. En Supabase SQL Editor puedes ejecutar `SELECT id,name,internal_code FROM stagehub.items;`. La foto debe estar en Storage. Reinicia el servicio y comprueba que todo sigue allí.
6. Después del primer acceso y de confirmar que el usuario existe, puedes retirar `ADMIN_PASSWORD` de Render (no es necesaria para siguientes arranques) y cambiar tu contraseña desde la interfaz. Mantén el resto de variables.

## Si ya tienes datos en SQLite

El ZIP de código original no traía una base de datos real. Si tienes una base usada en tu PC, **no despliegues Render todavía**: importa antes en un esquema nuevo vacío. Haz una copia de tu carpeta `data` con `stagehub.db` y `uploads/` mientras el servidor original esté detenido. No ejecutes la importación contra una base que ya contiene registros.

En el PC con Node 22.13+ abre una terminal en esta carpeta, ejecuta `npm install`, copia `.env.example` a `.env` (solo local) y completa las variables de Supabase. Usa el certificado PEM entre comillas dobles y saltos `\n` si tu editor lo requiere. Ejecuta:

```powershell
npm run import-sqlite -- "C:\ruta\a\copia-de-data"
```

Importa categorías, usuarios (con hashes de contraseña), inventario, unidades, historial, contadores, snapshots y fotos referenciadas. No importa sesiones; se vuelve a iniciar sesión. El script se niega a sobrescribir tablas con datos. Si falla durante la subida de imágenes, revisa el bucket antes de repetir; algunas fotos pueden haber quedado subidas. Usa los usuarios anteriores al entrar a Render.

## Desarrollo local y administración

Instala Node.js 22.13+, abre una terminal en el proyecto y ejecuta `npm install` y `npm start`. Sin `DATABASE_URL` funciona con SQLite local (`http://localhost:3000`); con una `.env` configurada, usa Supabase. En Render el modo local está bloqueado para evitar perder información en un disco efímero.

Para crear otros usuarios ejecuta desde tu PC con `.env` configurada:

```powershell
npm run create-user -- bodega1 "Encargado de bodega" bodega
```

Roles: `admin`, `bodega`, `supervisor`, `tecnico`, `consulta`. La administración web de usuarios no estaba en Fase 1. No pases contraseñas en argumentos de terminal. El comando solicita la contraseña; no la guarda en código.

## Respaldos

- Local SQLite: conserva la copia diaria automática y `npm run backup`.
- Supabase: no se escribe un respaldo automático en el disco temporal de Render. Ejecuta `npm run backup` desde tu PC con `.env` configurada: exporta tablas a JSON y fotos referenciadas a `data/backups/supabase-...`. Guarda la carpeta fuera del repositorio: contiene hashes de contraseñas e información interna. El exportador no incluye sesiones ni objetos no asociados a equipos. El archivo `COMPLETO.txt` confirma que finalizó. Es un exportador lógico, no un restaurador automático. Para una restauración completa usa las herramientas PostgreSQL (por ejemplo `pg_dump`/`pg_restore` con esquema `stagehub`) y un respaldo separado de Storage. Revisa los límites/retención de tu plan de Supabase.

## Verificación y diagnóstico

- `npm test`: 22 pruebas de regresión de la aplicación en SQLite y 2 pruebas nuevas de traducción SQL/Storage simulado (24 aprobadas en el entorno de preparación). No prueban PostgreSQL remoto ni Storage real.
- `npm run smoke -- https://TU-SERVICIO.onrender.com`: prueba contra un despliegue real con `ADMIN_USERNAME` y `ADMIN_PASSWORD` en el entorno local. Crea y elimina un equipo de prueba, hace login, carga una foto, cambia estado de una unidad, consulta historial y panel. Quedará un registro de auditoría de la prueba. Si falla antes de asociar la foto, puede quedar un archivo sin referencia. No ejecutar contra un servidor que no administras.
- `28P01`: revisa usuario y contraseña de la URI. En Session pooler el usuario suele incluir la referencia del proyecto.
- `ENETUNREACH`: verifica Session pooler IPv4 (5432), no conexión directa IPv6 si tu host no la soporta.
- Error de certificado: revisa el PEM y la URL; no desactives TLS.
- Error de bucket: comprueba nombre, clave secreta, proyecto y que el bucket sea privado.
- Si el primer acceso demora, Render Free puede suspender servicios inactivos. No hay garantía de disponibilidad continua.

## Alcance y validación de esta entrega

Se convirtió la capa de datos a operaciones asíncronas, con transacciones, control de concurrencia, parámetros PostgreSQL, esquema privado, almacenamiento remoto y arranque seguro. Se conserva SQLite para pruebas y desarrollo. La aplicación usa una conexión de PostgreSQL a la vez y serializa operaciones de base de datos para preservar las garantías del sistema original; apropiado como punto de partida para un inventario pequeño, no como arquitectura de alta concurrencia.

No fue posible instalar `pg` ni conectar a PostgreSQL/Supabase real en el entorno de preparación (sin acceso a la red de paquetes ni credenciales). Render instalará `pg` durante la compilación; no se incluye `package-lock.json` generado. La validación contra el servicio real es necesaria antes de cargar datos productivos. El documento `docs/ARQUITECTURA.md` conserva el diseño original de fases futuras.

Documentación oficial:
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/storage/quickstart
- https://render.com/docs/web-services
- https://render.com/docs/free
