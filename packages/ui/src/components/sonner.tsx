import { Toaster as Sonner, toast } from "sonner";
import type { ToasterProps } from "sonner";
import { CircleCheckIcon, OctagonXIcon } from "lucide-react";

/**
 * Square, hairline-bordered toasts with the hard offset shadow the primary
 * button uses. Styled through `--normal-*` and class names, no theme provider.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-center"
      icons={{
        success: <CircleCheckIcon className="size-4" aria-hidden="true" />,
        error: <OctagonXIcon className="size-4" aria-hidden="true" />,
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--card-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "!border-2 !font-heading !text-sm !font-extrabold !shadow-[3px_3px_0_var(--ms-accent-900)]",
          icon: "!text-primary",
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
