/* Public snapshot sharing. The editor passes only visible geometry and attributes. */
(() => {
  const style = document.createElement("style");
  style.textContent = `
    .map-share-dialog{box-sizing:border-box;width:min(520px,calc(100vw - 32px));max-height:85vh;overflow:auto;border:1px solid #dbe3ed;border-radius:18px;padding:24px;color:#172b44;background:white;box-shadow:0 24px 80px #15233a40;font:15px/1.5 system-ui,sans-serif}
    .map-share-dialog::backdrop{background:#0f172a66}.map-share-dialog h2{margin:0 0 12px;font-size:23px}.map-share-dialog p{margin:10px 0}.map-share-dialog label{display:block;font-weight:600;margin-top:14px}
    .map-share-dialog input{box-sizing:border-box;width:100%;padding:10px;border:1px solid #b8c7d8;border-radius:8px;font:inherit}.map-share-dialog button{padding:10px 14px;margin:12px 8px 0 0;border:1px solid #b8c7d8;border-radius:8px;background:#f1f5f9;color:#172b44;cursor:pointer;font:inherit}.map-share-dialog button.primary{background:#155bc4;border-color:#155bc4;color:white}.map-share-dialog button:disabled{opacity:.6;cursor:wait}.map-share-dialog a{color:#155bc4}.map-share-dialog .status{overflow-wrap:anywhere}.map-share-dialog .error{color:#a41625}
  `;
  document.head.append(style);
  function element(tag, text) { const el = document.createElement(tag); if (text) el.textContent = text; return el; }
  async function api(url, options) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(60000) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Sharing failed. Please retry.");
    return body;
  }
  function dialog(title) {
    document.querySelector(".map-share-dialog")?.remove();
    const node = element("dialog"); node.className = "map-share-dialog";
    const heading = element("h2", title); heading.id = "map-share-title";
    node.setAttribute("aria-labelledby", heading.id); node.append(heading);
    document.body.append(node);
    const close = element("button", "Close"); close.type = "button";
    close.addEventListener("click", () => node.close());
    node.addEventListener("close", () => node.remove());
    return { node, close };
  }
  function showShare(payload) {
    const { node, close } = dialog("Share map");
    node.append(element("p", "Create a saved snapshot that anyone with the link can open. No Dropbox or sign-in needed."));
    const count = payload.layers.reduce((n, l) => n + l.geojson.features.length, 0);
    node.append(element("p", `${count.toLocaleString()} features in ${payload.layers.length} visible layers. Includes attributes and current filters; excludes hidden layers, archived records, and attached photos. Later edits won’t change this link.`));
    const title = element("input"); title.value = payload.title; title.maxLength = 160; title.id = "map-share-name";
    const label = element("label", "Map title"); label.htmlFor = title.id; node.append(label, title);
    const status = element("p"); status.className = "status"; status.setAttribute("role", "status");
    const create = element("button", "Create shareable link"); create.className = "primary"; create.type = "button";
    node.append(status, create, close);
    create.addEventListener("click", async () => {
      create.disabled = true; title.disabled = true; status.textContent = "Saving shared map…"; status.classList.remove("error");
      try {
        const result = await api("/api/v1/maps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, title: title.value }) });
        const link = element("input"); link.readOnly = true; link.value = result.shareUrl; link.setAttribute("aria-label", "Shareable map link");
        const open = element("a", "Open shared map"); open.href = result.shareUrl; open.target = "_blank"; open.rel = "noopener noreferrer";
        const copy = element("button", "Copy link"); copy.type = "button";
        copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(result.shareUrl); status.textContent = "Link copied."; } catch { link.focus(); link.select(); status.textContent = "Select and copy the link above."; } });
        const revoke = element("button", "Stop sharing"); revoke.type = "button";
        const key = `lalgeo-share-${result.id}`;
        try { localStorage.setItem(key, result.deleteToken); } catch { /* Link remains usable even if storage is full. */ }
        revoke.addEventListener("click", async () => {
          revoke.disabled = true;
          try {
            await api(`/api/v1/maps/${result.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${result.deleteToken}` } });
            localStorage.removeItem(key); status.textContent = "Sharing stopped. This link no longer opens the map.";
            open.remove(); link.remove(); copy.remove(); revoke.remove();
          } catch (error) { status.textContent = error.message; revoke.disabled = false; }
        });
        create.remove(); status.textContent = "Your shareable link is ready.";
        node.insertBefore(link, status); node.insertBefore(open, status); node.insertBefore(copy, close); node.insertBefore(revoke, close);
      } catch (error) { status.textContent = error.message; status.classList.add("error"); create.disabled = false; title.disabled = false; }
    });
    node.showModal();
  }
  function showSourceCreator(onCreated) {
    const { node, close } = dialog("Map from a public URL");
    node.append(element("p", "Paste a public GeoJSON endpoint or an Open Calgary dataset link to create a map and shareable link."));
    const label = element("label", "Dataset URL"); label.htmlFor = "map-source-url";
    const input = element("input"); input.id = "map-source-url"; input.type = "url"; input.placeholder = "https://data.calgary.ca/d/ab7m-fwn6";
    const docs = element("a", "API guide and dataset search"); docs.href = "/api-docs"; docs.target = "_blank"; docs.rel = "noopener noreferrer";
    const status = element("p"); status.setAttribute("role", "status");
    const create = element("button", "Create map & link"); create.type = "button"; create.className = "primary";
    node.append(label, input, element("p", "Anyone with the resulting link can view the snapshot."), docs, status, create, close);
    create.addEventListener("click", async () => {
      if (!input.reportValidity() || !input.value) return;
      create.disabled = true; status.textContent = "Fetching data and creating your map…";
      try {
        const result = await api("/api/v1/maps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceUrl: input.value }) });
        try { localStorage.setItem(`lalgeo-share-${result.id}`, result.deleteToken); } catch {}
        node.close(); onCreated(result);
      } catch (error) { status.textContent = error.message; create.disabled = false; }
    });
    node.showModal();
  }
  async function manageLink(id) {
    const { node, close } = dialog("Shared map link");
    const url = `${location.origin}/s/${id}`;
    const link = element("input"); link.readOnly = true; link.value = url; link.setAttribute("aria-label", "Shareable map link");
    const status = element("p", "This link opens the original snapshot. Use Share map to publish any edits as a new snapshot."); status.setAttribute("role", "status");
    const copy = element("button", "Copy link"); copy.type = "button";
    copy.onclick = async () => { try { await navigator.clipboard.writeText(url); status.textContent = "Link copied."; } catch { link.focus(); link.select(); } };
    node.append(link, status, copy, close);
    let token; try { token = localStorage.getItem(`lalgeo-share-${id}`); } catch {}
    if (token) {
      const revoke = element("button", "Stop sharing"); revoke.type = "button";
      revoke.onclick = async () => {
        revoke.disabled = true;
        try { await api(`/api/v1/maps/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }); localStorage.removeItem(`lalgeo-share-${id}`); status.textContent = "Sharing stopped."; revoke.remove(); copy.remove(); link.remove(); }
        catch (error) { status.textContent = error.message; revoke.disabled = false; }
      };
      node.insertBefore(revoke, close);
    }
    node.showModal();
  }
  window.LalGeoSharing = { showShare, showSourceCreator, manageLink, load: (id) => api(`/api/v1/maps/${id}`) };
})();
