import type { AnyModel } from "@shared/index"

type DefaultModelSectionProps = {
  model: AnyModel | null
}

export function DefaultModelSection({ model }: DefaultModelSectionProps) {
  if (!model) {
    return (
      <div className="mb-6 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No default local model selected. Choose one from the list below.
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-lg border bg-muted/30 p-4">
      <div className="text-xs font-medium text-muted-foreground">
        Default Local Model
      </div>
      <div className="text-lg font-semibold">{model.displayName}</div>
      <p className="text-sm text-muted-foreground">
        {model.description || "Selected for future local transcriptions."}
      </p>
    </div>
  )
}
