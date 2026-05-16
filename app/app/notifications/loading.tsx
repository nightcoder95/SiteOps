import { PageStack } from "@/components/ui/page-primitives";

export default function Loading() {
  return (
    <PageStack>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-container-low" />
      <section className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-2xl bg-surface-container-low"
          />
        ))}
      </section>
    </PageStack>
  );
}
