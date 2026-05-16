import { PageStack } from "@/components/ui/page-primitives";

export default function Loading() {
  return (
    <PageStack>
      <section className="h-32 animate-pulse rounded-3xl bg-surface-container-low" />
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-container-low" />
        <div className="h-24 animate-pulse rounded-2xl bg-surface-container-low" />
        <div className="h-24 animate-pulse rounded-2xl bg-surface-container-low" />
        <div className="h-24 animate-pulse rounded-2xl bg-surface-container-low" />
      </div>
    </PageStack>
  );
}
