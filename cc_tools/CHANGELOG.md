# Changelog

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
