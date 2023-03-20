import { app, BrowserWindow } from "electron";
import * as path from "path";
export class uitools {
  static mainWindow: BrowserWindow = null;
  static createWindow() {
    this.mainWindow = new BrowserWindow({
      height: 600,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
      },
      width: 800,
    });
    this.mainWindow.loadFile(path.join(__dirname, "../index.html"));
    this.mainWindow.webContents.openDevTools();
    this.mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(message + " " +sourceId+" ("+line+")");
    });
  }
  static notifyStream(id: string, buffer: Buffer | string) {
    if (buffer == null) {
      this.mainWindow.webContents.executeJavaScript(`updateStream("${id}", null)`);
      return;
    }
    if (!Buffer.isBuffer(buffer)) {
      // buffer = utf8Encode.encode(buffer);
      buffer = Buffer.from(buffer + "\n");
    }
    this.mainWindow.webContents.executeJavaScript(`updateStream("${id}", ${JSON.stringify(buffer)})`);
  }
  static notifyServerStatus(status: string, user: any, hostname: string) {
    this.log(`notifyServerStatus ${status}`);
    this.mainWindow.webContents.executeJavaScript(`updateServerStatus("${status}", ${JSON.stringify(user)}, "${hostname}")`);
  }
  static notifyPackages(packages: any) {
    this.mainWindow.webContents.executeJavaScript(`updatePackages('${JSON.stringify(packages)}')`);
  }
  static notifyConfig(config: any) {
    this.mainWindow.webContents.executeJavaScript(`updateConfig('${JSON.stringify(config)}')`);
  }
  static updateErrorStatus(message: string) {
    this.mainWindow.webContents.executeJavaScript(`updateErrorStatus('${message}')`);
  }
  
  static log(message: Buffer | string) {
    let buffer = message;
    if (this.mainWindow == null) return;
    if (this.mainWindow.webContents == null) return;
    if (!Buffer.isBuffer(message)) {
      // buffer = utf8Encode.encode(buffer);
      buffer = Buffer.from(message);
    }
    this.mainWindow.webContents.executeJavaScript(`processlog(${JSON.stringify(buffer)})`);
  }
  static setTitle(title: string) {
    this.mainWindow.setTitle(title);
  }
}
