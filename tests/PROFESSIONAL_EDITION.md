# Segunda edición: inteligencia profesional

Borrador 1 permanece en la rama `borrador-1`, commit `9b53384c17a1245d0b6943fa4605a9482dcc6658`.

## Rutas

- `#territory`: 328 AGEB disponibles, 14 distritos CODESIN, cuadrículas aproximadas de 500, 1000 y 1500 m; 11 indicadores, comparación de hasta tres zonas, búsqueda y exportación JSON.
- `#portfolio`: cartera capturada por el usuario, edición, baja con confirmación, filtros y resumen de venta/renta separado. Respaldo/importación JSON; importación agrega registros y conserva existentes por identificador.
- `#portfolio?ageb=CLAVE`: registro desde el análisis de una AGEB.

## Fuentes y método

Censo 2020: población, adultos, hogares, viviendas habitadas, internet, agua, automóvil, PEA y ocupados. DENUE 2025: establecimientos y empleo estimado. Servicios a 1 km: centroide AGEB, nunca punto de propiedad. Las fuentes y periodos no son contemporáneos entre sí.

La geometría se proyecta en coordenadas equirectangulares locales, origen (-106.45, 23.2), paralelo de referencia 23.25°. Las distancias de malla son aproximadas, no delimitación catastral. `polygon-clipping` calcula intersecciones incluyendo polígonos múltiples y huecos. La fracción de superficie de cada AGEB asigna sus conteos a cada destino. Se presupone distribución uniforme. Tasas ponderadas por viviendas habitadas; no se promedian sin ponderar. Un dato ausente en cualquiera de las AGEB contribuyentes invalida el agregado de esa variable, sin convertir faltantes en cero. Tasas fuera de [0,100] y viviendas sin denominador se marcan sin dato.

Los distritos usan intersecciones reales, no asignación al distrito más cercano. Pueden cubrir una fracción de las AGEB o superponerse según la delimitación de origen. No deben sumarse como si fueran una partición exhaustiva del municipio.

La cartera usa coordenadas si se proporcionan; en su ausencia acepta AGEB seleccionada manualmente. Fuera de cobertura no se asigna un entorno por proximidad. Los precios son capturados, no avalúos. Totales de venta y renta excluyen cerradas; cada total indica cuántos registros tienen precio. No se suman habitantes entre propiedades porque podrían compartir AGEB.

## Persistencia

`localStorage.growa_agency_portfolio_v1`, versión 1. Sin sincronización ni autenticación de equipo. Respaldo JSON para portabilidad. Errores de almacenamiento se muestran; contenido ilegible no se sobreescribe durante captura. La importación de un respaldo válido permite recuperación explícita. No se publican datos de cartera en el servidor.

## Verificación

`node tests/territory.test.mjs`: conservación de población en las tres mallas (<1 persona de error numérico, total de origen 473,913), 14 distritos, huecos y puntos fuera de cobertura, faltantes, validación de cartera y roundtrip de respaldo.

Prueba de navegador: cambios de escala y capa, selección, comparación, alta/edición/recarga, descarga/baja/importación; vistas 1440px y 390px sin desbordamiento horizontal ni errores de JavaScript.
