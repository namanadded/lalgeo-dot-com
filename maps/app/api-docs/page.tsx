export const metadata = { title: "Map creation API | LalGeo Maps" };
const example = `curl https://maps.lalgeo.com/api/v1/maps \\
  -H 'Content-Type: application/json' \\
  -d '{
    "title": "Calgary community boundaries",
    "sourceUrl": "https://data.calgary.ca/d/ab7m-fwn6",
    "labelField": "name"
  }'`;
export default function ApiDocs() {
  return <main style={{ maxWidth: 860, margin: "48px auto", padding: "0 24px 60px", color: "#172b44", fontFamily: "system-ui", lineHeight: 1.65 }}>
    <a href="/">← LalGeo Maps</a>
    <h1>Create a map. Share a link.</h1>
    <p>Use a public GeoJSON URL, an Open Calgary dataset link, or your own GeoJSON to create a saved map snapshot. No API key, account, or Dropbox connection is required.</p>
    <p>In the map editor, open <strong>Tools → Share map</strong> to share your visible layers, or <strong>Tools → Map from URL</strong> to build a new map from public data.</p>
    <h2>For assistants and API clients</h2>
    <p>Read the <a href="/openapi.json">OpenAPI schema</a> to configure an API-capable assistant or a custom action. This is an HTTP API; a chatbot must have an HTTP/action tool configured to call it.</p>
    <ol>
      <li>Find a dataset: <a href="/api/v1/datasets?q=community%20boundaries">GET /api/v1/datasets?q=community boundaries</a>. Search currently covers Open Calgary. A portal homepage alone is not a dataset.</li>
      <li>Choose a result’s <code>sourceUrl</code>. POST a title and that URL to <code>/api/v1/maps</code>.</li>
      <li>Give the user the returned <code>shareUrl</code>. Keep <code>deleteToken</code> private; it can revoke the link.</li>
    </ol>
    <pre style={{ background: "#edf3fa", padding: 20, borderRadius: 12, overflow: "auto", whiteSpace: "pre-wrap" }}>{example}</pre>
    <p>A successful request returns HTTP 201 with <code>id</code>, <code>shareUrl</code>, <code>apiUrl</code>, <code>featureCount</code>, <code>createdAt</code>, and <code>deleteToken</code>.</p>
    <h2>Multiple layers and supplied data</h2>
    <p>Use <code>layers</code> instead of the top-level source URL. Each layer accepts <code>name</code>, <code>sourceUrl</code> or <code>geojson</code>, <code>labelField</code>, <code>color</code> (red, blue, green, orange, purple), <code>opacity</code> (0–1), <code>visible</code>, <code>labelsVisible</code>, and <code>popoutsVisible</code>. Polygon and line layers default to readable text labels with zoom-based thinning and no clustered popout pins; set those booleans when you want a different behavior. If GeoJSON is supplied, the source URL is retained only for attribution. Supported geometries include points, lines, polygons with holes, multi-geometries, and geometry collections in WGS84 longitude/latitude.</p>
    <h2>Sharing and limits</h2>
    <p>Anyone with the link can read the map and its attributes. Links are unlisted, not private. Share only data you intend to disclose. Snapshots do not refresh automatically and cannot be overwritten. Create a new link after editing. Attached images, hidden layers, archived records, and features excluded by an editor filter are not included by the Share map button.</p>
    <p>Limits: 3 MB per request, source response, or saved map; 12 layers; 10,000 features or expanded geometry parts per layer; 25,000 parts per map; 150,000 coordinate positions per layer and 300,000 per map. Maximum 100 fields per feature. Anonymous creation is limited to 20 attempts per connecting IP per hour; dataset search to 60. Large datasets are rejected rather than silently truncated. Use a filtered endpoint or simplify geometry first.</p>
    <p>Public HTTPS sources only. Private networks, credential-bearing URLs, and non-JSON responses are rejected. Other open-data portals are supported through direct GeoJSON URLs; automatic dataset-page resolution currently covers Calgary.</p>
    <h2>Read or revoke a link</h2>
    <p><code>GET /api/v1/maps/ID</code> retrieves the saved snapshot. <code>DELETE /api/v1/maps/ID</code> with <code>Authorization: Bearer DELETE_TOKEN</code> revokes it. There is no public listing or update endpoint. The browser keeps the deletion token locally; open the shared map on the same browser and choose <strong>Tools → Shared link → Stop sharing</strong>. Losing that token removes your self-service ability to revoke the link.</p>
    <p>Errors return JSON with <code>error</code>: 400 invalid input, 413 limits exceeded, 415 incorrect content type, 422 unusable data, 429 rate limit, 503 temporary storage/service failure, or 504 upstream timeout.</p>
  </main>;
}
