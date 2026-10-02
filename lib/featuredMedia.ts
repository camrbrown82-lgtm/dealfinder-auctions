export type FeaturedMedia = {
  id: string;
  image: string;
  alt: string;
};

/** Facebook file links expire when Facebook rotates them. */
export const FEATURED_MEDIA: FeaturedMedia[] = [
  {
    id: "chest",
    alt: "Husky tool chest on the DealFinder floor",
    image:
      "https://scontent.fyyc3-1.fna.fbcdn.net/v/t15.5256-10/824955980_1066414656286233_662916088650575948_n.jpg?stp=dst-jpg_tt6&cstp=mx1080x1920&ctp=s960x960&_nc_cat=100&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=5fad0e&_nc_ohc=WW508qL1MvoQ7kNvwEoUuSi&_nc_oc=AdrocxgXjNZ9MXA9YDji-MXuPVRKDNr1fQSKHL-6anqa1UegXL5D5cIzT-W_IjYP2L44wvQQlMJqAqe3E4hLpjkX&_nc_zt=23&_nc_ht=scontent.fyyc3-1.fna&_nc_gid=_HmWB1lpG-X5iRJ2U3z1Gw&_nc_ss=7b2a8&oh=00_AQPwY9NcSpYQnrMqJTkbpnscqGqrjFos1QP54fd3kGYmUA&oe=6AC537E9",
  },
  {
    id: "reel",
    alt: "Coins and bullion laid out for DealFinder",
    image:
      "https://scontent.fyyc3-1.fna.fbcdn.net/v/t15.5256-10/789505903_1711854006754506_8823647999503209346_n.jpg?stp=dst-jpg_tt6&cstp=mx1080x1920&ctp=s960x960&_nc_cat=103&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=5fad0e&_nc_ohc=pC9Xh0UebuMQ7kNvwELA5TT&_nc_oc=AdpzvraVZKMyiFj1p_zG5CC2q-Vv7wrFLibrHxI-CN46sHMBqLb-kxrd1VRC4ba1UUUeammeQE75NilWAehiq4ih&_nc_zt=23&_nc_ht=scontent.fyyc3-1.fna&_nc_gid=_HmWB1lpG-X5iRJ2U3z1Gw&_nc_ss=7b2a8&oh=00_AQMHx9rMh7D_wVFORT5ue0OD9zSanKz7Iu-h1nLW0BYXSw&oe=6AC50A7E",
  },
  {
    id: "photo",
    alt: "Turbo Sloth in a DealFinder tracksuit",
    image:
      "https://scontent.fyyc3-1.fna.fbcdn.net/v/t15.5256-10/562954836_1365078925023283_6340761622642850191_n.jpg?stp=dst-jpg_tt6&cstp=mx1436x1440&ctp=s960x960&_nc_cat=101&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=5fad0e&_nc_ohc=i8uHnav0GqAQ7kNvwHBeNPp&_nc_oc=AdpJQ1UfxPvpl6Xue0WUtXskU2JcciIpaMFLubM4wEsweMqX1V7wScMvtxXYiI0rVCqJoILiI_mabvcVh24ZsHBs&_nc_zt=23&_nc_ht=scontent.fyyc3-1.fna&_nc_gid=-YWvWqLWfJzeWLtKbsF_Jg&_nc_ss=7b2a8&oh=00_AQMzwP5J8wHwx8qAhZXEn3shTsVUzYL_9jBaHGGWSOzjSg&oe=6AC53245",
  },
];

