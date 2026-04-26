export default function MapsFrame() {
  const legacyMapUrl = process.env.NEXT_PUBLIC_LEGACY_MAP_URL || "https://lalgeo.com/lalgeosurvey.html";

  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        overflow: "hidden",
        background: "#f8fafc",
      }}
    >
      <iframe
        src={legacyMapUrl}
        title="LalGeo Maps"
        allow="geolocation; clipboard-read; clipboard-write; fullscreen"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          border: 0,
        }}
      />
    </main>
  );
}
