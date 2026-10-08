import { redditIdentityFromUrl, redditPostUrl } from "@mindspool/schema";
import type { RedditCapture } from "@mindspool/schema";

function safeOutboundUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? value
      : null;
  } catch {
    return null;
  }
}

const textStyle =
  "max-h-80 overflow-auto text-sm break-words whitespace-pre-wrap";

export function RedditCapturePreview({ capture }: { capture: RedditCapture }) {
  const outbound = safeOutboundUrl(capture.outboundUrl);
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Post" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Post</h3>
        {capture.postText && (
          <div tabIndex={0} aria-label="Post text" className={textStyle}>
            {capture.postText}
          </div>
        )}
        <a
          href={redditPostUrl(capture.postId)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline"
        >
          Open post on Reddit
        </a>
        {outbound && (
          <a
            href={outbound}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline"
          >
            Open captured link
          </a>
        )}
      </section>
      {capture.comments.length > 0 && (
        <section aria-label="Selected comments" className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Selected comments</h3>
          <ol className="flex flex-col gap-4">
            {capture.comments.map((comment) => {
              const identity = redditIdentityFromUrl(comment.permalink);
              const safe =
                comment.permalink.startsWith("https:") &&
                identity?.postId === capture.postId &&
                identity.commentId === comment.commentId;
              return (
                <li
                  key={comment.commentId}
                  className="flex flex-col gap-2 border-t pt-3"
                >
                  {comment.author && (
                    <p className="text-sm font-medium">{comment.author}</p>
                  )}
                  <div
                    tabIndex={0}
                    aria-label="Selected comment text"
                    className={textStyle}
                  >
                    {comment.text}
                  </div>
                  {safe && (
                    <a
                      href={comment.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm underline"
                    >
                      Open comment on Reddit
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
