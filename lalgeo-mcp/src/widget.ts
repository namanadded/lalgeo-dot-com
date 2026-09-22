export const MAP_WIDGET_URI = "ui://lalgeo/map.html";

export const MAP_WIDGET_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root { color-scheme: light dark; font: 14px/1.35 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #173332; background: #f4f8f7; }
    .shell { position: relative; min-height: 330px; overflow: hidden; background: linear-gradient(145deg, #dbecea, #f8fbfa); }
    header { position: absolute; z-index: 2; top: 12px; left: 12px; display: flex; align-items: center; gap: 12px; max-width: calc(100% - 24px); padding: 9px 10px 9px 12px; border: 1px solid #b8d4d0; border-radius: 12px; background: rgba(255,255,255,.92); box-shadow: 0 5px 18px rgba(22,68,65,.12); }
    .heading { min-width: 0; }
    h1 { margin: 0; font-size: 15px; color: #164844; }
    #status { margin-top: 2px; color: #54706e; font-size: 12px; }
    svg { display: block; width: 100%; height: 330px; touch-action: none; cursor: grab; }
    svg.dragging { cursor: grabbing; }
    .grid { stroke: #c6dcda; stroke-width: 1; vector-effect: non-scaling-stroke; }
    .feature { stroke: #0f766e; fill: rgba(20,184,166,.22); stroke-width: 3; vector-effect: non-scaling-stroke; }
    .point { fill: #0f766e; stroke: white; stroke-width: 2; vector-effect: non-scaling-stroke; cursor: pointer; }
    #details { position: absolute; z-index: 2; right: 12px; bottom: 12px; display: none; width: min(270px, calc(100% - 24px)); max-height: 120px; overflow: auto; margin: 0; padding: 9px 11px; border: 1px solid #b8d4d0; border-radius: 10px; background: rgba(255,255,255,.94); color: #294c49; font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
    .empty { position: absolute; inset: 0; display: grid; place-items: center; padding: 70px 24px 24px; color: #54706e; text-align: center; }
    #open { display: none; flex: none; border: 0; border-radius: 9px; padding: 8px 11px; background: #0f766e; color: white; font: inherit; font-weight: 650; cursor: pointer; }
    #open:hover { background: #115e59; } #open:disabled { opacity: .65; cursor: wait; }
    @media (prefers-color-scheme: dark) {
      body, .shell { color: #e6f3f1; background: #122523; }
      .shell { background: linear-gradient(145deg, #163431, #1f2928); }
      header, #details { background: rgba(20,41,39,.94); border-color: #315b57; color: #d8ece9; }
      h1 { color: #d9f4f0; } #status { color: #a9c5c1; } .grid { stroke: #31514e; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header><div class="heading"><h1 id="title">LalGeo map</h1><div id="status">Waiting for map data…</div></div><button id="open" type="button">Open in LalGeo</button></header>
    <svg id="map" viewBox="0 0 800 500" role="img" aria-label="Interactive LalGeo map"><g id="viewport"></g></svg>
    <div id="empty" class="empty">The map is ready. Add GeoJSON features to see them here.</div>
    <pre id="details"></pre>
  </main>
  <script>
    (() => {
      const svg = document.getElementById("map");
      const viewport = document.getElementById("viewport");
      const empty = document.getElementById("empty");
      const details = document.getElementById("details");
      const title = document.getElementById("title");
      const status = document.getElementById("status");
      const openButton = document.getElementById("open");
      let box = { x: 0, y: 0, width: 800, height: 500 };
      let drag = null;
      let currentMapId = null;
      let requestId = 0;
      const pending = new Map();

      const element = (name, attributes = {}) => {
        const node = document.createElementNS("http://www.w3.org/2000/svg", name);
        for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
        return node;
      };

      function normalizeGeometry(geometry) {
        if (!geometry || typeof geometry !== "object") return null;
        if (geometry.type === "Point") {
          if (Array.isArray(geometry.coordinates)) return { type: "Point", paths: [[geometry.coordinates]] };
          if (Number.isFinite(geometry.lng) && Number.isFinite(geometry.lat)) return { type: "Point", paths: [[[geometry.lng, geometry.lat]]] };
        }
        if (geometry.type === "LineString") {
          const coordinates = geometry.coordinates || [];
          return { type: "LineString", paths: [coordinates.map((point) => Array.isArray(point) ? point : [point.lng, point.lat])] };
        }
        if (geometry.type === "Polygon") {
          const rings = geometry.rings || geometry.coordinates || [];
          return { type: "Polygon", paths: rings.map((ring) => ring.map((point) => Array.isArray(point) ? point : [point.lng, point.lat])) };
        }
        return null;
      }

      function collectFeatures(result) {
        if (result?.operation === "add_features") return result.context?.features || [];
        if (result?.operation === "export_map") {
          return (result.data?.project?.layers || []).flatMap((layer) => (layer.features || []).map((feature) => ({
            type: "Feature", id: feature.id, geometry: feature.geometry, properties: feature.attributes || {},
          })));
        }
        return [];
      }

      function mapName(result) {
        return result?.data?.map?.name || result?.data?.project?.name || result?.context?.map_id || "LalGeo map";
      }

      function mapId(result) {
        return result?.data?.map?.id || result?.data?.project?.id || result?.context?.map_id || result?.context?.requested_map?.id || null;
      }

      function request(method, params) {
        const id = ++requestId;
        window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
        return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      }

      async function openExternal(href) {
        const target = new URL(href);
        if (target.origin !== "https://maps.lalgeo.com" || target.pathname !== "/maps" || !/^#open=[0-9a-f]{64}$/.test(target.hash)) throw new Error("LalGeo returned an invalid map URL.");
        if (window.openai?.openExternal) return window.openai.openExternal({ href, redirectUrl: false });
        window.open(href, "_blank", "noopener,noreferrer");
      }

      function render(result) {
        if (!result || typeof result !== "object") return;
        const features = collectFeatures(result).map((feature) => ({ ...feature, normalized: normalizeGeometry(feature.geometry) })).filter((feature) => feature.normalized);
        const coordinates = features.flatMap((feature) => feature.normalized.paths.flat());
        title.textContent = mapName(result);
        currentMapId = mapId(result);
        openButton.style.display = currentMapId ? "block" : "none";
        status.textContent = features.length ? features.length + (features.length === 1 ? " feature" : " features") + " · drag to pan · scroll to zoom" : "Map created · add features to preview geometry";
        empty.style.display = coordinates.length ? "none" : "grid";
        viewport.replaceChildren();
        details.style.display = "none";

        let minLng = -114.18, maxLng = -113.96, minLat = 50.96, maxLat = 51.15;
        if (coordinates.length) {
          minLng = Math.min(...coordinates.map((point) => point[0])); maxLng = Math.max(...coordinates.map((point) => point[0]));
          minLat = Math.min(...coordinates.map((point) => point[1])); maxLat = Math.max(...coordinates.map((point) => point[1]));
          const lngPad = Math.max((maxLng - minLng) * .15, .002); const latPad = Math.max((maxLat - minLat) * .15, .002);
          minLng -= lngPad; maxLng += lngPad; minLat -= latPad; maxLat += latPad;
        } else {
          const center = result?.data?.map?.center;
          if (center) { minLng = center.longitude - .11; maxLng = center.longitude + .11; minLat = center.latitude - .095; maxLat = center.latitude + .095; }
        }
        const project = ([lng, lat]) => [40 + ((lng - minLng) / (maxLng - minLng)) * 720, 460 - ((lat - minLat) / (maxLat - minLat)) * 420];

        for (let index = 1; index < 8; index++) {
          viewport.append(element("line", { x1: index * 100, y1: 0, x2: index * 100, y2: 500, class: "grid" }));
        }
        for (let index = 1; index < 5; index++) {
          viewport.append(element("line", { x1: 0, y1: index * 100, x2: 800, y2: index * 100, class: "grid" }));
        }
        for (const feature of features) {
          for (const path of feature.normalized.paths) {
            const projected = path.map(project);
            let node;
            if (feature.normalized.type === "Point") {
              node = element("circle", { cx: projected[0][0], cy: projected[0][1], r: 7, class: "point" });
            } else {
              const points = projected.map((point) => point.join(",")).join(" ");
              node = element(feature.normalized.type === "Polygon" ? "polygon" : "polyline", {
                points, class: "feature", ...(feature.normalized.type === "Polygon" ? {} : { fill: "none" }),
              });
            }
            node.addEventListener("click", (event) => {
              event.stopPropagation(); details.textContent = JSON.stringify(feature.properties || { id: feature.id }, null, 2); details.style.display = "block";
            });
            viewport.append(node);
          }
        }
        box = { x: 0, y: 0, width: 800, height: 500 }; svg.setAttribute("viewBox", "0 0 800 500");
      }

      svg.addEventListener("wheel", (event) => {
        event.preventDefault();
        const scale = event.deltaY > 0 ? 1.14 : .86;
        const nextWidth = Math.min(2400, Math.max(180, box.width * scale));
        const nextHeight = nextWidth * .625;
        box.x += (box.width - nextWidth) / 2; box.y += (box.height - nextHeight) / 2; box.width = nextWidth; box.height = nextHeight;
        svg.setAttribute("viewBox", [box.x, box.y, box.width, box.height].join(" "));
      }, { passive: false });
      svg.addEventListener("pointerdown", (event) => { drag = { x: event.clientX, y: event.clientY, box: { ...box } }; svg.setPointerCapture(event.pointerId); svg.classList.add("dragging"); });
      svg.addEventListener("pointermove", (event) => {
        if (!drag) return; const rect = svg.getBoundingClientRect();
        box.x = drag.box.x - (event.clientX - drag.x) * box.width / rect.width; box.y = drag.box.y - (event.clientY - drag.y) * box.height / rect.height;
        svg.setAttribute("viewBox", [box.x, box.y, box.width, box.height].join(" "));
      });
      svg.addEventListener("pointerup", () => { drag = null; svg.classList.remove("dragging"); });
      svg.addEventListener("click", () => { details.style.display = "none"; });

      openButton.addEventListener("click", async () => {
        if (!currentMapId || openButton.disabled) return;
        openButton.disabled = true; openButton.textContent = "Preparing…";
        try {
          const toolResult = window.openai?.callTool
            ? await window.openai.callTool("export_map", { map_id: currentMapId })
            : await request("tools/call", { name: "export_map", arguments: { map_id: currentMapId } });
          const metadata = toolResult?._meta || window.openai?.toolResponseMetadata || {};
          const href = metadata["lalgeo/openUrl"];
          if (typeof href !== "string") throw new Error("LalGeo did not return an open link.");
          await openExternal(href);
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : "LalGeo could not open this map.";
        } finally {
          openButton.disabled = false; openButton.textContent = "Open in LalGeo";
        }
      });

      window.addEventListener("message", (event) => {
        if (event.source !== window.parent) return;
        const message = event.data;
        if (message?.jsonrpc === "2.0" && message.id !== undefined && pending.has(message.id)) {
          const request = pending.get(message.id); pending.delete(message.id);
          if (message.error) request.reject(message.error); else request.resolve(message.result);
          return;
        }
        if (message?.jsonrpc === "2.0" && message.method === "ui/notifications/tool-result") render(message.params?.structuredContent);
      }, { passive: true });
      if (window.openai?.toolOutput) render(window.openai.toolOutput);
    })();
  </script>
</body>
</html>`;
