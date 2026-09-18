import { NextRequest, NextResponse } from "next/server";
import { getBidderSession } from "@/lib/bidderAuth";
import { getDemoLot } from "@/lib/demoAuctionStore";
import { mapLot, type LotRow } from "@/lib/mappers";
import { invoiceFees } from "@/lib/invoiceFees";
import {
  invoiceNumber,
  isFulfillmentChoice,
  paymentInstructions,
  paymentMethodLabel,
  type FulfillmentChoice,
} from "@/lib/payments";
import { profileAddress } from "@/lib/profileTypes";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { MOCK_LOTS, type AuctionLot } from "@/lib/utils";
import { saveWinFulfillment } from "@/lib/winFulfillment";
import { invoicePaymentForLot, requestCashPayment } from "@/lib/cashPayment";
import { estimateCarrierShipping } from "@/lib/shippingEstimate";
import type { WinInvoice } from "@/lib/winTypes";
import { isLotPaid, lotPaidRecord } from "@/lib/helcim";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getBidderSession();
  if (!session) return NextResponse.json({ wins: [] as WinInvoice[] });

  let lots: AuctionLot[] = [];

  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data: byId } = await supabase
        .from("lots")
        .select("*")
        .eq("high_bidder_id", session.id);
      let rows = (byId ?? []) as LotRow[];
      if (session.fullName) {
        const { data: byName } = await supabase
          .from("lots")
          .select("*")
          .eq("high_bidder", session.fullName);
        const seen = new Set(rows.map((row) => row.id));
        for (const row of (byName ?? []) as LotRow[]) {
          if (!seen.has(row.id)) rows.push(row);
        }
      }
      lots = rows.map(mapLot);
    }
  } else {
    lots = MOCK_LOTS.map((lot) => {
      const demo = getDemoLot(lot.id);
      if (!demo) return lot;
      return {
        ...lot,
        currentBid: demo.currentBid,
        endsAt: demo.endsAt,
        highBidder: demo.highBidder,
        highBidderId: demo.highBidderId,
        status: (demo.status as AuctionLot["status"]) ?? lot.status,
        fulfillment: demo.fulfillment ?? lot.fulfillment ?? "unset",
        shippingCost: demo.shippingCost ?? lot.shippingCost ?? 0,
        paidAt: demo.paidAt ?? lot.paidAt ?? null,
        helcimPurchaseTransactionId:
          demo.helcimPurchaseTransactionId ?? lot.helcimPurchaseTransactionId ?? null,
      };
    }).filter(
      (lot) => lot.highBidderId === session.id || lot.highBidder === session.fullName,
    );
  }

  const address = profileAddress(session);
  const handlingClaimed = new Set<string>();
  const wins: WinInvoice[] = [];
  for (const lot of lots) {
    const invoice = invoiceNumber(lot.id, session.id);
    const memory = lotPaidRecord(lot.id);
    const paid = isLotPaid(lot) || Boolean(memory);
    const groupKey = lot.eventId || "house";
    const includeHandling = lot.fulfillment === "ship" && !handlingClaimed.has(groupKey);
    if (includeHandling) handlingClaimed.add(groupKey);
    const fees = invoiceFees({
      hammer: lot.currentBid,
      fulfillment: lot.fulfillment ?? "unset",
      shippingCost: lot.shippingCost ?? 0,
      includeHandling,
    });
    const settlement = await invoicePaymentForLot(lot.id, session);
    wins.push({
      lotId: lot.id,
      title: lot.title,
      slug: lot.slug,
      currentBid: fees.hammer,
      premium: fees.premium,
      handling: fees.handling,
      shippingCost: fees.shipping,
      gst: fees.gst,
      total: fees.total,
      status: lot.status,
      invoice: settlement?.invoice ?? invoice,
      paymentMethodKey: "helcim_card" as const,
      paymentMethod: paymentMethodLabel("helcim_card"),
      instructions: paymentInstructions("helcim_card", settlement?.invoice ?? invoice),
      winning: lot.status === "ended",
      fulfillment: lot.fulfillment ?? "unset",
      address,
      buyerName: session.fullName,
      phone: session.phone,
      paid: paid || settlement?.payment === "paid",
      paidAt: lot.paidAt ?? memory?.paidAt ?? null,
      payment: settlement?.payment ?? (paid ? "paid" : "unpaid"),
      paymentChannel: settlement?.paymentChannel ?? "helcim",
    });
  }

  return NextResponse.json({ wins, profile: session });
}

