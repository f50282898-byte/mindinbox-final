"use client";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { GoldenSymbols } from "./GoldenSymbols";
import { LeadGenModal } from "./LeadGenModal";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isRoot = pathname === "/";

  return (
    <>
      <Sidebar />
      {!isRoot && <GoldenSymbols />}
      <LeadGenModal />
      <div className={(isRoot ? "" : "md:pr-[80px] ") + "w-full min-h-screen flex flex-col"}>
        {children}
      </div>
    </>
  );
}
