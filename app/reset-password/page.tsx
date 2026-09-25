import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = pageMetadata({
  title: "Reset password",
  description: "Choose a new password for your DealFinder Auctions paddle using the link from your reset email.",
  path: "/reset-password",
  index: false,
});

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  return <ResetPasswordForm token={searchParams.token ?? ""} />;
}
