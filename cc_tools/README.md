# CC Tools Dev

Edición de desarrollo de CC Tools para automatizar tareas de Creality Cloud desde Home Assistant.

**Versión de prueba: [CC Tools Dev 1.0.49](https://github.com/micasadomotica/CC-Tools-HA/releases/tag/dev-v1.0.49)**. Añade categorías y subcategorías para subir diseños, prioridad de `CATEGORIA:` en `info.txt`, requisitos de Orca Slicer y un aviso que distingue impresiones pendientes de las que caben por tiempo. Pendiente de validación real en Home Assistant.

[Descargar ZIP 1.0.49 para probar](https://github.com/micasadomotica/CC-Tools-HA/releases/download/dev-v1.0.49/cc-tools-dev-1.0.49.zip) · [Versión estable validada y Latest: 1.0.48](https://github.com/micasadomotica/CC-Tools-HA/releases/tag/dev-v1.0.48)

La interfaz web utiliza el puerto **8088** por defecto: `http://IP_DE_HOME_ASSISTANT:8088`. Puede convivir con CC Tools de TitoTB instalado desde su repositorio en el puerto **8080**.

Descarga el ZIP adjunto de las [Releases de Dev](https://github.com/micasadomotica/CC-Tools-HA/releases), descomprímelo y copia la carpeta `cc_tools` dentro de `/addons`. Después busca actualizaciones en la tienda e instala **CC Tools Dev** desde las aplicaciones locales.

Consulta la [guía de instalación y actualización](https://github.com/micasadomotica/CC-Tools-HA/tree/dev#instalación) y la pestaña **Documentación** para configurar el puerto y repartir los módulos entre ambas instalaciones.

En **Subir diseños**, prepara un `.3mf` con configuración de **Creality Print, Bambu Studio u Orca Slicer**, una portada e `info.txt`. Los selectores de **Categoría** y **Subcategoría** se guardan al cambiarlos y se aplican a las subidas manuales y programadas. El valor inicial es **Impresoras 3D / Otro**.

La línea opcional `CATEGORIA: Categoría / Subcategoría` de `info.txt` tiene prioridad para ese diseño. Por ejemplo: `CATEGORIA: Hogar / Mascotas`. Si falta o está vacía, se usa el selector del módulo. Una combinación incorrecta se marca para revisar. Consulta los requisitos previos del módulo y [ejemplo-info.txt](ejemplo-info.txt).
