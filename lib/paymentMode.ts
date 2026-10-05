export function isPaymentTestMode() {
  return /^(1|true|yes|on)$/i.test(
    (process.env.PAYMENT_TEST_MODE || process.env.NEXT_PUBLIC_PAYMENT_TEST_MODE || "").trim(),
  );
}

/** Card bypass. Every Helcim charge, hold, and invoice is approved without
 *  touching a card so the rest of the sale can be tested end to end. Unlike
 *  PAYMENT_TEST_MODE this leaves live email delivery alone. */
export function isHelcimBypass() {
  return /^(1|true|yes|on)$/i.test(
    (process.env.HELCIM_BYPASS || process.env.NEXT_PUBLIC_HELCIM_BYPASS || "").trim(),
  );
}
