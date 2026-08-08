# Resumen — PDF "not found" al compartir por WhatsApp

## Lo que vimos en tu video
Al compartir el PDF descargado por WhatsApp, el mensaje mostraba el
nombre del archivo seguido de una dirección que empieza con "blob:" en
vez de comportarse como un archivo adjunto normal. Cuando la otra
persona lo abre, sale "404: NOT_FOUND".

## Qué es exactamente
Un "blob" es una forma en que el navegador guarda un archivo generado
al momento (como tu Mapa) en su memoria temporal — no es todavía un
archivo real guardado en el teléfono. En computadoras y en la mayoría de
los casos esto funciona sin problema, pero en ciertos teléfonos Android,
cuando el archivo es grande, el sistema de Android no logra "convertir"
ese blob en un archivo real guardado — y cuando WhatsApp intenta
compartirlo, en vez de mandar el archivo, termina mandando esa
referencia temporal, que solo tiene sentido en el navegador donde se
generó. Por eso la otra persona ve un error 404: no está intentando
abrir tu Mapa, está intentando abrir un enlace que ya no existe para
ella.

## Qué se hizo
El tamaño del documento influye directamente en qué tan probable es que
esto pase — entre más pesado el archivo, más probabilidades de que
Android falle al guardarlo. El Mapa se generaba con imágenes de alta
resolución, pesando entre 10 y 16 MB según el contenido. Se ajustó la
resolución y calidad de esas imágenes a un punto donde el texto sigue
viéndose igual de nítido, pero el archivo ahora pesa alrededor de 4 a 5
MB — menos de un tercio de antes. Esto reduce mucho la probabilidad de
que vuelva a pasar.

También se agregó una nota breve justo debajo del botón de descarga,
sugiriendo a la clienta que abra el PDF desde la carpeta de Descargas de
su teléfono antes de compartirlo por WhatsApp — abrirlo primero desde
ahí evita este problema casi siempre, sin importar el tamaño del
archivo.

## Una aclaración honesta
Esta reducción de tamaño baja mucho el riesgo, pero el comportamiento
exacto depende del modelo de teléfono, la versión de Android, y la
versión de Chrome de cada clienta — factores fuera del control del
código. No es algo que se pueda garantizar al 100% desde la app, por
eso la nota de "ábrelo primero desde Descargas" es la protección
complementaria: es el paso que, cuando se sigue, evita el problema casi
siempre.
