"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Backwards compatibility: older secret links pointed at `/?s=…`.
 * The employee console now lives at `/employee`, so forward them there.
 */
export default function SecretLinkRedirect() {
  const router = useRouter();
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s");
    if (s) router.replace(`/employee?s=${s}`);
  }, [router]);
  return null;
}
