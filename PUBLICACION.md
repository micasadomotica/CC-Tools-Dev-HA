# Publicar una versión de CC Tools Dev

Home Assistant lee la rama predeterminada **main** de `https://github.com/micasadomotica/CC-Tools-Dev-HA`. La versión disponible se obtiene de `cc_tools/config.yaml`.

Desde 1.0.67 la app declara `image: ghcr.io/micasadomotica/cc-tools-dev-ha`. Supervisor descarga la imagen `ghcr.io/micasadomotica/cc-tools-dev-ha:<versión>` al instalar y actualizar. Así los backups de la app no incluyen la imagen Docker, que Supervisor solo guarda cuando construye la app en el equipo. La imagen se publica con el workflow **Publish container**, basado en `home-assistant/builder` como el proyecto original de TitoTB, en el registro propio `ghcr.io/micasadomotica`. No depende de paquetes de TitoTB. El workflow **Validate** sigue comprobando pruebas y construcción para **amd64** y **aarch64**.

**Orden obligatorio:** la imagen de una versión debe existir y ser pública **antes** de que esa versión llegue a `main`. En cuanto `main` cambia, Home Assistant ofrece la actualización e intenta descargar la imagen; si no existe, la actualización falla.

## Preparar el cambio

1. Trabaja en una rama independiente de `main`.
2. Actualiza la versión en `cc_tools/config.yaml`, `cc_tools/package.json`, las dos versiones del paquete raíz de `cc_tools/package-lock.json`, el valor predeterminado de `BUILD_VERSION` en `cc_tools/Dockerfile` y los parámetros de caché de `cc_tools/public/index.html`.
3. Añade las novedades a `cc_tools/CHANGELOG.md` y actualiza la documentación necesaria. Conserva el nombre **CC Tools Dev**, `slug: cc_tools`, el puerto externo **8088** y la URL del repositorio.
4. Ejecuta las pruebas pertinentes y revisa el resultado de **Validate** en GitHub, incluidas las construcciones de ambas arquitecturas.
5. Haz push de la rama `release/X.Y.Z`. **Publish container** construye y publica `ghcr.io/micasadomotica/cc-tools-dev-ha:X.Y.Z` para amd64 y aarch64. También puede lanzarse a mano desde **Actions** sobre esa rama.
6. Solo la primera vez: en **GitHub > Packages > cc-tools-dev-ha > Package settings**, cambia la visibilidad a **Public**. Sin ese paso, Supervisor no puede descargarla sin credenciales.
7. Abre el PR hacia `main`. El job **published-image** de **Validate** comprueba sin credenciales que la imagen de la versión existe para ambas arquitecturas; no integres si falla.
8. Prueba la actualización desde la versión anterior en Home Assistant, incluyendo el mantenimiento de los datos y la conexión con Creality Cloud Dev.

## Ofrecer la actualización

Integra el cambio en `main` después de validar. Ese paso ya ofrece la nueva versión a quienes usan el repositorio en HA. Una release marcada como borrador o pre-release no impide que HA lea lo que hay en `main`.

Crea una etiqueta **vX.Y.Z** en el mismo commit y una release que describa las novedades y las comprobaciones. La etiqueta y la release documentan la versión; no sustituyen el cambio de `version` ni los archivos en `main`. No hace falta adjuntar un ZIP para los usuarios de la tienda.

Las pruebas previas pueden permanecer en una rama de trabajo. Si se utiliza una URL con `#rama` en HA, se crea otra identidad de app: no es una actualización de la instalación de `main` y tendrá datos propios.

## Origen de 1.0.50

La base exacta es `07fbf22ae26969877eda19a551d9c923c98fb71d`, etiqueta [dev-v1.0.49](https://github.com/micasadomotica/CC-Tools-HA/releases/tag/dev-v1.0.49) del repositorio anterior. El mantenedor ha confirmado que 1.0.49 está probada y funciona en Home Assistant. La 1.0.50 adapta la distribución y documenta la migración; la validación real del nuevo origen y de esa migración debe registrarse por separado.
