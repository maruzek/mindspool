import { Link, StickyNote } from "lucide-react-native";
import { View } from "react-native";
import Svg, { Line } from "react-native-svg";
import { colors } from "../theme";

const WIDTH = 72;
const HEIGHT = 56;

// 135deg hatch, a line every 7px like the web tile's repeating gradient.
const HATCH = Array.from(
  { length: Math.ceil((WIDTH + HEIGHT) / 7) },
  (_, i) => i * 7,
);

/** Media placeholder: hatched tonal tile with the kind glyph (web `ItemThumb`). */
export function ItemThumb({ kind }: { kind: "link" | "note" }) {
  const Glyph = kind === "link" ? Link : StickyNote;
  return (
    <View
      accessible={false}
      style={{
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: colors.tile,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Svg
        width={WIDTH}
        height={HEIGHT}
        style={{ position: "absolute" }}
        pointerEvents="none"
      >
        {HATCH.map((x) => (
          <Line
            key={x}
            x1={x}
            y1={0}
            x2={x - HEIGHT}
            y2={HEIGHT}
            stroke={colors.tileGlyph}
            strokeOpacity={0.14}
            strokeWidth={1}
          />
        ))}
      </Svg>
      <Glyph size={20} color={colors.tileGlyph} />
    </View>
  );
}
