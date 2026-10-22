# Migrar CC Tools Dev local al repositorio

Esta guía traslada una instalación local **1.0.49** a **1.0.50** desde [CC-Tools-Dev-HA](https://github.com/micasadomotica/CC-Tools-Dev-HA). Se hace una sola vez. Después podrás actualizar desde Home Assistant.

La base 1.0.49 está validada en Home Assistant por el mantenedor. El procedimiento de migración requiere su comprobación final en una instalación real. Conserva la instalación local y las copias hasta verificar todos tus datos.

## Qué se conserva

Se copia **todo el contenido privado de `/data`**: configuración, programaciones, perfiles y sesión del navegador, historial, catálogos, registros de entrega de diseños, imágenes de comentarios y capturas. Copiar únicamente `config.json` no es suficiente.

Los archivos de subida en **`/media/cctools_3d_models`** ya están en el almacenamiento compartido de Home Assistant. Permanecen en su ubicación. Respalda también `media`: una copia que incluya solo la app no cubre esta carpeta.

La carpeta **`/addons/cc_tools` contiene el código**, no los datos privados. Copiarla, borrar sus archivos o cambiar su nombre no migra la configuración ni la sesión.

Home Assistant identifica la instalación local como `local_cc_tools` y la del repositorio como `<id_repositorio>_cc_tools`. El cambio de identificador crea otro almacenamiento. Restaurar normalmente una copia de la app local restaura la identidad local; no convierte esa copia en la app del repositorio.

## 1. Preparar la instalación local

1. Anota la zona horaria y el puerto externo de la app. Esta guía utiliza **8088** para la instalación nueva.
2. En la integración **Creality Cloud Dev**, desactiva **Reinicio automático**. Desactiva también cualquier automatización externa que pueda iniciar o reiniciar Dev durante la copia.
3. Espera a que terminen las tareas en curso y cierra el navegador interactivo de Dev. Detén la app local desde HA.
4. Desactiva **Iniciar al arrancar** y **Watchdog** de la app local si aparecen activados. No la desinstales.
5. Crea una copia de seguridad de Home Assistant que incluya **CC Tools Dev local** y **media**. Descárgala y conserva también los datos necesarios para restaurarla si está cifrada.
6. Cambia el puerto externo de la app local a otro libre, por ejemplo **8089**, y déjala detenida. La nueva utilizará **8088**. Este cambio evita que la integración encuentre dos destinos para el reinicio automático.

## 2. Instalar la app del repositorio

1. En la tienda de Apps, añade exactamente `https://github.com/micasadomotica/CC-Tools-Dev-HA`, sin `#main` ni `.git`.
2. Instala **CC Tools Dev 1.0.50** desde el repositorio. Comprueba el origen para distinguirla de la app local.
3. Configura la misma zona horaria y el puerto **8088**. Mantén desactivados **Iniciar al arrancar** y **Watchdog** durante la migración.
4. Inicia una vez la app nueva para que Supervisor cree su contenedor y su almacenamiento. No completes el asistente ni inicies sesión. Detén la app nueva desde HA.

Las dos apps deben estar detenidas antes de copiar. No utilices esta guía para mezclar dos instalaciones que ya tengan actividad propia: la copia sustituye los datos nuevos por los de la local.

## 3. Copiar los datos privados

Este paso requiere una **consola del host de Home Assistant OS con acceso a Docker y a sus rutas de almacenamiento**. La app Terminal & SSH habitual y Samba no muestran los datos privados de otras apps. En la consola física o de la máquina virtual de HA OS, escribe `login` para entrar en el host. Si ya tienes SSH de desarrollo configurado, también sirve. Consulta el [acceso al host documentado por Home Assistant](https://contributors.home-assistant.io/os/operating-system/debugging/).

Los comandos siguientes se ejecutan en esa consola Linux, no en PowerShell ni en la consola web de CC Tools. Solo copian datos de CC Tools; no modifican los registros internos de Supervisor.

Lista los contenedores:

```sh
docker ps -a --format '{{.Names}}\t{{.Status}}'
```

Localiza los dos nombres de CC Tools. Dependiendo de la versión de Supervisor, pueden comenzar por `app_` o por `addon_`:

- Antigua: `app_local_cc_tools` o `addon_local_cc_tools`.
- Nueva: `app_<id_repositorio>_cc_tools` o `addon_<id_repositorio>_cc_tools`.

Confirma el identificador de la nueva en la URL de su ficha de Home Assistant. **No elijas la app original de TitoTB.** Sustituye los dos valores iniciales del bloque por los nombres reales. El marcador `REEMPLAZAR_ID` hace que el bloque se detenga hasta que lo cambies.

```sh
(
  set -eu
  OLD_CONTAINER='app_local_cc_tools'
  NEW_CONTAINER='app_REEMPLAZAR_ID_cc_tools'

  case "$OLD_CONTAINER" in
    app_local_cc_tools|addon_local_cc_tools) ;;
    *) echo 'El origen debe ser la app local CC Tools.' >&2; exit 1 ;;
  esac
  printf '%s\n' "$NEW_CONTAINER" | grep -Eq '^(app|addon)_[0-9a-f]{8}_cc_tools$' || {
    echo 'Introduce el nombre real del contenedor del nuevo repositorio.' >&2
    exit 1
  }
  for container in "$OLD_CONTAINER" "$NEW_CONTAINER"; do
    test "$(docker inspect -f '{{.State.Running}}' "$container")" = false || {
      echo "Detén $container desde Home Assistant antes de copiar." >&2
      exit 1
    }
  done

  SRC=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' "$OLD_CONTAINER")
  DST=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' "$NEW_CONTAINER")
  test -n "$SRC" && test -n "$DST"
  SRC=$(readlink -f "$SRC")
  DST=$(readlink -f "$DST")
  test -d "$SRC" && test -d "$DST" && test "$SRC" != "$DST"
  test "$(basename "$SRC")" = local_cc_tools
  NEW_SLUG=${NEW_CONTAINER#*_}
  test "$(basename "$DST")" = "$NEW_SLUG"
  test "$(dirname "$SRC")" = "$(dirname "$DST")"
  test -f "$SRC/config.json"

  BACKUP=$(mktemp -d /mnt/data/cc-tools-migration.XXXXXX)
  chmod 700 "$BACKUP"
  printf 'Origen: %s\nDestino: %s\nCopia de respaldo: %s\n' "$SRC" "$DST" "$BACKUP"
  tar -cpf "$BACKUP/local-data.tar" -C "$SRC" .
  mkdir "$BACKUP/new-data-before-migration"

  # Conserva los datos iniciales de la nueva app; no borra nada.
  for entry in "$DST"/* "$DST"/.[!.]* "$DST"/..?*; do
    if test -e "$entry" || test -L "$entry"; then
      mv "$entry" "$BACKUP/new-data-before-migration/"
    fi
  done
  cp -a "$SRC/." "$DST/"
  cmp "$SRC/config.json" "$DST/config.json"
  printf 'Copia terminada. Conserva el respaldo en %s\n' "$BACKUP"
)
```

Si el bloque muestra un error, **no inicies la app nueva** hasta resolverlo. La local no se modifica. Si la copia se interrumpe después de mover los datos iniciales, esos datos permanecen en `new-data-before-migration` y la copia completa de la local está en `local-data.tar`. Anota la ruta de respaldo que muestra el bloque.

La copia incluye cookies y datos de acceso. Guarda los respaldos de forma privada; no los adjuntes a Issues ni a conversaciones públicas. No sustituyas las rutas por `/config` o `/addons`: el bloque obtiene de Docker las rutas reales montadas como `/data`.

## 4. Comprobar la instalación nueva

1. En HA, comprueba de nuevo la zona horaria y el puerto **8088** de la app del repositorio. Los ajustes de Supervisor se revisan en su ficha, aunque se haya copiado `options.json` dentro de `/data`.
2. Inicia únicamente la app nueva y abre su interfaz. Recarga la página para ver **1.0.50**.
3. Comprueba el perfil correcto, los módulos y sus horarios, los diseños, el Log, las impresoras, Telegram y los registros de entregas. Las programaciones copiadas pueden ejecutarse al arrancar si su horario está vencido; realiza la comprobación en un momento adecuado.
4. Comprueba la sesión de Creality Cloud. Se copia el perfil completo del navegador, aunque Creality puede exigir un nuevo inicio de sesión si la sesión ha caducado.
5. Comprueba que **Mis diseños** sigue viendo `/media/cctools_3d_models` y que conserva las entregas anteriores. No vuelvas a subir un diseño solo para probar la migración.
6. Activa **Iniciar al arrancar** y, si lo usabas, **Watchdog** únicamente en la nueva app. Crea otra copia de seguridad tras comprobar los datos.

Mantén la antigua detenida hasta completar estas comprobaciones. Después puedes desinstalar la app local y retirar su carpeta de código `/addons/cc_tools` si ya no la necesitas y conservas el respaldo. No borres `media` ni desinstales la nueva app.

## 5. Mantener la integración y sus entidades

Si Creality Cloud Dev ya utiliza `http://IP_DE_HOME_ASSISTANT:8088`, conservar esa dirección permite seguir usando el mismo hub y sus entidades. Recarga la integración si no recupera la conexión. Si utilizabas un nombre interno de la app local o una dirección distinta, cambia la URL mediante **Reconfigurar** en el hub existente.

Antes de reactivar **Reinicio automático**, confirma que la local ya no tiene configurado 8088. La integración **1.0.6-dev.1** comprueba todas las apps instaladas; una app detenida con el mismo puerto también genera ambigüedad.

Activa el interruptor y comprueba sus atributos:

- `restart_app`: `<id_repositorio>_cc_tools`, correspondiente a la nueva app.
- `restart_app_name`: `CC Tools Dev`.

Si no aparece un destino único, deja el interruptor desactivado y revisa los puertos. Actualiza también cualquier automatización externa que tuviera fijado `local_cc_tools`; no borres ni recrees las entidades de Creality Cloud Dev para cambiar el destino.

## Volver a la instalación local

Si todavía no has utilizado la nueva app para ejecutar tareas:

1. Desactiva el reinicio automático de la integración, el arranque automático y Watchdog de la nueva app. Detenla.
2. Cambia el puerto externo de la nueva a uno libre, por ejemplo 8090.
3. Devuelve el puerto **8088** a la app local y arráncala. Sus datos originales siguen intactos.
4. Comprueba la conexión de Creality Cloud Dev y el destino de reinicio antes de volver a activar ese interruptor.

Si la nueva ya ejecutó tareas, sus datos contienen actividad posterior a la copia. Volver sin más a los datos antiguos puede repetir acciones. Detén ambas y conserva una copia actual de la nueva; revisa o traslada esos datos recientes antes de reanudar programaciones. La migración a 1.0.50 no cambia el formato de datos, pero los historiales de las dos instalaciones no se fusionan automáticamente.

## Siguientes actualizaciones

Desde la ficha de la app del repositorio, pulsa **Actualizar** cuando HA ofrezca una nueva versión. No repitas la copia entre instalaciones. La app mantiene su identificador y su almacenamiento mientras uses este repositorio con la misma URL.

Referencias: [repositorios e identidad de apps](https://contributors.home-assistant.io/apps/guides/repository/), [almacenamiento y configuración](https://contributors.home-assistant.io/apps/reference/configuration/), [acceso al host](https://contributors.home-assistant.io/os/operating-system/debugging/).
