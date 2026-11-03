import { redirect } from "next/navigation";

/** Root: the proxy sends signed-out visitors to /login; signed-in users land on the dashboard. */
export default function Home() {
  redirect("/dashboard");
}
