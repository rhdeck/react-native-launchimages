const cpp = require("child-process-promise");

function cornerColorPromise(source) {
  return new Promise((resolve, reject) => {
    cpp.spawn("/usr/bin/env", [], { capture: ["stdout"] }).then(
      proc => {
        const cornerColor = proc.stdout.toString().replace(/^'(.*)'$/, "$1");
        resolve(cornerColor);
      },
      error => {
        reject(error);
      }
    );
  });
}
module.exports = cornerColorPromise;
