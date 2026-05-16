import { PageStack } from "@/components/ui/page-primitives";

export default function Loading() {
  return (
    <PageStack>
      <section className="h-32 animate-pulse rounded-3xl bg-surface-container-low" />
      <section className="h-48 animate-pulse rounded-2xl bg-surface-container-low" />
    </PageStack>
  );
}
