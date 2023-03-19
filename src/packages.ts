// import * as os from "os"
// import * as path from "path";
// import * as fs from "fs"
// import { execSync, spawn, ChildProcessWithoutNullStreams } from 'child_process';
// import { uitools } from "./uitools"
// import { openiap } from "@openiap/nodeapi";
// import * as AdmZip from "adm-zip";
// import * as tar from "tar";
// export class packages_process {
//   streamid: string;
//   pid: number
//   p: ChildProcessWithoutNullStreams;
//   forcekilled: boolean;
// }
// export class packages_stream {
//   streamid: string;
//   stream: ReadableStream
// }
// export class packages {
//   static packagefolder: string = path.join(os.homedir(), ".openiap", "packages");
//   static processs: packages_process[] = [];
//   static streams: packages_stream[] = [];
//   static async pipinstall(packagepath: string, streamid: string, pythonpath: string) {
//     if (fs.existsSync(path.join(packagepath, "requirements.txt.done"))) return;
//     if (fs.existsSync(path.join(packagepath, "requirements.txt"))) {
//       uitools.notifyStream(streamid, "Running pip install");
//       if ((await packages.runit(packagepath, streamid, pythonpath + " -m pip install -r " + path.join(packagepath, "requirements.txt"), false)) == true) {
//         fs.writeFileSync(path.join(packagepath, "requirements.txt.done"), "done");
//       }
//     }
//   }
//   public static kill(streamid: string) {
//     const p = this.processs.filter(x => x.streamid == streamid);
//     for (var i = 0; i < p.length; i++) {
//       uitools.notifyStream(streamid, "Sent kill signal to process " + p[i].p.pid);
//       p[i].forcekilled = true;
//       p[i].p.kill();
//     }
//   }
//   static async runit(packagepath: string, streamid: string, command: string, clearstream: boolean) {
//     return new Promise((resolve, reject) => {
//       try {
//         // var xvfb = findXvfbPath();
//         // if(xvfb 
//         uitools.log(`run ${command} in ${packagepath}`)
//         const childProcess = spawn(command.split(" ")[0], command.split(" ").slice(1), { cwd: packagepath })
//         const pid = childProcess.pid;
//         const p: packages_process = { streamid, pid, p: childProcess, forcekilled: false }
//         uitools.notifyStream(streamid, `Child process started as pid ${pid}`);
//         uitools.log(`Child process started as pid ${pid}`);
//         this.processs.push(p);
//         childProcess.stdout.on('data', (data) => {
//           uitools.log(data.toString());
//           uitools.notifyStream(streamid, data)
//         });
//         childProcess.stderr.on('data', (data) => {
//           uitools.log(data.toString());
//           uitools.notifyStream(streamid, data)
//         });
//         childProcess.stdout.on('error', (data) => {
//           uitools.log(data.toString());
//           uitools.notifyStream(streamid, data.toString())
//         });
//         childProcess.stdout.on('close', (code: any) => {
//           if (code == false || code == null) {
//             uitools.notifyStream(streamid, `Child process ${pid} exited`);
//             uitools.log(`Child process ${pid} exited`);
//           } else {
//             uitools.notifyStream(streamid, `Child process ${pid} exited with code ${code}`);
//             uitools.log(`Child process ${pid} exited with code ${code}`);
//             p.forcekilled = true;
//           }
//           this.processs = this.processs.filter(x => x.pid != pid);
//           if (clearstream == true) {
//             this.removestream(streamid);
//             uitools.notifyStream(streamid, null)
//           }
//           resolve(!p.forcekilled);
//         });
//         uitools.log("done")
//       } catch (error) {
//         reject(error);
//       }
//     });
//   }
//   static async getpackage(client: openiap, fileid: string, id: string) {
//     const reply = await client.DownloadFile({ id: fileid });
//     // move reply.filename to packagefolder
//     if (!fs.existsSync(this.packagefolder)) fs.mkdirSync(this.packagefolder);
//     // fs.copyFileSync(reply.filename, join(packagefolder, reply.filename));
//     try {
//       if (path.extname(reply.filename) == ".zip") {
//         var zip = new AdmZip(reply.filename);
//         zip.extractAllTo(path.join(this.packagefolder, id), true);
//         uitools.log("done")
//       } else if (path.extname(reply.filename) == ".tar.gz" || path.extname(reply.filename) == ".tgz") {
//         var dest = path.join(this.packagefolder, id);
//         if (!fs.existsSync(dest)) {
//           fs.mkdirSync(dest);
//         }
//         try {
//           await tar.x({
//             file: reply.filename,
//             C: dest
//           })
//         } catch (error) {
//           console.error(error)
//           throw error;
//         }

