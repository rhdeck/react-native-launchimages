const fs = require("fs");
const inquirer = require("inquirer");
const cp = require("child_process");
const cornerColorPromise = require("./lib/cornerColorPromise");
const getLaunchImageInfo = require("./lib/getLaunchImageInfo");
const url = require("url");
function getPackagePath() {
  return process.cwd() + "/package.json";
}
function getPackage() {
  const packagePath = getPackagePath();
  if (!fs.existsSync(packagePath)) {
    console.log(
      "This does not appear to be a valid directory. Try from your project root"
    );
    process.exit(1);
  }
  var package = require(packagePath);
  return package;
}
function writePackage(newPackage) {
  fs.writeFileSync(getPackagePath(), JSON.stringify(newPackage, null, 2));
}
function saveLaunchInfo(obj) {
  var package = getPackage();
  if (obj) {
    Object.keys(obj).map(key => {
      if (obj[key]) obj[key] = obj[key].trim();
    });
    if (!obj.pathorurl) obj = null;
  }
  if (obj) package.launchImageInfo = obj;
  else delete package.launchImageInfo;
  writePackage(package);
  if (obj) {
    cp.spawn(
      "/usr/bin/env",
      ["node", "./node_modules/.bin/react-native-launchimages"],
      { stdio: "inherit" }
    );
  }
}
function getInfo(argv, config, args) {
  inquirer
    .prompt([
      {
        name: "pathorurl",
        default: getLaunchImageInfo().pathorurl || null,
        message:
          "What is the path or URL of the image you would like to base your launch images (splash screens) on? \n(should be on the big side)",
        validate: answer => {
          answer = answer.trim();
          try {
            const u = new url.URL(answer);
            return true;
          } catch (err) {
            const rp = fs.realpathSync(answer);
            if (!fs.existsSync(rp)) {
              console.log("Could not validate the location", answer);
              return false;
            }
            return true;
          }
        }
      },
      {
        name: "type",
        default: getLaunchImageInfo().type || null,
        message: "How would you like this image arranged on the screen?",
        type: "list",
        choices: [
          { value: "fill", name: "Fill the whole screen" },
          {
            value: "center",
            name: "Center and surround with a background color"
          }
        ]
      }
    ])
    .then(answers => {
      if (!answers.pathorurl.trim().length) {
        console.log(
          "Removing launch image instructions from package.json. Future links will not update the packages"
        );
        saveLaunchInfo(null);
        return;
      }
      if (answers.type == "center") {
        inquirer
          .prompt({
            name: "backgroundColor",
            default: getLaunchImageInfo().backgroundColor || null,
            message:
              "What background would you like to apply?\n(Leave blank to just use the color of the upper-left of the image)"
          })
          .then(
            coloranswers => {
              if (!coloranswers.backgroundColor.length)
                coloranswers.backgroundColor = null;
              answers.backgroundColor = coloranswers.backgroundColor;
              saveLaunchInfo(answers);
            },
            error => {
              console.log("Hit an error, cannot continue", error);
            }
          );
      } else {
        saveLaunchInfo(answers);
      }
    });
}
module.exports = {
  name: "setlaunchimage",
  description: "Identify the launch image URL or path for building",
  func: (argv, config, args) => {
    if (getLaunchImageInfo().pathorurl) {
      inquirer
        .prompt({
          name: "docancel",
          message:
            "You have a saved launch image setup. Do you want to remove it and cancel?",
          type: "list",
          choices: [
            {
              value: "no",
              name: "Continue and update my launch image setup (default)"
            },
            {
              value: "yes",
              name: "Remove the launch image directives and finish."
            }
          ]
        })
        .then(answers => {
          if (answers.docancel == "yes") {
            console.log(
              "Removing launch image instructions from package.json. Future links will not update the packages"
            );
            saveLaunchInfo(null);
            return;
          } else {
            getInfo(argv, config, args);
          }
        });
    } else {
      getInfo(argv, config, args);
    }
  }
};
