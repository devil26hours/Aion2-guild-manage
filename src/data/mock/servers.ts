/** Mock AION 2 Global server list (illustrative names). */
export const SERVERS = [
  "Siel",
  "Israphel",
  "Nezekan",
  "Zikel",
  "Lumiel",
  "Triniel",
] as const;

export type ServerName = (typeof SERVERS)[number];
