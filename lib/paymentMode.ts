export function isPaymentTestMode() {
  return /^(1|true|yes|on)$/i.test(
    (process.env.PAYMENT_TEST_MODE || process.env.NEXT_PUBLIC_PAYMENT_TEST_MODE || "").trim(),
  );
}
