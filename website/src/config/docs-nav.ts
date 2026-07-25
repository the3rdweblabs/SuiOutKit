export type NavItem = {
  title: string;
  href?: string;
  children?: NavItem[];
};

export const docsNav: NavItem[] = [
  {
    title: "Getting Started",
    children: [
      { title: "Installation", href: "/docs/getting-started/installation" },
      { title: "Quick Start", href: "/docs/getting-started/quick-start" },
      { title: "How It Works", href: "/docs/getting-started/how-it-works" },
      { title: "First Settlement", href: "/docs/getting-started/first-settlement" },
    ],
  },
  {
    title: "Guides",
    children: [
      { title: "Architecture", href: "/docs/guides/architecture" },
      { title: "SDK Reference", href: "/docs/guides/sdk" },
      { title: "Currencies", href: "/docs/guides/currencies" },
      { title: "Settlement Tokens", href: "/docs/guides/settlement-tokens" },
      { title: "Coin Configuration", href: "/docs/guides/coin-configuration" },
      { title: "Cross-Region Payments", href: "/docs/guides/cross-region" },
      { title: "USSD Payments", href: "/docs/guides/ussd-payments" },
      { title: "FX Rates", href: "/docs/guides/fx-rates" },
      { title: "Treasury Management", href: "/docs/guides/treasury" },
      { title: "Backend API", href: "/docs/guides/backend-api" },
      { title: "Environment (operators)", href: "/docs/guides/environment" },
      { title: "Security", href: "/docs/guides/security" },
    ],
  },
  {
    title: "Reference",
    children: [
      { title: "Hosted API", href: "/docs/hosted-api" },
      { title: "Developer Guide", href: "/docs/developer-guide" },
      { title: "Changelog", href: "/docs/changelog" },
    ],
  },
];

export function flattenNav(items: NavItem[]): { title: string; href: string }[] {
  const out: { title: string; href: string }[] = [];
  for (const item of items) {
    if (item.href) out.push({ title: item.title, href: item.href });
    if (item.children) out.push(...flattenNav(item.children));
  }
  return out;
}
