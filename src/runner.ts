import * as os from "os"
import * as path from "path";
import * as fs from "fs"
import { uitools } from "./uitools"
import { packages } from "./packages"
export class runner {
  static async runpackage(id: string, streamid: string, remote: boolean) {
    uitools.log('open package ' + id + ' streamid: ' + streamid);
    if (streamid == null || streamid == "") return new Error("streamid is null or empty");
    try {
      var packagepath = packages.getpackagepath(path.join(packages.getpackagefolder(), id));
      if (fs.existsSync(packagepath)) {
        let command = packages.getscriptpath(packagepath)
        if (command == "") throw new Error("Failed locating a command to run, EXIT")
        if (command.endsWith(".py")) {
          var python = packages.findPythonPath();
          await packages.pipinstall(packagepath, streamid, python)
          packages.runit(packagepath, streamid, python + " " + command, true)
        } else if (command.endsWith(".js") || command == "npm run start") {
          // const nodePath = path.join(app.getAppPath(), 'node_modules', '.bin', 'node');
          var test = process.versions.node;
          const nodePath = "node"
          await packages.npminstall(packagepath, streamid)
          packages.runit(packagepath, streamid, nodePath + " " + command, true)
        } else {
          var dotnet = packages.findDotnetPath();
          packages.runit(packagepath, streamid, dotnet + " run ", true)
        }
      } else {
        uitools.notifyStream(streamid, "Package not found in " + packagepath);
        packages.removestream(streamid);
      }
    } catch (error) {
      uitools.notifyStream(streamid, error.message);
      packages.removestream(streamid);
      // throw error;
    }
    return 'pong';
  }
}