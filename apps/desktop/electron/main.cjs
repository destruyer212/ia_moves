const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";

let mainWindow = null;
let handLabWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#080b10",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
    },
  });

  mainWindow.loadURL(DEV_URL);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createHandLabWindow() {
  if (handLabWindow && !handLabWindow.isDestroyed()) {
    handLabWindow.focus();
    return handLabWindow;
  }

  const url = new URL(DEV_URL);
  url.searchParams.set("dedicated", "handlab");
  url.hash = "hand-lab";

  handLabWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#05080c",
    title: "IA Moves · Neural Field Lab",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
    },
  });

  handLabWindow.loadURL(url.toString());
  handLabWindow.on("closed", () => {
    handLabWindow = null;
  });

  return handLabWindow;
}

app.whenReady().then(() => {
  ipcMain.handle("open-hand-lab-window", () => {
    createHandLabWindow();
    return true;
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
