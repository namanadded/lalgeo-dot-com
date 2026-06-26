export default function MapsFrame() {
  const legacyMapUrl = process.env.NEXT_PUBLIC_LEGACY_MAP_URL || "/render/lalgeosurvey";

  return (
    <main
      className="maps-shell"
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
      `}</style>
      <iframe
        src={legacyMapUrl}
        title="LalGeo Maps"
        allow="geolocation; clipboard-read; clipboard-write; fullscreen"
        scrolling="no"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          border: 0,
          overflow: "hidden",
        }}
      />
    </main>
  );
}
