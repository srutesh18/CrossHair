import { redirect } from "next/navigation";

/** The radar now lives on the main screen. */
export default function RadarPage() {
  redirect("/finder");
}
