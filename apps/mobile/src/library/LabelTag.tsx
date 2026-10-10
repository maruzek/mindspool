import { LoaderCircle, Sparkles } from "lucide-react-native";
import { Text, View } from "react-native";
import { colors, fonts, rule } from "../theme";
import type { Tag } from "./tags";

/** Web `LabelTag`: confirmed solid, suggested dashed, manual neutral. */
export function LabelTag({ tag }: { tag: Tag }) {
  const confirmed = tag.state === "confirmed";
  const suggested = tag.state === "suggested";
  const color = confirmed
    ? colors.onAccent
    : suggested
      ? colors.accent700
      : colors.neutral800;
  return (
    <View
      accessibilityLabel={suggested ? `${tag.text} (unsure)` : undefined}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 2,
          borderWidth: suggested ? rule : 1,
          borderStyle: suggested ? "dashed" : "solid",
          borderColor: confirmed || suggested ? colors.accent : "transparent",
          backgroundColor: confirmed
            ? colors.accent
            : suggested
              ? "transparent"
              : colors.neutral100,
        },
      ]}
    >
      {suggested && <Sparkles size={11} color={color} />}
      {tag.busy && <LoaderCircle size={11} color={color} />}
      <Text
        style={{
          fontFamily: fonts.medium,
          fontSize: 11,
          letterSpacing: 0.22,
          color,
        }}
      >
        {tag.text}
      </Text>
    </View>
  );
}
