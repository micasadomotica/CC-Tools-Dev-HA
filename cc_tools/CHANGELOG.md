# Changelog

## 1.0.72 — Cupos guardados de MakeNow, pausa de comentarios y versión visible

- **Crea un proyecto** usa los cupos guardados de cada herramienta y solo comprueba la herramienta elegida antes de crear el proyecto, en lugar de revisar las ocho en cada ejecución (antes tardaba casi dos minutos). Después de crearlo suma uno a su contador. Las ocho se consultan de nuevo si no hay cupos guardados, si la última consulta completa tiene más de 7 días, si según lo guardado ninguna tiene espacio, o al pulsar el nuevo botón **Actualizar cupos**, que no crea ningún proyecto ni cambia la próxima ejecución programada.
- Cuando una herramienta de MakeNow llega a su límite (30, o 50 en FrameStudio), se avisa por Telegram una sola vez y no se usa hasta que una consulta vea que vuelve a tener espacio. La lista de cupos la marca como llena. Nueva opción en **Notificaciones**: **Cuando una herramienta de MakeNow se llene**.
- **Haz un comentario**: si en un mismo día se publican dos comentarios sin que Creality Cloud acredite la recompensa, se cancela la programación de ese día y se reanuda sola al día siguiente. Se avisa por Telegram con la opción **Cuando se desactive o pause la programación de comentarios**.
- La cabecera muestra la versión instalada junto a **CC Tools Dev**.

## 1.0.71 — Límite de usos e importación de comentarios

- **Haz un comentario**: nuevo ajuste **Usos máx. por comentario** (50 por defecto, de 1 a 1000). Al llegar al límite, el comentario se desactiva y se avisa por Telegram. Repetir el mismo texto e imagen muchas veces hace que Creality Cloud oculte el comentario a los demás y no acredite la recompensa. Si vuelves a activar a mano un comentario que llegó al límite, su contador empieza de 0. El contador de la biblioteca muestra los usos sobre el límite (por ejemplo `x12/50`) y se marca en rojo al alcanzarlo.
- Si no queda ningún comentario disponible, se desactiva la programación de **Haz un comentario** y se avisa por Telegram para que añadas comentarios nuevos. No se puede volver a programar sin al menos un comentario disponible.
- Nuevo botón **Importar comentarios** en la **Biblioteca de comentarios**: selecciona a la vez un `.txt` por comentario (UTF-8, máximo 1000 caracteres) y, si quieres, una imagen JPG, PNG, GIF o WebP con el mismo nombre, por ejemplo `comentario-01.txt` + `comentario-01.png`. Un `.txt` sin imagen crea un comentario solo de texto. Se omiten, indicando el motivo, los textos vacíos o repetidos y las imágenes sin `.txt`. Pulsa **Programar** para guardarlos.
- **Notificaciones**: nuevas opciones **Cuando un comentario llegue al límite de usos** y **Cuando se desactive la programación de comentarios**, activadas por defecto.
- En **Logs**, los paneles **Datos técnicos** ya no se cierran solos. La vista se actualiza cada 10 segundos y volvía a dibujar el historial cerrando todos los paneles expandidos; ahora conserva abiertos los que hayas expandido, igual que ya hacía con la actividad de Chromium.

## 1.0.70 — Modelos que ya no existen y botón para eliminar

- **Me gusta**, **Añadir a la colección**, **Boost** y **Comentarios** quitan de **Modelos descargados** un modelo cuya ficha ya no existe en Creality Cloud (error 404) o que no superó la revisión de Creality, y pasan al siguiente candidato en lugar de fallar. El modelo se añade a la lista de excluidos, como ya hacía **Descubrir diseños**, para que no vuelva a añadirse. Los errores de red, de sesión o de verificación de seguridad no quitan ningún modelo.
- Nuevo botón **Eliminar** en cada fila de **Modelos descargados**. Pide confirmación, quita el modelo de la lista y lo excluye para que ningún módulo lo vuelva a usar ni Descubrir diseños lo añada otra vez.
- No cambia el comportamiento de las programaciones ni de la limpieza de descargas: **Limpiar en** sigue borrando solo los archivos descargados, no la lista de modelos.

## 1.0.69 — Inicio de sesión automático con el nuevo banco de trabajo

- Corrige el **Inicio de sesión automático**, que dejó de funcionar. Creality Cloud ya no redirige al centro de cuentas cuando el **Banco de trabajo** se abre sin sesión: muestra la página vacía. La recuperación quedaba en «no se pudo confirmar la sesión» cada 30 minutos y no llegaba a seleccionar la cuenta recordada. Ahora, si la sesión no está iniciada, abre el acceso con el botón **Iniciar sesión** de Creality Cloud (o, si no lo encuentra, con la dirección del centro de cuentas), selecciona la cuenta recordada y confirma el perfil como antes. Con la sesión ya iniciada no abre el acceso.
- Chromium ya no muestra «Restore pages? Chromium didn't shut down correctly» después de un reinicio de la app, por ejemplo el del **Reinicio automático** de Creality Cloud Dev.
- No cambia el comportamiento de los módulos, las programaciones ni los datos.

## 1.0.68 — Respaldos de migración, descargas de Chromium y aviso de Chrome for Testing

- Los respaldos privados de cada migración (`/data/.cc-tools-migration/<id>`), que contienen una copia completa del origen y de los datos anteriores, se eliminan al arrancar cuando la migración terminó hace más de 7 días. Podían ocupar varios GB. Se conserva `state.json` y no se toca nada mientras haya una migración fallida o interrumpida. Una migración cancelada conserva su respaldo 7 días desde la cancelación.
- Esos respaldos ya no entran en los backups de la app. Para deshacer una migración durante esos 7 días, utiliza el respaldo que queda en `/data`.
- La carpeta `cdp-downloads` del perfil de Chromium, donde Playwright deja los archivos descargados y que no se vaciaba nunca, se vacía al iniciar Chromium y se excluye de los backups.
- Chromium externo ya no muestra la barra «Chrome for Testing … is only for automated testing». Se usa `--test-type=gpu`, el único valor con el que Chromium omite ese aviso; sigue ocultando también el aviso de `--no-sandbox`.
- No cambia el comportamiento de los módulos, las programaciones, la sesión ni los datos.

## 1.0.67 — Imagen precompilada y backups más pequeños

- La app se distribuye como imagen precompilada en GitHub Container Registry (`ghcr.io/micasadomotica/cc-tools-dev-ha`) para amd64 y aarch64. Home Assistant la descarga al instalar y actualizar en lugar de construirla en el equipo.
- Los backups de la app ya no incluyen la imagen Docker. Supervisor solo guarda la imagen de las apps construidas localmente; con Playwright y Chromium suponía varios GB por backup.
- Los backups omiten datos regenerables de `/data`: descargas temporales, capturas de diagnóstico y las cachés de Chromium (Cache, Code Cache, GPUCache, cachés de shaders y de Service Worker, Crashpad). Se conservan el perfil con la sesión y las cookies, la configuración, los registros y el historial de entregas.
- Tras restaurar un backup, las capturas anteriores ya no estarán disponibles en los registros y Chromium reconstruirá sus cachés en la primera tarea.
- Nuevo workflow **Publish container** basado en `home-assistant/builder`, como el proyecto original. Publica la imagen desde la rama `release/X.Y.Z` antes de integrar en `main`, y **Validate** impide integrar si la imagen de la versión no está publicada y es pública.
- Chromium externo ya no muestra la barra «You are using an unsupported command-line flag: --no-sandbox». Se añade `--test-type`, que oculta ese aviso propio del navegador; `--no-sandbox` sigue siendo necesario porque la app se ejecuta como root dentro del contenedor.
- No cambia el comportamiento de los módulos, las programaciones ni los datos existentes.

