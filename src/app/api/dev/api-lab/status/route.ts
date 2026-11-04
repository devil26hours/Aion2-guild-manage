import { requireDeveloper } from "@/lib/auth/developer";
import { json, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

/** GET /api/dev/api-lab/status — DEV only: has an API Lab password been set yet? */
export async function GET(request: Request) {
  const auth = await requireDeveloper(request);
  if (auth.response) return auth.response;
  try {
    const { data, error } = await auth.supabase.rpc("dev_api_lab_status");
    if (error) throw toDbError(error);
    return json({ configured: data === true });
  } catch (e) {
    return storageFailure(e);
  }
}
