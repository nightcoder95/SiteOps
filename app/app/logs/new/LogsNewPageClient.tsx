"use client";

import { useRouter } from "next/navigation";

import { CategoryPicker, type CategoryOption } from "@/components/logs/CategoryPicker";

type Props = {
  initialCategories: CategoryOption[];
  siteId?: string;
  role: "Admin" | "Supervisor";
};

export function LogsNewPageClient({ initialCategories, siteId, role }: Props) {
  const router = useRouter();
  return (
    <CategoryPicker
      initialCategories={initialCategories}
      role={role}
      siteId={siteId}
      onSelect={(c) => {
        const qs = siteId ? `?siteId=${encodeURIComponent(siteId)}` : "";
        router.push(`/app/logs/new/${c.categoryId}${qs}`);
      }}
    />
  );
}
