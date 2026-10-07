# Changelog

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
