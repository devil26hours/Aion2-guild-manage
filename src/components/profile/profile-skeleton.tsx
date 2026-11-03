/** Static-shell fallback while the route param streams in. */
export function ProfileSkeleton() {
  const block = "animate-pulse border border-steel/10 bg-steel/[0.04]";
  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6" aria-busy="true" aria-label="Loading character">
      <div className={`${block} h-64`} />
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        <div className={`${block} h-72 xl:col-span-2`} />
        <div className={`${block} h-72`} />
      </div>
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        <div className={`${block} h-[30rem] xl:col-span-2`} />
        <div className={`${block} h-80`} />
      </div>
    </div>
  );
}
