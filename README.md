# CC Tools Dev para Home Assistant

CC Tools Dev automatiza tareas de Creality Cloud desde Home Assistant. Es una edición independiente basada en [CC Tools de TitoTB](https://github.com/TitoTB/CC-Tools-HA) y en el trabajo de la comunidad de Aguacatec.

**Versión 1.0.53**. Se conecta con **Creality Cloud Dev 1.0.7** y añade los datos necesarios para el dispositivo **Creality Cloud Models**: categoría, diseños disponibles, último modelo, última y próxima subida, contador diario e interruptor de programación. El historial de envíos se conserva aunque se limpien los archivos locales. Incluye migración opcional desde Configuración > Opciones, comprobada por el mantenedor en Home Assistant.

[![Añadir repositorio a Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fmicasadomotica%2FCC-Tools-Dev-HA)

[Novedades](cc_tools/CHANGELOG.md) · [Migrar desde CC Tools local o TitoTB](MIGRACION.md) · [Versiones publicadas](https://github.com/micasadomotica/CC-Tools-Dev-HA/releases)

## Instalación desde la tienda

Necesitas Home Assistant con Supervisor, conexión a Internet y un equipo **amd64** o **aarch64**.

**Puedes empezar de cero siguiendo el asistente. La migración es opcional**, también si ya utilizas Dev como app local. Elige cómo quieres pasar a la app del repositorio:

- **Empezar de cero:** instala la nueva app, inicia sesión y completa el asistente con los pasos siguientes. Tendrás una configuración nueva y un historial local vacío; vuelve a añadir tus favoritos y configura los módulos que utilices.
- **Conservar tus datos:** utiliza la opción **Migrar datos desde** en Configuración > Opciones de la nueva app. Puedes elegir **CC Tools Dev local** o **CC Tools de TitoTB**, un solo origen cada vez. Sigue [la guía de migración](MIGRACION.md) antes de iniciar el proceso: sustituye los datos del destino y conserva un respaldo.

Ambas opciones permiten actualizar después desde Home Assistant. Añadir el repositorio crea otra instalación y no transfiere los datos por sí solo.

1. Entra en **Ajustes > Apps > Instalar app** (en algunas versiones, **Aplicaciones > Tienda de aplicaciones**).
2. Abre **⋮ > Repositorios**, añade `https://github.com/micasadomotica/CC-Tools-Dev-HA` y pulsa **Añadir**. También puedes usar el botón anterior.
3. Busca **CC Tools Dev** dentro del repositorio **CC Tools Dev** e instala la app. Home Assistant construye la imagen en tu equipo; la primera instalación necesita descargar sus dependencias.
4. Revisa la zona horaria y el puerto externo **8088** en **Configuración > Red**.
5. Inicia la app y abre `http://IP_DE_HOME_ASSISTANT:8088`, o pulsa **Abrir interfaz web**.
6. Completa el asistente e inicia sesión en Creality Cloud. Si has migrado, comprueba los datos restaurados en lugar de configurar otra cuenta.

Utiliza la URL del repositorio tal como aparece arriba, sin `#main` ni `.git`. La rama predeterminada es **main**. Mantener la misma URL evita crear otro identificador de instalación.

### Empezar de cero si ya tienes la app local

Antes de iniciar la nueva, espera a que terminen las tareas de la local. Desactiva su arranque automático y Watchdog, si lo utilizas, y detén la app. Desactiva también el reinicio automático de Creality Cloud Dev durante el cambio. Puedes conservar la local detenida como respaldo mientras compruebas la nueva.

En la nueva app, sigue el asistente y configura de nuevo tus favoritos y los ajustes que utilices: módulos, horarios, Telegram, impresoras y archivos de impresión. La sesión y los registros locales empiezan de cero. Lo publicado en tu cuenta de Creality Cloud permanece allí.

**Aviso sobre diseños ya subidos:** los archivos de `/media/cctools_3d_models` permanecen en el almacenamiento compartido de HA, pero el registro de cuáles entregó la app antigua está en sus datos privados y no se recupera al empezar de cero. Al escanear, la nueva app puede considerar esos diseños como pendientes. Antes de activar subidas manuales o programadas, mueve las carpetas de los diseños ya entregados a una ubicación fuera de `/media/cctools_3d_models`, o prepara una biblioteca que contenga únicamente diseños pendientes de subir. Si no tienes claro cuáles se entregaron, revísalos en Creality Cloud antes de publicarlos otra vez.

## Actualizar desde Home Assistant

1. Cuando haya una nueva versión, abre **CC Tools Dev** y revisa el changelog. Si no aparece, pulsa **Buscar actualizaciones** en la tienda.
2. Espera a que termine cualquier tarea en curso y crea una copia de seguridad de la app. Incluye también **media** si quieres respaldar los archivos de diseños.
3. Pulsa **Actualizar**. Home Assistant obtiene los archivos del repositorio y construye la nueva versión.
4. Comprueba que la app arranca y recarga la interfaz web.

Las actualizaciones de esta misma instalación conservan los datos de `/data`. Ya no necesitas descargar ZIP ni sustituir `/addons/cc_tools`. La detección de una versión nueva no implica que se instale automáticamente: puedes pulsar **Actualizar** desde HA.

## Convivencia con CC Tools de TitoTB

| App | Instalación | Puerto habitual |
|---|---|---|
| CC Tools | Repositorio de TitoTB | 8080 |
| CC Tools Dev | Este repositorio | 8088 |

Cada app tiene sus propios datos, sesión y programación. Reparte las tareas entre ellas para evitar acciones duplicadas sobre la misma cuenta. Las recompensas y los límites diarios pertenecen a la cuenta de Creality Cloud.

Likes y colecciones requieren **Descubrir diseños** activado en la misma app. Los catálogos y configuraciones privados no se sincronizan. La biblioteca `/media/cctools_3d_models` está en el almacenamiento compartido de HA; evita que varias instalaciones suban o limpien los mismos archivos a la vez.

La instalación local anterior debe permanecer detenida cuando pases a la nueva, tanto si empiezas de cero como si migras. Puedes conservarla como respaldo temporal mientras compruebas la app del repositorio.

## Conectar Creality Cloud Dev

Utiliza [Creality Cloud Dev 1.0.7](https://github.com/micasadomotica/Creality-Cloud-Dev-HA/releases/tag/v1.0.7), integración independiente con dominio `creality_cloud_dev`, compatible con tener también la integración original.

1. Añade `https://github.com/micasadomotica/Creality-Cloud-Dev-HA` en HACS como repositorio personalizado de tipo **Integración**, instálala y reinicia Home Assistant. Requiere HA **2026.8 o posterior**.
2. En **Ajustes > Dispositivos y servicios > Añadir integración**, selecciona **Creality Cloud Dev**. Detecta automáticamente `34e9898c_cc_tools` si está iniciado y responde con un perfil válido. Si no puede detectarlo, introduce `http://IP_DE_HOME_ASSISTANT:8088` o `http://homeassistant.local:8088`, con el puerto que hayas configurado.
3. Si ya tenías el hub y conservas esa dirección, utiliza el existente. Para cambiar la dirección, usa **Reconfigurar**; no borres el hub ni lo añadas de nuevo.
4. Antes de activar **Reinicio automático**, comprueba que `restart_app` identifica la app del nuevo repositorio, con formato `<id_repositorio>_cc_tools`, y que `restart_app_name` es **CC Tools Dev**. Ya no debe apuntar a `local_cc_tools`.

La integración resuelve el destino por dirección y puerto. Si conectas mediante la IP o el nombre de Home Assistant y otra app conserva también el puerto 8088, la coincidencia es ambigua aunque esté detenida: cámbiale el puerto a uno libre, por ejemplo 8089, y deja 8088 únicamente en la nueva. Durante el cambio de instalación mantén desactivado **Reinicio automático**, tanto si empiezas de cero como si migras.

### Creality Cloud Models

La integración crea un dispositivo independiente de las impresoras, vinculado al mismo hub de cuenta:

| Entidad | Qué muestra o controla |
|---|---|
| Scheduled upload models / Subidas de modelos programadas | Activa o pausa la programación guardada, conservando selección, horario, límite diario y limpieza automática. |
| Categoría predeterminada | Categoría y subcategoría, por ejemplo `Impresoras 3D / Otro`. |
| Diseños disponibles | Número de diseños válidos y pendientes de envío en el último escaneo. |
| Last model upload / Último diseño subido | Nombre del último modelo enviado correctamente, con ID y enlace en los atributos. |
| Last upload / Última subida | Fecha y hora del último envío confirmado. |
| Next upload / Próxima subida | Fecha y hora previstas de la próxima ejecución programada. |
| Uploads today / Subidas hoy | Diseños enviados correctamente hoy, según la zona horaria de CC Tools. |

Guarda primero la programación inicial en **Subir diseños** de CC Tools. Después puedes activarla o pausarla desde Home Assistant. El interruptor incluye el último resultado y mensaje de error en sus atributos; apagarlo no cancela un envío en curso.

Los sensores utilizan el registro persistente de entregas, incluso cuando los archivos locales ya se han limpiado. **Subidas hoy** cuenta diseños enviados, manuales o programados; no equivale a los puntos ni a la recompensa **Upload Models**, que depende de la aprobación de Creality. Sin envíos anteriores, la última subida aparece desconocida. Con la programación apagada, la próxima subida aparece desconocida.

Para incorporar estas entidades a una instalación existente, actualiza primero CC Tools Dev y después la integración desde HACS, y reinicia Home Assistant. Conserva el hub existente para mantener sus entidades e historial.

## Descubrir diseños

La programación propone **10 diseños por día** en una instalación nueva. Una actualización conserva el límite que ya tengas guardado, incluido un valor inferior. Puedes ajustarlo entre 0 y 10 en la configuración del módulo.

Las nuevas programaciones de **Realiza una impresión** también proponen **10 impresiones por día** y conservan los valores de los perfiles existentes. En Telegram puedes activar o desactivar por separado los avisos de éxito y error de añadir a una colección, crear un proyecto y subir un diseño.

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
| Un `.3mf` | Con configuración de Creality Print, Bambu Studio u Orca Slicer; máximo 256 MB. Su nombre, sin extensión, se usa como título. |
| Una portada web | JPG, JPEG, PNG o WebP estática, proporción **4:3**; máximo 20 MB. Por ejemplo, `portada.jpg`. |
| `info.txt` | Texto UTF-8 con etiquetas y descripción; máximo 32 KB. Hasta 20 etiquetas de 30 caracteres cada una. |
| Imágenes opcionales | `portada2` para la app en **3:4** e `imagen1` a `imagen9` en **4:3**, con cualquiera de las extensiones de imagen anteriores; máximo 20 MB por archivo. |

Ejemplo de `info.txt`:

```text
CATEGORIA: Impresoras 3D / Otro
ETIQUETAS: caja, organizador
DESCRIPCION: Caja organizadora con compartimentos para piezas pequeñas.
```

Dev valida los archivos y detecta duplicados por su contenido. Selecciona los diseños y pulsa **Subir seleccionados**, o configura la cantidad diaria, la franja horaria y los diseños de la primera ejecución y pulsa **Programar**.

La **categoría predeterminada** se guarda al cambiar los selectores de categoría y subcategoría y se aplica tanto a subidas manuales como programadas. Su valor inicial es **Impresoras 3D / Otro**. La línea opcional `CATEGORIA: Categoría / Subcategoría` de `info.txt` tiene prioridad para ese diseño. Si falta o está vacía, se usa el selector. Si no coincide con una combinación disponible, el diseño se marca para revisar; no se sustituye por otra categoría. Puedes consultar las diez categorías y sus subcategorías en los selectores del módulo.

La subida automatiza el formulario web de Creality Cloud: carga los archivos, completa las etiquetas y la descripción y entrega el diseño como **Original, Gratis y Público**, en la categoría indicada en `info.txt` o en el selector del módulo, con licencia **CC BY-NC**. Al subir o programar autorizas que acepte la declaración de derechos de autor para esos diseños.

La tarjeta muestra la recompensa **Upload Models** sobre **5**, aunque hayas programado menos diseños. En **Mis diseños**, debajo de **Entregado** aparece la fecha original de entrega, que no cambia al volver a escanear.

La entrega queda registrada por cuenta para evitar duplicados. Si el resultado es incierto, revisa el **Banco de trabajo** de Creality antes de repetirla. Entregar un diseño no confirma la recompensa **Upload Models**: queda pendiente de aprobación. La limpieza local es opcional y está desactivada por defecto. **Limpiar diseños** se guarda al marcar la casilla y funciona también con las subidas desactivadas, sin tener que seleccionar diseños ni pulsar Programar. Desde el día siguiente a la entrega comprueba que el diseño esté publicado en el perfil antes de eliminar sus archivos. Conserva los archivos adicionales, modificados o sin confirmación pública.

## Desarrollo y publicaciones

- **main** es la rama predeterminada y contiene la versión que ofrece la tienda de Home Assistant.
- Las ramas de trabajo se integran después de las comprobaciones. Para publicar, sigue [PUBLICACION.md](PUBLICACION.md).
- Las versiones de este repositorio usan etiquetas **vX.Y.Z**. El historial anterior se conserva, partiendo del commit `07fbf22ae26969877eda19a551d9c923c98fb71d` de **dev-v1.0.49**.
- El [repositorio anterior](https://github.com/micasadomotica/CC-Tools-HA) conserva las publicaciones históricas.

## Soporte

Comunica los problemas de Dev en [Issues](https://github.com/micasadomotica/CC-Tools-Dev-HA/issues), indicando la versión y los pasos para reproducirlos. Para la edición original, consulta el [repositorio de TitoTB](https://github.com/TitoTB/CC-Tools-HA).

## Aviso y licencia

CC Tools no es una aplicación oficial ni está afiliada con Creality o Creality Cloud. Respeta las normas de la plataforma.

Se conserva el trabajo de TitoTB y la comunidad de Aguacatec, su historial y la [licencia MIT](LICENSE).
