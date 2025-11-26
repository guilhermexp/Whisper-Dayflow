
import { Recorder } from "@renderer/lib/recorder"
import { playSound } from "@renderer/lib/sound"
import { cn } from "@renderer/lib/utils"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useConfigQuery, queryClient } from "@renderer/lib/query-client"
import { rendererHandlers, tipcClient } from "~/lib/tipc-client"
import type { RecordingAudioProfile } from "@shared/types"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog"
import { Button } from "@renderer/components/ui/button"

const VISUALIZER_BUFFER_LENGTH = 70

const getInitialVisualizerData = () =>
  Array<number>(VISUALIZER_BUFFER_LENGTH).fill(-1000)

type PanelPhase = "idle" | "starting" | "recording" | "stopping" | "transcribing" | "enhancing"

export function Component() {
  const { t } = useTranslation()
  const configQuery = useConfigQuery()
  const [visualizerData, setVisualizerData] = useState(() =>
    getInitialVisualizerData(),
  )
  const [recording, setRecording] = useState(false)
  const [phase, setPhase] = useState<PanelPhase>("idle")
  const isConfirmedRef = useRef(false)
  const audioCuesEnabled = configQuery.data?.enableAudioCues ?? true
  const [error, setError] = useState<{ name: string; message: string } | null>(null)

  const handleError = (error: Error) => {
    void tipcClient.hidePanelWindow()
    setError({
      name: error.name,
      message: error.message,
    })
  }

  const handleOpenAccessibilitySettings = async () => {
    setError(null)
    await tipcClient.openAccessibilitySettings()
  }

  const audioProfileRef = useRef({
    samples: 0,
    total: 0,
    peak: 0,
    silenceSamples: 0,
  })

  const resetAudioProfileMetrics = () => {
    audioProfileRef.current = {
      samples: 0,
      total: 0,
      peak: 0,
      silenceSamples: 0,
    }
  }

  const getAudioProfilePayload = () => {
    const metrics = audioProfileRef.current
    if (!metrics.samples) return undefined
    const average = metrics.total / metrics.samples
    const silenceRatio = metrics.silenceSamples / metrics.samples
    return {
      peakLevel: Number(Math.min(1, Math.max(0, metrics.peak)).toFixed(4)),
      averageLevel: Number(Math.min(1, Math.max(0, average)).toFixed(4)),
      silenceRatio: Number(Math.min(1, Math.max(0, silenceRatio)).toFixed(4)),
      sampleCount: metrics.samples,
    }
  }

  type TranscribePayload = {
    blob: Blob
    duration: number
    mimeType: string
    audioProfile?: RecordingAudioProfile
  }

  const transcribeMutation = useMutation({
    mutationFn: async ({
      blob,
      duration,
      mimeType,
      audioProfile,
    }: TranscribePayload) => {
      if (!blob.size || duration <= 0) {
        throw new Error(
          "Não capturamos áudio. Segure a tecla por ~1 segundo antes de soltar para iniciar a gravação.",
        )
      }

      await tipcClient.createRecording({
        recording: await blob.arrayBuffer(),
        duration,
        mimeType,
        audioProfile,
      })
    },
    onMutate() {
      setPhase("transcribing")
    },
    onError(error) {
      if (error instanceof Error && error.name === "AbortError") {
        void tipcClient.hidePanelWindow()
        setPhase("idle")
        setVisualizerData(getInitialVisualizerData())
        return
      }

      if (error instanceof Error) {
        handleError(error)
      }
    },
    onSettled() {
      isConfirmedRef.current = false
      setPhase("idle")
      setRecording(false)
      setVisualizerData(getInitialVisualizerData())
      resetAudioProfileMetrics()
    },
  })

  const recorderRef = useRef<Recorder | null>(null)
  const audioCuesEnabledRef = useRef(audioCuesEnabled)

  // Force refetch config when window gains focus
  useEffect(() => {
    const handleFocus = () => {
      queryClient.invalidateQueries({ queryKey: ["config"] })
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [])

  useEffect(() => {
    audioCuesEnabledRef.current = audioCuesEnabled
    recorderRef.current?.setAudioCuesEnabled(audioCuesEnabled)
  }, [audioCuesEnabled])

  useEffect(() => {
    if (recorderRef.current) return

    const recorder = (recorderRef.current = new Recorder())
    recorder.setAudioCuesEnabled(audioCuesEnabledRef.current)

    recorder.on("record-start", () => {
      setRecording(true)
      tipcClient.recordEvent({ type: "start" })
      setPhase("recording")
      resetAudioProfileMetrics()
    })

    recorder.on("visualizer-data", (rms) => {
      audioProfileRef.current.samples += 1
      audioProfileRef.current.total += Math.max(0, rms)
      audioProfileRef.current.peak = Math.max(
        audioProfileRef.current.peak,
        Math.max(0, rms),
      )
      if (rms < 0.08) {
        audioProfileRef.current.silenceSamples += 1
      }

      setVisualizerData((prev) => {
        const data = [...prev, rms]

        if (data.length > VISUALIZER_BUFFER_LENGTH) {
          data.shift()
        }

        return data
      })
    })

    recorder.on("record-end", (blob, duration, mimeType) => {
      setRecording(false)
      setVisualizerData(() => getInitialVisualizerData())
      tipcClient.recordEvent({ type: "end" })
      setPhase(isConfirmedRef.current ? "stopping" : "idle")

      if (!isConfirmedRef.current) {
        resetAudioProfileMetrics()
        return
      }

      if (!blob || blob.size === 0 || duration <= 0) {
        handleError(
          new Error(
            "Não capturamos áudio. Tente novamente segurando a tecla por ~1 segundo para garantir que o microfone começou a gravar.",
          ),
        )
        resetAudioProfileMetrics()
        setPhase("idle")
        return
      }

      if (audioCuesEnabledRef.current) {
        void playSound("end_record")
      }
      const audioProfile = getAudioProfilePayload()
      transcribeMutation.mutate({
        blob,
        duration,
        mimeType,
        audioProfile,
      })
    })
  }, [])

  useEffect(() => {
    const unlisten = rendererHandlers.startRecording.listen(() => {
      if (phase !== "idle") return
      setVisualizerData(() => getInitialVisualizerData())
      setPhase("starting")
      recorderRef.current
        ?.startRecording()
        .catch((error) => {
          setPhase("idle")
          if (error instanceof Error) {
            handleError(error)
          }
        })
    })

    return unlisten
  }, [phase])

  useEffect(() => {
    const unlisten = rendererHandlers.finishRecording.listen(() => {
      isConfirmedRef.current = true
      setPhase("stopping")
      recorderRef.current?.stopRecording()
    })

    return unlisten
  }, [])

  useEffect(() => {
    const unlisten = rendererHandlers.stopRecording.listen(() => {
      isConfirmedRef.current = false
      setPhase("idle")
      recorderRef.current?.stopRecording()
      setVisualizerData(getInitialVisualizerData())
      transcribeMutation.reset()
      resetAudioProfileMetrics()
    })

    return unlisten
  }, [])

  useEffect(() => {
    const unlisten = rendererHandlers.startOrFinishRecording.listen(() => {
      if (recording) {
        isConfirmedRef.current = true
        setPhase("stopping")
        recorderRef.current?.stopRecording()
      } else {
        tipcClient.showPanelWindow()
        if (phase === "idle") {
          setPhase("starting")
          recorderRef.current
            ?.startRecording()
            .catch((error) => {
              setPhase("idle")
              if (error instanceof Error) {
                handleError(error)
              }
            })
        }
      }
    })

    return unlisten
  }, [phase, recording])

  const enhancementEnabled = configQuery.data?.enhancementEnabled ?? false
  const isAccessibilityError = error?.name === "AccessibilityPermissionError"

  return (
    <>
      <div className="relative flex h-screen items-center justify-center rounded-full border border-white/5 bg-black shadow-2xl">
        {transcribeMutation.isPending ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        ) : (
          <div className="relative flex grow items-center justify-center overflow-hidden" dir="rtl">
            <div className="flex h-8 items-center gap-1">
              {visualizerData
                .slice()
                .reverse()
                .map((rms, index) => {
                  return (
                    <div
                      key={index}
                      className={cn(
                        "w-1 shrink-0 rounded-full transition-all duration-100 ease-out",
                        rms === -1000
                          ? "h-1 bg-white/5"
                          : "bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                      )}
                      style={{
                        height: rms === -1000 ? "4px" : `${Math.min(100, Math.max(12, rms * 120))}%`,
                        opacity: rms === -1000 ? 0.5 : 1,
                        transform: rms === -1000 ? "scaleY(1)" : "scaleY(1.1)",
                      }}
                    />
                  )
                })}
            </div>
          </div>
        )}
      </div>

      {/* Custom Error Dialog */}
      <Dialog open={!!error} onOpenChange={() => setError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{error?.name || "Erro"}</DialogTitle>
            <DialogDescription className="whitespace-pre-line">
              {error?.message}
            </DialogDescription>
          </DialogHeader>
          {isAccessibilityError && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setError(null)}>
                Fechar
              </Button>
              <Button onClick={handleOpenAccessibilitySettings}>
                Abrir Configurações
              </Button>
            </DialogFooter>
          )}
          {!isAccessibilityError && (
            <DialogFooter>
              <Button onClick={() => setError(null)}>OK</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
