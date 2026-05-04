import { Skeleton } from "@/components/ui/skeleton";

export default function PublicLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6">
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    </div>
  );
}
