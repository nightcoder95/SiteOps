"use client";

import { useRouter } from "next/navigation";

import { CategoryPicker, type CategoryOption } from "@/components/logs/CategoryPicker";

type Props = {
  initialCategories: CategoryOption[];
  siteId?: string;
};

export function LogsNewPageClient({ initialCategories, siteId }: Props) {
  const router = useRouter();
  return (
    <CategoryPicker
      initialCategories={initialCategories}
      onSelect={(c) => {
        const qs = siteId ? `?siteId=${encodeURIComponent(siteId)}` : "";
        router.push(`/app/logs/new/${c.categoryId}${qs}`);
      }}
    />
  );
}
