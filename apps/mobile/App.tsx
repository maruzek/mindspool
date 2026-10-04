import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Text, View, StyleSheet } from "react-native";
import { AuthScreen } from "./src/AuthScreen";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function App() {
  if (!publishableKey)
    return (
      <View style={styles.container}>
        <Text style={styles.title}>MindSpool</Text>
        <Text>Sign-in is not configured for this environment.</Text>
      </View>
    );
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <AuthScreen />
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  title: { fontSize: 32, fontWeight: "600" },
});