export async function PATCH(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) {
    return NextResponse.json({ error: "Log in to choose shipping." }, { status: 401 });
  }
  const body = (await request.json()) as {
    lotId?: string;
    fulfillment?: FulfillmentChoice;
    cash?: boolean;
    address?: {
      fullName?: string;
      street?: string;
      city?: string;
      province?: string;
      postalCode?: string;
      phone?: string;
    };
  };
  if (!body.lotId) {
    return NextResponse.json({ error: "lotId is required." }, { status: 400 });
  }

  let lot: AuctionLot | null = null;
  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase.from("lots").select("*").eq("id", body.lotId).maybeSingle();
      lot = data ? mapLot(data as LotRow) : null;
    }
  } else {
    const demo = getDemoLot(body.lotId);
    const mock = MOCK_LOTS.find((row) => row.id === body.lotId);
    if (mock) {
      lot = {
        ...mock,
        highBidder: demo?.highBidder ?? mock.highBidder ?? null,
        highBidderId: demo?.highBidderId ?? mock.highBidderId ?? null,
        status: (demo?.status as AuctionLot["status"]) ?? mock.status,
        fulfillment: demo?.fulfillment,
      };
    }
  }

  if (!lot) return NextResponse.json({ error: "Lot not found." }, { status: 404 });
  const owns =
    lot.highBidderId === session.id ||
    lot.highBidder === session.fullName ||
    lot.highBidder === session.email;
  if (!owns) {
    return NextResponse.json({ error: "Only the winner can update this invoice." }, { status: 403 });
  }
  if (lot.status !== "ended") {
    return NextResponse.json({ error: "Choose shipping after the hammer." }, { status: 400 });
  }

  if (body.cash) {
    try {
      if (lot.fulfillment !== "pickup") {
        await saveWinFulfillment(body.lotId, "pickup", session);
      }
      const invoice = await requestCashPayment(body.lotId, session);
      return NextResponse.json({ ok: true, payment: invoice.payment, invoice: invoice.invoice });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not request cash payment.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (!body.fulfillment || !isFulfillmentChoice(body.fulfillment) || body.fulfillment === "unset") {
    return NextResponse.json({ error: "Pick ship or pick up for a won lot." }, { status: 400 });
  }

  let addressLine = profileAddress(session);
  if (body.address) {
    const next = {
      ...session,
      fullName: body.address.fullName?.trim() || session.fullName,
      phone: body.address.phone?.trim() || session.phone,
      street: body.address.street?.trim() || session.street,
      city: body.address.city?.trim() || session.city,
      province: body.address.province?.trim() || session.province,
      postalCode: body.address.postalCode?.trim() || session.postalCode,
    };
    addressLine = profileAddress(next);
    const supabase = getSupabaseAdmin();
    if (isSupabaseConfigured && supabase) {
      await supabase
        .from("profiles")
        .update({
          full_name: next.fullName,
          phone: next.phone,
          street: next.street,
          city: next.city,
          province: next.province,
          postal_code: next.postalCode,
        })
        .eq("id", session.id);
    }
  }

  const shippingCost =
    body.fulfillment === "ship"
      ? estimateCarrierShipping({
          province: body.address?.province || session.province,
          postalCode: body.address?.postalCode || session.postalCode,
        })
      : 0;

  try {
    await saveWinFulfillment(body.lotId, body.fulfillment, session, {
      shippingCost,
      address: addressLine,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save delivery choice.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, fulfillment: body.fulfillment, shippingCost });
}
