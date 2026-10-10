import { registerRootComponent } from "expo";
import { AppRegistry } from "react-native";
import App from "./App";
import { ShareApp } from "./src/share/ShareApp";

registerRootComponent(App);
// Started by ShareActivity, never by MainActivity.
AppRegistry.registerComponent("share", () => ShareApp);
