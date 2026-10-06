"use client";

import { AdminShell } from "@/components/admin/AdminShell";
import { FloorStudio } from "@/components/admin/FloorStudio";

export default function AdminStreamPage() {
  return (
    <AdminShell
      title="Floor stream"
      subtitle="Film an item as it comes in. Stopping the recording saves it on the media page. YouTube, Facebook, TikTok, and Instagram buttons ask the DealFinder Poster extension to fill that site's upload form with the account signed in on this Chrome profile."
    >
      <FloorStudio />
    </AdminShell>
  );
}