## 1.0.66 — Cierre entre tareas y rechazo del aviso de cookies

- Chromium externo se cierra al terminar cada tarea y se vuelve a iniciar con el mismo perfil persistente en la siguiente, siguiendo el ciclo de tareas del proyecto original. Se mantiene bloqueado el acceso hasta terminar el cierre del proceso.
- Al aparecer el aviso inicial de cookies de Creality, se pulsa «Reject all»: el sitio rechaza las cookies opcionales y conserva las necesarias. No se borran cookies ni se escriben preferencias manualmente.
- Conserva la elección en el perfil y actúa también en pestañas nuevas y en el navegador interactivo. No modifica decisiones previas si el aviso no aparece ni interviene en el editor de preferencias.
- Mantiene la ventana durante una verificación pendiente, la cancelación y los diagnósticos de actividad. No automatiza controles de Cloudflare.
- Añade pruebas de rechazo, límites por dominio y diálogo, conservación de cookies necesarias y consentimiento después de reabrir, y exclusión de tareas durante el cierre.


## 1.0.65 — Chromium externo definitivo y limpieza de diagnósticos

- Chromium externo es el único navegador compartido desde el arranque, también al actualizar desde una selección antigua del modo estándar. Se retiran el selector, su API y la ruta alternativa de arranque. Se conserva el mismo perfil persistente.
- Se elimina el diagnóstico temporal de cookies de Cloudflare: muestras, consola y panel por ejecución. Los diagnósticos antiguos se omiten en la vista y exportación de logs; las cookies del navegador no se borran.
- Se mantienen la reutilización entre módulos, la espera de intervención, la cancelación y el registro global de actividad de Chromium para investigar cierres y fallos.
- Se retiran las pruebas del selector y de alternancia entre modos. Las pruebas funcionales siguen comprobando persistencia de sesión y cookies, descargas, subida de archivos, reutilización y recuperación.
- No se cambian las programaciones ni se atribuyen puntos a comentarios sin recompensa confirmada.

## 1.0.64 — Chromium externo predeterminado y claridad en los registros

- Chromium externo pasa a ser el modo predeterminado cuando no hay una selección guardada. Se aplica antes de iniciar los procesos de trabajo; una elección explícita del modo estándar se conserva.
- El panel Actividad de Chromium conserva su estado abierto o cerrado al actualizar los logs y cambiar de página.
- Los mensajes de Comentarios distinguen la publicación confirmada de la recompensa no observada o no verificable. Se mantiene el registro del comentario publicado para evitar repetirlo y no se incrementan los puntos sin confirmación.

## 1.0.63 — Chromium externo experimental y diagnóstico del entorno

- Añade Ajustes → Sesión → Navegador: Estándar (predeterminado) o Chromium externo (experimental). Aplicar modo guarda la selección y cierra el contexto inactivo para utilizar el modo elegido en la siguiente apertura. Rechaza el cambio durante una tarea, una verificación pendiente o una sesión interactiva.
- El modo experimental inicia Chromium visible como proceso independiente y conecta Playwright por CDP exclusivamente en loopback. Comparte el mismo directorio de perfil con el modo estándar, con un único proceso activo, sin exportar ni copiar cookies.
- Mantiene la reutilización entre módulos, la espera manual, la cancelación y el límite de 15 minutos. No pulsa la casilla ni modifica navigator.webdriver mediante scripts. No garantiza que Cloudflare acepte la sesión.
- Añade eventos browser_environment al registro global con modo, versión y valor observado de navigator.webdriver. En el modo externo compara también la medición previa a conectar Playwright. Registra PID, código de salida y señal del proceso externo, sin valores de cookies ni URLs de depuración.
- Gestiona el cierre del proceso externo, los fallos de arranque y la limpieza al detener la app. Añade pruebas de persistencia al cambiar de modo, descargas, selección de archivos, ventanas, intervención y reutilización, además de pruebas del selector y del bloqueo de cambios cuando el navegador está ocupado.
- Mantiene la misma configuración de pruebas internas de Chromium que Playwright para compartir el formato de almacenamiento del perfil. El cierre externo deja una pestaña vacía para evitar restaurar páginas de trabajo antes de conectar.
- Actualización directa desde 1.0.62, sin migración. El modo externo no se activa automáticamente al actualizar.

## 1.0.62 — integración de TitoTB 1.0.45