//       }
//     } catch (error) {
//       console.error(error);
//       throw error
//     } finally {
//       fs.unlinkSync(reply.filename);
//     }
//   }
//   static getpackagepath(packagepath: string, first: boolean = true): string {
//     if (fs.existsSync(path.join(packagepath, "package.json"))) return packagepath;
//     if (fs.existsSync(path.join(packagepath, "agent.js"))) return packagepath;
//     if (fs.existsSync(path.join(packagepath, "main.js"))) return packagepath;
//     if (fs.existsSync(path.join(packagepath, "index.js"))) return packagepath;
//     if (fs.existsSync(path.join(packagepath, "agent.py"))) return packagepath;
//     if (fs.existsSync(path.join(packagepath, "main.py"))) return packagepath;
//     if (fs.existsSync(path.join(packagepath, "index.py"))) return packagepath;
//     // search for a .csproj file
//     if (!first) return ""
//     if (!fs.existsSync(packagepath)) return ""
//     var files = fs.readdirSync(packagepath)
//     for (var i = 0; i < files.length; i++) {
//       const filepath = path.join(packagepath, files[i])
//       if (fs.lstatSync(filepath).isDirectory()) {
//         var test = this.getpackagepath(filepath, false)
//         if (test != "") return test;
//       }
//     }
//     return ""
//   }
//   static getscriptpath(packagepath: string): string {
//     if (fs.existsSync(path.join(packagepath, "package.json"))) {
//       var project = require(path.join(packagepath, "package.json"))
//       if (project.scripts && project.scripts.start) {
//         return "npm run start"
//       }
//       var _main = path.join(packagepath, project.main);
//       if (fs.existsSync(_main)) {
//         return _main
//       }
//     }
//     if (fs.existsSync(path.join(packagepath, "agent.js"))) return path.join(packagepath, "agent.js");
//     if (fs.existsSync(path.join(packagepath, "main.js"))) return path.join(packagepath, "main.js");
//     if (fs.existsSync(path.join(packagepath, "index.js"))) return path.join(packagepath, "index.js");
//     if (fs.existsSync(path.join(packagepath, "agent.py"))) return path.join(packagepath, "agent.py");
//     if (fs.existsSync(path.join(packagepath, "main.py"))) return path.join(packagepath, "main.py");
//     if (fs.existsSync(path.join(packagepath, "index.py"))) return path.join(packagepath, "index.py");
//   }
//   static async npminstall(packagepath: string, streamid: string) {
//     if (fs.existsSync(path.join(packagepath, "npm.install.done"))) return;
//     if (fs.existsSync(path.join(packagepath, "package.json"))) {
//       uitools.notifyStream(streamid, "************************");
//       uitools.notifyStream(streamid, "**** Running npm install");
//       uitools.notifyStream(streamid, "************************");
//       const child = (process.platform === 'win32' ? 'npm.cmd' : 'npm')
//       if ((await this.runit(packagepath, streamid, child + " install", false)) == true) {
//         fs.writeFileSync(path.join(packagepath, "npm.install.done"), "done");
//       }
//     }
//   }
//   static findInPath(exec: string) {
//     try {
//       let command;
//       switch (process.platform) {
//         case 'linux':
//         case 'darwin':
//           command = 'which ' + exec;
//           break;
//         case 'win32':
//           command = 'where ' + exec;
//           break;
//         default:
//           throw new Error(`Unsupported platform: ${process.platform}`);
//       }
//       const stdout = execSync(command, { stdio: 'pipe' }).toString();
//       return stdout.trim() || null;
//     } catch (error) {
//       throw error;
//     }
//   }
//   static findPythonPath() {
//     return this.findInPath("python")
//   }
//   static findDotnetPath() {
//     return this.findInPath("dotnet")
//   }
//   static findXvfbPath() {
//     return this.findInPath("xvfb-run")
//   }
//   static getpackagefolder() {
//     return this.packagefolder;
//   }
//   static getprocessses(streamid: string) {
//     return this.processs.filter(x => x.streamid == streamid);
//   }
//   static getstream(streamid: string): packages_stream | null {
//     return this.streams.find(x => x.streamid == streamid);
//   }
//   static getstreams() {
//     return this.streams;
//   }
//   static ensurestream(streamid: string): packages_stream {
//     var s = this.getstream(streamid);
//     if (s == null) {
//       s = new packages_stream();
//       s.stream = new ReadableStream()
//       this.streams.push(s);
//     }
//     return s;
//   }
//   static removestream(streamid: string) {
//     uitools.notifyStream(streamid, null);
//     this.streams = this.streams.filter(x => x.streamid != streamid);
//   }
//   static deleteDirectoryRecursiveSync(dirPath: string) {
//     if (fs.existsSync(dirPath)) {
//       fs.readdirSync(dirPath).forEach((file, index) => {
//         const curPath = path.join(dirPath, file);
//         if (fs.lstatSync(curPath).isDirectory()) { // recurse
//           packages.deleteDirectoryRecursiveSync(curPath);
//         } else { // delete file
//           fs.unlinkSync(curPath);
//         }
//       });
//       fs.rmdirSync(dirPath);
//     }
//   }

// }