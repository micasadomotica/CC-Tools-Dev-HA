# CC Tools Dev

CC Tools ejecuta automatizaciones de Creality Cloud desde Home Assistant.

## Configuración

Antes de iniciar la app puedes configurar:

- `timezone`: zona horaria utilizada para planificar las automatizaciones. El valor predeterminado es `Europe/Madrid`.

## Puerto web y convivencia

Dev utiliza el puerto externo **8088**: `http://IP_DE_HOME_ASSISTANT:8088`.
En **Configuración > Red** puedes revisar o cambiar el puerto. Si vienes de una
versión anterior que utilizaba 8080, cambia el puerto externo guardado a **8088**
y reinicia Dev. El puerto interno del contenedor sigue siendo 8080; Home Assistant
resuelve **Abrir interfaz web** con el puerto externo configurado.

Puedes mantener CC Tools de TitoTB instalado desde su repositorio en el puerto
8080 y CC Tools Dev desde su propio repositorio en el puerto 8088.
Cada aplicación conserva sus propios datos y su sesión. Inicia sesión en ambas y
reparte los módulos: por ejemplo, MakeNow en Dev y las descargas en la principal.
Activa cada tarea en una sola instalación para evitar ejecuciones simultáneas
sobre la misma cuenta. Los límites de recompensa son comunes a la cuenta.

Likes y colecciones requieren Descubrir diseños en la misma instalación. Los
catálogos de diseños y la configuración no se comparten entre las dos aplicaciones.

## Instalar y actualizar Dev

Añade `https://github.com/micasadomotica/CC-Tools-Dev-HA` en los repositorios de la tienda de Apps e instala **CC Tools Dev**. La versión **1.0.52** añade migración opcional en Configuración > Opciones, 10 impresiones al día como valor inicial de nuevas programaciones y avisos de Telegram independientes para colecciones, proyectos y subidas. Actualizar desde 1.0.51 no activa ninguna migración. Desde 1.0.50 basta con actualizar la app; no hace falta volver a migrar. La app se construye en tu equipo y utiliza el puerto externo **8088**.

Para las siguientes versiones, utiliza **Actualizar** desde Home Assistant. Crea antes una copia de seguridad y espera a que terminen las tareas en curso. No necesitas descargar ZIP.

