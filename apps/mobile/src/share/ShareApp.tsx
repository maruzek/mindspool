import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { BackHandler, ToastAndroid } from "react-native";
import { api } from "@mindspool/backend/api";
import { messageOf, saveShared } from "../clip/saveClip";
import { Providers, isConfigured } from "../providers";

function toast(message: string) {
  ToastAndroid.show(message, ToastAndroid.LONG);
}

/** Closes the translucent ShareActivity, which returns to the app the user shared from. */
function finish() {
  BackHandler.exitApp();
}

function BackgroundShare({ shareText }: { shareText: string }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const create = useMutation(api.items.create);
  const started = useRef(false);

  useEffect(() => {
    if (isLoading || started.current) return;
    started.current = true;
    if (!isAuthenticated) {
      toast("Open MindSpool and sign in, then share again");
      finish();
      return;
    }
    toast("Saving to MindSpool…");
    void saveShared(shareText, { fetch, create })
      .then((outcome) => toast(messageOf(outcome)))
      .catch(() => toast("Something went wrong"))
      .finally(finish);
  }, [isLoading, isAuthenticated, shareText, create]);

  return null;
}

/**
 * Root of the invisible share target (see plugins/withBackgroundShare.js):
 * saves the shared X post and closes without ever showing the app.
 */
export function ShareApp({ shareText }: { shareText?: string }) {
  useEffect(() => {
    if (shareText && isConfigured) return;
    toast(
      shareText
        ? "MindSpool is not configured in this build"
        : "Nothing to save",
    );
    finish();
  }, [shareText]);
  if (!shareText || !isConfigured) return null;
  return (
    <Providers>
      <BackgroundShare shareText={shareText} />
    </Providers>
  );
}
