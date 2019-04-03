#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const cpp = require("child-process-promise");
const glob = require("glob");
const url = require("url");
const tmp = require("tmp");
const request = require("request");
const xcode = require("@raydeck/xcode");
const plist = require("plist");
const getLaunchImageInfo = require("./lib/getLaunchImageInfo");
const cornerColorPromise = require("./lib/cornerColorPromise");
const mustache = require("mustache");
const splashlines = `<activity
android:name=".SplashActivity"
android:theme="@style/SplashTheme"
android:label="@string/app_name">
<intent-filter>
    <action android:name="android.intent.action.MAIN" />
    <category android:name="android.intent.category.LAUNCHER" />
</intent-filter>
</activity>`.split("\n");
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
(async () => {
  try {
    const imagepath = await loadImage();
    //#region IOS
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
    //#endregion IOS
    //#region Android
    //Let's get the image into place
    console.log("Starting Android launch image");
    const mainpath = path.join(process.cwd(), "android", "app", "src", "main");
    const respath = path.join(mainpath, "res");
    const drawablepath = path.join(respath, "drawable");
    if (!fs.existsSync(drawablepath)) fs.mkdirSync(drawablepath);
    fs.copyFileSync(
      imagepath,
      path.join(drawablepath, "launch_screen" + path.extname(imagepath))
    );
    const layoutpath = path.join(respath, "layout");
    if (!fs.existsSync(layoutpath)) fs.mkdirSync(layoutpath);
    if (!fs.existsSync(path.join(layoutpath, "launch_screen.xml"))) {
      fs.copyFileSync(
        path.join(__dirname, "templates", "launch_screen.xml"),
        path.join(layoutpath, "launch_screen.xml")
      );
    }
    //Let's check for
    const splashxmlpath = path.join(respath, "values", "splash.xml");
    if (fs.existsSync(splashxmlpath)) fs.unlinkSync(splashxmlpath);
    const splashbase = fs.readFileSync(
      path.join(__dirname, "templates", "splash.xml"),
      { encoding: "UTF8" }
    );
    let bg = getBGColor();
    if (bg === null) bg = "#000";
    const splashxml = mustache.render(splashbase, { color: bg });
    fs.writeFileSync(splashxmlpath, splashxml);
    fs.copyFileSync(
      path.join(__dirname, "templates", "fullscreen.background_splash.xml"),
      path.join(drawablepath, "background_splash.xml")
    );
    const jsbase = glob.sync(
      path.join(mainpath, "java", "**", "MainActivity.java")
    )[0];
    const AppjsPath = glob.sync(path.join(process.cwd(), "App.js"))[0];
    const splashactivitypath = path.join(
      path.dirname(jsbase),
      "SplashActivity.java"
    );
    if (!fs.existsSync(splashactivitypath)) {
      //Open the file to extract the package name
      const mainActivity = fs.readFileSync(jsbase, { encoding: "UTF8" });
      const mainActivityLines = mainActivity.split("\n");
      const packageLines = mainActivityLines.filter(l =>
        l.trim().startsWith("package")
      );
      const firstPackageLine = packageLines[0];
      const splash = fs.readFileSync(
        path.join(__dirname, "templates", "SplashActivity.java"),
        { encoding: "UTF8" }
      );
      const newSplash = [firstPackageLine, splash].join("\n");
      fs.writeFileSync(splashactivitypath, newSplash);
    }
    //Check out the manifest - this is where things get dicey
    const manifestPath = path.join(mainpath, "AndroidManifest.xml");
    const manifest = fs.readFileSync(manifestPath, { encoding: "UTF8" });
    //let's check for the splashactivity
    if (!manifest.includes("SplashActivity")) {
      //Let's get to work
      //Split into lines
      let lines = manifest.split("\n");
      //Shimmy down to the intent filter for the main activity
      const { newLines } = lines.reduce(
        (o, l) => {
          if (o.isApplication) {
            //Ask about this line
            o.newLines.push(l);
            if (l.trim().endsWith(">")) {
              o.isApplication = false;
              o.newLines = [...o.newLines, ...splashlines];
            }
          } else {
            if (l.includes("<application")) o.isApplication = true;
            if (l.includes("<intent-filter")) o.isIntent = true;

            if (!o.isIntent) {
              o.newLines.push(l);
            } else {
              if (l.includes("</intent-filter>")) o.isIntent = false;
            }
          }
          return o;
        },
        { newLines: [], isApplication: false }
      );
      const newManifest = newLines.join("\n");
      fs.writeFileSync(manifestPath, newManifest);
    }
    //Now check out mainactivity for auto-loading the splash
    const mainActivity = fs.readFileSync(jsbase, { encoding: "UTF8" });
    if (!mainActivity.includes("SplashScreen")) {
      if (!mainActivity.includes("onCreate")) {
        // Jam 'er in there
        let lines = mainActivity.split("\n");
        //find last import line
        const lastImportRev = [...lines]
          .reverse()
          .findIndex(l => l.trim().startsWith("import"));
        const lastImport = lines.length - lastImportRev;
        lines.splice(
          lastImport,
          0,
          "import android.os.Bundle;",
          "import org.devio.rn.splashscreen.SplashScreen;"
        );
        //Look for the mainactivity class
        const MainActivitySTART = lines.findIndex(l =>
          l.includes("public class MainActivity")
        );
        lines.splice(
          MainActivitySTART + 1,
          0,
          `
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.show(this);  // here
        super.onCreate(savedInstanceState);
    }`
        );
        fs.writeFileSync(jsbase, lines.join("\n"));
      } else {
        console.warn(
          "I could not modify the MainActivity because it looks like an onCreate override is already present."
        );
      }
    }
    console.log("Starting appjs check");
    const Appjs = fs.readFileSync(AppjsPath, { encoding: "UTF8" });
    //let's check it for reference to splashscreen
    if (!Appjs.includes("splashscreen")) {
      //Add splashscreen reference
      //find import line
      const Appjslines = Appjs.split("\n");
      //find last line
      const pos =
        Appjslines.length -
        [...Appjslines]
          .reverse()
          .findIndex(l => l.trim().startsWith("import "));
      Appjslines.splice(
        pos,
        0,
        `import SplashScreen from "react-native-splash-screen";`,
        `SplashScreen.hide();`
      );
      const out = Appjslines.join("\n");
      fs.writeFileSync(AppjsPath, out);
    }
    //#endregion Android
  } catch (e) {
    console.log("Could not load the starting image", e);
  }
})();
