# Publicar una versión de CC Tools Dev

Home Assistant lee la rama predeterminada **main** de `https://github.com/micasadomotica/CC-Tools-Dev-HA`. La versión disponible se obtiene de `cc_tools/config.yaml`.

Esta app no declara `image`: Supervisor la construye desde `cc_tools/Dockerfile` tanto al instalar como al actualizar. No depende de paquetes de TitoTB ni de permisos de GHCR. Se ha retirado el workflow heredado que publicaba imágenes del proyecto original; el workflow **Validate** sigue comprobando pruebas y construcción para **amd64** y **aarch64**.

## Preparar el cambio

1. Trabaja en una rama independiente de `main`.
2. Actualiza la versión en `cc_tools/config.yaml`, `cc_tools/package.json`, las dos versiones del paquete raíz de `cc_tools/package-lock.json`, el valor predeterminado de `BUILD_VERSION` en `cc_tools/Dockerfile` y los parámetros de caché de `cc_tools/public/index.html`.
3. Añade las novedades a `cc_tools/CHANGELOG.md` y actualiza la documentación necesaria. Conserva el nombre **CC Tools Dev**, `slug: cc_tools`, el puerto externo **8088** y la URL del repositorio.
4. Ejecuta las pruebas pertinentes y revisa el resultado de **Validate** en GitHub, incluidas las construcciones de ambas arquitecturas.
5. Prueba la actualización desde la versión anterior en Home Assistant, incluyendo el mantenimiento de los datos y la conexión con Creality Cloud Dev.

## Ofrecer la actualización

Integra el cambio en `main` después de validar. Ese paso ya ofrece la nueva versión a quienes usan el repositorio en HA. Una release marcada como borrador o pre-release no impide que HA lea lo que hay en `main`.

Crea una etiqueta **vX.Y.Z** en el mismo commit y una release que describa las novedades y las comprobaciones. La etiqueta y la release documentan la versión; no sustituyen el cambio de `version` ni los archivos en `main`. No hace falta adjuntar un ZIP para los usuarios de la tienda.

Las pruebas previas pueden permanecer en una rama de trabajo. Si se utiliza una URL con `#rama` en HA, se crea otra identidad de app: no es una actualización de la instalación de `main` y tendrá datos propios.

## Origen de 1.0.50

La base exacta es `07fbf22ae26969877eda19a551d9c923c98fb71d`, etiqueta [dev-v1.0.49](https://github.com/micasadomotica/CC-Tools-HA/releases/tag/dev-v1.0.49) del repositorio anterior. El mantenedor ha confirmado que 1.0.49 está probada y funciona en Home Assistant. La 1.0.50 adapta la distribución y documenta la migración; la validación real del nuevo origen y de esa migración debe registrarse por separado.
