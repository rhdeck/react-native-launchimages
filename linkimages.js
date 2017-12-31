#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const cpp = require("child-process-promise");
const glob = require("glob");
const url = require("url");
const tmp = require("tmp");
const request = require("request");
const xcode = require("xcode");
const plist = require("plist");
const getLaunchImageInfo = require("./lib/getLaunchImageInfo");
const cornerColorPromise = require("./lib/cornerColorPromise");
const resizers = {
  fill: (source, target, width, height) => {
    if (!height) height = width;
    if (!source || !target || !width) {
      console.log(
        "Bad arguments passed to resize",
        source,
        target,
        width,
        height
      );
      return;
    }
    const geometryold = parseInt(width) + "x" + parseInt(height);
    const geometry = geometryold + "^";
    return new Promise((resolve, reject) => {
      cpp
        .spawn("/usr/bin/env", [
          "convert",
          source,
          "-resize",
          geometry,
          "-gravity",
          "center",
          "-extent",
          geometryold,
          target
        ])
        .then(
          () => {
            resolve(target);
          },
          error => {
            reject("Could not create the appropriate icon file", target, error);
          }
        );
    });
  },
  center: (source, target, width, height) => {
    console.log("Starting with", source, target, width, height);
    const geometry = parseInt(width) + "x" + parseInt(height);
    const resizePromise = cornerColor => {
      return new Promise((resolve, reject) => {
        cpp
          .spawn(
            "/usr/bin/env",
            [
              "convert",
              source,
              "-background",
              cornerColor,
              "-gravity",
              "center",
              "-extent",
              geometry,
              target
            ],
            { capture: ["stdout"] }
          )
          .then(
            () => {
              resolve(target);
            },
            error => {
              reject(error);
            }
          );
      });
    };
    const cc = getBGColor();
    if (cc !== null) {
      return resizePromise(cc);
    } else {
      return cornerColorPromise().then(cornerColor => {
        resizePromise(cornerColor);
      });
    }
  }
};
function getBGColor() {
  const bg = getLaunchImageInfo().backgroundColor;
  return typeof bg == "undefined" ? null : bg;
}
var contentsJSON = null;
function getContents() {
  if (contentsJSON) return contentsJSON;
  const cwd = fs.realpathSync(__dirname);
  const contentsPath = path.join(cwd, "Contents.json");
  if (fs.existsSync(contentsPath)) {
    const str = fs.readFileSync(contentsPath);
    contentsJSON = JSON.parse(str);
    return contentsJSON;
  } else {
    return null;
  }
}
var cachedImagePath = null;
function getImagePath() {
  if (cachedImagePath) return cachedImagePath;
  const iosDir = path.join(process.cwd(), "ios");
  const imageDir = glob.sync(path.join(iosDir, "*", "Images.xcassets"))[0];
  if (!imageDir) return null;
  const AppIconDir = path.join(imageDir, "LaunchImage.launchimage");
  if (!fs.existsSync(AppIconDir)) {
    fs.mkdirSync(AppIconDir);
  }
  cachedImagePath = AppIconDir;
  return cachedImagePath;
}
var imagestart = null;
function loadImage() {
  if (imagestart) return imagestart;
  imagestart = getLaunchImageInfo().pathorurl;
  if (!imagestart) {
    console.log(
      'There us no launch image specified. Run "react-native setlaunchimage"'
    );
    process.exit();
  }
  try {
    uri = new url.URL(imagestart);
    return new Promise((resolve, reject) => {
      if (uri.protocol.length) {
        //Get the damn file
        const tmppath = tmp.fileSync().name;
        const bn = path.basename(uri.pathname);
        const p = tmppath + "_" + bn;
        request.get(imagestart, { encoding: null }, (e, r, b) => {
          if (e) {
            reject("Got an error: " + e);
            return;
          }
          if (b) {
            fs.writeFileSync(p, b);
            resolve(p);
            return;
          } else {
            reject("There was no data there");
          }
        });
      } else {
        const realpath = fs.realpathSync(imagestart);
        if (fs.existsSync(realpath)) {
          resolve(realpath);
        } else {
          reject(imagestart + " does not appear to exist");
        }
      }
    });
  } catch (err) {
    //OK, so this isn't a url
    const realpath = fs.realpathSync(imagestart);
    return new Promise((resolve, reject) => {
      if (fs.existsSync(realpath)) {
        resolve(realpath);
      } else {
        reject(imagestart + " does not appear to exist");
      }
    });
  }
}
function fixProject() {
  const projpath = glob.sync(
    path.join(process.cwd(), "ios", "*xcodeproj*", "project.pbxproj")
  )[0];
  if (!projpath) return;
  var proj = xcode.project(projpath);
  proj.parse(error => {
    proj.addToBuildSettings(
      "ASSETCATALOG_COMPILER_LAUNCHIMAGE_NAME",
      "LaunchImage"
    );
    var file = proj.removeResourceFile("LaunchScreen.xib");
    var file = proj.removeResourceFile("Base.lproj/LaunchScreen.xib");
    fs.writeFileSync(projpath, proj.writeSync());
  });
  const p = path.join(process.cwd(), "ios", "**", "*.plist");
  const plists = glob.sync(p);
  plists.map(plistpath => {
    const str = fs.readFileSync(plistpath, "utf8");
    var obj = plist.parse(str);
    if (typeof obj.UILaunchStoryboardName !== "undefined") {
      delete obj.UILaunchStoryboardName;
      const xml = plist.build(obj);
      fs.writeFileSync(plistpath, xml);
    }
  });
}
var contents = getContents();
if (!contents) {
  console.log("Could not find Contents.json file, aborting");
  process.exit();
}
loadImage().then(
  imagepath => {
    contents.images = contents.images.map(obj => {
      const width = obj.width;
      const height = obj.height;
      if (!height) return obj;
      if (!obj.filename)
        obj.filename =
          "launchimage_" +
          obj.idiom +
          obj.orientation +
          width +
          "x" +
          height +
          ".png";
      target = path.join(getImagePath(), obj.filename);
      try {
        fs.unlinkSync(target);
      } catch (err) {}
      resizers[getLaunchImageInfo().type](
        imagepath,
        target,
        width,
        height
      ).then(
        target => {},
        error => {
          console.log(
            "This module requires imagemagick to run. \nTo install on MacOS:\n port install imagemagick\n -OR-\n brew install imagemagick\n\nOn Linux, try aptitude:\n apt-get install imagemagick",
            error
          );
          process.exit();
        }
      );
      return obj;
    });
    const contentsPath = path.join(getImagePath(), "Contents.json");
    fs.writeFileSync(contentsPath, JSON.stringify(contents, null, 2));
    console.log("Successfully created iOS launch images");
    fixProject();
  },
  errormessage => {
    console.log("Could not load the starting image", errormessage);
    pricess.exit();
  }
);
