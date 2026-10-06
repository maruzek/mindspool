export function NotBuilt({ title }: { title: string }) {
  return (
    <section className="flex flex-col gap-2 p-6">
      <h1 className="text-2xl">{title}</h1>
      <p className="text-muted-foreground">Not built yet.</p>
    </section>
  );
}
