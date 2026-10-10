import { UserButton } from "@clerk/expo/native";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Text,
  View,
} from "react-native";
import { colors, rule, text } from "../theme";
import { BrandMark } from "./BrandMark";
import { ItemDetailScreen } from "./ItemDetailScreen";
import { ItemRow } from "./ItemRow";
import { useLibraryItems } from "./useLibraryItems";
import type { PreviewItem } from "./types";

function Notice({ children }: { children: string }) {
  return (
    <View style={{ padding: 24, alignItems: "center" }}>
      <Text style={[text.body, { color: colors.muted, textAlign: "center" }]}>
        {children}
      </Text>
    </View>
  );
}

export function LibraryScreen() {
  const feed = useLibraryItems();
  const { isAuthenticated } = useConvexAuth();
  const stats = useQuery(api.items.stats, isAuthenticated ? {} : "skip");
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (openId === null) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setOpenId(null);
      return true;
    });
    return () => sub.remove();
  }, [openId]);
  if (openId !== null)
    return <ItemDetailScreen id={openId} onBack={() => setOpenId(null)} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: rule,
          borderBottomColor: colors.divider,
        }}
      >
        <BrandMark />
        <Text style={[text.heading, { flex: 1 }]}>Library</Text>
        {stats && <Text style={text.small}>{stats.total} items</Text>}
        <View style={{ width: 36, height: 36 }}>
          <UserButton />
        </View>
      </View>
      {feed.status === "LoadingFirstPage" ? (
        <View style={{ padding: 24 }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={feed.results}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <ItemRow item={item} onPress={() => setOpenId(item._id)} />
          )}
          onEndReached={() => {
            if (feed.status === "CanLoadMore") feed.loadMore();
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <Notice>
              Nothing saved yet. Share an X post to MindSpool to add one.
            </Notice>
          }
          ListFooterComponent={
            feed.status === "LoadingMore" ? (
              <ActivityIndicator color={colors.accent} style={{ margin: 16 }} />
            ) : null
          }
        />
      )}
    </View>
  );
}
