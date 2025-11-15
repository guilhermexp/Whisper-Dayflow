import { Spinner } from "@renderer/components/ui/spinner"
import { Recorder } from "@renderer/lib/recorder"
import { playSound } from "@renderer/lib/sound"
import { cn } from "@renderer/lib/utils"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useConfigQuery, queryClient } from "@renderer/lib/query-client"
import { rendererHandlers, tipcClient } from "~/lib/tipc-client"

const VISUALIZER_BUFFER_LENGTH = 70

const getInitialVisualizerData = () =>
  Array<number>(VISUALIZER_BUFFER_LENGTH).fill(-1000)

type PanelPhase = "idle" | "starting" | "recording" | "stopping" | "transcribing"

export function Component() {
  const configQuery = useConfigQuery()
  const [visualizerData, setVisualizerData] = useState(() =>
    getInitialVisualizerData(),
  )
  const [recording, setRecording] = useState(false)
  const [phase, setPhase] = useState<PanelPhase>("idle")
  const isConfirmedRef = useRef(false)
  const audioCuesEnabled = configQuery.data?.enableAudioCues ?? true

  const transcribeMutation = useMutation({
    mutationFn: async ({
      blob,
      duration,
      mimeType,
    }: {
      blob: Blob
      duration: number
      mimeType: string
    }) => {
      await tipcClient.createRecording({
        recording: await blob.arrayBuffer(),
        duration,
        mimeType,
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

      void tipcClient.hidePanelWindow()
      tipcClient.displayError({
        title: error.name,
        message: error.message,
      })
    },
    onSettled() {
      isConfirmedRef.current = false
      setPhase("idle")
      setRecording(false)
      setVisualizerData(getInitialVisualizerData())
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
    })

    recorder.on("visualizer-data", (rms) => {
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

      if (!isConfirmedRef.current) return

      if (audioCuesEnabledRef.current) {
        void playSound("end_record")
      }
      transcribeMutation.mutate({
        blob,
        duration,
        mimeType,
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
          tipcClient.displayError({
            title: error.name,
            message: error.message,
          })
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
              tipcClient.displayError({
                title: error.name,
                message: error.message,
              })
            })
        }
      }
    })

    return unlisten
  }, [phase, recording])

  return (
    <div className="relative flex h-screen items-center justify-center rounded-2xl border border-gray-800/50 bg-black/90 backdrop-blur-sm">
      {transcribeMutation.isPending ? (
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex h-full w-full px-4 py-2">
          <div
            className="relative flex grow items-center justify-center overflow-hidden"
            dir="rtl"
          >
            <div className="flex h-4 items-center gap-0.5">
              {visualizerData
                .slice()
                .reverse()
                .map((rms, index) => {
                  return (
                    <div
                      key={index}
                      className={cn(
                        "w-0.5 shrink-0 rounded-full transition-all duration-75",
                        rms === -1000 ? "bg-gray-600" : "bg-white shadow-sm",
                      )}
                      style={{
                        height: `${Math.min(100, Math.max(8, rms * 100))}%`,
                      }}
                    />
                  )
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
