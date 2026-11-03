/** Mock guild & admin profile. Replace with real data source later. */

export interface GuildInfo {
  name: string;
  server: string;
  region: string;
  faction: "Elyos" | "Asmodian";
  level: number;
  memberCap: number;
}

export interface AdminProfile {
  characterName: string;
  title: string;
  email: string;
}

export const MOCK_GUILD: GuildInfo = {
  name: "Ascendant Vanguard",
  server: "Siel",
  region: "Global",
  faction: "Elyos",
  level: 7,
  memberCap: 60,
};

export const MOCK_ADMIN: AdminProfile = {
  characterName: "Kaelthys",
  title: "Guild Leader",
  email: "admin@guild.local",
};
