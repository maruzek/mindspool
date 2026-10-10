import { View } from "react-native";
import { colors } from "../theme";

/** The two-square MindSpool mark: accent block with two ground-colored corners (web `BrandMark`). */
export function BrandMark({ size = 20 }: { size?: number }) {
  const corner = {
    position: "absolute",
    width: size * 0.48,
    height: size * 0.48,
    backgroundColor: colors.bg,
  } as const;
  return (
    <View
      accessible={false}
      style={{ width: size, height: size, backgroundColor: colors.accent }}
    >
      <View style={[corner, { right: 0, bottom: 0 }]} />
      <View style={[corner, { left: 0, top: 0 }]} />
    </View>
  );
}
