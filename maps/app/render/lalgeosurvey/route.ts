export const dynamic = "force-dynamic";

const TOKEN_ASSIGNMENT_PATTERN =
  /const token = hostname\.includes\("lalgeo\.ca"\)[\s\S]*?;\n\n        mapkit\.init\(/;

function mapkitTokenScript() {
  const override = (process.env.MAPKIT_TOKEN || process.env.NEXT_PUBLIC_MAPKIT_TOKEN || "").trim();

  if (!override) {
    return `const token = hostname.includes("lalgeo.ca")
          ? "eyJraWQiOiJaNTM3TTc2Qk1RIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJKOTU2Mkw2TFE2IiwiaWF0IjoxNzQ3MDk1MzUwLCJvcmlnaW4iOiJsYWxnZW8uY2EifQ.lFsIe9182uBOQ_q2hW1JspNpieuttywt7TgL7GzzcOOCqTDi32Fd59waM4wZnUqys0xLt3Bh_hpK-OHZH6ocoA"
          : "eyJraWQiOiIzOVBKMjNNODVRIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJKOTU2Mkw2TFE2IiwiaWF0IjoxNzQ3MDk1MzUwLCJvcmlnaW4iOiJsYWxnZW8uY29tIn0.CIkZ1wlCStvy0oTTeH4AVBc5EigAa6JFFdFh5bjd7iMOOnVnJ_T4ZDplj5YtL4pxooL1iGYngNz9gAKP4VKgbw";`;
  }

  return `const token = ${JSON.stringify(override)};`;
}

export async function GET() {
  const sourceResponse = await fetch(new URL("/legacy/lalgeosurvey.html", process.env.URL || "https://maps.lalgeo.com"), {
    cache: "no-store",
  });

  if (!sourceResponse.ok) {
    return new Response("Unable to load LalGeo Maps shell.", { status: 500 });
  }

  const source = await sourceResponse.text();
  const html = source.replace(TOKEN_ASSIGNMENT_PATTERN, `${mapkitTokenScript()}\n\n        mapkit.init(`);

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
