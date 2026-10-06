import type { ReactNode } from "react";

/** A full-area message for loading, setup, and failure states. */
export function StateNotice({
  role,
  title,
  children,
}: {
  role: "status" | "alert";
  title: string;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 p-6">
      <section
        role={role}
        className="flex flex-col items-start gap-3 border-2 border-border bg-card p-6"
      >
        <h1 className="text-xl">{title}</h1>
        {children}
      </section>
    </main>
  );
}
