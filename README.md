# CC Tools Dev para Home Assistant

CC Tools Dev es la edición de desarrollo de este fork de [CC Tools de TitoTB](https://github.com/TitoTB/CC-Tools-HA). Permite probar funciones y mantener cambios propios para automatizar tareas de Creality Cloud desde Home Assistant.

Se instala como aplicación local y utiliza el puerto **8088**. Puede convivir con la aplicación de TitoTB instalada desde su repositorio, que utiliza el puerto **8080** por defecto.

**Nueva versión: [CC Tools Dev 1.0.48](https://github.com/micasadomotica/CC-Tools-HA/releases/tag/dev-v1.0.48)**. Incluye las adaptaciones de TitoTB 1.0.36 y 1.0.37: máximo de 10 descargas y botones de boost. Corrige la selección y reprogramación de impresiones, limita el boost a uno diario y mejora la fecha de entrega y la limpieza de diseños. Publicada como **Pre-release** hasta confirmar estos cambios en Home Assistant.

[Descargar ZIP 1.0.48](https://github.com/micasadomotica/CC-Tools-HA/releases/download/dev-v1.0.48/cc-tools-dev-1.0.48.zip) · [Versión anterior validada: 1.0.47](https://github.com/micasadomotica/CC-Tools-HA/releases/tag/dev-v1.0.47)

Las novedades y correcciones de cada versión se describen en su release. Las publicaciones marcadas como **Pre-release** están pendientes de validación completa en Home Assistant.

## Instalación

Necesitas Home Assistant con Supervisor y acceso a la carpeta `addons`, por ejemplo mediante Samba o SSH.

1. Abre las [Releases de Dev](https://github.com/micasadomotica/CC-Tools-HA/releases) y selecciona la versión que quieras instalar.
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

Puedes activar los módulos **Añadir a la colección** y **Crear un proyecto (MakeNow) en Dev** y mantener **check-in o impresiones en la principal de TitoTB**. Elige en qué instalación ejecutar cada módulo y desactívalo en la otra. Evita programar la misma tarea en ambas para la misma cuenta; sus programadores no comparten un bloqueo y podrían actuar a la vez. Las recompensas y sus límites diarios pertenecen a la cuenta de Creality Cloud, no a cada instalación.

Al repartir módulos, ten en cuenta sus dependencias: **likes y colecciones requieren Descubrir diseños activado en la misma instalación**, y los diseños descargados por una aplicación no se transfieren automáticamente a la otra. La sincronización de recompensas de Dev actualiza sus contadores y pendientes; no copia la configuración ni el catálogo de la aplicación principal.

La convivencia descrita utiliza la principal instalada desde el repositorio de TitoTB y Dev como aplicación local. Si ya tienes otra aplicación local ocupando `/addons/cc_tools`, no la sobrescribas para crear una segunda instalación: esa carpeta identifica tu aplicación local existente.

## Usar Dev junto a Creality Cloud HA

Utiliza [**Creality Cloud Dev 1.0.6-dev.1**](https://github.com/micasadomotica/Creality-Cloud-Dev-HA/releases/tag/v1.0.6-dev.1) para CC Tools Dev. Esta versión está probada y validada en Home Assistant. Es una integración independiente con dominio `creality_cloud_dev`, compatible con tener instalada [Creality Cloud de TitoTB](https://github.com/TitoTB/Creality-Cloud-HA), cuyo dominio es `creality_cloud`. El mismo perfil de Creality puede aparecer en ambas sin que se sustituya la conexión del otro hub.

1. En HACS, añade `https://github.com/micasadomotica/Creality-Cloud-Dev-HA` como repositorio personalizado de tipo **Integración**.
2. Descarga [**1.0.6-dev.1**](https://github.com/micasadomotica/Creality-Cloud-Dev-HA/releases/tag/v1.0.6-dev.1). Requiere **Home Assistant 2026.8 o posterior**. Reinicia Home Assistant tras instalarla.
3. En **Ajustes > Dispositivos y servicios > Añadir integración**, selecciona **Creality Cloud Dev** e introduce `http://IP_DE_HOME_ASSISTANT:8088`, o el puerto configurado para Dev. Siempre pide la URL; no necesitas detener CC Tools original.
4. Comprueba el hub con el nombre del perfil y el sufijo **Dev**. Para cambiar su dirección, utiliza **Reconfigurar**. Añadir la misma cuenta otra vez no cambia silenciosamente su URL.
5. Si activas **Reinicio automático**, comprueba que los atributos `restart_app` y `restart_app_name` correspondan a Dev, normalmente `local_cc_tools` / CC Tools Dev. Se verifica el destino con Supervisor por dirección y puerto; si es ambiguo o remoto, no se reinicia ninguna aplicación.

Mantén la integración de TitoTB conectada a CC Tools original y Creality Cloud Dev conectada a Dev. Las tareas programadas deben repartirse entre ambas aplicaciones para no duplicar acciones sobre la misma cuenta.

La integración incluye el sensor **Sesión**, los vínculos de las impresoras de TitoTB 1.0.5 y el reinicio por destino configurado. CC Tools Dev **1.0.47** es estable y proporciona los datos necesarios. La versión **1.0.6-dev.1** corresponde a la integración HACS independiente Creality Cloud Dev y está publicada como **Latest**.

## Añadir a la colección (Collection Models)

Guarda un diseño pendiente en **Default Collections** de tu cuenta y comprueba la recompensa diaria **Collection Models**. Requiere una sesión de Creality Cloud iniciada y **Descubrir diseños** activado en la misma instalación para su programación. Omite los diseños propios, los que ya están guardados y la acción si la recompensa diaria ya está completada.

El guardado en colecciones fallaba desde los navegadores de PC y solo funcionaba desde la app móvil de Creality Cloud. Dev incorpora una vía de guardado directa para resolver ese problema. Dev obtiene el identificador del modelo de los datos de su ficha y envía el guardado directamente a la API de Creality Cloud con la sesión autenticada. Después recarga la ficha y consulta la recompensa. El punto solo se cuenta cuando Creality Cloud lo confirma; si el resultado es incierto, no vuelve a enviar el mismo modelo automáticamente.

## Crear un proyecto (MakeNow)

El módulo consulta primero la recompensa diaria. Si está pendiente, revisa los cupos de Lampshade Generator, FrameStudio, ClickerMaker, FlexiWeave, CubeMe, SnapForm, MagicRelief y SignForge. Cada herramienta admite 30 proyectos. Elige la que tenga menos proyectos y espacio disponible, y pulsa **New Project** sin generar ni finalizar el proyecto. Quedan excluidos AI Create Lab, Fanforge-Football y FlexiToys.

En la configuración del módulo puedes consultar los últimos cupos leídos. Dev registra cada intento por perfil CC y guarda el identificador del proyecto cuando la web lo muestra. Si hay un corte después del clic, no repite automáticamente la creación ese día. Ejecutar ahora consulta de nuevo la recompensa y permite un reintento manual si confirma 0/1; con 1/1 no abre otro proyecto. Cada reintento puede consumir otro espacio y conserva el proyecto anterior. El identificador del editor no confirma la aprobación de la recompensa. El contador diario solo se completa cuando Creality Cloud confirma la recompensa.

Dev no elimina proyectos. Si todos los cupos están llenos, lo registra en el Log y avisa por Telegram si tienes activadas las notificaciones de error del módulo. Libera espacio manualmente en alguna herramienta y vuelve a ejecutar el módulo. Los proyectos que ya existían se incluyen en el cupo, pero no se atribuyen a Dev.

## Subir diseños (Upload Models)

Publica diseños desde una biblioteca local de Home Assistant, de forma manual o con una programación de **1 a 5 diseños diarios**. Requiere una sesión de Creality Cloud iniciada y el perfil de la cuenta actualizado en Dev.

En la configuración del módulo, abre **Mis diseños** y pulsa el botón de carpeta para importar desde el PC los archivos de un diseño. Dev crea la biblioteca en `/media/cctools_3d_models`. También puedes copiar allí una subcarpeta por diseño y pulsar **Escanear carpeta**.

Prepara estos archivos para cada diseño:

| Archivo | Requisitos |
|---|---|
| Un `.3mf` | Con configuración de Creality Print o Bambu Studio; máximo 256 MB. Su nombre, sin extensión, se usa como título. |
| Una portada web | JPG, JPEG, PNG o WebP estática, proporción **4:3**; máximo 20 MB. Por ejemplo, `portada.jpg`. |
| `info.txt` | Texto UTF-8 con etiquetas y descripción; máximo 32 KB. Hasta 20 etiquetas de 30 caracteres cada una. |
| Imágenes opcionales | `portada2` para la app en **3:4** e `imagen1` a `imagen9` en **4:3**, con cualquiera de las extensiones de imagen anteriores; máximo 20 MB por archivo. |

Ejemplo de `info.txt`:

```text
ETIQUETAS: caja, organizador
DESCRIPCION: Caja organizadora con compartimentos para piezas pequeñas.
```

Dev valida los archivos y detecta duplicados por su contenido. Selecciona los diseños y pulsa **Subir seleccionados**, o configura la cantidad diaria, la franja horaria y los diseños de la primera ejecución y pulsa **Programar**.

La subida automatiza el formulario web de Creality Cloud: carga los archivos, completa las etiquetas y la descripción y entrega el diseño como **Original, Gratis y Público**, en **Impresoras 3D / Otro**, con licencia **CC BY-NC**. Al subir o programar autorizas que acepte la declaración de derechos de autor para esos diseños.

La tarjeta muestra la recompensa **Upload Models** sobre **5**, aunque hayas programado menos diseños. En **Mis diseños**, debajo de **Entregado** aparece la fecha original de entrega, que no cambia al volver a escanear.

La entrega queda registrada por cuenta para evitar duplicados. Si el resultado es incierto, revisa el **Banco de trabajo** de Creality antes de repetirla. Entregar un diseño no confirma la recompensa **Upload Models**: queda pendiente de aprobación. La limpieza local es opcional y está desactivada por defecto. **Limpiar diseños** se guarda al marcar la casilla y funciona también con las subidas desactivadas, sin tener que seleccionar diseños ni pulsar Programar. Desde el día siguiente a la entrega comprueba que el diseño esté publicado en el perfil antes de eliminar sus archivos. Conserva los archivos adicionales, modificados o sin confirmación pública.

## Organización del fork

- **`dev`** es la rama predeterminada del repositorio y contiene la edición Dev completa, incluidas funciones propias que no se enviarán al proyecto original.
- **`feat/nombre-del-cambio`** contiene únicamente los cambios de una aportación concreta.
- Las releases Dev usan etiquetas **`dev-vX.Y.Z`** y adjuntan el ZIP de instalación. Los ZIP no se guardan dentro del código.

La rama `main` de este fork se ha retirado; su historial permanece incluido en `dev`. Para revisar cambios de TitoTB o preparar una aportación, se utiliza la rama `main` de su repositorio original (`upstream/main`) y se trasladan solo los cambios necesarios a una rama específica. Se conserva la atribución y la licencia del proyecto original.

## Soporte

Comunica los problemas específicos de Dev en los [Issues de este fork](https://github.com/micasadomotica/CC-Tools-HA/issues), indicando la versión y los pasos para reproducirlos. Para la edición principal, consulta el [repositorio de TitoTB](https://github.com/TitoTB/CC-Tools-HA).

## Aviso y licencia

CC Tools no es una aplicación oficial ni está afiliada con Creality o Creality Cloud. Respeta las normas de la plataforma.

Este fork parte del trabajo de TitoTB y la comunidad de Aguacatec. Se distribuye bajo la [licencia MIT](LICENSE).
