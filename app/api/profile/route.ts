import { NextRequest, NextResponse } from "next/server";
import { bidderUnauthorized, getBidderSession } from "@/lib/bidderAuth";
import { updateDemoUser, publicProfile } from "@/lib/demoUsers";
import { isPaymentMethod } from "@/lib/profileTypes";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) return bidderUnauthorized();

  const body = (await request.json()) as Record<string, string>;
  const paymentMethod = isPaymentMethod(body.paymentMethod)
    ? body.paymentMethod
    : session.paymentMethod;
  const patch = {
    fullName: String(body.fullName ?? session.fullName).trim(),
    phone: String(body.phone ?? session.phone).trim(),
    street: String(body.street ?? session.street).trim(),
    city: String(body.city ?? session.city).trim(),
    province: String(body.province ?? session.province).trim(),
    postalCode: String(body.postalCode ?? session.postalCode).trim().toUpperCase(),
    paymentMethod,
  };

  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          full_name: patch.fullName,
          phone: patch.phone,
          street: patch.street,
          city: patch.city,
          province: patch.province,
          postal_code: patch.postalCode,
          payment_method: patch.paymentMethod,
        })
        .eq("id", session.id)
        .select("*")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({
        user: {
          id: data.id,
          email: data.email ?? session.email,
          fullName: data.full_name,
          phone: data.phone,
          street: data.street,
          city: data.city,
          province: data.province,
          postalCode: data.postal_code,
          paymentMethod: isPaymentMethod(data.payment_method)
            ? data.payment_method
            : patch.paymentMethod,
          status: data.status === "suspended" ? "suspended" : "active",
        },
      });
    }
  }

  const updated = updateDemoUser(session.id, patch);
  if (!updated) return bidderUnauthorized();
  return NextResponse.json({ user: publicProfile(updated) });
}
