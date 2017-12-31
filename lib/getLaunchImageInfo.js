const fs = require("fs");
function getPackagePath() {
  return process.cwd() + "/package.json";
}
function getPackage() {
  const packagePath = getPackagePath();
  if (!fs.existsSync(packagePath)) {
    console.log(
      "This does not appear to be a valid directory. Try running from your project root"
    );
    process.exit();
  }
  var package = require(packagePath);
  return package;
}
var cachedLaunchImageInfo;
function getLaunchImageInfo() {
  if (cachedLaunchImageInfo) return cachedLaunchImageInfo;
  const package = getPackage();
  if (package) cachedLaunchImageInfo = package.launchImageInfo;
  return cachedLaunchImageInfo ? cachedLaunchImageInfo : {};
}

module.exports = getLaunchImageInfo;
