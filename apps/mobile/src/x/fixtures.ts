/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "__fixtures__");

export const fixture = (name: string): string =>
  readFileSync(join(dir, name), "utf8");

/** A fetch that answers by host from recorded files: `[status, file]`. */
export function fakeFetch(answers: {
  fx?: [number, string];
  syn?: [number, string];
}): typeof fetch & { calls: string[] } {
  const calls: string[] = [];
  const impl = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const answer = url.includes("api.fxtwitter.com") ? answers.fx : answers.syn;
    if (!answer) throw new TypeError("Network request failed");
    return new Response(fixture(answer[1]), { status: answer[0] });
  };
  return Object.assign(impl, { calls }) as typeof fetch & { calls: string[] };
}
