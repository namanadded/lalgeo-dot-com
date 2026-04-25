import { redirect } from "next/navigation";
import { headers } from "next/headers";
import MapsFrame from "./maps/MapsFrame";

export default async function HomePage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host")?.split(":")[0].toLowerCase();

  if (host === "maps.lalgeo.com") {
    return <MapsFrame />;
  }

  redirect("/login");
}
