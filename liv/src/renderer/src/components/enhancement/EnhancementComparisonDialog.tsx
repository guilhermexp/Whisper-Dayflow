import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import { Button } from "../ui/button"
import { Switch } from "../ui/switch"
import { Label } from "../ui/label"
import { useTranslation } from "react-i18next"

interface EnhancementComparisonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  original: string
  enhanced: string
  provider: string
  onCopyOriginal: () => void
  onCopyEnhanced: () => void
  onRollback?: () => void
}

export function EnhancementComparisonDialog({
  open,
  onOpenChange,
  original,
  enhanced,
  provider,
  onCopyOriginal,
  onCopyEnhanced,
  onRollback,
}: EnhancementComparisonDialogProps) {
  const { t } = useTranslation()
  const [showDiffOnly, setShowDiffOnly] = useState(false)

  const originalWords = original.split(/\s+/).length
  const enhancedWords = enhanced.split(/\s+/).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{t("settings.enhancement.comparison.title")}</DialogTitle>
          <div className="flex items-center gap-4 text-sm text-white/70">
            <span>{t("settings.enhancement.comparison.provider")}: {provider}</span>
            <span>•</span>
            <span>
              {original.length} → {enhanced.length} {t("settings.enhancement.comparison.characters").toLowerCase()}
            </span>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4">
          <Switch checked={showDiffOnly} onCheckedChange={setShowDiffOnly} />
          <Label>{t("settings.enhancement.comparison.showDiffOnly")}</Label>
        </div>

        <div className="grid grid-cols-2 gap-4 h-[60vh]">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("settings.enhancement.comparison.original")}</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={onCopyOriginal}
                className="gap-1"
              >
                <span className="i-mingcute-copy-line text-sm"></span>
                {t("settings.enhancement.comparison.copy")}
              </Button>
            </div>
            <div className="h-full overflow-auto rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <pre className="text-sm whitespace-pre-wrap">{original}</pre>
            </div>
            <div className="text-xs text-white/70">
              {t("settings.enhancement.comparison.words")}: {originalWords} • {t("settings.enhancement.comparison.characters")}: {original.length}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("settings.enhancement.comparison.enhanced")}</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={onCopyEnhanced}
                className="gap-1"
              >
                <span className="i-mingcute-copy-line text-sm"></span>
                {t("settings.enhancement.comparison.copy")}
              </Button>
            </div>
            <div className="h-full overflow-auto rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <pre className="text-sm whitespace-pre-wrap">{enhanced}</pre>
            </div>
            <div className="text-xs text-white/70">
              {t("settings.enhancement.comparison.words")}: {enhancedWords} • {t("settings.enhancement.comparison.characters")}: {enhanced.length}
            </div>
          </div>
        </div>

        <DialogFooter>
          {onRollback && (
            <Button variant="outline" onClick={onRollback} className="gap-2">
              <span className="i-mingcute-back-line"></span>
              {t("settings.enhancement.comparison.rollback")}
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>{t("settings.enhancement.comparison.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
