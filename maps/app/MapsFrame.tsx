export default function MapsFrame() {
  const legacyMapUrl = process.env.NEXT_PUBLIC_LEGACY_MAP_URL || "/render/lalgeosurvey";

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100dvh",
        margin: 0,
        overflow: "hidden",
        background: "#f8fafc",
      }}
    >
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
