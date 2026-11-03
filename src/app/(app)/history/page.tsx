import { redirect } from "next/navigation";

/** Legacy route — kept so old links keep working. */
export default function LegacyRedirect() {
  redirect("/character-history");
}
