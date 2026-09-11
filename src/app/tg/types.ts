export type TgRole = "ADMIN" | "PARTNER" | "SUBSCRIBER" | null;

export type AuthState =
  | { status: "booting" }
  | { status: "no_telegram" }
  | { status: "auth_error"; message: string }
  | {
      status: "ready";
      role: TgRole;
      firstName?: string | null;
      channelMember?: boolean;
    };

export type CabinetData = {
  botUser: {
    id: string;
    telegramId: string;
    username: string | null;
    firstName: string | null;
    balance: number;
    role: string;
  };
  refLink: string;
  channelUrl?: string;
  supportUrl?: string;
  applications?: Array<{
    id: string;
    status: string;
    product: string;
    subscriberAmount: number | null;
    premium: number;
    createdAt: string;
  }>;
  stats: {
    clicks: number;
    registrations: number;
    leadsTotal: number;
    approved: number;
    rejected: number;
    credited: number;
    creditedLabel: string;
  };
  products: Array<{
    id: string;
    title: string;
    bank: string;
    description: string;
    reward: number;
    subscriberPrice: number;
    rewardType: string;
    hot: boolean;
    hotText: string | null;
  }>;
  referrals: Array<{
    id: string;
    username: string | null;
    firstName: string | null;
    telegramId: string;
    status: string;
    createdAt?: string;
    role?: string;
    refSource?: string;
    issues?: Array<{
      id: string;
      status: string;
      product: string;
      premium: number;
    }>;
  }>;
  withdrawals: Array<{
    id: string;
    amount: number;
    details: string;
    status: string;
    createdAt: string;
  }>;
  txs: Array<{
    id: string;
    amount: number;
    type: string;
    comment: string | null;
    createdAt: string;
  }>;
};

export type PartnerTab = "home" | "products" | "premiums" | "people" | "withdraw";
export type AdminSubTab =
  | "stats"
  | "products"
  | "premiums"
  | "leads"
  | "withdrawals"
  | "users";
export type AppTab = PartnerTab | "admin";

export type ProductForm = {
  title: string;
  bank: string;
  description: string;
  reward: string;
  subscriberPrice: string;
  rewardType: string;
  url: string;
};

export type ProductsViewMode = "premiums" | "shop";
