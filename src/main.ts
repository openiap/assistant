import { openiap, config, QueueEvent } from "@openiap/nodeapi";
import { app, BrowserWindow, ipcMain } from "electron";
import { Stream } from 'stream';
import { uitools } from "./uitools"
import { agent, runner, packagemanager, agenttools } from "@openiap/nodeagent";
const util = require('util');
const { spawn } = require('child_process');
import * as os from "os"
import * as path from "path";
import * as fs from "fs"
import * as cron from "node-cron";

const exec = util.promisify(require('child_process').exec);
const appName = 'assistant';
var apppath = app.getAppPath();
if(process.env.APPIMAGE != null && process.env.APPIMAGE != "") {
  apppath = process.env.APPIMAGE;
} else {
  if(app.isPackaged) {
    apppath = app.getPath('exe');
  } else {
    apppath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron') + " " + __filename;
  } 
}

function log(message: string) {
  console.log(message);
}
function enableAutoLaunch() {
  switch (os.platform()) {
    case 'linux':
      const linuxDesktopEntry = `[Desktop Entry]
Type=Application
Exec=${apppath}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name[en_US]=${appName}
Name=${appName}
Comment[en_US]=${appName} auto-launch
Comment=${appName} auto-launch`;

      const linuxAutostartDir = path.join(os.homedir(), '.config', 'autostart');
      if (!fs.existsSync(linuxAutostartDir)) {
        fs.mkdirSync(linuxAutostartDir, { recursive: true });
      }
      fs.writeFileSync(path.join(linuxAutostartDir, `${appName}.desktop`), linuxDesktopEntry);
      break;

    case 'darwin':
    case 'win32':
      app.setLoginItemSettings({
        openAtLogin: true,
      });
      break;

    default:
      console.error('Auto-launch not supported on this platform');
  }
}

function disableAutoLaunch() {
  switch (os.platform()) {
    case 'linux':
      const linuxAutostartFile = path.join(os.homedir(), '.config', 'autostart', `${appName}.desktop`);
      if (fs.existsSync(linuxAutostartFile)) {
        fs.unlinkSync(linuxAutostartFile);
      }
      break;

    case 'darwin':
    case 'win32':
      app.setLoginItemSettings({
        openAtLogin: false,
      });
      break;

    default:
      console.error('Auto-launch not supported on this platform');
  }
}

