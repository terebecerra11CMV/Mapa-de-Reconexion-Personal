# Cambios en este paquete

Solo 2 archivos fueron modificados. El resto está incluido sin cambios,
por si prefieres subir la carpeta completa como reemplazo directo.

## Archivos modificados
- `style.css`
- `app.js`

## Archivos sin cambios (incluidos igual, para reemplazo completo)
- `index.html`
- `admin.html`
- `body_src.html`
- `package.json`
- `api/_redis.js`
- `api/check-token.js`
- `api/redeem-token.js`

---

## Ronda 6 — causa raíz DEFINITIVA del corte de líneas por la mitad

El fix de la Ronda 5 (agregar `position: relative`) era necesario pero
no era la causa completa — el mismo caso reportado (Código B, tarjeta
"SEÑALES", el ítem "Inicias nuevos proyectos...") seguía fallando después
de aplicarlo. Esta vez, en vez de corregir y suponer que funcionaba,
instrumenté la generación real del PDF con logs detallados en cada paso
y localicé el mecanismo exacto del bug.

**Archivo:** `app.js` → `findSafeCut` (cambia su valor de retorno),
`renderSectionToPdf`

**El mecanismo real:** cuando el sistema detecta que una tarjeta completa
cabe en una página y decide "empujarla para que empiece limpia en una
página nueva", ese empuje solo movía el PUNTO DE CORTE — pero nunca le
avisaba al generador de PDF que debía saltar de página de verdad. El
resultado: el hueco que quedaba al final de la página anterior (por
ejemplo 330px libres de una página de 2105px) se seguía usando para
empezar a dibujar la tarjeta ahí mismo, en vez de en una página nueva.
Cuando el sistema calculaba el siguiente corte ("una página completa de
distancia desde donde vamos"), esa distancia ya no coincidía con el
límite real de la tarjeta, y el corte cortaba a mitad de una de sus
líneas — el síntoma exacto reportado: la misma línea con la mitad
superior en una página y la mitad inferior en la siguiente.

**La corrección:** ahora, cuando se decide empujar un bloque completo a
página nueva, el sistema lo marca explícitamente y, después de dibujar
lo que sí cabía antes de ese bloque, fuerza un salto de página real
(en vez de dejar que el hueco restante se rellene con el inicio del
bloque empujado).

**Verificación exhaustiva:**
1. Probé la lógica en aislado con los números exactos medidos del caso
   real (escala, alturas, posiciones) antes de tocar el navegador —
   confirmé matemáticamente que la tarjeta completa cae dentro de una
   sola página, sin que ningún corte la atraviese.
2. Regeneré el Mapa completo con el mismo caso exacto reportado (Código
   B, número 1) y confirmé que la tarjeta "SEÑALES DE QUE HABITAS TU
   ESENCIA DEL NÚMERO 1" —incluyendo el ítem "Inicias nuevos proyectos
   desde la claridad, no desde la urgencia"— aparece completa, una sola
   vez, sin dividirse entre dos páginas.
3. Recorrí el documento completo (35 páginas — el conteo subió de 32 a
   35 porque ahora se respetan más saltos de página reales en vez de
   aprovechar huecos) buscando el mismo patrón de línea duplicada/cortada
   en cualquier otro punto: no se encontró ninguno.
4. Confirmé que ninguna página quedó vacía por el cambio.

---

## Ronda 5 — position:relative (necesario pero no suficiente por sí solo)
**Archivo:** `app.js` → `buildExportRoot`

Sin `position: relative` en cada sección de exportación, la medición de
posición de líneas de texto podía saltarse esa sección y sumar también
la altura de secciones anteriores. Corregido, pero como se descubrió en
la Ronda 6, había un segundo bug independiente en el mecanismo de salto
de página que también debía corregirse para que el problema
desapareciera del todo.

---

## Ronda 4 — protección contra bloques más altos que una página
**Archivo:** `app.js` → `collectLineBreaks`, `findSafeCut` (versión inicial)

---

## Ronda 3 — causa raíz real del error de generación del PDF
**Archivo:** `app.js` → `resolveHex`, `calloutBgFor`, `THEME_HEX`,
`panelHero` actualizada
**Archivo:** `style.css` → `.block-callout`

`color-mix()` no es compatible con `html2canvas@1.4.1`. Solución: calcular
el color en JavaScript con `rgba()`. **Confirmado por Tere: el PDF ya abre
correctamente en iPhone, y el resaltado quedó correcto.**

---

## Ronda 2
### El texto de revelación clave no quedaba resaltado
**Archivo:** `app.js` → `findRevelationIndex`, `normalizeItems`

Detección por posición estructural, verificada contra las 42
combinaciones reales de código × número. **Confirmado por Tere: quedó
correcto.**

---

## Ronda 1
### Resaltado del bloque de revelación clave
**Archivo:** `style.css` → clase `.block-callout`

### PDF en blanco al abrir en iPhone/Safari
**Archivo:** `app.js` → `buildExportRoot`, `generatePdf`,
`renderSectionToPdf`, `captureSection`

Captura del Mapa sección por sección para no exceder el límite de área de
canvas de Safari/iOS. **Confirmado por Tere: quedó correcto.**
