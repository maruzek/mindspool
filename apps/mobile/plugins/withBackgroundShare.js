// Adds a translucent, UI-less share target. The Android share sheet starts
// ShareActivity, which runs the "share" React component (src/share/ShareApp.tsx)
// with the shared text as a prop and finishes itself, so the app never opens
// on top of the app the user shared from.
const fs = require("node:fs");
const path = require("node:path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");

const ACTIVITY = ".ShareActivity";

const kotlin = (pkg) => `package ${pkg}

import android.content.Intent
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

/** Receives text/plain shares and hands the text to the "share" component as initial props. */
class ShareActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "share"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    val activity = this
    return ReactActivityDelegateWrapper(
      this,
      BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {
        override fun getLaunchOptions(): Bundle =
          Bundle().apply {
            putString("shareText", activity.intent?.getStringExtra(Intent.EXTRA_TEXT))
          }
      })
  }
}
`;

const STYLES = `<resources>
  <style name="Theme.App.Share" parent="AppTheme">
    <item name="android:windowIsTranslucent">true</item>
    <item name="android:windowBackground">@android:color/transparent</item>
    <item name="android:windowNoTitle">true</item>
    <item name="android:windowAnimationStyle">@null</item>
    <item name="android:backgroundDimEnabled">false</item>
  </style>
</resources>
`;

module.exports = function withBackgroundShare(config) {
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      const pkg = cfg.android?.package;
      if (!pkg)
        throw new Error("withBackgroundShare: android.package is required");
      const root = cfg.modRequest.platformProjectRoot;
      const source = path.join(root, "app/src/main/java", ...pkg.split("."));
      const values = path.join(root, "app/src/main/res/values");
      fs.mkdirSync(source, { recursive: true });
      fs.mkdirSync(values, { recursive: true });
      fs.writeFileSync(path.join(source, "ShareActivity.kt"), kotlin(pkg));
      fs.writeFileSync(path.join(values, "share_styles.xml"), STYLES);
      return cfg;
    },
  ]);

  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    application.activity ??= [];
    if (!application.activity.some((a) => a.$["android:name"] === ACTIVITY))
      application.activity.push({
        $: {
          "android:name": ACTIVITY,
          "android:theme": "@style/Theme.App.Share",
          "android:exported": "true",
          "android:excludeFromRecents": "true",
          "android:taskAffinity": "",
          "android:configChanges":
            "keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|smallestScreenSize",
        },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "android.intent.action.SEND" } }],
            category: [
              { $: { "android:name": "android.intent.category.DEFAULT" } },
            ],
            data: [{ $: { "android:mimeType": "text/plain" } }],
          },
        ],
      });
    return cfg;
  });
};
