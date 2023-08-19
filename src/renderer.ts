// No Node.js APIs are available in this process unless
// nodeIntegration is set to true in webPreferences.

declare const versions: any;
declare const app: any;
var packagelist: any[] = [];

const clearcache = document.getElementById("clearcache")
clearcache.onclick = async function () {
    try {
        updateErrorStatus()
        await app.clearCache();
        clearAllOutput()
    } catch (error) {
        updateErrorStatus("Error: " + error.message)
        console.error(error);
    }
}

const setupconnection = document.getElementById("setupconnection")
const setupurl = document.getElementById("setupurl")
const setupconnect = document.getElementById("setupconnect")
const listpackages = document.getElementById("listpackages")
const signout = document.getElementById("signout")
const autoLaunchCheckbox = document.getElementById('autoLaunchCheckbox');

autoLaunchCheckbox.addEventListener('change', async (event) => {
    // @ts-ignore
  if (event.target.checked) {
    await app.enableAutoLaunch();
  } else {
    await app.disableAutoLaunch();
  }
});
function SetAutoLaunchState(status: boolean) {
    // @ts-ignore
    autoLaunchCheckbox.checked = status;    
}

setupconnect.onclick = async function () {
    try {
        updateErrorStatus()
        var url = (setupurl as any).value;
        var loginurl = await app.setupConnect(url);
    } catch (error) {
        updateErrorStatus("Error: " + error.message)
        console.error(error);
    }
}
signout.onclick = async function () {
    try {
        updateErrorStatus()
        await app.Signout();
        clearAllOutput()
        clearPackageList()
    } catch (error) {
        updateErrorStatus("Error: " + error.message)
        console.error(error);
    }
}
function clearAllOutput() {
    const output = document.getElementById("output")
    while (output.firstChild) {
        output.removeChild(output.firstChild);
    }
}
function clearPackageList() {
    const ul_packages = document.getElementById("packages")
    while (ul_packages.firstChild) {
        ul_packages.removeChild(ul_packages.firstChild);
    }
}
function updateErrorStatus(status: string = "") {
    const div = document.getElementById("errorstatus")
    if (status == null) status = "";
    div.innerText = status
}
function updateServerStatus(status: string, user: any, hostname: string) {
    const div = document.getElementById("serverstatus")
    div.innerText = status
    console.log("Server status:", status);
    if (status == "connected") {
        signout.innerText = "Sign out " + user?.username;
        setupconnection.style.display = "none";
        listpackages.style.display = "block";
    } else if (status == "disconnected") {
        setupconnection.style.display = "block";
        listpackages.style.display = "none";
    }
}
function remoteRunPackage(packageid: string, streamid: string) {
    updateErrorStatus()
    if (streams[streamid] == null) streams[streamid] = [];

    var package = packagelist.find(p => p._id == packageid);

    var exists = document.getElementById(streamid);
    if (exists != null) return;

    const outputul = document.getElementById("output")
    const span = document.createElement("span");
    const pre = document.createElement("pre");
    span.innerText = package.name + "#" + streamid;
    const killbutton = document.createElement("button");
    killbutton.id = "kill" + streamid;
    killbutton.innerText = "kill";
    killbutton.onclick = function () {
        app.stopPackage(streamid);
    }
    span.appendChild(killbutton);
    const togglebutton = document.createElement("button");
    togglebutton.id = "toggle" + streamid;
    togglebutton.innerText = "toggle";
    togglebutton.onclick = function () {
        pre.classList.toggle('collapsed');
        pre.classList.toggle('expanded');
        pre.style.display = pre.classList.contains('collapsed') ? 'block' : 'none';
    }
    span.appendChild(togglebutton);
    const clearbutton = document.createElement("button");
    clearbutton.id = "clear" + streamid;
    clearbutton.innerText = "clear";
    clearbutton.onclick = function () {
        pre.innerText = "";
    }
    span.appendChild(clearbutton);
    pre.id = streamid;
    pre.innerText = "";
    const li = document.createElement("li");
    li.appendChild(span);
    li.appendChild(pre);
    outputul.insertBefore(li, outputul.firstChild);
    togglebutton.onclick(null);
}
function runPackage(packageid: string) {
    try {
        updateErrorStatus()
        // generate unique id for stream
        const streamid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        if (streams[streamid] == null) streams[streamid] = [];

        var package = packagelist.find(p => p._id == packageid);

        const outputul = document.getElementById("output")
        const span = document.createElement("span");
        const pre = document.createElement("pre");
        span.innerText = package.name + "#" + streamid;
        const killbutton = document.createElement("button");
        killbutton.id = "kill" + streamid;
        killbutton.innerText = "kill";
        killbutton.onclick = function () {
            app.stopPackage(streamid);
        }
        span.appendChild(killbutton);
        const togglebutton = document.createElement("button");
        togglebutton.id = "toggle" + streamid;
        togglebutton.innerText = "toggle";
        togglebutton.onclick = function () {
            pre.classList.toggle('collapsed');
            pre.classList.toggle('expanded');
            pre.style.display = pre.classList.contains('collapsed') ? 'block' : 'none';
        }
        span.appendChild(togglebutton);
        const clearbutton = document.createElement("button");
        clearbutton.id = "clear" + streamid;
        clearbutton.innerText = "clear";
        clearbutton.onclick = function () {
            pre.innerText = "";
        }
        span.appendChild(clearbutton);
        pre.id = streamid;
        pre.innerText = "";
        const li = document.createElement("li");
        li.appendChild(span);
        li.appendChild(pre);
        outputul.insertBefore(li, outputul.firstChild);

        app.runPackage(packageid, streamid);
        togglebutton.onclick(null);
    } catch (error) {
        updateErrorStatus("Error: " + error.message)
        console.error(error);
    }
}
interface IHashTable<T> {
    [key: string]: T;
}
var streams: IHashTable<any> = {}
function updateStream(id: string, byteArray: any) {
    var bytes = byteArray;
    if (byteArray == null) {
        const killbutton = document.getElementById("kill" + id);
        if (killbutton == null) return;
        killbutton.parentElement.removeChild(killbutton);
        return;
    }
    if (byteArray.type == "Buffer") {
        bytes = byteArray.data;
    }
    bytes = new Uint8Array(bytes)
    if (streams[id] == null) streams[id] = [];
    streams[id] = streams[id].concat(bytes);

    const outputul = document.getElementById(id)
    if (outputul == null) return;
    const decoder = new TextDecoder("utf-8");
    const string = decoder.decode(bytes);
    outputul.innerText = string + outputul.innerText;
}
function updateConfig(config: any) {
    config = JSON.parse(config);
    const setupurl = document.getElementById("setupurl")
    if (config.apiurl) {
        var u = new URL(config.apiurl);
        if (u.protocol == "wss:") {
            (setupurl as any).value = "https://" + u.host;
        } else if (u.protocol == "ws:") {
            (setupurl as any).value = "http://" + u.host;
        }
    }
}
function updatePackages(json: string) {
    packagelist = JSON.parse(json);
    const ul_packages = document.getElementById("packages")
    clearPackageList()
    for (var i = 0; i < packagelist.length; i++) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = "#";
        if (packagelist[i].language == "python") {
            a.innerText = packagelist[i].name + " (Python)";
        } else if (packagelist[i].language == "nodejs") {
            a.innerText = packagelist[i].name + " (Node.js)";
        } else {
            a.innerText = packagelist[i].name + " (" + packagelist[i].language + ")";
        }
        const _id = packagelist[i]._id
        a.onclick = function () {
            runPackage(_id);
        }
        li.appendChild(a);
        ul_packages.appendChild(li);
    }
}
function processlog(byteArray: any) {
    var bytes = byteArray;
    if (byteArray == null) return;
    if (byteArray.type == "Buffer") {
        bytes = byteArray.data;
    }
    bytes = new Uint8Array(bytes)
    const decoder = new TextDecoder("utf-8");
    const string = decoder.decode(bytes);
    console.log("[Processor] " + string)
}


async function init() {
    const information = document.getElementById("info")
    information.innerText = `Chrome ${versions.chrome()}, Node.js ${versions.node()}, and Electron ${versions.electron()}, and Python ${await versions.python()}`
}
init()