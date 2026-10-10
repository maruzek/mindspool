import { useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import { ArrowLeft, ExternalLink } from "lucide-react-native";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  displayTitle,
  hostOfItem,
  kindOf,
  relativeDate,
} from "@mindspool/schema";
import { colors, fonts, rule, text } from "../theme";
import { BrandIcon } from "./BrandIcon";
import { ProcessingStatus } from "./ProcessingStatus";
import { SOURCES } from "./tags";

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={text.small}>{label}</Text>
      <Text selectable style={text.body}>
        {children}
      </Text>
    </View>
  );
}

/** Full item view, the phone counterpart of the web inspector panel. */
export function ItemDetailScreen({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const item = useQuery(api.items.detail, { id });
  const url = item
    ? (item.originalUrl ??
      (item.inputType === "url" ? item.originalInput : undefined))
    : undefined;
  const kind = item ? kindOf(item) : "link";
  const meta = item?.sourceMetadata;
  const images = (item?.imageAssets ?? []).flatMap((asset) =>
    asset.kind === "external" ? [asset.url] : [],
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 8,
          paddingVertical: 8,
          borderBottomWidth: rule,
          borderBottomColor: colors.divider,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to library"
          onPress={onBack}
          android_ripple={{ color: colors.hover }}
          style={{ padding: 8 }}
        >
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={[text.heading, { fontSize: 18 }]}>Item</Text>
      </View>
      {item === undefined ? (
        <View style={{ padding: 24 }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : item === null ? (
        <View style={{ padding: 24, gap: 4 }}>
          <Text style={text.title}>Not found</Text>
          <Text style={text.small}>
            That item does not exist, or it is not yours.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View style={{ gap: 4 }}>
            <Text selectable style={[text.heading, { fontSize: 20 }]}>
              {displayTitle(item)}
            </Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <BrandIcon
                host={hostOfItem(item)}
                kind={kind}
                color={colors.muted}
              />
              <Text style={[text.small, { flexShrink: 1 }]}>
                Saved {relativeDate(item._creationTime)} · via{" "}
                {SOURCES[item.captureSource]}
              </Text>
            </View>
            <ProcessingStatus status={item.enrichmentStatus} />
          </View>
          {url && (
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(url)}
              android_ripple={{ color: colors.accent700 }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 12,
                backgroundColor: colors.accent,
              }}
            >
              <ExternalLink size={16} color={colors.onAccent} />
              <Text
                style={{
                  fontFamily: fonts.bold,
                  fontSize: 14,
                  color: colors.onAccent,
                }}
              >
                Open original
              </Text>
            </Pressable>
          )}
          {kind === "note" ? (
            <Text selectable style={text.body}>
              {item.originalInput}
            </Text>
          ) : (
            <View style={{ gap: 12 }}>
              {url && <Fact label="URL">{url}</Fact>}
              {meta?.description && (
                <Fact label="Description">{meta.description}</Fact>
              )}
              {meta?.author && <Fact label="Author">{meta.author}</Fact>}
              {meta?.siteName && <Fact label="Site">{meta.siteName}</Fact>}
              {item.extractedText && (
                <Fact label="Text">{item.extractedText}</Fact>
              )}
            </View>
          )}
          {images.map((src) => (
            <Image
              key={src}
              source={{ uri: src }}
              style={{
                width: "100%",
                aspectRatio: 1,
                backgroundColor: colors.tile,
              }}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
