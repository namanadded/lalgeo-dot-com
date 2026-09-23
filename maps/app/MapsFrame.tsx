"use client";

import { useEffect, useRef, useState } from "react";

const MAPS_API_REDEEM_URL = "https://api.lalgeo.com/v1/map-open/redeem";
const OPEN_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const OPEN_MESSAGE = "lalgeo:open-api-copy";
const OPEN_RESULT_MESSAGE = "lalgeo:open-api-copy-result";

type HandoffState =
  | { kind: "hidden" }
  | { kind: "ready" }
  | { kind: "opening" }
  | { kind: "opened"; projectName: string }
  | { kind: "error"; message: string; requestId?: string };

function visibleState(state: HandoffState) {
  return state.kind !== "hidden";
}

export default function MapsFrame({ sharedMapId }: { sharedMapId?: string } = {}) {
  const legacyMapUrl = sharedMapId
    ? `/render/lalgeosurvey?sharedMap=${encodeURIComponent(sharedMapId)}`
    : process.env.NEXT_PUBLIC_LEGACY_MAP_URL || "/render/lalgeosurvey";
  const frameRef = useRef<HTMLIFrameElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const capabilityRef = useRef<string | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [handoff, setHandoff] = useState<HandoffState>({ kind: "hidden" });

  const dialogOpen = visibleState(handoff);

  useEffect(() => {
    const captureOpenCapability = () => {
      const hash = window.location.hash;
      if (!hash) return;

      const params = new URLSearchParams(hash.slice(1));
      const openValues = params.getAll("open");
      if (!openValues.length) return;

      // Fragments stay in the browser, but scrub the capability before showing any UI.
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);

      const onlyOpenParameter = [...params.keys()].every((key) => key === "open");
      const capability = openValues.length === 1 ? openValues[0] : "";
      if (!onlyOpenParameter || !OPEN_TOKEN_PATTERN.test(capability)) {
        capabilityRef.current = null;
        setHandoff({
          kind: "error",
          message: "This link is incomplete. Ask the sender to create a new map link.",
        });
        return;
      }

      capabilityRef.current = capability;
      setHandoff({ kind: "ready" });
    };

    captureOpenCapability();
    window.addEventListener("hashchange", captureOpenCapability);
    return () => window.removeEventListener("hashchange", captureOpenCapability);
  }, []);

  useEffect(() => {
    shellRef.current?.toggleAttribute("inert", dialogOpen);
    if (!dialogOpen) return;
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [dialogOpen, handoff.kind, frameReady]);

  useEffect(() => {
    const receiveOpenResult = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (!event.data || event.data.type !== OPEN_RESULT_MESSAGE) return;

      if (resultTimerRef.current !== null) {
        window.clearTimeout(resultTimerRef.current);
        resultTimerRef.current = null;
      }

      if (event.data.ok === true) {
        setHandoff({
          kind: "opened",
          projectName: typeof event.data.projectName === "string" && event.data.projectName.trim()
            ? event.data.projectName.trim()
            : "the API map",
        });
        return;
      }

      setHandoff({
        kind: "error",
        message: typeof event.data.message === "string" && event.data.message.trim()
          ? event.data.message.trim()
          : "The API returned a project that Maps could not open. Ask the sender for a new link.",
        requestId: typeof event.data.requestId === "string" ? event.data.requestId : undefined,
      });
    };

    window.addEventListener("message", receiveOpenResult);
    return () => {
      window.removeEventListener("message", receiveOpenResult);
      if (resultTimerRef.current !== null) window.clearTimeout(resultTimerRef.current);
    };
  }, []);

  const closeHandoff = () => {
    if (handoff.kind === "opening") return;
    capabilityRef.current = null;
    setHandoff({ kind: "hidden" });
    window.setTimeout(() => frameRef.current?.focus(), 0);
  };

  const openEditableCopy = async () => {
    const capability = capabilityRef.current;
    capabilityRef.current = null;
    if (!capability || !frameReady) return;

    setHandoff({ kind: "opening" });
    try {
      const response = await fetch(MAPS_API_REDEEM_URL, {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token: capability }),
      });
      const requestId = response.headers.get("x-request-id") || undefined;
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const unavailable = response.status === 404 || payload?.error?.code === "OPEN_LINK_UNAVAILABLE";
        setHandoff({
          kind: "error",
          message: unavailable
            ? "This one-time link has expired or was already used. Ask the sender to create a new one."
            : "LalGeo Maps could not open this copy. Ask the sender to create a new link.",
          requestId,
        });
        return;
      }

      if (!payload?.project || typeof payload.project !== "object" || !Array.isArray(payload.project.layers)) {
        setHandoff({
          kind: "error",
          message: "The API returned a project that Maps could not read. Ask the sender to create a new link.",
          requestId,
        });
        return;
      }

      const target = frameRef.current?.contentWindow;
      if (!target) {
        setHandoff({
          kind: "error",
          message: "The map workspace did not finish loading. Refresh, then ask the sender for a new link.",
          requestId,
        });
        return;
      }

      target.postMessage({ type: OPEN_MESSAGE, payload, requestId }, window.location.origin);
      resultTimerRef.current = window.setTimeout(() => {
        resultTimerRef.current = null;
        setHandoff({
          kind: "error",
          message: "The secure copy was received, but the map workspace did not open it. Refresh, then ask the sender for a new link.",
          requestId,
        });
      }, 15_000);
    } catch {
      setHandoff({
        kind: "error",
        message: "LalGeo Maps could not reach the API. Ask the sender to create a new link.",
      });
    }
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && handoff.kind !== "opening") {
      event.preventDefault();
      closeHandoff();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
    ) || [])].filter((control) => control.offsetParent !== null);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const title = handoff.kind === "ready"
    ? "Open this API map?"
    : handoff.kind === "opening"
      ? "Opening a secure copy…"
      : handoff.kind === "opened"
        ? "Your copy is ready"
        : "This map link can’t be opened";

  return (
    <>
      <main
        ref={shellRef}
        className="maps-shell"
        aria-hidden={dialogOpen ? true : undefined}
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100vh",
          margin: 0,
          overflow: "hidden",
          background: "#f8fafc",
        }}
      >
        <style>{`
          @supports (height: 100dvh) {
            .maps-shell {
              height: 100dvh !important;
            }
          }
          .map-open-backdrop {
            position: fixed;
            inset: 0;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: rgba(15, 23, 42, 0.42);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
          }
          .map-open-dialog {
            box-sizing: border-box;
            width: min(440px, calc(100vw - 32px));
            padding: 28px;
            border: 1px solid rgba(255, 255, 255, 0.72);
            border-radius: 24px;
            background: rgba(255, 255, 255, 0.98);
            box-shadow: 0 28px 80px rgba(15, 23, 42, 0.24);
            color: #0f172a;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          .map-open-icon {
            display: grid;
            place-items: center;
            width: 48px;
            height: 48px;
            margin-bottom: 20px;
            border-radius: 14px;
            background: #eaf2ff;
            color: #0759c7;
            font-size: 25px;
            font-weight: 700;
          }
          .map-open-dialog h1 {
            margin: 0;
            font-size: 25px;
            line-height: 1.15;
            letter-spacing: -0.025em;
          }
          .map-open-dialog p {
            margin: 12px 0 0;
            color: #526070;
            font-size: 15px;
            line-height: 1.5;
          }
          .map-open-request-id {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 12px !important;
            overflow-wrap: anywhere;
          }
          .map-open-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 26px;
          }
          .map-open-actions button {
            min-height: 44px;
            padding: 0 18px;
            border: 0;
            border-radius: 12px;
            font: inherit;
            font-weight: 650;
            cursor: pointer;
          }
          .map-open-actions button:focus-visible {
            outline: 3px solid rgba(29, 116, 232, 0.3);
            outline-offset: 2px;
          }
          .map-open-secondary {
            background: #eef1f5;
            color: #253244;
          }
          .map-open-primary {
            background: #176fe3;
            color: white;
          }
          .map-open-primary:disabled {
            cursor: wait;
            opacity: 0.58;
          }
          .map-open-spinner {
            width: 24px;
            height: 24px;
            border: 3px solid #cfe0f8;
            border-top-color: #176fe3;
            border-radius: 50%;
            animation: map-open-spin 0.8s linear infinite;
          }
          @keyframes map-open-spin { to { transform: rotate(360deg); } }
          @media (max-width: 560px) {
            .map-open-backdrop {
              align-items: flex-end;
              padding: 0;
            }
            .map-open-dialog {
              width: 100%;
              padding: 24px 20px calc(20px + env(safe-area-inset-bottom, 0px));
              border-right: 0;
              border-bottom: 0;
              border-left: 0;
              border-radius: 26px 26px 0 0;
            }
            .map-open-actions {
              flex-direction: column-reverse;
            }
            .map-open-actions button { width: 100%; min-height: 48px; }
          }
          @media (prefers-reduced-motion: reduce) {
            .map-open-spinner { animation-duration: 1.8s; }
          }
        `}</style>
        <iframe
          ref={frameRef}
          src={legacyMapUrl}
          title="LalGeo Maps"
          allow="geolocation; clipboard-read; clipboard-write; fullscreen"
          scrolling="no"
          onLoad={() => setFrameReady(true)}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            border: 0,
            overflow: "hidden",
          }}
        />
      </main>

      {dialogOpen ? (
        <div className="map-open-backdrop">
          <div
            ref={dialogRef}
            className="map-open-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-open-title"
            aria-describedby="map-open-description"
            aria-busy={handoff.kind === "opening"}
            onKeyDown={handleDialogKeyDown}
          >
            <div className="map-open-icon" aria-hidden="true">
              {handoff.kind === "opening" ? <span className="map-open-spinner" /> : handoff.kind === "opened" ? "✓" : "↗"}
            </div>
            <h1 id="map-open-title">{title}</h1>
            <p id="map-open-description" aria-live="polite">
              {handoff.kind === "ready" ? (
                frameReady
                  ? "This one-time link imports an editable local copy. Changes you make here won’t update the original API map."
                  : "The map workspace is getting ready. You can open the copy as soon as it finishes loading."
              ) : handoff.kind === "opening" ? (
                "The link is being exchanged once, then the returned project will stay in this browser."
              ) : handoff.kind === "opened" ? (
                <>Opened “{handoff.projectName}” as a local project. Changes stay in this copy.</>
              ) : handoff.message}
            </p>
            {handoff.kind === "error" && handoff.requestId ? (
              <p className="map-open-request-id">Request ID: {handoff.requestId}</p>
            ) : null}
            <div className="map-open-actions">
              {handoff.kind === "ready" ? (
                <>
                  <button type="button" className="map-open-secondary" onClick={closeHandoff}>Not now</button>
                  <button
                    type="button"
                    className="map-open-primary"
                    data-autofocus
                    disabled={!frameReady}
                    onClick={openEditableCopy}
                  >
                    {frameReady ? "Open editable copy" : "Getting Maps ready…"}
                  </button>
                </>
              ) : handoff.kind === "opening" ? (
                <button type="button" className="map-open-primary" data-autofocus disabled>Opening…</button>
              ) : handoff.kind === "opened" ? (
                <button type="button" className="map-open-primary" data-autofocus onClick={closeHandoff}>Start editing</button>
              ) : (
                <button type="button" className="map-open-primary" data-autofocus onClick={closeHandoff}>Close</button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
