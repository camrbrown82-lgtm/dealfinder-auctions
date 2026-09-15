import { NextRequest, NextResponse } from "next/server";
import { bidderUnauthorized, getBidderSession } from "@/lib/bidderAuth";
import { updateDemoUser, publicProfile } from "@/lib/demoUsers";
import { normalizePaymentMethod } from "@/lib/profileTypes";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) return bidderUnauthorized();

  const body = (await request.json()) as Record<string, string>;
  const paymentMethod = normalizePaymentMethod(body.paymentMethod || session.paymentMethod);
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
      const update = {
        full_name: patch.fullName,
        phone: patch.phone,
        street: patch.street,
        city: patch.city,
        province: patch.province,
        postal_code: patch.postalCode,
        payment_method: patch.paymentMethod,
      };
      let { data, error } = await supabase
        .from("profiles")
        .update(update)
        .eq("id", session.id)
        .select("*")
        .single();
      if (error && /payment_method|enum|invalid input/i.test(error.message)) {
        const { payment_method: _ignored, ...withoutMethod } = update;
        ({ data, error } = await supabase
          .from("profiles")
          .update(withoutMethod)
          .eq("id", session.id)
          .select("*")
          .single());
      }
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
          paymentMethod: normalizePaymentMethod(data.payment_method),
          status: data.status === "suspended" ? "suspended" : "active",
          preauthStatus: data.preauth_status === "held" || data.preauth_status === "released"
            ? data.preauth_status
            : "none",
          preauthAmount: Number(data.preauth_amount ?? session.preauthAmount) || session.preauthAmount,
          hasCardOnFile: Boolean(data.helcim_card_token),
        },
      });
    }
  }

  const updated = updateDemoUser(session.id, patch);
  if (!updated) return bidderUnauthorized();
  return NextResponse.json({ user: publicProfile(updated) });
}
