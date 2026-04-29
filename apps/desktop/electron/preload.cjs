const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("iaMoves", {
  version: "0.1.0",
});

