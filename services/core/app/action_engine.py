import subprocess

import pyautogui

from .control_state import control_state
from .models import ActionResult


class ActionEngine:
    def __init__(self) -> None:
        self.enabled = True
        self._allowed_actions = {
            "toggle_listening": self._toggle_listening,
            "open_ai_panel": self._open_ai_panel,
            "confirm": self._confirm,
            "previous_window": self._previous_window,
            "next_window": self._next_window,
            "open_start": self._open_start,
            "open_vscode": self._open_vscode,
            "open_terminal": self._open_terminal,
            "show_desktop": self._show_desktop,
            "click": self._click,
            "escape": self._escape,
            "toggle_mouse_mode": self._toggle_mouse_mode,
            "commands_mode": self._commands_mode,
            "mouse_mode": self._mouse_mode,
        }

    @property
    def allowed_actions(self) -> list[str]:
        return sorted(self._allowed_actions)

    def run(self, action: str) -> ActionResult:
        handler = self._allowed_actions.get(action)
        if handler is None:
            return ActionResult(action=action, ok=False, message="Accion no permitida.")
        return handler()

    def _toggle_listening(self) -> ActionResult:
        self.enabled = not self.enabled
        state = "activo" if self.enabled else "pausado"
        return ActionResult(action="toggle_listening", ok=True, message=f"Modo escucha {state}.")

    def _open_ai_panel(self) -> ActionResult:
        return ActionResult(action="open_ai_panel", ok=True, message="Panel IA enfocado.")

    def _confirm(self) -> ActionResult:
        return ActionResult(action="confirm", ok=True, message="Confirmacion recibida.")

    def _previous_window(self) -> ActionResult:
        pyautogui.hotkey("alt", "shift", "tab")
        return ActionResult(action="previous_window", ok=True, message="Ventana anterior.")

    def _next_window(self) -> ActionResult:
        pyautogui.hotkey("alt", "tab")
        return ActionResult(action="next_window", ok=True, message="Ventana siguiente.")

    def _open_start(self) -> ActionResult:
        pyautogui.press("win")
        return ActionResult(action="open_start", ok=True, message="Menu Inicio abierto.")

    def _open_vscode(self) -> ActionResult:
        return self._open_process("code", "open_vscode", "VS Code abierto o solicitado.")

    def _open_terminal(self) -> ActionResult:
        return self._open_process("wt", "open_terminal", "Terminal abierto o solicitado.")

    def _show_desktop(self) -> ActionResult:
        pyautogui.hotkey("win", "d")
        return ActionResult(action="show_desktop", ok=True, message="Escritorio alternado.")

    def _click(self) -> ActionResult:
        pyautogui.click()
        return ActionResult(action="click", ok=True, message="Click ejecutado.")

    def _escape(self) -> ActionResult:
        pyautogui.press("esc")
        return ActionResult(action="escape", ok=True, message="Escape enviado.")

    def _toggle_mouse_mode(self) -> ActionResult:
        snapshot = control_state.toggle_mouse()
        return ActionResult(action="toggle_mouse_mode", ok=True, message=f"Modo {snapshot.mode}.")

    def _commands_mode(self) -> ActionResult:
        control_state.set_mode("commands")
        return ActionResult(action="commands_mode", ok=True, message="Modo comandos activo.")

    def _mouse_mode(self) -> ActionResult:
        control_state.set_mode("mouse")
        return ActionResult(action="mouse_mode", ok=True, message="Modo mouse activo.")

    def _open_process(self, command: str, action: str, message: str) -> ActionResult:
        try:
            subprocess.Popen([command], shell=True)
        except Exception as exc:
            return ActionResult(action=action, ok=False, message=f"No pude abrir {command}: {exc}")
        return ActionResult(action=action, ok=True, message=message)


action_engine = ActionEngine()
