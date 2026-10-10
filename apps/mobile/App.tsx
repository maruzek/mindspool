import { Archivo_400Regular } from "@expo-google-fonts/archivo/400Regular";
import { Archivo_500Medium } from "@expo-google-fonts/archivo/500Medium";
import { Archivo_700Bold } from "@expo-google-fonts/archivo/700Bold";
import { Archivo_800ExtraBold } from "@expo-google-fonts/archivo/800ExtraBold";
import { useFonts } from "expo-font";
import { useConvexAuth } from "convex/react";
import { ActivityIndicator, Text, View } from "react-native";
import { AuthScreen } from "./src/AuthScreen";
import { ErrorBoundary } from "./src/library/ErrorBoundary";
import { LibraryScreen } from "./src/library/LibraryScreen";
import { Providers, isConfigured } from "./src/providers";
import { Screen } from "./src/Screen";
import { colors, text } from "./src/theme";

function Loading() {
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    </Screen>
  );
}

function Root() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) return <Loading />;
  return (
    <Screen>
      {isAuthenticated ? (
        <ErrorBoundary>
          <LibraryScreen />
        </ErrorBoundary>
      ) : (
        <AuthScreen />
      )}
    </Screen>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_700Bold,
    Archivo_800ExtraBold,
  });
  if (!isConfigured)
    return (
      <Screen>
        <View
          style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}
        >
          <Text style={text.heading}>MindSpool</Text>
          <Text style={text.body}>
            This build is not configured: set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
            and EXPO_PUBLIC_CONVEX_URL (see .env.example).
          </Text>
        </View>
      </Screen>
    );
  if (!fontsLoaded) return <Loading />;
  return (
    <Providers>
      <Root />
    </Providers>
  );
}
