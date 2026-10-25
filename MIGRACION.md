# Migrar datos a CC Tools Dev

La migración se realiza desde **Configuración > Opciones** de CC Tools Dev en Home Assistant. El mantenedor ha comprobado el proceso en su instalación. Esta guía sustituye el procedimiento manual de copia con Docker: no necesitas Advanced SSH & Web Terminal ni ejecutar comandos.

La migración es opcional. Puedes empezar de cero con el asistente o importar datos más adelante. **Importar sustituye los datos actuales de CC Tools Dev; no fusiona las dos instalaciones.**

## Origen y destino

| Opción «Migrar datos desde» | Instalación de origen |
|---|---|
| CC Tools Dev local | `local_cc_tools` |
| CC Tools de TitoTB | `8966b8c7_cc_tools` |
| No migrar | Inicia normalmente con los datos actuales. |

El destino es **CC Tools Dev de este repositorio**, identificado como `34e9898c_cc_tools`. El selector permite elegir un solo origen. La app de origen debe seguir instalada y estar detenida.

Desde **1.0.54**, el origen puede aparecer como **Error** después de detenerlo. En ese caso, la migración solo continúa si Supervisor confirma una versión instalada y Watchdog desactivado, y Docker confirma que el contenedor está inactivo o ya no existe. El estado Error por sí solo no autoriza la copia. No necesitas volver a iniciar el origen para intentar que cambie a Detenido.

## Qué se conserva

Se importan la configuración, las programaciones, el perfil y la sesión del navegador, el historial, los catálogos, los registros de entrega de diseños y los demás datos privados de la app. Creality puede pedir que vuelvas a iniciar sesión si ha caducado.

Las opciones propias de la nueva app en Home Assistant se conservan: revisa allí su zona horaria y puerto. Los archivos de `/media/cctools_3d_models` ya están en el almacenamiento compartido de HA y permanecen en su ubicación. Incluye **media** en tu copia de seguridad para respaldarlos.

Los datos del origen no se modifican. Antes de sustituir los del destino, CC Tools conserva un respaldo privado y valida la copia importada.

## 1. Preparar las apps

1. Espera a que terminen las tareas en curso y cierra el navegador interactivo de la app de origen.
2. Desactiva **Reinicio automático** en la integración Creality Cloud Dev y cualquier automatización que pueda iniciar o reiniciar las apps durante la migración.
3. Desactiva **Iniciar al arrancar** y **Watchdog** de la app de origen y detenla desde Home Assistant. No la desinstales.
4. Crea una copia de seguridad de Home Assistant con la app de origen y **media**. Si el destino ya contiene datos, inclúyelo también.
5. Instala o actualiza **CC Tools Dev** desde `https://github.com/micasadomotica/CC-Tools-Dev-HA`. Durante el proceso, deja desactivados su arranque automático y Watchdog.
6. Comprueba la zona horaria y el puerto externo del destino, normalmente **8088**. Si el origen también tiene asignado 8088, cámbialo a otro libre, por ejemplo 8089. Déjalo detenido.

No es necesario iniciar antes la nueva app para crear un contenedor vacío: puedes seleccionar la migración antes del primer arranque. Si ya la has utilizado, detenla antes de cambiar las opciones.

## 2. Seleccionar la migración

En la ficha de **CC Tools Dev del repositorio**:

1. Desactiva temporalmente **Modo de protección**. La migración necesita ese acceso para leer los datos privados del origen; el funcionamiento normal de CC Tools no lo necesita.
2. Abre **Configuración > Opciones**.
3. En **Migrar datos desde**, elige **CC Tools Dev local** o **CC Tools de TitoTB**.
4. Marca **Confirmar sustitución de datos** y pulsa **Guardar**.
5. Inicia la app nueva y consulta su **Registro**.

La copia se realiza al iniciar, antes de arrancar la aplicación. No inicies el origen ni interrumpas el destino mientras se está copiando. El Registro muestra el origen, la ubicación del respaldo y, al terminar, **Migración completada**.

La solicitud se restablece automáticamente a **No migrar**, con la confirmación desmarcada, para evitar repetirla en el siguiente arranque.

## 3. Revisar y reanudar

Después de una migración completada, las automatizaciones quedan pausadas hasta que revises los datos:

