import { useAuth } from "@clerk/expo";
import { AuthView, UserButton } from "@clerk/expo/native";
import { useState } from "react";
import { ActivityIndicator, Button, Modal, Text, View } from "react-native";

export function AuthScreen() {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const [authOpen, setAuthOpen] = useState(false);
  if (!isLoaded)
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 20,
      }}
    >
      <Text style={{ fontSize: 32, fontWeight: "600" }}>MindSpool</Text>
      {isSignedIn ? (
        <UserButton />
      ) : (
        <Button
          title="Sign in or create account"
          onPress={() => setAuthOpen(true)}
        />
      )}
      <Modal
        visible={authOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAuthOpen(false)}
      >
        <AuthView onDismiss={() => setAuthOpen(false)} />
      </Modal>
    </View>
  );
}
