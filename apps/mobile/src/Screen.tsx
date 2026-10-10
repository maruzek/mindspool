import { StatusBar, View } from "react-native";
import type { ReactNode } from "react";
import { colors } from "./theme";

/**
 * Full-screen container that keeps content below the status bar (Android
 * draws edge to edge) and above the navigation bar.
 */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingTop: StatusBar.currentHeight ?? 0,
        paddingBottom: 24,
      }}
    >
      <StatusBar
        barStyle="dark-content"
        translucent
        backgroundColor="transparent"
      />
      {children}
    </View>
  );
}