1. Abre la interfaz de la nueva app y comprueba la cuenta, la sesión, los módulos y sus horarios, las impresoras, Telegram y el Log.
2. En **Mis diseños**, comprueba la biblioteca y los registros de entregas anteriores. No vuelvas a subir un diseño solo para probar la migración.
3. Comprueba en las opciones de HA que figura **No migrar** y que la confirmación está desmarcada.
4. Detén la nueva app, vuelve a activar **Modo de protección** y arráncala. La pausa de revisión se conserva.
5. Cuando los datos sean correctos, pulsa **Reanudar automatizaciones** en la interfaz de CC Tools. Las tareas seguirán sus ajustes y horarios importados.
6. Activa **Iniciar al arrancar** y, si lo utilizas, **Watchdog** únicamente en la nueva app. Crea una nueva copia de seguridad.

Mantén el origen detenido mientras verificas la instalación. Cuando todo funcione y tengas respaldo, podrás desinstalarlo. No borres la biblioteca compartida de `media`.

## Mantener la integración de Home Assistant

Utiliza [Creality Cloud Dev](https://github.com/micasadomotica/Creality-Cloud-Dev-HA). Si el hub existente usa `http://IP_DE_HOME_ASSISTANT:8088` y la nueva app conserva esa dirección, puedes seguir usando el mismo hub. Si apunta al nombre interno de la app local o a otra dirección, usa **Reconfigurar** para cambiar la URL. No elimines el hub ni recrees sus entidades.

Al añadir un hub nuevo, la integración detecta la app `34e9898c_cc_tools` iniciada; si no responde, permite introducir `http://IP_DE_HOME_ASSISTANT:8088` o `http://homeassistant.local:8088`.

Antes de reactivar **Reinicio automático**, comprueba que los atributos del interruptor indican `restart_app: 34e9898c_cc_tools` y `restart_app_name: CC Tools Dev`. Si utilizas una dirección externa, evita que otra app tenga asignado el mismo puerto. Actualiza también cualquier automatización propia que todavía apunte al origen.

## Si aparece un error

Consulta el mensaje del Registro antes de reintentar:

- **Origen activo o Watchdog habilitado:** detén el origen y desactiva Watchdog.
- **Supervisor muestra Error después de detener el origen:** actualiza el destino a 1.0.54 o posterior. Consulta las líneas `[migration] Supervisor:` y `[migration] Docker:`; muestran qué devuelve cada servicio y si se ha confirmado la inactividad. Si Docker detecta actividad o no puede comprobarla, la copia sigue bloqueada.
- **No se puede acceder a Docker:** comprueba que has desactivado temporalmente Modo de protección en la app de destino.
- **Origen no encontrado o configuración incompatible:** comprueba la instalación seleccionada y conserva las copias de seguridad.
- **Migración interrumpida:** al siguiente arranque, la app intenta recuperar los datos anteriores y se detiene para que decidas cómo continuar. Sigue el mensaje del Registro.

Si el Registro indica que se han recuperado los datos anteriores y quieres reintentar, vuelve a seleccionar el origen y marca la confirmación. Para cancelar una migración fallida y conservar los datos recuperados, selecciona **No migrar**, marca **Confirmar sustitución de datos**, guarda e inicia. Esta confirmación especial se utiliza solo para reconocer la cancelación tras un fallo.

Los respaldos internos están en `/data/.cc-tools-migration/`; el Registro indica la carpeta concreta de cada intento. Contienen datos privados de sesión y no deben adjuntarse a incidencias públicas. No sustituyen la copia de seguridad de Home Assistant.

## Volver al origen o migrar más adelante

Si todavía no has ejecutado tareas en el destino, puedes detenerlo y volver a iniciar el origen, ajustando el puerto y la conexión de la integración si es necesario. Los datos originales siguen intactos.

Si el destino ya ha realizado acciones, el origen no contiene esa actividad reciente. Revisa los historiales antes de reanudarlo para evitar repetir envíos u otras tareas; no se fusionan automáticamente.

También puedes solicitar otra migración más adelante desde las mismas opciones. Volverá a sustituir los datos del destino por los del origen seleccionado y conservará otro respaldo.

Las actualizaciones normales de CC Tools Dev mantienen sus datos: **no repitas la migración para actualizar de versión**.
