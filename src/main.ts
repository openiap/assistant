import { openiap, config, QueueEvent } from "@openiap/nodeapi";
import { app, BrowserWindow, ipcMain } from "electron";
import { Stream } from 'stream';
import { uitools } from "./uitools"
import { runner, packagemanager, agenttools } from "@openiap/nodeagent";
// import { runner  } from "./runner";
// import { packages } from "./packages"
import * as os from "os"
import * as path from "path";
import * as fs from "fs"
process.env.log_with_colors = "false"
const client: openiap = new openiap()
client.agent = "assistent"
var myproject = require(path.join(__dirname, "..", "package.json"));
client.version = myproject.version;
let localqueue = "";
let agentid = process.env.agentid;
var languages = ["nodejs"];
var assistentConfig: any = { "apiurl": "wss://app.openiap.io/ws/v2", jwt: "", agentid: "" };
function reloadAndParseConfig() {
  if (fs.existsSync(path.join(os.homedir(), ".openiap", "config.json"))) {
    assistentConfig = require(path.join(os.homedir(), ".openiap", "config.json"));
    process.env["NODE_ENV"] = "production";
    if (assistentConfig.apiurl) {
      process.env["apiurl"] = assistentConfig.apiurl;
      client.url = assistentConfig.apiurl;
    }
    if (assistentConfig.jwt) {
      process.env["jwt"] = assistentConfig.jwt;
      client.jwt = assistentConfig.jwt;
    }
    if (assistentConfig.agentid != null && assistentConfig.agentid != "") {
      agentid = assistentConfig.agentid;
    }
  }
}
function init() {
  // var client = new openiap();
  config.doDumpStack = true
  reloadAndParseConfig();
  try {
    var pypath = runner.findPythonPath();
    if (pypath != null && pypath != "") {
      languages.push("python");
    }
  } catch (error) {

  }
  try {
    var pypath = runner.findDotnetPath();
    if (pypath != null && pypath != "") {
      languages.push("dotnet");
    }
  } catch (error) {

  }

  client.onConnected = onConnected
  client.onDisconnected = onDisconnected
  uitools.notifyServerStatus('connecting', null, "");
  client.connect();
}
async function onQueueMessage(msg: QueueEvent, payload: any, user: any, jwt: string) {
  uitools.log("onQueueMessage");
  uitools.log(payload);
  if (user == null || jwt == null || jwt == "") {
    return { "command": "error", error: "not authenticated" };
  }
  if (payload.command == "start") {
    var packagepath = packagemanager.getpackagepath(path.join(os.homedir(), ".openiap", "packages", payload.packageid));
    if (packagepath == "") {
      uitools.log("package not found");
      return { "command": "error", error: "package not found" };
    }

    var scriptpath = packagemanager.getscriptpath(packagepath);
    if (scriptpath == "") {
      uitools.log("script not found");
      return { "command": "error", error: "script not found" };
    }
    const streamid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    var pythonpath = runner.findPythonPath();
    if (pythonpath != null) {
      await runner.pipinstall(packagepath, streamid, pythonpath);
    }
    await runner.npminstall(packagepath, streamid);
    await runner.runit(packagepath, streamid, scriptpath, true);
  }
}
async function reloadpackages() {
  var _packages = await client.Query<any>({ query: { "_type": "package", "language": { "$in": languages } }, collectionname: "agents" });
  if (_packages != null) {
    for (var i = 0; i < _packages.length; i++) {
      try {
        if (fs.existsSync(path.join(packagemanager.packagefolder, _packages[i]._id))) continue;
        if (_packages[i].fileid != null && _packages[i].fileid != "") {
          await packagemanager.getpackage(client, _packages[i].fileid, _packages[i]._id);
        }
      } catch (error) {
        console.error(error);
      }
    }
    uitools.notifyPackages(_packages);
  }
}
async function RegisterAgent() {
  try {
    var u = new URL(client.url);
    var data = JSON.stringify({ hostname: os.hostname(), os: os.platform(), arch: os.arch(), username: os.userInfo().username, version: app.getVersion(), "languages": languages, "chrome": true, "chromium": true, "maxpackages": 50 })
    var res: any = await client.CustomCommand({
      id: agentid, command: "registeragent",
      data
    });
    if (res != null) res = JSON.parse(res);
    if (res != null && res.slug != "" && res._id != null && res._id != "") {
      localqueue = await client.RegisterQueue({ queuename: res.slug }, onQueueMessage);
        agentid = res._id
        var config = require(path.join(os.homedir(), ".openiap", "config.json"));
        config.agentid = agentid
        if(res.jwt != null && res.jwt != "") {
          config.jwt = res.jwt
          process.env.jwt = res.jwt
        }  
        fs.writeFileSync(path.join(os.homedir(), ".openiap", "config.json"), JSON.stringify(config));
    }
    if (res.jwt != null && res.jwt != "") {
      await client.Signin({ jwt: res.jwt });
      uitools.notifyServerStatus('connected', client.client.user, u.hostname);
    }
    reloadAndParseConfig();
  } catch (error) {
    uitools.updateErrorStatus("Error: " + error.message)
    uitools.notifyServerStatus('disconnected', null, "");
    process.env["apiurl"] = "";
    process.env["jwt"] = "";
    try {
      client.Close();
    } catch (error) {      
    }
  }
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
    await RegisterAgent()
    await reloadpackages()
    var watchid = await client.Watch({ paths: [], collectionname: "agents" }, async (operation: string, document: any) => {
      try {
        if (document._type == "package") {
          if(operation == "insert") {
            console.log("package " + document.name + " inserted, reload packages");
            await reloadpackages()
          } else if(operation == "replace") {
            console.log("package " + document.name + " updated, delete and reload");
            packagemanager.removepackage(document._id);
            await packagemanager.getpackage(client, document.fileid, document._id);
          } else if (operation == "delete") {
            console.log("package " + document.name + " deleted, cleanup after package");
            packagemanager.removepackage(document._id);
          }
        } else if (document._type == "agent") {
          if(document._id == agentid)  {
            console.log("agent changed, reload config");
            await RegisterAgent()
          } else {
            console.log("Another agent was changed, do nothing");
          }        
        } else {
          console.log("unknown type " + document._type + " changed, do nothing");
        }
      } catch (error) {
        console.error(error);
      }
    });
    console.log("watch registered with id", watchid);
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
async function onDisconnected(client: openiap) {
  uitools.log('disconnected');
  uitools.notifyServerStatus('disconnected', null, "");
};
app.whenReady().then(() => {
  uitools.createWindow();
  init();
  uitools.notifyConfig(assistentConfig);
  ipcMain.handle('ping', (sender) => {
    return 'pong';
  });
  ipcMain.handle('clear-cache', async (sender) => {
    if (runner.streams.length > 0) throw new Error("Cannot clear cache while streams are running");
    packagemanager.deleteDirectoryRecursiveSync(packagemanager.packagefolder);
    reloadpackages()
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
          assistentConfig = { apiurl: client.url, jwt: client.jwt }
          if (fs.existsSync(path.join(os.homedir(), ".openiap", "config.json"))) {
            assistentConfig = require(path.join(os.homedir(), ".openiap", "config.json"));
            assistentConfig.apiurl = client.url;
            assistentConfig.jwt = client.jwt;
          }
          if (!fs.existsSync(path.join(os.homedir(), ".openiap"))) fs.mkdirSync(path.join(os.homedir(), ".openiap"));
          fs.writeFileSync(path.join(os.homedir(), ".openiap", "config.json"), JSON.stringify(assistentConfig));
          if (client.connected) client.Close();
          uitools.notifyConfig(assistentConfig);
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
  ipcMain.handle('stop-package', async (sender, streamid) => {
    uitools.log('stop package ' + streamid);
    runner.kill(streamid);
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
    runner.addstream(streamid, stream);
    await packagemanager.runpackage(id, streamid, false);
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

