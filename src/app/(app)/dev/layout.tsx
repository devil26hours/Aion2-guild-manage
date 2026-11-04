import { DevGate } from "@/components/dev/dev-gate";

export default function DevLayout({ children }: LayoutProps<"/dev">) {
  return <DevGate>{children}</DevGate>;
}
