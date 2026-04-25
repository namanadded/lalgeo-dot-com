export default function MapsFrame() {
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
        src="/legacy/lalgeosurvey.html"
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
