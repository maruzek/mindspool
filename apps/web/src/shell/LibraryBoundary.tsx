import { Component } from "react";
import type { ReactNode } from "react";
import { Button } from "@mindspool/ui/components/button";
import { StateNotice } from "./StateNotice";

export class LibraryBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <StateNotice role="alert" title="Your library could not load">
          <p>Your unsaved input is kept. Try reconnecting.</p>
          <Button onClick={() => window.location.reload()}>Reconnect</Button>
        </StateNotice>
      );
    return this.props.children;
  }
}
