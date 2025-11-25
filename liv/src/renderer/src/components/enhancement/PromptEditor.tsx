import { useState, useEffect } from "react"
import type { CustomPrompt, PromptCategory } from "@shared/types/enhancement"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Textarea } from "../ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { Switch } from "../ui/switch"
import { useTranslation } from "react-i18next"

interface PromptEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prompt?: CustomPrompt
  onSave: (prompt: CustomPrompt) => void
  readOnly?: boolean
}

const CATEGORIES: PromptCategory[] = [
  "custom",
  "business",
  "technical",
  "creative",
  "academic",
  "legal",
  "medical",
]

export function PromptEditor({
  open,
  onOpenChange,
  prompt,
  onSave,
  readOnly = false,
}: PromptEditorProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(prompt?.title ?? "")
  const [description, setDescription] = useState(prompt?.description ?? "")
  const [category, setCategory] = useState<PromptCategory>(
    prompt?.category ?? "custom",
  )
  const [icon, setIcon] = useState(prompt?.icon ?? "i-mingcute-sparkles-line")
  const [promptText, setPromptText] = useState(prompt?.promptText ?? "")
  const [useSystemInstructions, setUseSystemInstructions] = useState(
    prompt?.useSystemInstructions ?? true,
  )

  // Reset form when prompt changes
  useEffect(() => {
    if (prompt) {
      setTitle(prompt.title)
      setDescription(prompt.description ?? "")
      setCategory(prompt.category)
      setIcon(prompt.icon)
      setPromptText(prompt.promptText)
      setUseSystemInstructions(prompt.useSystemInstructions)
    } else {
      setTitle("")
      setDescription("")
      setCategory("custom")
      setIcon("i-mingcute-sparkles-line")
      setPromptText("")
      setUseSystemInstructions(true)
    }
  }, [prompt])

  const handleSave = () => {
    onSave({
      id: prompt?.id ?? crypto.randomUUID(),
      title,
      description,
      category,
      icon,
      promptText,
      useSystemInstructions,
      createdAt: prompt?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    })
    onOpenChange(false)
  }

  const handleDuplicate = () => {
    onSave({
      id: crypto.randomUUID(),
      title: `${title} (Copy)`,
      description,
      category,
      icon,
      promptText,
      useSystemInstructions,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    onOpenChange(false)
  }

  const getPreviewText = () => {
    if (useSystemInstructions) {
      return `<SYSTEM_INSTRUCTIONS>\n${promptText}\n</SYSTEM_INSTRUCTIONS>`
    }
    return promptText
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {readOnly
              ? t("settings.enhancement.promptEditor.view")
              : prompt
                ? t("settings.enhancement.promptEditor.edit")
                : t("settings.enhancement.promptEditor.create")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title">{t("settings.enhancement.promptEditor.name")} *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("settings.enhancement.promptEditor.namePlaceholder")}
                maxLength={50}
                disabled={readOnly}
              />
            </div>

            <div>
              <Label htmlFor="category">{t("settings.enhancement.promptEditor.category")}</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as PromptCategory)}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {t(`settings.enhancement.promptEditor.categories.${cat}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="description">{t("settings.enhancement.promptEditor.description")}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("settings.enhancement.promptEditor.descriptionPlaceholder")}
              maxLength={200}
              rows={2}
              disabled={readOnly}
            />
          </div>

          <div>
            <Label htmlFor="promptText">{t("settings.enhancement.promptEditor.promptText")} *</Label>
            <Textarea
              id="promptText"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={t("settings.enhancement.promptEditor.promptTextPlaceholder")}
              rows={8}
              className="font-mono text-sm"
              disabled={readOnly}
            />
            <p className="text-xs text-white/70 mt-1">
              {t("settings.enhancement.promptEditor.availableVars")}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="systemInstructions"
              checked={useSystemInstructions}
              onCheckedChange={setUseSystemInstructions}
              disabled={readOnly}
            />
            <Label htmlFor="systemInstructions">
              {t("settings.enhancement.promptEditor.systemInstructions")}
            </Label>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs font-medium mb-1">{t("settings.enhancement.promptEditor.preview")}</p>
            <pre className="text-xs text-white/70 whitespace-pre-wrap font-mono">
              {getPreviewText()}
            </pre>
          </div>
        </div>

        <DialogFooter>
          {readOnly ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.close")}
              </Button>
              <Button onClick={handleDuplicate}>
                <span className="i-mingcute-copy-line mr-2"></span>
                {t("settings.enhancement.promptEditor.duplicate")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSave} disabled={!title || !promptText}>
                {prompt ? t("settings.enhancement.promptEditor.saveChanges") : t("settings.enhancement.promptEditor.createPrompt")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
