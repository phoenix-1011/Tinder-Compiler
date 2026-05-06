import { app, BrowserWindow, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { registerIpcHandlers } from "./ipc.js";
import { registerTerminalHandlers } from "./terminal.js";
import { registerRunnerHandlers } from "./runner.js";
import { registerSearchHandlers } from "./search.js";
import { registerRecentHandlers } from "./recent.js";
import { registerLspHandlers } from "./lsp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: "#1e1e1e",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#3c3c3c",
      symbolColor: "#cccccc",
      height: 32
    },
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  window.on("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    await window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  registerTerminalHandlers();
  registerRunnerHandlers();
  registerSearchHandlers();
  registerRecentHandlers();
  registerLspHandlers();
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
