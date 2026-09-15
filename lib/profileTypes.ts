export type PaymentMethod = "helcim_card";

export type AccountStatus = "active" | "suspended";

export type PreauthStatus = "none" | "held" | "released";

export type BidderProfile = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  paymentMethod: PaymentMethod;
  status: AccountStatus;
  preauthStatus: PreauthStatus;
  preauthAmount: number;
  hasCardOnFile: boolean;
};

export type ProfileInput = Omit<
  BidderProfile,
  "id" | "email" | "status" | "preauthStatus" | "preauthAmount" | "hasCardOnFile"
>;

export function emptyProfileInput(): ProfileInput {
  return {
    fullName: "",
    phone: "",
    street: "",
    city: "",
    province: "AB",
    postalCode: "",
    paymentMethod: "helcim_card",
  };
}

export function isProfileComplete(profile: Pick<BidderProfile, keyof ProfileInput>) {
  return Boolean(
    profile.fullName.trim() &&
      profile.phone.trim() &&
      profile.street.trim() &&
      profile.city.trim() &&
      profile.province.trim() &&
      profile.postalCode.trim() &&
      profile.paymentMethod,
  );
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === "helcim_card";
}

export function normalizePaymentMethod(_value?: unknown): PaymentMethod {
  return "helcim_card";
}

export function isPreauthStatus(value: unknown): value is PreauthStatus {
  return value === "none" || value === "held" || value === "released";
}

export function profileAddress(
  profile: Pick<BidderProfile, "street" | "city" | "province" | "postalCode"> | null | undefined,
) {
  if (!profile) return "";
  return [profile.street, profile.city, profile.province, profile.postalCode]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}
