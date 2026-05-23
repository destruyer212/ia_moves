# Gestos iniciales

Estos gestos son el set recomendado para el MVP. Son simples y reducen falsos positivos.

| Gesto | Intencion | Accion inicial |
| --- | --- | --- |
| `open_palm` | Lanzador | Abre menu Inicio |
| `fist` | Escritorio | Alterna mostrar escritorio |
| `point` | Click | Ejecuta click |
| `thumb_up` | Confirmar | Ejecuta accion pendiente |
| `victory` | Programar | Abre VS Code |
| `swipe_left` | Navegacion | Ventana anterior |
| `swipe_right` | Navegacion | Ventana siguiente |

## Acciones PC disponibles

- `open_start`: abre el menu Inicio.
- `open_vscode`: abre VS Code.
- `open_terminal`: abre Windows Terminal.
- `next_window`: cambia a la siguiente ventana.
- `previous_window`: cambia a la ventana anterior.
- `show_desktop`: alterna mostrar escritorio.
- `click`: click del mouse.
- `escape`: envia Escape.

## Reglas de seguridad

- Ningun gesto debe borrar archivos.
- Ningun gesto debe ejecutar comandos libres.
- Toda accion peligrosa requiere confirmacion por voz o UI.
- El sistema debe tener siempre un gesto o tecla de pausa.
