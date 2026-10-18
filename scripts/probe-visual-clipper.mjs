// Disposable Task 0 probes; never bundled into the MindSpool extension.
// Use --fixture-only to test the built product instead of generating probe extensions.
// Run from the repository root: node scripts/probe-visual-clipper.mjs
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const fixtureOnly = process.argv.includes("--fixture-only");
const port = Number(
  process.argv.find((arg) => arg.startsWith("--port="))?.slice(7) ?? 0,
);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("Invalid fixture port");

const assets = {
  "background.js": String.raw`const api = globalThis.browser ?? chrome;
api.contextMenus
  .removeAll()
  .then(() =>
    api.contextMenus.create({
      id: "capture-image",
      title: "Save image to MindSpool (probe)",
      contexts: ["image"],
      documentUrlPatterns: ["http://127.0.0.1/*"],
    }),
  );
api.contextMenus.onClicked.addListener((info, tab) =>
  api.storage.local.set({ menuResult: { srcUrl: info.srcUrl, tabId: tab.id } }),
);
api.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== api.runtime.id || message.target !== "background") return;
  api.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    reply({ started: true });
    setTimeout(
      () =>
        run(tab, message.mode)
          .then((result) => api.storage.local.set({ result }))
          .catch((error) =>
            api.storage.local.set({ result: { error: String(error) } }),
          ),
      250,
    );
  });
  return true;
});
async function run(tab, mode) {
  if (!tab?.url?.startsWith("http://127.0.0.1:"))
    throw Error("Open the local capture fixture first.");
  await api.storage.local.set({ result: null });
  if (api.offscreen && !(await api.offscreen.hasDocument()))
    await api.offscreen.createDocument({
      url: "processor.html",
      reasons: ["BLOBS"],
      justification:
        "Disposable proof of canvas image processing after popup closure",
    });
  if (!api.offscreen && !document.getElementById("processor")) {
    const frame = document.createElement("iframe");
    frame.id = "processor";
    frame.src = api.runtime.getURL("processor.html");
    document.body.append(frame);
    await new Promise((resolve) => (frame.onload = resolve));
  }
  const [{ result: original }] = await api.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      x: scrollX,
      y: scrollY,
      height: document.documentElement.scrollHeight,
      width: innerWidth,
      viewport: innerHeight,
    }),
  });
  const tiles = [];
  if (original.y !== 0)
    throw Error("Scroll the fixture to its top before running the probe.");
  try {
    for (let y = 0; y < original.height; y += original.viewport) {
      const [{ result: actual }] = await api.scripting.executeScript({
        target: { tabId: tab.id },
        func: (offset) => {
          if (offset > 0)
            document.querySelector("header").style.visibility = "hidden";
          scrollTo(0, offset);
          return scrollY;
        },
        args: [y],
      });
      await new Promise((resolve) => setTimeout(resolve, 650));
      const [active] = await api.tabs.query({
        active: true,
        windowId: tab.windowId,
      });
      if (active?.id !== tab.id) throw Error("Target tab changed.");
      tiles.push({
        y: actual,
        url: await api.tabs.captureVisibleTab(tab.windowId, { format: "png" }),
      });
      if (mode === "viewport" || actual + original.viewport >= original.height)
        break;
    }
    const result = await api.runtime.sendMessage({
      target: "processor",
      tiles,
      width: original.width,
      height: mode === "viewport" ? original.viewport : original.height,
    });
    return {
      ...result,
      mode,
      tiles: tiles.length,
      offsets: tiles.map((tile) => tile.y),
      popupClosed: !(api.runtime.getContexts
        ? (await api.runtime.getContexts({ contextTypes: ["POPUP"] })).length
        : api.extension.getViews({ type: "popup" }).length),
    };
  } finally {
    await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: (state) => {
        document.querySelector("header").style.visibility = "";
        scrollTo(state.x, state.y);
      },
      args: [original],
    });
  }
}
`,
  "processor.js": String.raw`const api = globalThis.browser ?? chrome;
api.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== api.runtime.id || message.target !== "processor") return;
  (async () => {
    const images = [];
    for (const tile of message.tiles) {
      const image = await createImageBitmap(
        await (await fetch(tile.url)).blob(),
      );
      images.push({ ...tile, image });
    }
    const scale = images[0].image.width / message.width;
    const canvas = document.createElement("canvas");
    canvas.width = images[0].image.width;
    canvas.height = Math.round(message.height * scale);
    const ctx = canvas.getContext("2d");
    for (const tile of images) {
      ctx.drawImage(tile.image, 0, Math.round(tile.y * scale));
      tile.image.close();
    }
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.9),
    );
    const bottom = Array.from(
      ctx.getImageData(0, canvas.height - 1, 1, 1).data,
    );
    reply({
      encoded: canvas.toDataURL("image/webp", 0.9),
      width: canvas.width,
      height: canvas.height,
      bytes: blob.size,
      type: blob.type,
      bottom,
      processorOrigin: location.origin,
    });
  })().catch((error) => reply({ error: String(error) }));
  return true;
});
`,
  "processor.html": String.raw`<!doctype html><html><body><script src="processor.js"></script></body></html>
`,
  "popup.js": String.raw`const api = globalThis.browser ?? chrome;
async function refresh() {
  const { result, menuResult } = await api.storage.local.get([
    "result",
    "menuResult",
  ]);
  const { encoded, ...summary } = result ?? {};
  document.getElementById("result").textContent = JSON.stringify(
    { capture: result ? summary : null, imageMenu: menuResult ?? null },
    null,
    2,
  );
}
for (const [id, mode] of [
  ["viewport", "viewport"],
  ["full", "full-page"],
])
  document.getElementById(id).onclick = async () => {
    await api.runtime.sendMessage({ target: "background", kind: "run", mode });
    window.close();
  };
document.getElementById("open").onclick = () =>
  api.tabs.create({ url: api.runtime.getURL("result.html") });
api.storage.onChanged.addListener(refresh);
refresh();
`,
  "popup.html": String.raw`<!doctype html><html><head><meta charset="utf-8"><style>body{width:380px;font:14px system-ui;padding:12px}button{margin:4px}pre{white-space:pre-wrap;overflow-wrap:anywhere}img{max-width:100%}</style></head><body><h1>Capture feasibility probe</h1><p>On the local fixture, run a capture. This popup closes; wait three seconds and reopen it.</p><button id="viewport">Run viewport</button><button id="full">Run scroll/stitch</button><button id="open">Inspect captured image</button><pre id="result" role="status"></pre><script src="popup.js"></script></body></html>`,
  "result.js": String.raw`const api = globalThis.browser ?? chrome;
api.storage.local.get("result").then(({ result }) => {
  document.getElementById("summary").textContent = result
    ? JSON.stringify({
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        type: result.type,
      })
    : "Run a capture first.";
  if (result?.encoded) document.getElementById("visual").src = result.encoded;
});
`,
  "result.html": String.raw`<!doctype html><html><head><meta charset="utf-8"><title>Captured probe image</title><style>body{margin:0}img{max-width:100%;height:auto}</style></head><body><p id="summary"></p><img id="visual" alt="Captured visual"><script src="result.js"></script></body></html>`,
};
const common = {
  manifest_version: 3,
  name: "MindSpool disposable capture probe",
  version: "0.0.1",
  permissions: ["activeTab", "scripting", "storage", "contextMenus"],
  action: { default_popup: "popup.html" },
};
const directory = fixtureOnly
  ? undefined
  : await mkdtemp(join(tmpdir(), "mindspool-visual-probe-"));
