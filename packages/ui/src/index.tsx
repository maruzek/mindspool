import type { ReactNode } from "react";

export function WorkspaceShell({ children }: { children?: ReactNode }) {
  return (
    <main className="workspace">
      <header>
        <p className="eyebrow">MindSpool</p>
        <h1>Your ideas, in one place.</h1>
      </header>
      {children}
    </main>
  );
}