function isAutoLaunchEnabled() {
  return new Promise<boolean>((resolve, reject) => {
    switch (os.platform()) {
      case 'linux':
        const linuxAutostartFile = path.join(os.homedir(), '.config', 'autostart', `${appName}.desktop`);
        fs.access(linuxAutostartFile, fs.constants.F_OK, (err) => {
          if (err) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
        break;

      case 'darwin':
      case 'win32':
        const isEnabled = app.getLoginItemSettings().openAtLogin;
        resolve(isEnabled);
        break;

      default:
        reject(new Error('Auto-launch not supported on this platform'));
    }
  });
}

async function getUserPath() {
  try {
    // Get the user's PATH environment variable by running `echo $PATH` in a shell
    const { stdout } = await exec('echo $PATH');

    // Parse the output of `echo $PATH` to extract the PATH value
    // const path = stdout.trim().split(':')[1];
    const paths = stdout.trim().split(':');
    if (paths.indexOf('/opt/homebrew/bin') == -1) paths.push('/opt/homebrew/bin');
    if (paths.indexOf('/opt/homebrew/sbin') == -1) paths.push('/opt/homebrew/sbin');
    if (paths.indexOf('/usr/local/bin') == -1) paths.push('/usr/local/bin');
    if (paths.indexOf('/System/Cryptexes/App/usr/bin') == -1) paths.push('/System/Cryptexes/App/usr/bin');
    if (paths.indexOf('/usr/bin') == -1) paths.push('/usr/bin');
    if (paths.indexOf('/bin') == -1) paths.push('/bin');
    if (paths.indexOf('/usr/sbin') == -1) paths.push('/usr/sbin');
    if (paths.indexOf('/sbin') == -1) paths.push('/sbin');


    return paths.join(":");
  } catch (err) {
    console.error('Failed to get user PATH:', err);
    return null;
  }
}

// import { runner  } from "./runner";
// import { packages } from "./packages"
process.env.log_with_colors = "false"
process.on('SIGINT', () => { process.exit(0) })
process.on('SIGTERM', () => { process.exit(0) })
process.on('SIGQUIT', () => { process.exit(0) })

const client: openiap = new openiap()
client.agent = "assistant"
agent.exitonfailedschedule = false;
var myproject = require(path.join(__dirname, "..", "package.json"));
client.version = myproject.version;
async function init() {
  config.doDumpStack = true
  client.onConnected = onConnected
  client.onDisconnected = onDisconnected
  uitools.notifyServerStatus('connecting', null, "");
  // agent.on("runit", ( streamid, command, parameters, cwd, env) => {
  // });
  agent.on("streamadded", ( stream:any ) => {
    var packages = packagemanager.packages
    uitools.notifyPackages(packages);
    uitools.remoteRunPackage(stream.packageid, stream.id)
    //uitools.notifyStream(stream.id, stream.packageid);
  });
  agent.on("stream", ( stream:any, message: Buffer) => {
    uitools.notifyStream(stream.id, message);
  });
  await agent.init(client)
  client.connect();

}
async function onConnected(client: openiap) {
  var u = new URL(client.url);
  try {
    uitools.log('connected');
    uitools.setTitle("OpenIAP Agent - " + u.hostname)
    if (client.client != null && client.client.user != null) {
      uitools.notifyServerStatus('connected', client.client.user, u.hostname);
    } else {
      uitools.log('connected, but not signed in, close connection again');
      uitools.notifyServerStatus('disconnected', null, "");
      return client.Close();
    }
    process.env.apiurl = client.url;
    const packages = await agent.reloadpackages(false)
    uitools.notifyPackages(packages);

    reconnecttime = 500;
  } catch (error) {
    uitools.log(JSON.stringify(error))
    var message = error.message.split("\"").join("");
    uitools.notifyServerStatus("onConnected error: " + message, client?.client?.user, u.hostname);
    uitools.notifyServerStatus('disconnected', null, "");
    try {
      client.Close();
    } catch (error) {
    }
  }
};
let reconnecttime = 500;
async function onDisconnected(client: openiap) {
  uitools.log('disconnected');
  uitools.notifyServerStatus('disconnected', null, "");
  reconnecttime = reconnecttime + 500;
  console.log("disconnected, reconnect in " + reconnecttime + "ms");
  // setTimeout(() => { client.connect(); }, reconnecttime);
};
app.whenReady().then(async () => {
  uitools.createWindow();
  await init();
  if(process.platform != "win32") {
    process.env.PATH = await getUserPath()
  }
  uitools.notifyConfig(agent.assistantConfig);
  var isEnabled = await isAutoLaunchEnabled();
  uitools.SetAutoLaunchState(isEnabled);
  
  ipcMain.handle('ping', (sender) => {
    return 'pong';
  });
  ipcMain.handle('clear-cache', async (sender) => {
    // if (runner.streams.length > 0) throw new Error("Cannot clear cache while streams are running");
    // packagemanager.deleteDirectoryRecursiveSync(packagemanager.packagefolder);
    // 
    uitools.notifyPackages([]);
    const packages = await agent.reloadpackages(true)
    uitools.notifyPackages(packages);
    for(let i = 0; i < runner.streams.length; i++) {
      const s = runner.streams[i];
      uitools.remoteRunPackage(s.packageid, s.id)
      uitools.notifyStream(s.id, s.buffer);
    }
  });
  ipcMain.handle('signout', async (sender) => {
    if (runner.streams.length > 0) throw new Error("Cannot logout while streams are running");
    packagemanager.deleteDirectoryRecursiveSync(packagemanager.packagefolder);
    client.Close();
    client.jwt = "";
    if (fs.existsSync(path.join(os.homedir(), ".openiap", "config.json"))) {
      var config = require(path.join(os.homedir(), ".openiap", "config.json"));
      config.jwt = ""
      fs.writeFileSync(path.join(os.homedir(), ".openiap", "config.json"), JSON.stringify(config));
    }
    uitools.notifyServerStatus('disconnected', null, "");
  });
  ipcMain.handle('setup-connect', async (sender, url) => {
    var tokenkey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    var u: URL = new URL(url);
    var host = u.host;
    if (host.startsWith("grpc.")) host = host.substring(5);
    var addtokenurl = u.protocol + "//" + host + "/AddTokenRequest";
    var gettokenurl = u.protocol + "//" + host + "/GetTokenRequest?key=" + tokenkey;
    var signinurl = u.protocol + "//" + host + "/login?key=" + tokenkey;
    var result = await agenttools.post(null, null, addtokenurl, JSON.stringify({ key: tokenkey }));
    var res = JSON.parse(result)
    const id = setInterval(async () => {
      var result = await agenttools.get(gettokenurl);
      var res = JSON.parse(result)
      if (res.jwt != "" && res.jwt != null) {
        try {
          clearInterval(id);
          client.jwt = res.jwt;
          process.env["jwt"] = res.jwt;
          if (u.protocol == "https:") {
            client.url = "wss://" + host + "/ws/v2";
          } else {
            client.url = "ws://" + host + "/ws/v2";
          }
          agent.assistantConfig = { apiurl: client.url, jwt: client.jwt }
          if (fs.existsSync(path.join(os.homedir(), ".openiap", "config.json"))) {
            agent.assistantConfig = require(path.join(os.homedir(), ".openiap", "config.json"));
            agent.assistantConfig.apiurl = client.url;
            agent.assistantConfig.jwt = client.jwt;
          }
          if (!fs.existsSync(path.join(os.homedir(), ".openiap"))) fs.mkdirSync(path.join(os.homedir(), ".openiap"));
          fs.writeFileSync(path.join(os.homedir(), ".openiap", "config.json"), JSON.stringify(agent.assistantConfig));
          if (client.connected) client.Close();
          uitools.notifyConfig(agent.assistantConfig);
          uitools.notifyServerStatus('connecting', null, u.hostname);
          client.connect();
        } catch (error) {
          console.error(error);
        }
      }
    }, 1000);
    require('electron').shell.openExternal(signinurl);
    return signinurl;
  });
  ipcMain.handle('python-version', async (sender) => {
    if (agent.languages.indexOf("python") == -1) return "";
    // get major and monor version
    var result = await runner.runpythoncode("import sys;print(f\"{sys.version_info.major}.{sys.version_info.minor}\");");
    result = result.replace("\r", "").replace("\n", "");
    return result
  });
  ipcMain.handle('enable-auto-launch', async (sender) => {
    await enableAutoLaunch();
  });
  ipcMain.handle('disable-auto-launch', async (sender) => {
    await disableAutoLaunch();
  });
  


  ipcMain.handle('stop-package', async (sender, streamid) => {
    uitools.log('stop package ' + streamid);
    runner.kill(client, streamid);
  });
  ipcMain.handle('run-package', async (sender, id, streamid) => {
    var stream = new Stream.Readable({
      read(size) { }
    });
    stream.on('data', (data) => {
      uitools.notifyStream(streamid, data);
    });
    stream.on('end', () => {
      uitools.notifyStream(streamid, null);
    });
    await packagemanager.runpackage(client, id, streamid, [], stream, false);
  });
  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) uitools.createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

async function localrun(packageid: string, env: any, schedule: any) {
  // uitools.notifyStream(streamid, data);

  // uitools.remoteRunPackage(payload.id, streamid)
  // await packagemanager.runpackage(client, payload.id, streamid, streamqueue, stream, true, env);
  
  try {
    const streamid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    let stream = new Stream.Readable({
      read(size) { }
    });
    let buffer = "";
    stream.on('data', async (data) => {
      uitools.notifyStream(streamid, data);
    });
    stream.on('end', async () => {
      uitools.notifyStream(streamid, null);
    });
     // log("run package " + packageid);
     uitools.remoteRunPackage(packageid, streamid)
    await packagemanager.runpackage(client, packageid, streamid, [], stream, true, env, schedule);
    log("run complete");
  } catch (error) {
    console.error(error);
    // process.exit(1);
  }
}