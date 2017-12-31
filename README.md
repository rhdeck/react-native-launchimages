# react-native-launchimages

Never have ugly launch/splash screens again!

# Usage

```
yarn add react-native-launchimages
react-native setlaunchimage
```

Directives set will be saved in your package.json for easy replication in the future.

Any subsequent run on react-native link updates the library of launch images based on the source path or URL.

**Note**: you can set the launch screen image to a URL, which makes it easy to put in a nice-looking launch image via a Google Images search or the like. Just get it via "copy image address/link" and paste into the command line above.

# Limitations

This is currently for IOS-based RN apps only

# Dependencies

This requires imagemagick to be installed. If its missing, don't worry: the plugin will recommend how you might install it.
