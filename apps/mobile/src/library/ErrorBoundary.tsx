import { Component } from "react";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { colors, fonts, rule, text } from "../theme";

const AUTO_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

type State = { failed: boolean; exhausted: boolean };

/**
 * Shows a retryable message when a live query throws while rendering. A few
 * automatic retries come first: the usual cause is a session the server has
 * not confirmed yet, which resolves on its own.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, exhausted: false };
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch() {
    if (this.attempts >= AUTO_RETRIES) {
      this.setState({ exhausted: true });
      return;
    }
    this.attempts += 1;
    this.timer = setTimeout(
      () => this.setState({ failed: false }),
      RETRY_DELAY_MS,
    );
  }

  componentWillUnmount() {
    clearTimeout(this.timer);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (!this.state.exhausted) return null;
    return (
      <View style={{ padding: 24, gap: 16, alignItems: "center" }}>
        <Text style={[text.body, { textAlign: "center" }]}>
          Could not load your Library.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            this.attempts = 0;
            this.setState({ failed: false, exhausted: false });
          }}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderWidth: rule,
            borderColor: colors.accent,
          }}
        >
          <Text style={{ fontFamily: fonts.bold, color: colors.accent }}>
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }
}
