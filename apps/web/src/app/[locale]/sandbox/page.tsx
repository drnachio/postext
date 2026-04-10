import { setRequestLocale } from "next-intl/server";
import { SandboxPage } from "@/components/sandbox/SandboxPage";

export default async function Sandbox({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SandboxPage />;
}
