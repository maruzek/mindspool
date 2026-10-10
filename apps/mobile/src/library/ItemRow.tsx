import { Pressable, Text, View } from "react-native";
import {
  displayTitle,
  hostOfItem,
  kindOf,
  relativeDate,
} from "@mindspool/schema";
import { colors, fonts, rule, text } from "../theme";
import { BrandIcon } from "./BrandIcon";
import { ItemThumb } from "./ItemThumb";
import { LabelTag } from "./LabelTag";
import { ProcessingStatus } from "./ProcessingStatus";
import { SOURCES, tagsOf } from "./tags";
import type { PreviewItem } from "./types";

/**
 * Library list row: thumb · title/source/status · date, with the labels
 * always below (the web hides them under 768px; the phone design shows them).
 */
export function ItemRow({
  item,
  onPress,
  highlighted,
}: {
  item: PreviewItem;
  onPress: () => void;
  highlighted?: boolean;
}) {
  const kind = kindOf(item);
  const host = hostOfItem(item);
  const tags = tagsOf(item);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      android_ripple={{ color: colors.hover }}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: rule,
        borderBottomColor: colors.divider,
        backgroundColor: highlighted ? colors.accent100 : "transparent",
      }}
    >
      <ItemThumb kind={kind} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={[text.title, { fontSize: 15 }]}>
          {displayTitle(item)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <BrandIcon host={host} kind={kind} color={colors.muted} />
          <Text numberOfLines={1} style={[text.small, { flexShrink: 1 }]}>
            {kind === "note" ? "note" : (host ?? "link")} · via{" "}
            {SOURCES[item.captureSource]}
          </Text>
        </View>
        <ProcessingStatus status={item.enrichmentStatus} />
        {tags.length > 0 && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 4,
            }}
          >
            {tags.map((tag) => (
              <LabelTag key={tag.key} tag={tag} />
            ))}
          </View>
        )}
      </View>
      <Text
        style={{
          fontFamily: fonts.regular,
          fontSize: 12,
          color: colors.muted,
          minWidth: 40,
          textAlign: "right",
        }}
      >
        {relativeDate(item._creationTime)}
      </Text>
    </Pressable>
  );
}
