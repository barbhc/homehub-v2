export function StepCard({ index, text }: { index: number; text: string }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="shrink-0 w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center mt-0.5">
        {index + 1}
      </span>
      <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
    </div>
  )
}
