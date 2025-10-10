export function Page({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-[var(--muted)]">
            Hedera vouchers · HSCS + HTS
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}
