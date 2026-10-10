import { AuthView } from "@clerk/expo/native";
import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { BrandMark } from "./library/BrandMark";
import { colors, fonts, rule, text } from "./theme";

/** Signed-out screen. Shares need a signed-in session; the share target tells the user to sign in here first. */
export function AuthScreen() {
  const [authOpen, setAuthOpen] = useState(false);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        justifyContent: "center",
        alignItems: "center",
        gap: 20,
        padding: 24,
      }}
    >
      <BrandMark size={40} />
      <Text style={[text.heading, { fontSize: 32 }]}>MindSpool</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => setAuthOpen(true)}
        style={{
          paddingVertical: 12,
          paddingHorizontal: 24,
          backgroundColor: colors.accent,
          borderWidth: rule,
          borderColor: colors.accent,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.bold,
            fontSize: 15,
            color: colors.onAccent,
          }}
        >
          Sign in or create account
        </Text>
      </Pressable>
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
