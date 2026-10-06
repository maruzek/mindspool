export function NotFound() {
  return (
    <section className="flex flex-col gap-2 p-6">
      <h1 className="text-2xl">Not found</h1>
      <p className="text-muted-foreground">
        That page or item does not exist, or it is not yours.
      </p>
    </section>
  );
}