for (const name of fixtureOnly ? [] : ["chrome", "firefox"]) {
  const destination = join(directory, name);
  await mkdir(destination);
  for (const [filename, source] of Object.entries(assets))
    await writeFile(join(destination, filename), source);
  const manifest =
    name === "chrome"
      ? {
          ...common,
          permissions: [...common.permissions, "offscreen"],
          background: { service_worker: "background.js" },
        }
      : {
          ...common,
          background: { scripts: ["background.js"] },
          browser_specific_settings: {
            gecko: {
              id: "visual-probe@mindspool.local",
              data_collection_permissions: { required: ["none"] },
            },
          },
        };
  await writeFile(
    join(destination, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAIAAACO1KzYAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAB1UlEQVR4nO2VAQ3AIADDkHNtczpXV/E0400qgKwUTp5K7h3h4CeQKNhLEAv2EsQnOv/7EfyDiztQMD9TZrHg4g4UzM+UWSy4uAMF8zNlFgsu7kDB/EyZxYKLO1AwP1NmseDiDhTMz5RZLLi4AwXzM2UWCy7uQMH8TJnFgos7UDA/U2ax4OIOFMzPlFksuLgDBfMzZRYLLu5AwfxMmcWCiztQMD9TZrHg4g4UzM+UWSy4uAMF8zNlFgsu7kDB/EyZxYKLO1AwP1NmseDiDhTMz5RZLLi4AwXzM2UWCy7uQMH8TJnFgos7UDA/U2ax4OIOFMzPlFksuLgDBfMzZRYLLu5AwfxMmcWCiztQMD9TZrHg4g4UzM+UWSy4uAMF8zNlFgsu7kDB/EyZxYKLO1AwP1NmseDiDhTMz5RZLLi4AwXzM2UWCy7uQMH8TJnFgos7UDA/U2ax4OIOFMzPlFksuLgDBfMzZRYLLu5AwfxMmcWCiztQMD9TZrHg4g4UzM+UWSy4uAMF8zNlFgsu7kDB/EyZxYKLO1AwP1NmseDiDhTMz5RZLLi4AwXzM2UWCy7uQMH8TJnFgos7UDA/U2ax4OIOFMzPlFksuLgDBfMzZRYLLu7gU17wirxt8FC8uwAAAABJRU5ErkJggg==",
  "base64",
);
const fixture = `<!doctype html><html><head><title>MindSpool capture fixture</title><style>
*{box-sizing:border-box}body{margin:0;height:2100px;background:linear-gradient(blue,green);font:20px system-ui}
header{position:fixed;top:0;width:100%;height:80px;background:red}
main{padding:130px 24px}img{display:block}footer{position:absolute;top:2060px;color:white}
</style></head><body><header>Sticky capture fixture — red appears only once</header><main>
<img src="/target.png" alt="Purple native image menu target" width="160" height="100">
<p>Right-click the purple image, then choose Save image to MindSpool${fixtureOnly ? "" : " (probe)"}.</p>
<p>Run captures from the top. Keep this tab selected until the capture finishes.</p>
</main><footer>Bottom edge — must be present in the full-page image</footer></body></html>`;
const server = createServer((request, response) => {
  if (request.url === "/target.png") {
    response.writeHead(200, { "Content-Type": "image/png" });
    response.end(image);
  } else {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(fixture);
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});
console.log(`Fixture: http://127.0.0.1:${server.address().port}/`);
if (fixtureOnly) {
  console.log(
    "Use the built MindSpool extension. Keep this terminal open; Ctrl+C stops the fixture.",
  );
} else {
  console.log(`Chrome: load unpacked folder ${join(directory, "chrome")}`);
  console.log(
    `Firefox: load temporary add-on ${join(directory, "firefox", "manifest.json")}`,
  );
  console.log(
    "Keep this terminal open. Remove the probe extensions when finished; Ctrl+C stops the fixture.",
  );
}
