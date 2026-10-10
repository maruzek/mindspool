import { Bookmark, LoaderCircle, TriangleAlert } from "lucide-react-native";
import { Text, View } from "react-native";
import { colors, fonts } from "../theme";
import type { PreviewItem } from "./types";

const COPY = {
  not_started: "Saved — original stored",
  pending: "Processing…",
  failed: "Extraction failed — link kept",
} as const;

/** One quiet line under a row; nothing once processing has succeeded. */
export function ProcessingStatus({
  status,
}: {
  status: PreviewItem["enrichmentStatus"];
}) {
  if (status === "succeeded") return null;
  const color = status === "pending" ? colors.accent : colors.muted;
  const Glyph =
    status === "not_started"
      ? Bookmark
      : status === "pending"
        ? LoaderCircle
        : TriangleAlert;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Glyph size={14} color={color} />
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color }}>
        {COPY[status]}
      </Text>
    </View>
  );
}
