import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .insert(userProfiles)
    .values({ userId: user.id })
    .onConflictDoNothing({ target: userProfiles.userId });

  return NextResponse.json({ success: true });
}
