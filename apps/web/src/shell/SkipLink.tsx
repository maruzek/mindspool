/** First tab stop: jumps past the navigation to the page content. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      onClick={(event) => {
        event.preventDefault();
        document.getElementById("main")?.focus();
      }}
    >
      Skip to content
    </a>
  );
}
