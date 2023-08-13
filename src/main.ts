import { openiap, config, QueueEvent } from "@openiap/nodeapi";
import { app, BrowserWindow, ipcMain } from "electron";
import { Stream } from 'stream';
import { uitools } from "./uitools"
import { runner, packagemanager, agenttools } from "@openiap/nodeagent";
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
var myproject = require(path.join(__dirname, "..", "package.json"));
client.version = myproject.version;
let localqueue = "";
let agentid = process.env.agentid;
var languages = ["nodejs"];
var assistantConfig: any = { "apiurl": "wss://app.openiap.io/ws/v2", jwt: "", agentid: "" };
function reloadAndParseConfig() {
  if (fs.existsSync(path.join(os.homedir(), ".openiap", "config.json"))) {
    assistantConfig = require(path.join(os.homedir(), ".openiap", "config.json"));
    process.env["NODE_ENV"] = "production";
    if (assistantConfig.apiurl) {
      process.env["apiurl"] = assistantConfig.apiurl;
      client.url = assistantConfig.apiurl;
    }
    if (assistantConfig.jwt) {
      process.env["jwt"] = assistantConfig.jwt;
      client.jwt = assistantConfig.jwt;
    }
    if (assistantConfig.agentid != null && assistantConfig.agentid != "") {
      agentid = assistantConfig.agentid;
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
  try {
    var pwshpath = runner.findPwShPath();
    if (pwshpath != null && pwshpath != "") {
      languages.push("powershell");
    }
  } catch (error) {

  }

  client.onConnected = onConnected
  client.onDisconnected = onDisconnected
  uitools.notifyServerStatus('connecting', null, "");
  client.connect();
}
async function onQueueMessage(msg: QueueEvent, payload: any, user: any, jwt: string) {
  try {
    // const streamid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    let streamid = msg.correlationId;
    if (payload != null && payload.payload != null) payload = payload.payload;
    if (payload.streamid != null && payload.streamid != "") streamid = payload.streamid;
    // console.log("onQueueMessage");
    // console.log(payload);
    if (user == null || jwt == null || jwt == "") {
      return { "command": payload.command, "success": false, error: "not authenticated" };
    }
    var streamqueue = msg.replyto;
    if (payload.queuename != null && payload.queuename != "") {
      streamqueue = payload.queuename;
    }
    var dostream = true;
    if (payload.stream == "false" || payload.stream == false) {
      dostream = false;
    }
    console.log("streamqueue: " + streamqueue + " dostream: " + dostream)
    if (streamqueue == null) streamqueue = "";
    if (payload.command == "runpackage") {
      if (payload.id == null || payload.id == "") throw new Error("id is required");
      var packagepath = packagemanager.getpackagepath(path.join(os.homedir(), ".openiap", "packages", payload.id));
      if (packagepath == "") {
        console.log("package not found");
        return { "command": "runpackage", "success": false, "completed": true , error: "Package " + payload.id + " not found" };
      }
      var stream = new Stream.Readable({
        read(size) { }
      });
      let buffer = "";
      stream.on('data', async (data) => {
        if (!dostream) {
          if (data != null) buffer += data.toString();
        }
        uitools.notifyStream(streamid, data);
      });
      stream.on('end', async () => {
        uitools.notifyStream(streamid, null);
      });

      const payloadfile = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + ".json";
      let wipath = path.join(packagepath, payloadfile);
      let wijson = JSON.stringify(payload.payload, null, 2);
      if (fs.existsSync(wipath)) { fs.unlinkSync(wipath); }
      let env = { "packageid": "", payloadfile }
      if (payload.payload != null) {
        console.log("dump payload to: ", wipath);
        env = Object.assign(env, payload.payload);
        fs.writeFileSync(wipath, wijson);
      } else {
        delete env.payloadfile;
      }
      let wipayload = {};

      uitools.remoteRunPackage(payload.id, streamid)
      await packagemanager.runpackage(client, payload.id, streamid, streamqueue, stream, true, env);

      if (fs.existsSync(wipath)) {
        console.log("loading", wipath);
        try {
          wipayload = JSON.parse(fs.readFileSync(wipath).toString());
          if (fs.existsSync(wipath)) { fs.unlinkSync(wipath); }
        } catch (error) {
          console.log(error.message ? error.message : error);
        }
      }

      try {
        if (dostream == true && streamqueue != "") await client.QueueMessage({ queuename: streamqueue, data: { "command": "runpackage", "success": true, "completed": true }, correlationId: streamid });
      } catch (error) {
        console.error(error);
        dostream = false;
      }
      if(buffer != "" && buffer != null) {
        return { "command": "runpackage", "success": true, "completed": false, "output": buffer, "payload": wipayload };
      }
      return { "command": "runpackage", "success": true, "completed": false, "payload": wipayload };
    }
    if (payload.command == "kill") {
      if (payload.id == null || payload.id == "") payload.id = payload.streamid;
      if (payload.id == null || payload.id == "") throw new Error("id is required");
      runner.kill(client, payload.id);
      return { "command": "kill", "success": true };
    }
    if (payload.command == "killall") {
      var processcount = runner.processs.length;
      for (var i = processcount; i >= 0; i--) {
        runner.kill(client, runner.processs[i].id);
      }
      return { "command": "killall", "success": true, "count": processcount };
    }
    if (payload.command == "setstreamid") {
      if (payload.id == null || payload.id == "") payload.id = payload.streamid;
      if (payload.id == null || payload.id == "") throw new Error("id is required");
      if(payload.streamqueue == null || payload.streamqueue == "") payload.streamqueue = msg.replyto;
      if (payload.streamqueue == null || payload.streamqueue == "") throw new Error("streamqueue is required");
      var processcount = runner.streams.length;
      var counter = 0;
      if(runner.commandstreams.indexOf(payload.streamqueue) == -1 && payload.streamqueue != null && payload.streamqueue != "") {
        runner.commandstreams.push(payload.streamqueue);
      }
      // for (var i = processcount; i >= 0; i--) {
      //   var p = runner.streams[i];
      //   if(p == null) continue
      //   if(p.id==payload.id) {
      //     counter++;
      //     p.streamqueue = payload.streamqueue;
      //   }
      // }
      return { "command": "setstreamid", "success": true, "count": counter };
    }
    if (payload.command == "listprocesses") {
      if(runner.commandstreams.indexOf(msg.replyto) == -1 && msg.replyto != null && msg.replyto != "") {
        runner.commandstreams.push(msg.replyto);
      }
      var processcount = runner.streams.length;
      var processes = [];
      for (let i = processcount; i >= 0; i--) {
        let p = runner.streams[i];
        if (p == null) continue;
        processes.push({
          "id": p.id,
          "streamqueues": runner.commandstreams,
          "packagename": p.packagename,
          "packageid": p.packageid,
          "schedulename": p.schedulename,
        });
      }
      return { "command": "listprocesses", "success": true, "count": processcount, "processes": processes };
    }
  } catch (error) {
    console.error(error);
    return { "command": payload.command, "success": false, error: JSON.stringify(error.message) };
  }
}
async function reloadpackages() {
  var _packages = await client.Query<any>({ query: { "_type": "package", "language": { "$in": languages } }, collectionname: "agents" });
  if (_packages != null) {
    for (var i = 0; i < _packages.length; i++) {
      try {
        if (fs.existsSync(path.join(packagemanager.packagefolder, _packages[i]._id))) continue;
        if (_packages[i].fileid != null && _packages[i].fileid != "") {
          await packagemanager.getpackage(client, _packages[i]._id);
        }
      } catch (error) {
        console.error(error);
      }
    }
    uitools.notifyPackages(_packages);
  }
}
let schedules: any[] = [];
async function RegisterAgent() {
  try {
    var u = new URL(client.url);
    var chromium = runner.findChromiumPath() != "";
    var chrome = runner.findChromePath() != "";
    var data = JSON.stringify({ hostname: os.hostname(), os: os.platform(), arch: os.arch(), username: os.userInfo().username, version: app.getVersion(), "languages": languages, "assistant": true, chrome, chromium, "maxpackages": 50 })
    var res: any = await client.CustomCommand({
      id: agentid, command: "registeragent",
      data
    });
    if (res != null) res = JSON.parse(res);
    if (res != null && res.slug != "" && res._id != null && res._id != "") {
      localqueue = await client.RegisterQueue({ queuename: res.slug + "agent" }, onQueueMessage);
      agentid = res._id
      var config = require(path.join(os.homedir(), ".openiap", "config.json"));
      config.agentid = agentid
      if (res.jwt != null && res.jwt != "") {
        config.jwt = res.jwt
        process.env.jwt = res.jwt
      }
      fs.writeFileSync(path.join(os.homedir(), ".openiap", "config.json"), JSON.stringify(config));

      if (res.schedules == null || !Array.isArray(res.schedules))  res.schedules = [];

      for (let p = 0; p < res.schedules.length; p++) {
        const _schedule = res.schedules[p];
        let schedule = schedules.find((x: any) => x.name == _schedule.name && x.packageid == _schedule.packageid);
        if(schedule != null && schedule != _schedule) {
          _schedule.task = schedule.task;
          if(_schedule.env == null) _schedule.env = {};
          if(schedule.env == null) schedule.env = {};
          if(_schedule.cron == null || _schedule.cron == "") _schedule.cron = "";
          if(schedule.cron == null || schedule.cron == "") schedule.cron = "";
          if(JSON.stringify(_schedule.env) != JSON.stringify(schedule.env) || _schedule.cron != schedule.cron) {
            try {
              _schedule.task.stop();
              _schedule.task.restartcounter = 0;
              _schedule.task.lastrestart = new Date();

              log("Schedule " + _schedule.name + " (" + _schedule.id + ") updated, kill all instances of package " + _schedule.packageid + " if running");
              for (let s = runner.streams.length -1; s >= 0; s--) {
                const stream = runner.streams[s];
                if (stream.schedulename == _schedule.name ) {
                  runner.kill(client, stream.id);
                }
              }
  
            } catch (error) {
            }
            _schedule.task = null;
          }          
        }
      }
      for (let p = 0; p < schedules.length; p++) {
        const _schedule = schedules[p];
        let schedule = res.schedules.find((x: any) => x.name == _schedule.name && x.packageid == _schedule.packageid);
        if(schedule == null) {
          try {
            if(_schedule.task != null) {
              _schedule.task.stop();
              _schedule.task = null;
            }
            log("Schedule " + _schedule.name + " (" + _schedule.id + ") removed, kill all instances of package " + _schedule.packageid + " if running");
            for (let s = runner.streams.length -1; s >= 0; s--) {
              const stream = runner.streams[s];
              if (stream.schedulename == _schedule.name ) {
                runner.kill(client, stream.id);
              }
            }

          } catch (error) {
            
          }
        }
      }
      schedules = res.schedules;
      for (let p = 0; p < res.schedules.length; p++) {
        const schedule = res.schedules[p];
        if (schedule.packageid == null || schedule.packageid == "") {
          log("Schedule " + schedule.name + " has no packageid, skip");
          continue;
        }

        if (schedule.cron != null && schedule.cron != "") {
          if (!schedule.enabled) {
            if(schedule.task != null) {
              schedule.task.stop();
              schedule.task = null;
            }
            log("Schedule " + schedule.name + " (" + schedule.id + ") disabled, kill all instances of package " + schedule.packageid + " if running");
            for (let s = runner.streams.length -1; s >= 0; s--) {
              const stream = runner.streams[s];
              if (stream.schedulename == schedule.name ) {
                runner.kill(client, stream.id);
              }
            }
          } else {
            log("Schedule " + schedule.name + " (" + schedule.id + ") running every " + schedule.cron);
            if(schedule.task == null) {
              schedule.task = cron.schedule(schedule.cron, async () => {
                if (schedule.enabled) {
                  log("Schedule " + schedule.name + " (" + schedule.id + ") enabled, run now");
                  localrun(schedule.packageid, schedule.env, schedule);
                  // await packagemanager.runpackage(client, schedule.packageid, streamid, "", null, false, schedule.env);
                } else {
                  log("Schedule " + + " (" + schedule.id + ") disabled, kill all instances of package " + schedule.packageid + " if running");
                  for (let s = runner.streams.length -1; s >= 0; s--) {
                    const stream = runner.streams[s];
                    if (stream.schedulename == schedule.name) {
                      runner.kill(client, stream.id);
                    }
                  }
                }
              });  
            }
          }
        } else {
          if (schedule.enabled) {
            // const streamid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            // await packagemanager.runpackage(client, schedule.packageid, streamid, "", null, false, schedule.env);
            if (schedule.task == null) {
              log("Schedule " + schedule.name + " enabled, run now");
              schedule.task = {
                timeout: null,
                lastrestart: new Date(),
                restartcounter: 0,
                stop() {
                  if(schedule.task.timeout != null) {
                    clearTimeout(schedule.task.timeout);
                    for (let s = runner.streams.length -1; s >= 0; s--) {
                      const stream = runner.streams[s];
                      if (stream.schedulename == schedule.name) {
                        runner.kill(client, stream.id);
                      }
                    }
                  }
                },
                start() {
                  if(schedule.task.timeout != null) {
                    log("Schedule " + schedule.name + " (" + schedule.id + ") already running");
                    return;
                  }
                  log("Schedule " + schedule.name + " (" + schedule.id + ") started");
                  schedule.task.stop()
                  schedule.task.timeout = setTimeout(() => {
                    localrun(schedule.packageid, schedule.env, schedule).then(() => {
                      if(schedule.task == null) return;
                      try {
                        schedule.task.timeout = null;
                        log("Schedule " + schedule.name + " (" + schedule.id + ") finished");
                        const minutes = (new Date().getTime() - schedule.task.lastrestart.getTime()) / 1000 / 60;
                        if (minutes < 5) {
                          schedule.task.restartcounter++;
                        } else {
                          schedule.task.restartcounter = 0;
                        }
                        schedule.task.lastrestart = new Date();
                        if (schedule.task.restartcounter < 5) {
                          let exists = schedules.find(x => x.name == schedule.name && x.packageid == schedule.packageid );
                          if (exists != null && schedule.task != null) {
                            log("Schedule " + schedule.name + " (" + schedule.id + ") restarted again after " + minutes + " minutes (" + schedule.task.restartcounter + " times)");
                            schedule.task.start();
                          }
                        } else {
                          log("Schedule " + schedule.name + " (" + schedule.id + ") restarted too many times, stop! (" + schedule.task.restartcounter + " times)");
                        }
                      } catch (error) {
                        console.error(error);
                      }
                    }).catch((error) => {
                      try {
                        console.error(error);
                        schedule.task.timeout = null;
                      } catch (e) {
                        console.error(e);
                      }
                    });;
                  }, 100);
                }
              }
              schedule.task.start();
            } else {
              log("Schedule " + schedule.name + " (" + schedule.id + ") allready running");
            }
          } else {
            log("Schedule " + schedule.name + " disabled, kill all instances of package " + schedule.packageid + " if running");
            for (let s = runner.streams.length - 1; s >= 0; s--) {
              const stream = runner.streams[s];
              if (stream.schedulename == schedule.name) {
                runner.kill(client, stream.id);
              }
            }
          }
        }
      }
      log("Registed agent as " + res.name + " (" + agentid + ") and queue " + localqueue + " ( from " + res.slug + " )");

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
var lastreload = new Date();
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
          if (operation == "insert") {
            console.log("package " + document.name + " inserted, reload packages");
            await reloadpackages()
          } else if (operation == "replace") {
            console.log("package " + document.name + " updated, delete and reload");
            packagemanager.removepackage(document._id);
            await packagemanager.getpackage(client, document._id);
          } else if (operation == "delete") {
            console.log("package " + document.name + " deleted, cleanup after package");
            packagemanager.removepackage(document._id);
          }
        } else if (document._type == "agent") {
          if (document._id == agentid) {
            if (lastreload.getTime() + 1000 > new Date().getTime()) {
              console.log("agent changed, but last reload was less than 1 second ago, do nothing");
              return;
            }
            lastreload = new Date();
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
    reconnecttime = 500;
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
  init();
  if(process.platform != "win32") {
    process.env.PATH = await getUserPath()
  }
  uitools.notifyConfig(assistantConfig);
  var isEnabled = await isAutoLaunchEnabled();
  uitools.SetAutoLaunchState(isEnabled);
  
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
          assistantConfig = { apiurl: client.url, jwt: client.jwt }
          if (fs.existsSync(path.join(os.homedir(), ".openiap", "config.json"))) {
            assistantConfig = require(path.join(os.homedir(), ".openiap", "config.json"));
            assistantConfig.apiurl = client.url;
            assistantConfig.jwt = client.jwt;
          }
          if (!fs.existsSync(path.join(os.homedir(), ".openiap"))) fs.mkdirSync(path.join(os.homedir(), ".openiap"));
          fs.writeFileSync(path.join(os.homedir(), ".openiap", "config.json"), JSON.stringify(assistantConfig));
          if (client.connected) client.Close();
          uitools.notifyConfig(assistantConfig);
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
    if (languages.indexOf("python") == -1) return "";
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
    await packagemanager.runpackage(client, id, streamid, "", stream, false);
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
  try {
    const streamid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    let stream = new Stream.Readable({
      read(size) { }
    });
    let buffer = "";
    // stream.on('data', async (data) => {
    //   if (data == null) return;
    //   let s = data.toString().replace(/\n$/, "");
    //   if(buffer.length < 300) {
    //     buffer += s;
    //     log(s);
    //   }
    // });
    // stream.on('end', async () => {
    //   log("process ended");
    // });
    stream.on('data', async (data) => {
      uitools.notifyStream(streamid, data);
    });
    stream.on('end', async () => {
      uitools.notifyStream(streamid, null);
    });
     // log("run package " + packageid);
     uitools.remoteRunPackage(packageid, streamid)
    await packagemanager.runpackage(client, packageid, streamid, "", stream, true, env, schedule);
    log("run complete");
  } catch (error) {
    console.error(error);
    // process.exit(1);
  }
}