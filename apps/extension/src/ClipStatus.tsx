export function ClipStatus({ webUrl }: { webUrl: string }) {
  return (
    <>
      <p role="status">Clipping on x.com is on</p>
      <a href={webUrl} target="_blank" rel="noopener noreferrer">
        Open MindSpool
      </a>
    </>
  );
}
