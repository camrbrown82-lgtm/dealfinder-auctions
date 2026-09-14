export type PaymentMethod = "interac_etransfer" | "pay_on_arrival";

export type AccountStatus = "active" | "suspended";

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
};

export type ProfileInput = Omit<BidderProfile, "id" | "email" | "status">;

export function emptyProfileInput(): ProfileInput {
  return {
    fullName: "",
    phone: "",
    street: "",
    city: "",
    province: "ON",
    postalCode: "",
    paymentMethod: "interac_etransfer",
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
  return value === "interac_etransfer" || value === "pay_on_arrival";
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
