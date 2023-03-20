import { openiap, config, QueueEvent } from "@openiap/nodeapi";
import { app, BrowserWindow, ipcMain } from "electron";
import { Stream } from 'stream';
import { uitools } from "./uitools"
import { runner, packagemanager } from "@openiap/nodeagent";
// import { runner  } from "./runner";
// import { packages } from "./packages"
import * as os from "os"
import * as path from "path";
import * as fs from "fs"
import * as http from "http"
import * as https from "https"
const client: openiap = new openiap()
let localqueue = "";
let agentid = process.env.agentid;
var languages = ["nodejs"];
var assistentConfig: any = { "apiurl": "wss://app.openiap.io", jwt: "", agentid: "" };
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
function get(url: string) {
  return new Promise<string>((resolve, reject) => {
    var provider = http;
    if (url.startsWith("https")) {
      // @ts-ignore
      provider = https;
    }
    provider.get(url, (resp: any) => {
      let data = "";
      resp.on("data", (chunk: any) => {
        data += chunk;
      });
      resp.on("end", () => {
        resolve(data);
      });
    }).on("error", (err: any) => {
      reject(err);
    });
  })
}
function post(jwt: string, agent: any, url: string, body: any) {
  return new Promise<string>((resolve, reject) => {
    try {
      var provider = http;
      var u = new URL(url);
      var options = {
        rejectUnauthorized: false,
        agent: agent,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      };
      if (agent == null) {
        delete options.agent;
      }
      if (jwt != null && jwt != "") {
        // @ts-ignore
        options.headers["Authorization"] = "Bearer " + jwt;
      }
      if (url.startsWith("https")) {
        delete options.agent;
        // @ts-ignore
        provider = https;
      }
      var req = provider.request(url, options, (res: any) => {
        var o = options;
        var b = body;
        res.setEncoding("utf8");
        if (res.statusCode != 200) {
          return reject(new Error("HTTP Error: " + res.statusCode + " " + res.statusMessage));
        }
        var _body = "";
        res.on("data", (chunk: any) => {
          _body += chunk;
        });
        res.on("end", () => {
          var r = res;
          resolve(_body);
        });
      }
      );
      req.write(body);
      req.end();

    } catch (error) {
      reject(error);
    }
  })
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
    if (res != null && res.queue != "" && res._id != null && res._id != "") {
      localqueue = await client.RegisterQueue({ queuename: res.queue }, onQueueMessage);
      if (agentid != res._id || (res.jwt != null && res.jwt != "")) {
        agentid = res._id
        var config = require(path.join(os.homedir(), ".openiap", "config.json"));
        config.agentid = agentid
        config.jwt = res.jwt
        process.env.jwt = res.jwt
        fs.writeFileSync(path.join(os.homedir(), ".openiap", "config.json"), JSON.stringify(config));
      }
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
          await reloadpackages()
        }
        if (document._type == "agent" && document._id == agentid) {
          await RegisterAgent()
        }
      } catch (error) {
        console.error(error);
        uitools.log(JSON.stringify(error))
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
    var result = await post(null, null, addtokenurl, JSON.stringify({ key: tokenkey }));
    var res = JSON.parse(result)
    const id = setInterval(async () => {
      var result = await get(gettokenurl);
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

