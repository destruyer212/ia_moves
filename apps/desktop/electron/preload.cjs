const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("iaMoves", {
  version: "0.1.0",
  openHandLabWindow: () => ipcRenderer.invoke("open-hand-lab-window"),
});
