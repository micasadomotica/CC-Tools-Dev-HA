# CC Tools Dev para Home Assistant

Versión **1.0.18**, basada en CC Tools 1.0.17 de TitoTB. Conserva «Añadir a la colección» y la recuperación del check-in ante el recordatorio de reposición. Incorpora la comprobación de sesión, el límite de ocho minutos por tarea y la liberación del navegador para iniciar sesión.

Corrige el reinicio del asistente al probar Telegram. Las instalaciones nuevas empiezan con 30 descargas diarias en una ventana de 08:00 a 14:00; las actualizaciones conservan los ajustes guardados.

Este fork se compila localmente en Home Assistant. Para actualizar la instalación local Dev, sustituye la carpeta `/addons/cc_tools` por la carpeta `cc_tools` del ZIP, recarga la tienda de aplicaciones y pulsa **Actualizar** en CC Tools Dev. Mantén la instalación existente para conservar su configuración y sesión en `/data`.

La implementación propuesta al proyecto original está en la [PR #1](https://github.com/TitoTB/CC-Tools-HA/pull/1).

CC Tools es una herramienta diseñada, en conjunto con [esta integración](https://github.com/TitoTB/Creality-Cloud-HA), para interactuar con Creality Cloud desde Home Assistant, permitiendo:

- Realizar o programar tareas que te otorgan puntos.
- Crear una programación de impresiones para tu granja de impresión 3D.
- Apoyar a tus diseñadores favoritos con comentarios, likes e impulsos.
- Acceder fácilmente a los apartados más importantes de Creality Cloud.
- Hacer un seguimiento de los diseños con los que interactúas.
- Hacer un seguimiento de los puntos que has conseguido.
- Programar el intercambio de puntos por premios, y hacer un seguimiento del pedido.
- Programar notificaciones de Telegram que te avisen de los eventos importantes.
- Exponer ciertas entidades en Home Assistant, para usarlas en tus notificaciones, paneles y automatizaciones.

## Instalación

1. Abre Home Assistant y entra en **Configuración > Aplicaciones > Tienda de aplicaciones**.
2. Abre el menú de los tres puntos de la esquina superior derecha y selecciona **Repositorios**.
3. Añade esta URL:

   ```text
   https://github.com/micasadomotica/CC-Tools-HA
   ```

4. Cierra el diálogo de repositorios y busca **CC Tools Dev** en la tienda.
5. Abre su ficha y pulsa **Instalar**. La primera compilación puede tardar varios minutos.
6. En la pestaña **Configuración**, revisa la zona horaria.
7. Inicia el complemento y pulsa **Abrir interfaz web**.
8. Completa el asistente inicial.

## Soporte

Para resolver dudas, comunicar fallos o proponer mejoras, visita la [comunidad de Aguacatec en Telegram](https://t.me/aguacatec_es/13374).

## Disclaimer

**CC Tools no es una aplicación oficial** y no está de ninguna manera afiliada con Creality o Creality Cloud. Se trata de una iniciativa desarrollada por la [comunidad de Aguacatec](https://t.me/aguacatec_es/13374), con el objetivo de mejorar la experiencia de la impresión 3D e integrarla en nuestro sistema domótico de automatización.

El objetivo no es, en ningún caso, violar o evadir las reglas de Creality Cloud. **Utiliza la herramienta bajo tu responsabilidad**, cumpliendo siempre las normas establecidas por la plataforma.

Si quieres reportar algún fallo o hacer alguna sugerencia, puedes unirte a [nuestra comunidad de Telegram](https://t.me/aguacatec_es/13374).

## Licencia

Este proyecto se distribuye bajo la [licencia MIT](LICENSE).
