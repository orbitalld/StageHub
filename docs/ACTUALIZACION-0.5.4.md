# StageHub v0.5.4 — Rendimiento

## Cambios
- Compresión HTTP GZIP/Brotli negociada para archivos públicos de texto, con caché acotada en memoria (64 variantes).
- Recursos estáticos con versión en URL: caché pública de 24 h. HTML sin caché fresca, ETag por variante y Vary: Accept-Encoding. API y fotos privadas conservan no-store. No aplicar caché pública a /api ni /uploads.
- Carga bajo demanda de las páginas con import() y eliminación de la dependencia estática de Eventos desde Miembros. Indicador de versión independiente, con una consulta compartida entre encabezados simultáneos.
- Logos y miniaturas con carga diferida y decodificación asíncrona. La paginación (25 equipos por defecto) y compresión de fotos al subirlas ya existían.
- La lista de empresas obtiene los permisos en la misma consulta, sin consultas por empresa; consulta de membresía mediante JOIN. El conteo de inventario evita la vista de stock cuando no se filtra por estado.
- Índices aditivos para inventario por empresa/categoría/nombre, fotos y logos, tanto en SQLite como en PostgreSQL. Se mantiene la serialización y protección de reservas y escrituras. No se modifica el contenido de los registros.
- No se ha añadido minificador ni dependencias nuevas. Las respuestas API privadas no se comprimen ni cachean; la concurrencia PostgreSQL permanece sin cambios.

## Actualización
1. Respalda Supabase y conserva el ZIP anterior.
2. Descomprime el ZIP y sube el contenido de stagehub al mismo repositorio privado, reemplazando los archivos existentes. Mantén package.json, public/, server/ y supabase/; conserva scripts, tests y docs para mantenimiento. No subas .env, node_modules ni data.
3. En Render, Settings > Build & Deploy, configura Build Command: npm install --omit=dev. Start Command: npm start. Guarda. No cambies las variables de entorno.
4. Despliega el último commit (desde StageHub Master si ya están configuradas las APIs, o desde Render). Los índices se crean en el arranque. Espera a que Render muestre el servicio en línea. No ejecutar SQL manualmente.
5. Recarga el sitio, comprueba versión 0.5.4, abre empresas, inventario y eventos. Verifica guardar y recargar un borrador, fotos y permisos. Si el navegador conserva la interfaz antigua, recarga una vez sin caché.
6. En Chrome/Edge, F12 > Network: con Disable cache marcado, recarga para una medición fría. Compara tamaño transferido, duración y Content-Encoding. Desmarca Disable cache y recarga para probar reutilización. Repite en la versión previa si deseas comparar. Usa la misma red y servidor ya activo; no compares un arranque en frío de Render con un servidor caliente.
7. Comprueba en Render las métricas disponibles de CPU/memoria y los logs. Si hay lentitud persistente, mide las consultas con Supabase antes de añadir más índices o aumentar conexiones.

## Validación
67/67 tests locales aprobados con Node 22.16.0 (SQLite, pruebas HTTP y DOM simulado; integraciones externas simuladas). No se ha probado PostgreSQL real ni el rendimiento móvil en producción.
Tamaños de archivos sin comprimir vs GZIP, medidos localmente: app.css 28906 -> 7008 bytes; pages/events.js 32840 -> 10467 bytes; main.js 14190 -> 4456 bytes. Esto no equivale a una medición de velocidad de carga de la página completa.
