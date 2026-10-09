import { Component } from "react";
import type { ReactNode } from "react";
import { Button } from "@mindspool/ui/components/button";
/** Query failures stay local so an unrelated read cannot discard the editing session. */
export class BoardReadBoundary extends Component<
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
        <div role="alert" className="p-3 text-sm">
          Could not load board previews. Your board draft is kept.{" "}
          <Button
            variant="outline"
            size="sm"
            onClick={() => this.setState({ failed: false })}
          >
            Retry loading
          </Button>
        </div>
      );
    return this.props.children;
  }
}
