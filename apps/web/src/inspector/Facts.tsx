import type { ReactNode } from "react";

/** A section heading shared by every block of the inspector. */
export function SectionHeading({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <h3
      id={id}
      className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
    >
      {children}
    </h3>
  );
}

/** Label above value, one pair per block. */
export function FactList({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col gap-3">{children}</dl>;
}

export function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  );
}

/** A web URL as a link that opens in a new tab; anything else stays text. */
export function UrlValue({ value }: { value: string }) {
  let safe = false;
  try {
    const { protocol } = new URL(value.trim());
    safe = protocol === "http:" || protocol === "https:";
  } catch {
    // Not a URL: plain text.
  }
  if (!safe) return <span className="break-all">{value}</span>;
  return (
    <a
      href={value.trim()}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {value}
      <span className="sr-only"> (new tab)</span>
    </a>
  );
}
