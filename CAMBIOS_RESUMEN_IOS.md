# Actualización — corrección específica para iPhone

## Aclaración sobre la ronda anterior
El paquete anterior asumía que el problema era de Android (por un
comportamiento distinto y conocido con archivos pesados). Con la
confirmación de que fue en iPhone, until identifiqué la causa real, que
es distinta.

## Qué pasa en iPhone específicamente
En Safari (y también en Chrome para iPhone, que usa el mismo motor),
el mecanismo que usa la app para generar la descarga del PDF no siempre
logra guardar un archivo real — en su lugar, el navegador suele abrir el
PDF directamente en una pestaña nueva, mostrando una dirección temporal
que empieza con "blob:" en la barra de direcciones, sin que ese archivo
quede guardado en el teléfono. Si se comparte desde ahí, se comparte esa
misma dirección temporal, que solo existe en ese Safari — de ahí el
error "not found" para quien lo recibe.

## Qué se hizo
Se detecta cuando el dispositivo es un iPhone o iPad, y en ese caso la
app abre el Mapa en una pestaña nueva (aprovechando el mismo
comportamiento que Safari ya tiene) pero además muestra un mensaje claro
explicando cómo guardarlo correctamente antes de compartirlo: usando el
botón "Compartir" de Safari y eligiendo "Guardar en Archivos". Una vez
guardado ahí, el archivo ya es real y se puede compartir por WhatsApp
sin ningún problema.

En computadora y en Android, todo sigue funcionando exactamente igual
que antes — este cambio solo afecta al flujo cuando se detecta un
iPhone o iPad.

## Una aclaración honesta e importante
A diferencia de los ajustes anteriores, esta vez no pude verificar el
resultado final con una prueba automatizada 100% concluyente — el
entorno de pruebas que uso no reproduce con exactitud el comportamiento
de Safari real en un iPhone físico en este punto específico (es una
limitación conocida y documentada de las herramientas de automatización
de navegadores con este tipo de ventanas). La técnica que implementé
está respaldada por buenas prácticas documentadas y ampliamente
utilizadas para este problema exacto, pero te pediría que la pruebes
directamente en un iPhone real antes de darla por resuelta — y si algo
sigue sin verse bien, que me digas exactamente qué aparece en pantalla
(como hiciste con el video, que fue clave para llegar hasta aquí).
