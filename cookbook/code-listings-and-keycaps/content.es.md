---
title: "La terminal, con calma"
subtitle: "Guía de bolsillo de la línea de comandos"
author: "Tove Ahlberg"
---

# Piezas que encajan {kicker="Capítulo 4" lead="Cómo la tubería encadena programas sencillos para hacerle preguntas a una carpeta."}

Cada programa de este capítulo hace una sola cosa. `ls` muestra los nombres de una carpeta, `grep` se queda con las líneas que coinciden con un patrón, `sort` las ordena y `du` dice cuánto ocupa un archivo en el disco. La tubería, el carácter `|`, pasa lo que imprime un programa al siguiente, de modo que puedes encadenarlos en una sola línea y leer la respuesta al final.

:::callout{type="aside" title="El indicador"}
En un Mac, zsh muestra `%` en vez de `$`.
:::

Pruébalo en una carpeta de fotos. En los listados, las líneas que empiezan por el signo del dólar son las que escribes tú, sin el dólar, y ejecutas con :chip[Intro]{style="key"}. Ese signo es el indicador, que el intérprete de órdenes (la *shell*) muestra cuando te espera. Las de debajo son su respuesta.

```console Terminal
$ cd ~/fotos/2025
$ ls | grep -c 'JPG$'
268
$ ls | grep -v 'JPG$'
IMG_0413.MOV
IMG_0977.MOV
IMG_1502.PNG
$ du -sh *.MOV | sort -rh
812M    IMG_0977.MOV
455M    IMG_0413.MOV
```

:::paragraphs{style="resume"}
`grep -c` cuenta las líneas que coinciden sin imprimirlas, y `-v` se queda con las demás. Las comillas simples entregan el patrón a `grep` tal cual; en él, `$` marca el final de la línea. El asterisco de la última orden lo expande el intérprete: antes de que `du` arranque, `*.MOV` ya se ha convertido en la lista de los archivos `.MOV`.
:::

:::callout{type="aside" title="En un Mac"}
:chip[Ctrl]{style="key"} es :chip[control]{style="key"}

:chip[Intro]{style="key"} es :chip[retorno]{style="key"}

Los atajos usan :chip[control]{style="key"}, no :chip[comando]{style="key"}.
:::

## Cuando una orden no termina

Tarde o temprano lanzarás una orden que no acaba. Si escribes `grep JPG` sin ningún archivo detrás, `grep` se queda esperando a que teclees las líneas en las que debe buscar. Para detenerla, mantén :chip[Ctrl]{style="key"} y pulsa :chip[C]{style="key"}; vuelve el indicador y no ha cambiado nada. Para cerrar la entrada como es debido, pulsa :chip[Ctrl]{style="key"} :chip[D]{style="key"} al principio de una línea vacía; `grep` lo entiende como el final de la entrada. :chip[Ctrl]{style="key"} :chip[C]{style="key"} también detiene un `ping`, que, si no, escribiría una línea por segundo hasta que cerraras la ventana.

El intérprete también te ahorra teclear. Pulsa :chip[Tab]{style="key"} después de las primeras letras del nombre de un archivo o una carpeta y el intérprete completa el resto; si encajan varios nombres, te los enseña (bash espera a un segundo :chip[Tab]{style="key"}). :chip[↑]{style="key"} recupera la última orden, y cada pulsación retrocede una más, así que una tubería con una errata se corrige en vez de volver a escribirse.

1. Escribe `cd ~/fo` y pulsa :chip[Tab]{style="key"} para completar el nombre de la carpeta, `fotos/`; luego añade `2025` y pulsa :chip[Intro]{style="key"}.
2. Pulsa :chip[↑]{style="key"} hasta que vuelva a la línea `ls | grep -v 'JPG$'`.
3. Mantén :chip[Ctrl]{style="key"} y pulsa :chip[A]{style="key"} para saltar al principio de la línea; luego :chip[Ctrl]{style="key"} :chip[E]{style="key"} te devuelve al final.
4. Añade `| sort -r` y pulsa :chip[Intro]{style="key"}. Los mismos nombres salen en orden inverso.

:::callout{type="sheet" title="Chuleta · bash y zsh"}
:::columns{count=2 breaks="8"}
**En la línea**

:chip[Ctrl]{style="key"} :chip[A]{style="key"} al principio de la línea

:chip[Ctrl]{style="key"} :chip[E]{style="key"} al final de la línea

:chip[Ctrl]{style="key"} :chip[W]{style="key"} corta la palabra anterior

:chip[Ctrl]{style="key"} :chip[K]{style="key"} corta hasta el final

:chip[Ctrl]{style="key"} :chip[Y]{style="key"} pega lo que cortaste

:chip[Ctrl]{style="key"} :chip[T]{style="key"} cambia dos letras de sitio

**Órdenes e historial**

:chip[Ctrl]{style="key"} :chip[R]{style="key"} busca en órdenes anteriores

:chip[Ctrl]{style="key"} :chip[P]{style="key"} la orden anterior

:chip[Ctrl]{style="key"} :chip[C]{style="key"} detiene la orden en curso

:chip[Ctrl]{style="key"} :chip[Z]{style="key"} la suspende; `fg` la reanuda

:chip[Ctrl]{style="key"} :chip[L]{style="key"} limpia la pantalla

:chip[Ctrl]{style="key"} :chip[D]{style="key"} cierra la sesión (línea vacía)
:::
:::

## Un guion para guardar

Las órdenes que escribes cada semana merecen un archivo. Este copia cada carpeta de `~/trabajo` en un disco externo, dentro de una carpeta nueva con la fecha del día. Guárdalo como `copia.sh` en tu carpeta personal.

```bash copia.sh
#!/usr/bin/env bash
# Copia cada carpeta de ~/trabajo en el disco, bajo la fecha de hoy.
set -euo pipefail

src="$HOME/trabajo"
dest="/Volumes/Copias/$(date +%F)"

mkdir -p "$dest"
for dir in "$src"/*/; do
  name=$(basename "$dir")
  rsync -a "$dir" "$dest/$name/"
  echo "copiada: $name"
done
```

:::callout{type="aside" title="Modo archivo"}
`rsync -a` copia también las subcarpetas y conserva las fechas y los permisos de cada archivo.
:::

:::paragraphs{style="resume"}
La primera línea, el *shebang*, indica con qué programa se ejecuta el archivo. `set -euo pipefail` detiene el guion en la primera orden que falla, así que nunca sigue adelante con media copia. `$(date +%F)` ejecuta `date` y coloca lo que imprime, por ejemplo 2026-09-26, dentro de la ruta. Las comillas alrededor de cada variable mantienen entera una carpeta llamada Declaración de la renta; sin ellas, el intérprete partiría el nombre por los espacios y `rsync` buscaría cuatro carpetas que no existen.
:::

Haz el archivo ejecutable con `chmod +x copia.sh`, una sola vez, y lánzalo con `./copia.sh`. En Linux, un disco externo suele aparecer dentro de `/media`, en una carpeta con tu nombre de usuario, así que cambia la línea de `dest` para que coincida.

:::callout{type="colophon"}
*La terminal, con calma* es un libro inventado para el Recetario de Postext. Compuesto en Charis SIL, Sora y JetBrains Mono (SIL OFL). Texto: original, CC BY 4.0.
:::

El capítulo 5 lleva `grep` a `/var/log`, la carpeta de los registros del sistema, donde una tubería de tres órdenes cuenta cuántos errores se anotaron cada día de la última semana.
