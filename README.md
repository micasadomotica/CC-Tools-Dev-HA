# CC Tools Dev para Home Assistant

CC Tools Dev es la edición de desarrollo de este fork de [CC Tools de TitoTB](https://github.com/TitoTB/CC-Tools-HA). Permite probar funciones y mantener cambios propios para automatizar tareas de Creality Cloud desde Home Assistant.

Se instala como aplicación local y utiliza el puerto **8088**. Puede convivir con la aplicación de TitoTB instalada desde su repositorio, que utiliza el puerto **8080** por defecto.

[Descargar CC Tools Dev](https://github.com/micasadomotica/CC-Tools-HA/releases?q=dev-v&expanded=true) · [Código de Dev](https://github.com/micasadomotica/CC-Tools-HA/tree/dev)

Las novedades y correcciones de cada versión se describen en su release. Las publicaciones marcadas como **Pre-release** están pendientes de validación completa en Home Assistant.

## Instalación

Necesitas Home Assistant con Supervisor y acceso a la carpeta `addons`, por ejemplo mediante Samba o SSH.

1. Abre las [Releases de Dev](https://github.com/micasadomotica/CC-Tools-HA/releases?q=dev-v&expanded=true) y selecciona la versión que quieras instalar.
2. En **Assets**, descarga el archivo adjunto **`cc-tools-dev-X.Y.Z.zip`**. El archivo **Source code (zip)** es la descarga automática del repositorio y no es el paquete preparado para esta instalación.
3. Descomprime el ZIP. Dentro encontrarás la carpeta **`cc_tools`**.
4. Copia esa carpeta dentro de **`/addons`** de Home Assistant. Si usas Samba, corresponde al recurso compartido **`addons`**. La estructura debe quedar así:

   ```text
   /addons/
   └── cc_tools/
       ├── config.yaml
       ├── Dockerfile
       ├── run.sh
       └── ...
   ```

   Comprueba que el archivo quede en `/addons/cc_tools/config.yaml`, sin carpetas intermedias adicionales.
5. En Home Assistant, entra en **Ajustes > Aplicaciones > Tienda de aplicaciones**. En algunas versiones este apartado se llama **Complementos**.
6. Abre el menú de los tres puntos y pulsa **Buscar actualizaciones**. Recarga la página si hace falta.
7. Busca **CC Tools Dev** en **Aplicaciones locales** y pulsa **Instalar**. La aplicación se compila en tu equipo.
8. Revisa la zona horaria y comprueba en **Configuración > Red** que el puerto externo sea **8088**.
9. Inicia la aplicación y pulsa **Abrir interfaz web**, o entra en `http://IP_DE_HOME_ASSISTANT:8088`.
10. Completa el asistente e inicia sesión en Creality Cloud.

Este método instala Dev desde el ZIP; no requiere añadir este fork a la lista de repositorios de la tienda. La carpeta `addons` está separada de `/config`.

## Actualización

1. Descarga y descomprime el ZIP de la nueva release.
2. Detén **CC Tools Dev** y sustituye los archivos de `/addons/cc_tools` por los de la carpeta `cc_tools` del nuevo ZIP.
3. Busca actualizaciones en la tienda y pulsa **Actualizar** en la instalación existente de CC Tools Dev.
4. Revisa el puerto externo en **Configuración > Red**. Si tu instalación anterior tenía guardado **8080**, cámbialo a **8088** y guarda: una actualización puede conservar el puerto que ya tenías configurado.
5. Inicia Dev y recarga su interfaz web.

Mantén la carpeta `cc_tools` y la instalación existente para conservar la configuración, la sesión y el historial en sus datos persistentes. No es necesario desinstalar Dev. Si tienes accesos o una integración apuntando al puerto anterior de Dev, actualiza su dirección a `http://IP_DE_HOME_ASSISTANT:8088`.

## Usar Dev junto a CC Tools de TitoTB

| Instalación | Origen | Dirección predeterminada |
|---|---|---|
| CC Tools | Repositorio de TitoTB en la tienda | `http://IP_DE_HOME_ASSISTANT:8080` |
| CC Tools Dev | ZIP de Releases en `/addons/cc_tools` | `http://IP_DE_HOME_ASSISTANT:8088` |

Ambas pueden estar instaladas y ejecutándose a la vez. Cada una mantiene su propia configuración, sesión de Creality Cloud, diseños, programación y Log. Inicia sesión por separado en cada aplicación.

Puedes activar los módulos **Añadir a la colección** y **MakeNow en Dev** y mantener **check-in o impresiones en la principal de TitoTB**. Elige en qué instalación ejecutar cada módulo y desactívalo en la otra. Evita programar la misma tarea en ambas para la misma cuenta; sus programadores no comparten un bloqueo y podrían actuar a la vez. Las recompensas y sus límites diarios pertenecen a la cuenta de Creality Cloud, no a cada instalación.

Al repartir módulos, ten en cuenta sus dependencias: **likes y colecciones requieren Descubrir diseños activado en la misma instalación**, y los diseños descargados por una aplicación no se transfieren automáticamente a la otra. La sincronización de recompensas de Dev actualiza sus contadores y pendientes; no copia la configuración ni el catálogo de la aplicación principal.

La convivencia descrita utiliza la principal instalada desde el repositorio de TitoTB y Dev como aplicación local. Si ya tienes otra aplicación local ocupando `/addons/cc_tools`, no la sobrescribas para crear una segunda instalación: esa carpeta identifica tu aplicación local existente.

## Organización del fork

- **`main`** sigue la rama principal de TitoTB y sirve como base para preparar aportaciones.
- **`dev`** contiene la edición Dev completa, incluidas funciones propias que no se enviarán al proyecto original.
- **`feat/nombre-del-cambio`** contiene únicamente los cambios de una aportación concreta.
- Las releases Dev usan etiquetas **`dev-vX.Y.Z`** y adjuntan el ZIP de instalación. Los ZIP no se guardan dentro del código.

Para proponer una función al proyecto original se crea una rama desde `main` y se trasladan solo los cambios necesarios. Se conserva la atribución y la licencia del proyecto original.

## Soporte

Comunica los problemas específicos de Dev en los [Issues de este fork](https://github.com/micasadomotica/CC-Tools-HA/issues), indicando la versión y los pasos para reproducirlos. Para la edición principal, consulta el [repositorio de TitoTB](https://github.com/TitoTB/CC-Tools-HA).

## Aviso y licencia

CC Tools no es una aplicación oficial ni está afiliada con Creality o Creality Cloud. Respeta las normas de la plataforma.

Este fork parte del trabajo de TitoTB y la comunidad de Aguacatec. Se distribuye bajo la [licencia MIT](LICENSE).
