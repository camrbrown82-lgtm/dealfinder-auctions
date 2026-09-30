export const SITE = {
  name: "DealFinder Auctions",
  tagline: "High-Speed Timed Liquidations & Local Consignments",
  addressLine: "529 Gateway Rd NE",
  cityLine: "Airdrie, AB T4B 0J6",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=529+Gateway+Rd+NE%2C+Airdrie+AB+T4B+0J6",
  phoneDisplay: "+1 403-512-3220",
  phoneHref: "tel:+14035123220",
  email: "dealfinderauctions@gmail.com",
  social: {
    tiktok: "https://www.tiktok.com/@dealfinder.auctio",
    instagram: "https://www.instagram.com/DealFinderAuctions/",
    facebook: "https://www.facebook.com/search/top?q=dealfinder%20auctions%20airdrie",
    youtube: "https://www.youtube.com/@DealFinderAuctions",
  },
} as const;

export function adminNotifyEmail() {
  return (process.env.ADMIN_NOTIFY_EMAIL || "").trim() || "cam.r.brown82@gmail.com";
}

