import type { Metadata } from "next";
import { UserManagement } from "@/components/dev/user-management";

export const metadata: Metadata = {
  title: "User Management — DEV — ChumChon AION2",
};

export default function DevUsersPage() {
  return <UserManagement />;
}
