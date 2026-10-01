export function DemoBadge() {
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-30 flex items-center gap-1.5 rounded-full border border-line bg-black/60 px-2.5 py-1 text-[11px] font-medium text-ink-3 backdrop-blur-md">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-3" />
      Demo mit Beispieldaten
    </div>
  );
}
