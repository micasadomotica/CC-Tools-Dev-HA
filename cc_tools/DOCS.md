# CC Tools Dev

CC Tools ejecuta automatizaciones de Creality Cloud desde Home Assistant.

## Configuración

Antes de iniciar el complemento puedes configurar:

- `timezone`: zona horaria utilizada para planificar las automatizaciones. El valor predeterminado es `Europe/Madrid`.

## Puerto web y convivencia

Dev utiliza el puerto externo **8088**: `http://IP_DE_HOME_ASSISTANT:8088`.
En **Configuración > Red** puedes revisar o cambiar el puerto. Si vienes de una
versión anterior que utilizaba 8080, cambia el puerto externo guardado a **8088**
y reinicia Dev. El puerto interno del contenedor sigue siendo 8080; Home Assistant
resuelve **Abrir interfaz web** con el puerto externo configurado.

Puedes mantener CC Tools de TitoTB instalado desde su repositorio en el puerto
8080 y CC Tools Dev como aplicación local en `/addons/cc_tools` en el puerto 8088.
Cada aplicación conserva sus propios datos y su sesión. Inicia sesión en ambas y
reparte los módulos: por ejemplo, MakeNow en Dev y las descargas en la principal.
Activa cada tarea en una sola instalación para evitar ejecuciones simultáneas
sobre la misma cuenta. Los límites de recompensa son comunes a la cuenta.

Likes y colecciones requieren Descubrir diseños en la misma instalación. Los
catálogos de diseños y la configuración no se comparten entre las dos aplicaciones.

## Instalar y actualizar Dev

Descarga `cc-tools-dev-X.Y.Z.zip` de los Assets de una
[release Dev](https://github.com/micasadomotica/CC-Tools-HA/releases),
descomprímelo y copia `cc_tools` dentro de `/addons`. El archivo de configuración
debe quedar en `/addons/cc_tools/config.yaml`. Busca actualizaciones en la tienda
e instala **CC Tools Dev** desde las aplicaciones locales.

Para actualizar, detén Dev, sustituye los archivos de la misma carpeta y pulsa
**Actualizar** en la instalación existente. Revisa el puerto 8088 antes de
iniciarla. Conserva la instalación y su carpeta para mantener los datos.

## Primer acceso

1. Guarda la configuración del complemento.
2. Inicia CC Tools.
3. Pulsa **Abrir interfaz web**.
4. Completa el asistente para iniciar sesión en Creality Cloud y, opcionalmente, configurar Telegram.

## Añadir a la colección

La herramienta guarda un diseño pendiente en Default Collections y verifica el punto diario de Collection Models. Si la recompensa ya está completada o el modelo ya está guardado, omite la acción. La programación requiere que Descubrir diseños esté activado.

El identificador del modelo se obtiene exclusivamente del bloque `__NUXT_DATA__` del HTML de su ficha. La sesión autenticada se obtiene por separado de las cabeceras de las peticiones de la API. Si el HTML no contiene un identificador válido, no se envía el guardado.

La API local expone esta herramienta como `collections` en `/api/integration/status` y en los eventos de `/api/integration/events`. Permite activar o desactivar su programación con `PATCH /api/integration/tasks/collections` (`{"enabled": true}` o `false`) y ejecutarla con `POST /api/integration/tasks/collections/run`. Al desactivar Descubrir diseños se desactiva también la programación de colecciones.

La creación de entidades y controles en Home Assistant depende de que la integración cliente admita esta tarea; este complemento proporciona su API.

## Recordatorio de reposición del check-in

Si Creality Cloud muestra «Recordatorio de reposición», CC Tools marca «No recordar de nuevo en este ciclo» y pulsa «Hecho». Después comprueba si el check-in sigue pendiente y lo reintenta una vez. Funciona tanto en la página principal como dentro del iframe y reconoce los textos en español e inglés.

La ejecución solo se considera correcta al detectar la recompensa o el estado «Registrado». Si falta la casilla, no se puede marcar, el aviso no se cierra o vuelve a aparecer, se registra el fallo con una captura. Este flujo no consume tarjetas de reposición.

Las pruebas del diálogo se ejecutan con `npm run test:checkin:browser`. Requieren Chromium instalado para Playwright (`npx playwright install chromium`); en Windows utilizan Chrome.

## Datos persistentes

La configuración, la sesión del navegador, el historial y las capturas se almacenan en `/data`. Home Assistant conserva estos datos durante las actualizaciones y los incluye en las copias de seguridad del complemento.

## Soporte

Puedes comunicar dudas, fallos y sugerencias en la [comunidad de Aguacatec en Telegram](https://t.me/aguacatec_es/13374).

## Aviso

CC Tools no es una aplicación oficial ni está afiliada con Creality o Creality Cloud. Utiliza la herramienta bajo tu responsabilidad y respeta siempre las normas establecidas por la plataforma.

## MakeNow (1.0.19, prueba local)

Activa MakeNow en Herramientas y configura su franja diaria. También puedes usar Ejecutar ahora. Utiliza la sesión de Creality Cloud existente y funciona sin activar Descubrir diseños.

El flujo consulta Use MakeNow, abre Lampshade Generator y pulsa New Project. Después verifica la recompensa y cierra el navegador. Nunca usa AI Create Lab ni genera, guarda o finaliza el proyecto.

Log muestra los pasos y si Creality Cloud confirmó la recompensa. Si ya estaba completada, no abre otro proyecto. Tras intentar el clic no se repite ese día, incluso si la confirmación tarda o se reinicia la app. Ejecutar ahora permite volver a consultar la recompensa sin repetir el clic. El día se determina según la zona horaria configurada. No se eliminan proyectos existentes.

Instalación local: sustituye la carpeta cc_tools de la app local por la de este ZIP y actualiza/reconstruye CC Tools Dev desde Home Assistant. Conserva el slug y los datos de la versión 1.0.18. Esta entrega no publica cambios en GitHub.
