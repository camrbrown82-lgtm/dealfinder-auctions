"use client";

import { AdminShell } from "@/components/admin/AdminShell";
import { FloorStudio } from "@/components/admin/FloorStudio";

export default function AdminStreamPage() {
  return (
    <AdminShell
      title="Floor stream"
      subtitle="Film an item as it comes in. Stopping the recording saves it on the media page, then you can download it or open YouTube, Facebook, TikTok, or Instagram with the caption copied."
    >
      <FloorStudio />
    </AdminShell>
  );
}
