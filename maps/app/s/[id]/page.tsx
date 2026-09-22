import MapsFrame from "../../MapsFrame";
import { validMapId } from "../../../lib/map-store";
import { notFound } from "next/navigation";

export const metadata = { title: "Shared map | LalGeo Maps", robots: { index: false, follow: false } };
export default async function SharedMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validMapId(id)) notFound();
  return <MapsFrame sharedMapId={id} />;
}