- Integra las mejoras de [TitoTB 1.0.45](https://github.com/TitoTB/CC-Tools-HA/commit/d2e9246850e4beacf6319b646d902602410bc318): observación de las respuestas API durante la comprobación de sesión, identificación del proveedor y revisión cada cinco minutos de las pausas por verificación de seguridad.
- Da prioridad a un desafío confirmado sobre HTTP 429 y evita interpretar una respuesta de verificación HTTP 200 como acción aceptada. Una respuesta API de Cloudflare tampoco se interpreta como sesión caducada por devolver 403.
- Reanuda las automatizaciones solo con un perfil autenticado confirmado. Conserva la pausa ante comprobaciones inconclusas, respeta el navegador ocupado y evita comprobaciones simultáneas o sobrescribir cambios de estado realizados durante la espera.
- Conserva la detección visual de Dev, el aviso inmediato, la espera de intervención de hasta 15 minutos, la cancelación y la reutilización del proceso y contexto de Chromium entre módulos. No automatiza la casilla de verificación.
- Añade el proveedor, cf-ray y el tipo de contenido al diagnóstico de respuestas interceptadas. Omite el HTML de los desafíos para evitar registrar tokens incrustados. Mantiene los diagnósticos de cookies sin valores y el registro persistente del ciclo de vida de Chromium.
- Amplía las pruebas de respuestas API 200/403/429, pausas y recuperación, intervención manual, cancelación, tiempo límite y reutilización del navegador. Basta con actualizar desde 1.0.61, sin migración.

## 1.0.61 — diagnóstico de aperturas y cierres de Chromium

- Identifica aperturas, reutilización y sustitución de contextos, cierres manuales, cancelaciones, límites de tiempo, cambios de opciones y recuperación de páginas de descarga cerradas. Enlaza el contexto anterior y el nuevo sin registrar valores de opciones.
- Registra cierres no solicitados, desconexiones y fallos de pestaña. Conserva `module_end` aunque el contexto se cierre durante la tarea; una lectura imposible aparece como `unavailable`, no como pérdida de cookies.
- Añade un registro global persistente de los últimos 500 eventos, incluidos los de comprobaciones de sesión y progreso entre tareas. Se muestra en Logs y se incluye en el TXT exportado, independientemente de la página del historial. Distingue cada arranque de la app y señala si se han descartado eventos antiguos.
- Mantiene el diagnóstico de cookies sin valores, hashes, cabeceras ni mensajes de error sin filtrar. Añade pruebas de cierre inesperado, sustitución, cancelación, persistencia y exportación.
- Desde 1.0.60 basta con actualizar, sin migración. Esta versión permite investigar los cierres; no atribuye a una causa concreta el cambio observado en habeta ni garantiza que Cloudflare deje de pedir verificación.

## 1.0.60 — aviso sin demora y diagnóstico de cookies

- Elimina la espera previa de 40 segundos. Muestra Abrir navegador y envía el aviso de Telegram, si está configurado, al detectar la verificación.
- Conserva la reutilización de Chromium de 1.0.59, la cancelación y el límite de 15 minutos para completar la verificación.
- Registra la presencia y los metadatos de `cf_clearance` y `__cf_bm` antes y después de la verificación, al empezar y terminar cada módulo y al cerrar Chromium. Identifica el contexto reutilizado y las cookies que aparecen o desaparecen, sin registrar valores, hashes ni cabeceras de cookies.
- Incluye el diagnóstico en el historial y en la exportación de logs. Compara metadatos, no valores; la presencia de una cookie no garantiza que Cloudflare la acepte. Añade pruebas con cookies sintéticas, navegación y exportación.
- Actualiza las pruebas del aviso inmediato y de continuación en el mismo navegador. Desde 1.0.59 basta con actualizar, sin migración.

## 1.0.59 — Chromium compartido y espera de 40 segundos

- Reutiliza el proceso y el contexto de Chromium entre las tareas principales, conservando cookies y almacenamiento. Cierra las pestañas al finalizar y mantiene una pestaña vacía; no deja páginas de trabajo haciendo peticiones entre módulos.
- Mantiene la exclusión entre tareas y sesión interactiva. Cerrar navegador y detener la app liberan Chromium; los fallos de ejecución o las opciones incompatibles permiten iniciar un contexto nuevo. Conserva también el navegador tras recuperar correctamente una sesión.
- Desacopla las descargas del directorio de arranque de Chromium: guarda cada archivo en su lote y elimina la copia temporal después de verificarla.
- Espera 40 segundos antes de mostrar el botón Abrir navegador en el aviso y notificar por Telegram. Comprueba el estado sin recargar ni hacer clic; conserva la cancelación y el límite total de 15 minutos. No resuelve captchas automáticamente ni simula movimientos de ratón.
- Añade pruebas de reutilización, cancelación, cierre, temporización e interfaz, y una prueba de navegador con cookies, almacenamiento y descargas en dos lotes usando el mismo contexto. La aceptación real de Cloudflare sigue pendiente de comprobar en habeta.
- Desde 1.0.58 basta con actualizar, sin reinstalar ni migrar. Chromium permanece en memoria entre tareas hasta cerrarlo o detener la app.

## 1.0.58 — historial de comentarios tras una verificación

- Corrige `COMMENT_HISTORY_UNAVAILABLE` cuando resolver Cloudflare lleva más de 15 segundos. La captura del historial permanece activa durante la navegación y la verificación; el plazo de lectura empieza al comprobar la ficha cargada.
- Conserva la respuesta recibida mientras se resolvía la verificación. Solo acepta solicitudes iniciadas en la ficha correspondiente y libera la captura al terminar, cancelar u omitir un diseño.
- Mantiene la comprobación de comentarios existentes antes de publicar. Si el historial no llega, la tarea se detiene; no interpreta el fallo como un historial vacío.
- Añade pruebas de espera, cancelación y aislamiento, y una prueba con Chromium que simula más de 15 segundos de verificación y comprueba que un comentario previo no se duplica. No cambia el mecanismo de Cloudflare ni garantiza que acepte la casilla al primer intento.
- Desde 1.0.57 basta con actualizar la app; no requiere migración. La comprobación en habeta queda pendiente.

## 1.0.57 — verificación de seguridad y recuperación de sesión

- Conserva la misma ventana, pestaña y perfil de Chromium cuando una navegación muestra una verificación de seguridad. Espera su resolución automática o permite completarla manualmente desde el visor, y continúa desde ese punto tras comprobar la página de destino. No pulsa captchas ni repite la tarea completa.
- Muestra un aviso en toda la interfaz con Abrir navegador y Cancelar espera. Si Telegram está configurado, envía un aviso cuando sigue pendiente la intervención. La espera máxima es de 15 minutos; el watchdog excluye ese tiempo y vuelve a controlar la ejecución al continuar.
- Abrir navegador inicia Chromium si está cerrado o muestra la ventana existente sin cancelar ni redirigir la tarea. Logearme tampoco cancela una tarea que espera verificación. Cerrar navegador queda bloqueado durante esa espera; Cancelar espera detiene la operación.
- Evita nuevas consultas auxiliares con otros navegadores durante la verificación y cierra las consultas aisladas en curso. Aplaza la indexación de favoritos y las siguientes consultas de metadatos mientras se interviene.
- Da prioridad al diagnóstico de verificación sobre un HTTP 429 asociado y conserva las cabeceras cf-mitigated y cf-ray. Los errores anteriores a una verificación resuelta no contaminan la inspección de la nueva página.
- Adapta TitoTB 1.0.44 (86728a55): excluye de los boosts los modelos solo indexados y rota la prioridad en grupos de tres después de un fallo. Conserva la búsqueda completa de candidatos de Dev, la preferencia por favoritos y el límite diario de un boost, también en ejecución manual.
- Recupera cada nueva caducidad de sesión antes de alertar, siempre que Inicio de sesión automático esté activado. Comprueba la cuenta configurada, evita intentos simultáneos y explica los fallos o resultados inconclusos.
- Añade pruebas de navegador con desafíos simulados y pruebas de diagnóstico, recuperación y concurrencia. Superar la verificación real depende de Cloudflare; las pruebas no acreditan todavía su aceptación en habeta. Desde 1.0.56 basta con actualizar, sin migrar datos.

## 1.0.56 — favoritos y recuperación de sesión

- Corrige el error al añadir perfiles cuyos nombres no incluyen la clase de texto truncado en el formato actual de Creality Cloud.
- Acepta enlaces de perfil con `/model`, `/profile` o `/pinned-models`, además de la URL base. Guarda siempre la URL base y evita duplicados entre pestañas.
- Comprueba que el ID visible corresponde al perfil solicitado y toma la foto de la tarjeta del perfil, sin confundirla con la cuenta conectada.
- Incorpora la recuperación de sesión de [TitoTB 1.0.43](https://github.com/TitoTB/CC-Tools-HA/compare/v1.0.42...v1.0.43): selecciona la cuenta recordada correspondiente al perfil configurado mediante el flujo OAuth de Creality Cloud.
- Verifica la identidad después del acceso. Mantiene las automatizaciones pausadas si no puede confirmar el usuario, la cuenta es distinta, el token ha caducado o se necesita intervención manual.
- Aclara en Ajustes que el inicio automático selecciona la cuenta recordada por el navegador; no guarda contraseñas nuevas.
- Validación en Home Assistant confirmada por el mantenedor el 10 de noviembre de 2026: actualización a 1.0.56 probada en su instalación y funcionamiento correcto al añadir perfiles a Favoritos.

## 1.0.55 — sesión, puntos, pedidos y acceso a Logs tras migrar

- Incorpora las mejoras de [TitoTB 1.0.39–1.0.42](https://github.com/TitoTB/CC-Tools-HA/compare/v1.0.38...v1.0.42), conservando las funciones y los datos propios de Dev.
- Permite continuar una tarea cuando el perfil opcional no confirma la sesión, siempre que no haya señales de sesión cerrada o desafío de seguridad. Un resultado inconcluso no confirma la recuperación ni levanta una pausa previa, tanto con navegador remoto abierto como en la verificación automática. Un error genérico de comprobación no se interpreta por sí solo como una caída global de Creality Cloud.
- Aplaza las automatizaciones mientras el navegador remoto está abierto, sin cerrar la sesión interactiva.
- Corrige duplicados de puntos causados por cabeceras incluidas en el texto, también al combinar el historial existente. Conserva los registros distintos de check-in consecutivo y doble de miembro. Muestra puntos sin decimales sin redondear los valores guardados.
- Añade una papelera para ocultar pedidos disponibles o cancelados del seguimiento local. No cancela ni elimina pedidos en Creality Cloud; vuelven a mostrarse si cambia su estado. Actualiza el enlace de la guía de OctoPrint.
- El aviso de migración indica que, tras revisar el perfil, las programaciones y las entregas, hay que ir a Logs y pulsar Reanudar automatizaciones. El mensaje de ejecución manual incluye el enlace directo; abrirlo mantiene la pausa hasta pulsar el botón. También actualiza el aviso en instalaciones con el texto anterior guardado.
- Amplía las pruebas de sesión, recuperación, puntos y pedidos, y añade pruebas de navegador del aviso, la navegación a Logs y la reanudación explícita.
- Desde 1.0.54 basta con actualizar: no es necesario migrar de nuevo. Mantiene el puerto 8088, el identificador de la app, las subidas, la API de Models, Telegram y el cierre seguro. La actualización en una instalación real de Home Assistant queda pendiente de comprobación por el mantenedor.

## 1.0.54 — migración con estado Error y cierre de la app

- Permite migrar desde un origen que Supervisor muestra como Error cuando consta una versión instalada, Watchdog está desactivado y Docker confirma que no hay contenedores activos de ese origen. Sigue rechazando estados desconocidos, contenedores en ejecución, pausados o reiniciándose y fallos de consulta.
- Repite las comprobaciones antes de copiar y antes de sustituir los datos. Registra el origen consultado, el identificador y estado recibidos, la versión y los ajustes relevantes, sin volcar opciones ni credenciales. Los fallos de Supervisor incluyen endpoint y código HTTP.
- Ejecuta Node directamente como proceso principal para recibir la señal de parada. Detiene el planificador, impide nuevos navegadores, cierra Chromium y las conexiones HTTP/noVNC y espera las escrituras pendientes antes de salir con código 0. Las señales repetidas no interrumpen el cierre; los errores reales y los cierres bloqueados siguen devolviendo un código de error.
- Cambia de 1 a 10 el valor de respaldo de Diseños por día en la API de Descubrir diseños. No cambia los límites válidos guardados ni fuerza a 10 las programaciones existentes.
- Añade pruebas de migración con estado Error, cierre con SIGTERM/SIGINT y conexiones abiertas, y corrige una prueba de límite diario que confundía «hace 24 horas» con un día anterior durante el cambio de horario.
- Actualiza el README y la guía de migración. La migración desde TitoTB ha sido comprobada por el mantenedor; la corrección del origen local en Error y el cierre actualizado deben verificarse en su instalación.

## 1.0.53 — API de Creality Cloud Models

- Añade `GET /api/integration/models` para categoría, inventario disponible, último modelo, última y próxima subida y número de diseños enviados hoy.
- Consulta el registro persistente de envíos por cuenta, conservando los datos de diseños ya limpiados y excluyendo fallos o envíos inciertos del contador.
- Añade `PATCH /api/integration/models` para activar o pausar la programación sin sustituir la selección, el horario, el límite ni la limpieza automática.
- Comprueba la cuenta y la configuración inicial antes de activar; permite reanudar después de limpiar los archivos enviados.
- Mantiene sin cambios la guía de migración, pendiente de prueba real en Home Assistant.

## 1.0.52 — migración desde Opciones, impresiones y Telegram

- Añade un selector único en Configuración > Opciones: No migrar, CC Tools Dev local (local_cc_tools) o CC Tools de TitoTB (8966b8c7_cc_tools). Requiere confirmar la sustitución de datos.
- Ejecuta la migración al iniciar, antes del navegador y las tareas. No necesita iniciar previamente la app nueva ni utilizar Advanced SSH. Requiere detener el origen y sus reinicios automáticos, y desactivar temporalmente Modo de protección de CC Tools Dev. Tras completar, vuelve a activarlo y reinicia.
- Lee el origen mediante la API de Docker, conserva una copia completa del origen y los datos anteriores del destino en su almacenamiento privado. Mantiene las opciones de HA del destino y el contenido compartido de media.
- Comprueba la copia antes de instalarla, recupera el destino tras fallos y registra el estado para recuperarse de una interrupción. La selección y su confirmación se desactivan antes de copiar para evitar repeticiones al reiniciar.
- Permite solicitar otra migración más adelante. Si una migración falló, puedes reintentar seleccionando el origen y confirmando; para cancelar y conservar los datos recuperados, elige No migrar, marca la confirmación e inicia.
- Tras importar, mantiene las programaciones pausadas hasta revisar los datos y pulsar Reanudar automatizaciones. El origen queda intacto.
- Propone 10 impresiones por día al añadir una programación de impresora. Conserva los límites ya guardados, incluido cero.
- Añade controles de Telegram para éxito y error de Añadir a la colección y Subir un diseño, y presenta los de Crear un proyecto con esos nombres. Se guardan de forma independiente y participan en los selectores generales de éxito/error. Las subidas parciales respetan ambos controles por separado.
- Conserva el identificador, puerto 8088 y actualización directa desde 1.0.51. Con No migrar, no utiliza Docker ni altera los datos existentes.
- Incluye pruebas de recuperación, notificaciones, formulario y transporte Docker en CI. La prueba final de migración real en Home Assistant queda pendiente del mantenedor. MIGRACION.md permanece sin cambios.

## 1.0.51 — confirmación de sesión y detección de acceso cerrado

- Incorpora las correcciones de [TitoTB 1.0.38](https://github.com/TitoTB/CC-Tools-HA/commit/6fca2b19d075d600f8cc1b9e55d0795d9f332303), conservando las funciones propias de Dev.
- Exige una respuesta positiva del perfil autenticado antes de reanudar las automatizaciones. Una comprobación sin respuesta, ilegible o desconocida mantiene la pausa existente y permite reintentar sin dar la sesión por recuperada.
- Comprueba todos los controles de inicio de sesión en español e inglés; un primer elemento oculto ya no impide detectar otro visible.
- Amplía las pruebas de sesión y añade pruebas de navegador con respuestas controladas, sin utilizar cuentas reales.
- Mantiene subidas y categorías, MakeNow, colecciones, impresiones, el límite de un boost diario, la API y el puerto 8088. No cambia el formato de datos.
- Desde 1.0.50 se actualiza en la misma app de Home Assistant, sin repetir el asistente ni migrar. Para instalaciones locales, empezar de cero sigue siendo una opción y la migración es opcional; se mantiene el aviso sobre diseños ya subidos.
- La actualización y la recuperación de sesión en una instalación real de Home Assistant quedan pendientes de comprobación por el mantenedor.

## 1.0.50 — repositorio propio y actualizaciones desde Home Assistant

- Estrena CC-Tools-Dev-HA con main como rama predeterminada, conservando el historial de dev-v1.0.49.
- Parte de 1.0.49, confirmada como probada y funcional en Home Assistant por el mantenedor.
- Permite instalar y actualizar desde el repositorio en la tienda de Apps, con construcción local para amd64 y aarch64.
- Actualiza las direcciones, documentación, versión de la interfaz e instrucciones de publicación.
- Documenta la migración de todos los datos privados desde la app local, el almacenamiento compartido de media, la vuelta atrás y el nuevo destino del reinicio automático.
- Conserva las funciones, la API, el slug cc_tools y el puerto 8088. No modifica el formato de los datos.
- La instalación desde el nuevo repositorio y la migración quedan pendientes de validación final en una instalación real de Home Assistant.

## 1.0.49 — categorías de subida y aviso de capacidad de impresión

- Añade diez categorías y 45 subcategorías al módulo Subir diseños. La selección se guarda al cambiarla y se aplica a las subidas manuales y programadas sin categoría propia.
- Admite la línea opcional CATEGORIA: Categoría / Subcategoría en info.txt. Tiene prioridad sobre el selector; si falta o está vacía, se usa la selección guardada, inicialmente Impresoras 3D / Otro. Las combinaciones incorrectas se marcan para revisar.
- Selecciona las categorías de Creality Cloud con hover sobre el padre y desplazamiento independiente en ambos menús. Verifica la categoría antes de entregar y mantiene la selección durante todo el lote.
- Incluye Orca Slicer en los requisitos del archivo .3mf y actualiza la ayuda, los README y el ejemplo de info.txt.
- Al guardar una programación de impresiones distingue cuántas faltan para el objetivo diario y cuántas se programan por el tiempo disponible. Los intentos fallidos siguen sin descontarse del objetivo.
- Conserva todas las correcciones de 1.0.48, el puerto 8088 y la compatibilidad con Creality Cloud Dev 1.0.6-dev.1.
- Validada en Home Assistant por el mantenedor antes de preparar 1.0.50. La publicación original se había ofrecido inicialmente como versión de prueba.

## 1.0.48 — descargas, impresiones, boosts y limpieza

- Adapta las descargas al máximo diario de 10, incluidos ajustes antiguos, planes pendientes, contadores, API y formulario. Conserva los objetivos inferiores elegidos por el usuario. Incorpora la adaptación de TitoTB 1.0.37.
- Completa los textos del botón de boost de TitoTB 1.0.36, incluidas las variantes para impulsar de nuevo en español e inglés.
- Conserva el G-code seleccionado cuando una impresión no acredita puntos. Al volver a programar, descuenta las impresiones recompensadas de la cuenta, sin restar los intentos fallidos.
- Prioriza los diseños descargados sin boost y revisa toda la lista de candidatos. Al detectar un boost anterior lo refleja en el listado; si todos los candidatos elegibles ya lo tienen, permite impulsar de nuevo.
- Limita los boosts a uno por día, manual o programado, aunque sobren boletos. Comprueba el progreso de la cuenta antes de gastar y bloquea nuevas ejecuciones tras consumirlo, incluso si falla la lotería.
- Muestra Upload Models sobre 5 y la fecha de entrega debajo de Entregado. La limpieza usa esa fecha, conserva las entregas antiguas y funciona aunque la subida programada esté desactivada.
- Guarda la opción Limpiar diseños al marcarla, sin exigir modelos nuevos. Mantiene la comprobación de publicación y las protecciones de archivos antes de eliminar.
- Mantiene el puerto 8088 y la compatibilidad con Creality Cloud Dev 1.0.6-dev.1. Versión probada y validada por el usuario en Home Assistant, publicada como Latest.

## 1.0.47 — selector de archivos de las portadas

- Versión estable recomendada tras confirmar el usuario la subida real de diseños en Home Assistant.
- Corrige el timeout de filechooser al subir diseños: pulsa el recuadro interior de imagen de portada, en lugar de la columna que contiene el título y espacio vacío.
- Aplica la corrección a la portada web 4:3 y a la portada App 3:4. Mantiene la confirmación del recorte y las comprobaciones antes de entregar.
- Añade una prueba que reproduce el fallo con la estructura actual de Creality y comprueba los selectores de ambas portadas.

## 1.0.46 — pedidos y boosts de TitoTB 1.0.35

- Integra las mejoras de TitoTB 1.0.34 y 1.0.35.
- Añade Actualizar pedidos para consultar sin esperar 24 horas, con indicador de carga y conservación de los pedidos conocidos si falla la consulta.
- Permite varios boosts manuales el mismo día mientras queden boletos; adapta el control de progreso de Dev y conserva el límite automático diario.
- Comprueba el límite automático antes de abrir Chromium, revisa hasta tres candidatos por intento y los rota tras fallos.
- Mejora el diagnóstico de boosts con los modelos revisados y los motivos de rechazo.
- Conserva MakeNow con reintento manual, las funciones propias de Dev, el puerto 8088 y /media con escritura.

## 1.0.45 — MakeNow e integración de TitoTB 1.0.33

- Permite reintentar MakeNow manualmente el mismo día cuando una consulta nueva confirma 0/1. Mantiene el bloqueo de duplicados automáticos y el historial por perfil CC.
- Distingue en el registro la apertura del editor, la recompensa pendiente y la recompensa confirmada. El identificador del editor no acredita el punto.
- Integra todos los cambios de TitoTB desde 1.0.29 hasta 1.0.33 (etiqueta v1.0.33): indicador LED de sesión, comprobación antes de cada tarea, recuperación de sesión y aviso de cupones disponibles.
- Añade Inicio de sesión automático, desactivado por defecto, con los datos recordados por el navegador y un intervalo de 30 minutos entre intentos automáticos fallidos. Si se requiere intervención, mantiene las tareas pausadas.
- Unifica Puntos obtenidos hoy en Home Assistant con el indicador de CC Tools: suma solo movimientos positivos del día, sin restar gastos.
- Conserva las funciones propias de Dev, sus dos perfiles favoritos predeterminados, el puerto 8088 y /media con escritura.

## 1.0.44 — integración de TitoTB 1.0.29

- Añade un indicador de sesión verde o rojo junto al avatar según el último estado conocido de Creality Cloud.
- Reconoce la redirección al centro de cuentas como sesión cerrada y evita que un diagnóstico secundario de descarga oculte la pérdida de sesión.
- Guarda el estado de sesión, la fecha de comprobación y el motivo; los expone en la API de Home Assistant.
- Actualiza el indicador al confirmar el acceso y al refrescar el perfil o los contadores.
- Conserva las funciones de Dev 1.0.43, sus dos perfiles favoritos predeterminados, el puerto 8088 y /media con escritura.

## 1.0.43 — integración de TitoTB 1.0.28

- Integra TitoTB 1.0.28 y su corrección de instalación de Chromium en las pruebas, conservando las funciones de Dev 1.0.42.
- Detecta sesiones caducadas, pausa las automatizaciones y confirma el nuevo inicio de sesión antes de reanudarlas.
- Añade paginación y descarga de Logs, clasificación de la última ejecución y más diagnóstico del navegador y las impresoras.
- Valida que los nuevos favoritos tengan diseños publicados y conserva ambos perfiles predeterminados y sus avatares actualizados.
- Mejora la selección de región en los canjes y conserva la confirmación por número de pedido, las pausas ante resultados inciertos y la coordinación de tareas de Dev.
- Mantiene Subir diseños, MakeNow, colecciones, contadores, Telegram con Perfil CC, el puerto 8088 y /media con escritura.

## 1.0.42 — integración de TitoTB 1.0.27

- Integra los cambios de main de TitoTB 1.0.27 conservando las funciones de Dev 1.0.41.
- Expone a Home Assistant la planificación pendiente con identificadores y revisión estables.
- Añade el origen, inicio, límite de tiempo y estado de bloqueo de la ejecución activa a la API.
- Proporciona los datos necesarios para el reinicio automático gestionado por la integración de Home Assistant; no añade un reinicio automático independiente dentro del complemento.
- Mantiene la biblioteca, subida manual y programada de diseños, imágenes opcionales, recompensas y limpieza verificada.

## 1.0.41 — imágenes opcionales y publicación en Dev

- Admite portada2 para la App en 3:4 y hasta nueve imágenes del modelo, imagen1 a imagen9, en 4:3. Acepta JPG, JPEG, PNG y WebP, con validación de nombres, duplicados, tamaño y proporción al escanear o importar desde el PC.
- Después de confirmar la portada web, sube y confirma la portada App si existe, y carga las imágenes del modelo por orden. Comprueba su presencia en la entrega final.
- Incluye los archivos opcionales en la detección de cambios y en la limpieza posterior a la confirmación pública.
- Actualiza los requisitos y el ejemplo de info.txt. Mantiene Impresoras 3D / Otro; otras categorías quedan para futuras versiones.
- El ZIP excluye todos los TXT de PRUEBA y los LEEME anteriores. LEEME-1.0.41 resume las novedades acumuladas desde 1.0.35: biblioteca en /media, importación, publicación manual y programada, recompensas, Logs, Telegram y limpieza opcional.

## 1.0.40 — confirmación de derechos de autor y descripción

- Abre la declaración de derechos de autor, pulsa Confirmar en su popup y verifica que la casilla queda marcada antes de Entregar, tanto en manual como en programación.
- Distingue este popup del recorte de portada y bloquea la entrega si la confirmación no queda aceptada.
- Excluye de la descripción el apartado final «Recomendaciones de impresión:» y su contenido. Conserva intacto el archivo info.txt y actualiza el ejemplo incluido en el ZIP.
- Añade pruebas para el popup abierto, la aceptación ya realizada, una confirmación fallida y la preparación de la descripción sin recomendaciones.

## 1.0.39 — selector de categoría sin desplazamiento

- Pasa el ratón sobre la fila completa de Impresoras 3D y pulsa Otro en la segunda columna, sin hacer clic en la categoría principal.
- Elimina el desplazamiento explícito, el hover sobre el texto y la reapertura del desplegable durante su cierre. Evita seleccionar la categoría principal por accidente.
- La prueba del formulario reproduce la etiqueta superpuesta y el cierre con transición que causaba el nuevo timeout.
- Mantiene vacíos los archivos de instrucciones y la descripción del ajuste de impresión. Conserva los cambios de tarjeta y formulario de 1.0.38.

## 1.0.38 — corrección de la subida de diseños

- Abre Impresoras 3D pulsando la fila del selector y selecciona Otros con desplazamiento. Evita el bloqueo del texto cubierto por la etiqueta de selección.
- Marca Sí en adaptaciones y No en uso comercial; marca No en la tercera pregunta cuando esté visible. Comprueba la licencia CC BY-NC antes de entregar.
- Desactiva la recomendación de filamento y comprueba la aceptación de la declaración de derechos antes del envío.
- Muestra última y próxima ejecución sin segundos, colorea los fallos manuales en rojo y utiliza la cantidad programada en el contador (por ejemplo, 0/1).
- Actualiza la tarjeta también cuando el ejecutor devuelve un error HTTP. Simplifica el inicio de los requisitos a «Prepara un archivo…».

## 1.0.37 — publicación de diseños e importación desde el PC

- Mueve Subir diseños al final. La tarjeta muestra última y próxima ejecución. Su configuración sigue el formato de impresiones, con requisitos, Mis diseños y programación.
- Escanea al abrir y permite importar un 3MF, info.txt y portada JPG, PNG o WebP. El botón de carpeta crea /media/cctools_3d_models; el complemento monta /media con escritura.
- Publica manualmente o en lotes diarios de hasta cinco diseños, con categoría Impresoras 3D / Otro, Original, Gratis, Público y licencia CC BY-NC. Completa la declaración de derechos y Entregar.
- Registra entregas, errores y avisos de biblioteca agotada en Logs y Telegram. Conserva por cuenta las entregas y los resultados inciertos para evitar duplicados.
- Añade Upload Models al recuento de recompensas existente. Las entregas esperan aprobación y no se cuentan como puntos acreditados.
- Añade la limpieza opcional, desmarcada por defecto. A partir del día siguiente comprueba el ID y la presencia en el perfil público antes de eliminar los tres archivos y su carpeta. Conserva contenido adicional o modificado.
- Las programaciones de preparación de 1.0.36 permanecen desactivadas hasta pulsar Programar en esta versión.

## 1.0.36 — biblioteca local de Subir diseño

- Añade el módulo Subir diseño con interruptor, rueda de configuración y pestañas Manual y Programación.
- Monta /media en solo lectura. Escanea /media/cctools_3d_models y valida un 3MF, una portada 4:3 y un info.txt por carpeta.
- Detecta duplicados por contenido y cambios de archivos antes de guardar. Conserva selecciones y configuración tras reiniciar.
- Permite preparar entre 1 y 5 diseños diarios y simular el escaneo del siguiente día, incluidos lotes incompletos y biblioteca agotada.
- Esta prueba local no publica diseños, no envía avisos ni añade tareas al planificador. Mantiene el resto de funciones de Dev 1.0.35.


## 1.0.35 — canje automático y perfiles favoritos

- Los perfiles favoritos con el estado vacío de Creality confirmado muestran «Sin diseños». Conservan ese estado al reiniciar y se comprueban cada seis horas, sin forzar un indexado cada cinco minutos por tener cero diseños.
- Las páginas incompletas o los errores de carga conservan el índice anterior. Al publicar un nuevo diseño, el perfil vuelve a «Actualizado» en la siguiente revisión o al pulsar Actualizar.
- Abre el objetivo por su identificador y completa la confirmación final de cupones y productos con dirección guardada.
- Verifica la respuesta de canje y exige un número de pedido; un texto de éxito o un cambio de saldo no bastan para confirmar el resultado.
- Pausa el objetivo antes de iniciar el intento para evitar duplicados después de reinicios, errores o respuestas inciertas. Los errores requieren revisar los pedidos y volver a pulsar Programar.
- Comprueba región, cantidad y precio; aplica el precio de primer canje solo con la promoción activa y reconoce los estados de falta de existencias y límites de la tienda.
- Incluye todos los cambios acumulados desde Dev 1.0.32, con la planificación de impresiones de 1.0.34 y la renovación de avatares de favoritos.

## 1.0.34

- La tarjeta de impresión muestra el objetivo diario configurado: con dos impresiones recompensadas y un objetivo de tres, muestra 2/3 y programa una pendiente.
- Los inicios manuales no avanzan el cursor automático; el progreso diario se basa en impresiones recompensadas. Al guardar, se actualiza la próxima ejecución.
- Conserva la corrección de las fotos de perfiles favoritos y el límite diario de Creality Cloud.
- Incrementa la versión para que Home Assistant detecte la actualización local.

## 1.0.33 — avatares y asociación del historial de impresión

- Actualiza la foto pública al sincronizar cada favorito, incluidos los perfiles predeterminados. Conserva la última foto válida si falla su lectura.
- Asocia el historial a la impresora correspondiente y separa los inicios manuales de las ejecuciones de la agenda automática.
- El comportamiento definitivo del objetivo diario es el descrito en 1.0.34.

## 1.0.32 — integración de TitoTB 1.0.26

- Limita los comentarios a diseños cuya descarga esté verificada y que no sean meramente indexados desde favoritos o el catálogo.
- Omite la tarea sin abrir el navegador ni publicar comentarios si no quedan descargas válidas pendientes.
- Conserva los contadores sincronizados de Dev y todas las funciones de 1.0.31, incluido el aviso de primer uso de MakeNow y MiCasaDomotica fijado en favoritos.

## 1.0.31

- Gestiona el aviso de primer uso AI Feature Notice de MakeNow, tanto en la página como en su iframe, antes de consultar los cupos o crear un proyecto.
- Registra en Logs la detección y aceptación del aviso. Si no se puede cerrar, muestra un diagnóstico específico sin confundirlo con falta de espacio.
- Añade MiCasaDomotica (8028760638) a los perfiles favoritos predeterminados, fijado después de Aguacatec y protegido frente al borrado.
- Al actualizar conserva el índice previo de ese perfil y evita duplicados.

## 1.0.30 — integración de TitoTB 1.0.23, 1.0.24 y 1.0.25

- Aplica límites de tiempo a las consultas de boosts, pedidos y canjes, y recupera ejecuciones antiguas bloqueadas.
- Coordina la recuperación con la sincronización de contadores de Dev y conserva el control de cada ejecución al liberar sus recursos.
- Registra en Logs el código original, URL, HTTP, fallos consecutivos y próximo intento de los aplazamientos por indisponibilidad.
- Evita que esos registros técnicos consuman posiciones de la planificación diaria.
- Amplía la protección frente a pausas falsas por tareas correctas sin incidencias y mantiene la detección de excepciones vacías reales.
- Conserva MakeNow por cupos y por perfil, Telegram con Perfil CC, un impulso diario y el puerto 8088.

## 1.0.29 — integración de TitoTB 1.0.22

- Evita que las excepciones vacías oculten el error original de una descarga e incluye su fase y pila en el diagnóstico.
- Conserva y reprograma las descargas ante páginas incompletas o excepciones sin información, con los reintentos progresivos de Dev.
- Distingue una excepción vacía de un resultado correcto sin incidencias para no aplazar tareas ya completadas.
- Mantiene las funciones de Dev, los mensajes CC Tools Dev y Perfil CC, el límite de un impulso diario y el puerto 8088.

## 1.0.28 — integración de TitoTB 1.0.21

- Integra el tratamiento de timeouts de navegación y errores HTTP 502, 503 y 504 como indisponibilidades temporales de Creality Cloud.
- Conserva los turnos pendientes y aplica reintentos progresivos de 10, 20, 40 y hasta 60 minutos. Confirma la incidencia al segundo fallo y evita alertas repetidas por cada tarea.
- Envía un aviso al confirmar la incidencia y otro al recuperarse, también si la primera tarea recuperada es MakeNow. Los mensajes mantienen CC Tools Dev y Perfil CC.
- Adapta la integración para aceptar resultados sin incidencia y conservar el bloqueo de ejecución mientras se guarda el reintento.
- Conserva MakeNow por cupos, registro por perfil, un impulso diario en Model Boost y el puerto 8088.

## 1.0.27 — integración de TitoTB 1.0.20

- Integra los reintentos de la comprobación inicial de sesión de TitoTB 1.0.20 cuando Creality Cloud tarda en responder.
- Una comprobación de sesión sin respuesta no se interpreta como sesión caducada. En ejecuciones programadas conserva el turno y lo aplaza diez minutos, sin registrarlo ni notificarlo como descarga fallida.
- Incorpora el formulario de errores de TitoTB y lo adapta a Dev con los módulos Añadir a la colección y Crear un proyecto (MakeNow).
- Corrige la zona horaria del servidor de una prueba de API: usaba UTC en GitHub pese a preparar los datos en Europe/Madrid y podía fallar después de medianoche en Madrid.
- Conserva las funciones de Dev 1.0.26: puerto 8088, nombre CC Tools Dev, Perfil CC en Telegram, selección MakeNow por cupo y un impulso diario en Model Boost.

## 1.0.26 — restauración del límite diario de Model Boost

- Restaura el comportamiento de «Impulsa un diseño» anterior a la prueba 1.0.25: un impulso diario, contador original y bloqueo manual al completar el día o no disponer de boletos.
- La programación vuelve a aplazar el siguiente impulso al día siguiente una vez completado. Se retira el consumo de varios boletos por ejecución.
- Conserva el resto de cambios de 1.0.25: CC Tools Dev, Perfil CC en Telegram y selección de herramientas MakeNow por cupo, con su icono y registro por perfil.

## 1.0.25 — prueba local pendiente de validación en Home Assistant

- Icono triangular verde inspirado en MakeNow para «Crear un proyecto», distinto del marcador de «Añadir a la colección».
- Selección automática entre ocho herramientas MakeNow, priorizando las de menor ocupación y comprobando el cupo real antes de crear.
- Excluye AI Create Lab, Fanforge-Football y FlexiToys, además de cualquier herramienta sin acceso o cupo verificable.
- Registra por perfil CC el intento, herramienta, cupo, identificador del proyecto cuando esté disponible y resultado de la recompensa. No elimina proyectos ni repite un clic incierto.
- Muestra los cupos consultados en la configuración y avisa en Log y Telegram si no queda una herramienta utilizable.
- Renombra el módulo MakeNow a «Crear un proyecto» en la interfaz, Logs y planificación, y adapta la descripción a las herramientas disponibles.

- Incluye el nombre del perfil de Creality Cloud en todos los mensajes de Telegram; usa el ID si aún no se conoce el nombre.
- Añade 🎨 a las notificaciones de MakeNow completado y ❌ a las de error.
- Identifica la interfaz y todas las notificaciones de Telegram como CC Tools Dev, incluida la prueba de Telegram.
- Impulsos manuales y programados utilizan todos los boletos disponibles, sin bloquearse por haber obtenido la recompensa diaria.
- Consulta el saldo al ejecutar y después de cada impulso, respeta los permisos de Creality y registra los resultados parciales.
- Muestra los boletos restantes y la fecha de consulta, actualiza el saldo periódicamente y permite comprobarlo manualmente aunque el saldo guardado sea cero.

## 1.0.24 — integración de TitoTB 1.0.19

- Integra los cambios de TitoTB 1.0.19 sobre Dev 1.0.23.
- Los timeouts de tareas programadas se registran como reintentos aplazados, conservando el diagnóstico en Logs.
- Un timeout aplazado no consume una posición del plan diario de impresiones y mantiene sincronizados los perfiles de impresora.
- No envía alertas de Telegram ni penaliza el estado de la automatización por esos timeouts que se reprograman automáticamente; los errores manuales mantienen su tratamiento habitual.
- Conserva la corrección del contador MakeNow validada en 1.0.23, el check-in, Añadir a la colección y el puerto externo 8088.

## 1.0.23 — lectura de MakeNow con el HTML actual

- Evita esperar por encabezados opcionales que no existen en las tarjetas de Creality Cloud; la espera por cada tarjeta retenía el navegador y retrasaba la actualización de MakeNow.
- Lee el encabezado anidado real y su contador 0/1, sin confundirlo con el 1/1 de Collection Models.
- Comprueba primero si existen los elementos alternativos y limita la espera al leerlos.
- Añade pruebas de navegador con la estructura real de las diez tarjetas, incluyendo MakeNow ausente de la API o con una respuesta antigua.
- Conserva las correcciones de check-in, los cambios de TitoTB 1.0.18 y el puerto externo 8088.

## 1.0.22 — check-in, progreso MakeNow y base TitoTB 1.0.18

- Las tareas esperan a que termine una sincronización de recompensas en curso antes de utilizar el navegador.
- Mientras una tarea espera o se ejecuta, se aplazan los nuevos refrescos de puntos y contadores.
- La cancelación y el tiempo máximo también cubren la espera, sin ejecutar la tarea más tarde.
- Se conserva el puerto externo 8088.
- MakeNow utiliza el estado actual de la tarea: un 0/1 posterior corrige un 1/1 guardado y actualiza paneles, API y planificación.
- El historial de puntos de MakeNow no da por completado el uso de hoy, ya que la recompensa puede acreditarse después de su aprobación.
- Se prioriza el contador visible de Use MakeNow frente a respuestas antiguas de la API, conservando la protección para no repetir New Project el mismo día.
- Integra TitoTB 1.0.18: detección de impresoras con espera y reintento, corrección del consumo de posiciones del plan de impresiones y nueva plantilla de pedidos disponibles en Telegram.
- Incorpora el recordatorio en la lotería y las variantes Replenish/Replenishment Reminder y Got it, manteniendo la comprobación del check-in de Dev.

## 1.0.21 — Dev independiente y puerto 8088

- Puerto web externo 8088 por defecto para convivir con CC Tools de TitoTB en el 8080.
- Instalación local desde el ZIP de Releases en `/addons/cc_tools`, con instrucciones de actualización.
- Documentación para repartir los módulos entre ambas instalaciones y conservar los datos de Dev.
- Rama permanente `dev`, releases con etiquetas `dev-v*` y validación de cambios en Dev.
- Incluye MakeNow y la sincronización de contadores y planificación de las versiones locales anteriores.

## 1.0.20 — progreso diario sincronizado

- Los paneles y la API HA incluyen acciones realizadas fuera de CC Tools, sin duplicarlas.
- Consulta conjunta de recompensas, historial y estado del check-in al entrar, al refrescar puntos y cada cinco minutos.
- La planificación descuenta el progreso de la cuenta y conserva el objetivo configurado.
- Comentarios con y sin imagen separados; cupo de impresiones compartido por la cuenta.
- Persistencia del progreso observado, incluidos resultados omitidos; las lecturas fallidas no borran datos válidos.
- Las tareas completadas se omiten y los cambios de sincronización aparecen en Log.
- Se conserva MakeNow de la versión 1.0.19.

## 1.0.19 — prueba local MakeNow

- Nuevo módulo MakeNow: ejecución manual, franja diaria, contador y planificación.
- Abre Lampshade Generator y pulsa New Project sin generar ni finalizar el proyecto.
- Verifica Use MakeNow antes y después; evita repetir el clic el mismo día y registra pasos y diagnósticos en Log.
- Preferencias de notificación Telegram para éxito y error.

## 1.0.18

- Integra la versión 1.0.17 de TitoTB, incluida la comprobación de sesión, el límite de ocho minutos por tarea y la liberación del navegador al abrir el inicio de sesión.
- Mantiene el paso actual del asistente al guardar o probar Telegram, sin volver al inicio.
- Configura 30 descargas diarias y una ventana de 08:00 a 14:00 en instalaciones nuevas, conservando los ajustes existentes al actualizar.
- Mantiene activo el temporizador del límite de ejecución hasta que termine la tarea o se agote el plazo.
- Recupera Añadir a la colección de CC Tools Dev 1.0.13: ejecución manual, programación, columna y filtro de diseños, notificaciones y API de Home Assistant.
- Conserva la configuración de colecciones al actualizar y comprueba el punto de Collection Models antes de registrar éxito.
- Si aparece el Recordatorio de reposición durante el check-in, marca «No recordar de nuevo en este ciclo», pulsa «Hecho» y vuelve a intentarlo una vez si sigue pendiente.
- No registra éxito por cerrar el aviso: exige la recompensa o el estado Registrado y conserva una captura si no puede completar el proceso.

## 1.0.17

- Comprueba la sesión de Creality Cloud antes de iniciar cada automatización y avisa cuando haya caducado.
- Finaliza las tareas bloqueadas tras ocho minutos, libera Chromium y reprograma el mismo turno automáticamente.
- Permite que el botón de inicio de sesión cancele una automatización que esté reteniendo el navegador.
- Registra en el log del contenedor el inicio, el final y la duración de cada tarea.

## 1.0.16

- Amplía el diagnóstico de compatibilidad entre impresoras y archivos G-code.
- Distingue la ausencia de boletos boost del rechazo real de un diseño.
- Cambia a blanco los puntos requeridos del objetivo al superar el 50% de progreso.

## 1.0.15

- Detecta todas las impresoras combinando las dos respuestas del Banco de trabajo.
- Mantiene separadas varias impresoras del mismo modelo mediante sus identificadores únicos.

## 1.0.14

- Reconoce los cupones canjeados como disponibles y abre la tienda con el descuento precargado.
- Mantiene los pedidos disponibles activos hasta que alcancen un estado realmente finalizado.
- Actualiza las plantillas de Telegram con iconos específicos y mensajes más concisos.
- Sustituye la notificación de pedido enviado por la de cupón disponible.

## 1.0.13

- Añade el panel Mis impresoras con conectividad, estado, progreso y detalle de errores en tiempo real.
- Permite pausar, reanudar y detener impresiones, además de liberar procesos bloqueados cuando sea necesario.
- Incorpora el envío manual desde cada impresora inactiva utilizando la galería completa de G-code.
- Distingue correctamente entre impresoras inactivas, desconectadas, imprimiendo y finalizadas sin arrastrar datos antiguos.
- Evita confundir contenido externo incrustado con una verificación de seguridad de Creality Cloud.
- Elimina el bloque manual duplicado Realizar impresión.

## 1.0.12

- Corrige las conversiones de puntos Spotlight en el historial sin mezclar el encabezado y los filtros de Creality Cloud.
- Repara automáticamente los nombres defectuosos que ya estuvieran guardados en el historial.
- Retira la herramienta experimental Completa tu colección y su configuración asociada.

## 1.0.11

- Mantiene actualizada la disponibilidad de boletos boost y mejora sus reintentos.
- Refuerza la verificación de recompensas de comentarios y descargas.
- Tolera navegaciones lentas de Creality Cloud sin duplicar errores de descarga.
- Añade el enlace al histórico de pedidos y expone el último pedido a la integración de Home Assistant.

## 1.0.10

- Evita que Home Assistant reutilice respuestas antiguas del estado y de los registros.
- Actualiza los registros cada diez segundos mientras el apartado Logs está visible.

## 1.0.9

- Añade la API local utilizada por la integración Creality Cloud para Home Assistant.
- Expone puntos, recompensas, tareas, pedidos, impresoras, controles y eventos de CC Tools.
- Actualiza inmediatamente los registros al abrir Logs y cada diez segundos mientras el apartado está visible.

## 1.0.8

- Activa automáticamente cada herramienta al guardar su programación.
- Evita publicar comentarios duplicados comprobando previamente el historial real del usuario en Creality Cloud.

## 1.0.7

- Refuerza la primera conexión de noVNC con precarga y reintentos automáticos del visor.
- Sincroniza el perfil, el historial completo de puntos y el seguimiento de pedidos después del primer inicio de sesión en Creality Cloud.

## 1.0.6

- Elimina la contraseña y el inicio de sesión internos del panel de CC Tools.
- Corrige la verificación del check-in y utiliza todos los boletos de lotería recibidos sin registrar falsos fallos.
- Añade el seguimiento diario de pedidos de la tienda de regalos al historial de puntos.
- Permite archivar pedidos enviados y notificarlos por Telegram cuando pasan de pendiente a enviado.

## 1.0.5

- Recupera automáticamente el perfil y el avatar de Creality Cloud después del inicio de sesión del asistente.
- Permite reintentar la consulta del perfil cuando el primer intento no obtiene datos.

## 1.0.4

- Permite iniciar el complemento sin repetir `initial_password` cuando ya existen credenciales guardadas.
- Muestra en rojo el aviso que solicita configurar la contraseña inicial.
- Reconecta automáticamente el visor noVNC si el primer intento queda esperando conexión.

## 1.0.3

- Posponemos la indexación inicial de perfiles favoritos hasta completar el asistente.
- Actualiza automáticamente Aguacatec y los demás favoritos al finalizar la configuración inicial.

## 1.0.2

- Evita que la carga automática del perfil ocupe el navegador durante el asistente inicial.
- Cierra el navegador interactivo al avanzar tras iniciar sesión para guardar la sesión y liberar las automatizaciones.

## 1.0.1

- Sustituye el error técnico de opción obligatoria por una indicación clara para configurar la contraseña antes de iniciar CC Tools.

## 1.0.0

- Primera versión pública instalable desde un repositorio de Home Assistant.
- Compatibilidad con `amd64` y `aarch64`.
- Configuración inicial protegida mediante una contraseña obligatoria.
- Automatizaciones, historial, notificaciones y herramientas de Creality Cloud administradas desde la interfaz web de CC Tools.