Si vienes de `/addons/cc_tools`, **puedes empezar de cero siguiendo el asistente** y configurar de nuevo tus favoritos y los módulos que utilices. Detén la app local y desactiva su arranque y reinicio automáticos antes de iniciar la nueva. **La migración es opcional:** sigue [MIGRACION.md](https://github.com/micasadomotica/CC-Tools-Dev-HA/blob/main/MIGRACION.md) únicamente si quieres conservar la configuración, sesión e historial locales.

**Diseños ya subidos:** `/media/cctools_3d_models` sigue disponible porque es una carpeta compartida, pero al empezar de cero no se conserva el registro de entregas de la app antigua. Antes de activar subidas manuales o programadas, mueve fuera de esa biblioteca las carpetas de los diseños ya entregados para evitar publicarlos otra vez. Consulta las instrucciones completas en el [README](https://github.com/micasadomotica/CC-Tools-Dev-HA#instalación-desde-la-tienda).

## Primer acceso

1. Guarda la configuración de la app.
2. Inicia CC Tools.
3. Pulsa **Abrir interfaz web**.
4. Completa el asistente para iniciar sesión en Creality Cloud y, opcionalmente, configurar Telegram.

## Añadir a la colección

La herramienta guarda un diseño pendiente en Default Collections y verifica el punto diario de Collection Models. Si la recompensa ya está completada o el modelo ya está guardado, omite la acción. La programación requiere que Descubrir diseños esté activado.

El identificador del modelo se obtiene exclusivamente del bloque `__NUXT_DATA__` del HTML de su ficha. La sesión autenticada se obtiene por separado de las cabeceras de las peticiones de la API. Si el HTML no contiene un identificador válido, no se envía el guardado.

La API local expone esta herramienta como `collections` en `/api/integration/status` y en los eventos de `/api/integration/events`. Permite activar o desactivar su programación con `PATCH /api/integration/tasks/collections` (`{"enabled": true}` o `false`) y ejecutarla con `POST /api/integration/tasks/collections/run`. Al desactivar Descubrir diseños se desactiva también la programación de colecciones.

La creación de entidades y controles en Home Assistant depende de que la integración cliente admita esta tarea; esta app proporciona su API.

## Recordatorio de reposición del check-in

Si Creality Cloud muestra «Recordatorio de reposición», CC Tools marca «No recordar de nuevo en este ciclo» y pulsa «Hecho». Después comprueba si el check-in sigue pendiente y lo reintenta una vez. Funciona tanto en la página principal como dentro del iframe y reconoce los textos en español e inglés.

La ejecución solo se considera correcta al detectar la recompensa o el estado «Registrado». Si falta la casilla, no se puede marcar, el aviso no se cierra o vuelve a aparecer, se registra el fallo con una captura. Este flujo no consume tarjetas de reposición.

Las pruebas del diálogo se ejecutan con `npm run test:checkin:browser`. Requieren Chromium instalado para Playwright (`npx playwright install chromium`); en Windows utilizan Chrome.

## Datos persistentes

La configuración, la sesión del navegador, el historial y las capturas se almacenan en `/data`. Home Assistant conserva estos datos durante las actualizaciones y los incluye en las copias de seguridad de la app.

## Soporte

Comunica los problemas de esta edición en [Issues](https://github.com/micasadomotica/CC-Tools-Dev-HA/issues).

## Aviso

CC Tools no es una aplicación oficial ni está afiliada con Creality o Creality Cloud. Utiliza la herramienta bajo tu responsabilidad y respeta siempre las normas establecidas por la plataforma.

## MakeNow (Dev 1.0.45)

Activa MakeNow en Herramientas y configura su franja diaria. También puedes usar Ejecutar ahora. Utiliza la sesión de Creality Cloud existente y funciona sin activar Descubrir diseños.

El flujo consulta Use MakeNow, elige una herramienta permitida con espacio disponible y pulsa New Project. Después verifica la recompensa y cierra el navegador. Nunca usa AI Create Lab ni genera, guarda o finaliza el proyecto.

Log muestra los pasos y si Creality Cloud confirmó la recompensa. Si ya estaba completada, no abre otro proyecto. Tras intentar el clic no se repite automáticamente ese día, incluso si la confirmación tarda o se reinicia la app. Ejecutar ahora consulta de nuevo la recompensa y permite otro intento si confirma 0/1. El reintento puede consumir otro espacio y conserva el proyecto anterior. Si la lectura es incierta o la recompensa ya está en 1/1, no repite el clic. El identificador del editor no confirma la aprobación de la recompensa. El día se determina según la zona horaria configurada. No se eliminan proyectos existentes.

Instala y actualiza desde la tienda de Apps. Para pasar desde una instalación local, sigue la guía de migración enlazada arriba.

## Pedidos y boosts (Dev 1.0.48)

En el seguimiento de pedidos, Actualizar pedidos permite consultar el estado sin esperar al intervalo automático de 24 horas. El botón indica cuándo está consultando. Si falla la consulta, se conservan los pedidos conocidos. El botón de histórico abre los pedidos en Creality Cloud.

Se permite un solo boost al día, manual o programado, aunque queden más boletos. La tarjeta muestra 0/1 o 1/1 y los boletos se indican por separado. Si ya está completado, Ejecutar ahora queda bloqueado y Programar prepara el día siguiente. Antes de gastar se comprueba también el contador de Creality Cloud.

Se revisan primero los candidatos descargados sin boost, respetando el filtro de favoritos elegido. Al detectar «Impulsar de nuevo» se marca el diseño como impulsado en el listado. Si todos los candidatos elegibles ya lo tienen, se permite repetir en uno. Un botón ausente o una comprobación fallida no se interpreta como boost confirmado.


## Descargas, impresiones y entregas (Dev 1.0.48)

El máximo de descargas es 10 al día. Los ajustes antiguos de 30 se reducen a 10; se conservan los límites menores y se recortan los planes pendientes según el contador de la cuenta.

Una impresión sin recompensa conserva el G-code seleccionado. Al volver a programar se descuentan las impresiones recompensadas, sin consumir el objetivo con los intentos fallidos.

Subir diseños muestra las recompensas sobre 5. Mis diseños conserva la fecha de entrega debajo de Entregado. Limpiar diseños se guarda al marcarlo y funciona también con las subidas desactivadas: desde el día siguiente a la entrega, comprueba la publicación en el perfil antes de eliminar los archivos locales que no hayan cambiado.

## Categorías y capacidad de impresión (desde Dev 1.0.49, validada)

Subir diseños admite .3mf con configuración de Creality Print, Bambu Studio u Orca Slicer. Los selectores Categoría y Subcategoría se guardan al cambiar y se aplican a subidas manuales y programadas. El valor inicial es Impresoras 3D / Otro.

Puedes indicar una categoría propia en info.txt: `CATEGORIA: Hogar / Mascotas`. Separa siempre categoría y subcategoría con /. Si falta la línea o está vacía, se usa el selector; si contiene una combinación válida, tiene prioridad. Una combinación desconocida se marca para revisar. Las opciones disponibles aparecen en el módulo; la selección en Creality Cloud desplaza cada menú cuando hace falta.

Al guardar la programación de impresiones, el aviso distingue el objetivo pendiente de la capacidad del horario restante. Por ejemplo: «Quedan 9 impresiones para el objetivo; se programan 5 por el tiempo disponible». Los fallos anteriores no consumen el objetivo diario.
