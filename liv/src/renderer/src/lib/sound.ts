import beginRecord from "@renderer/assets/begin-record.wav"
import endRecord from "@renderer/assets/end-record.wav"

const beginAudio = new Audio(beginRecord)
const endAudio = new Audio(endRecord)

const audios = {
  begin_record: beginAudio,
  end_record: endAudio,
}

export const playSound = (sound: "begin_record" | "end_record", volume: number = 1.0) => {
  return new Promise<void>((resolve) => {
    const audio = audios[sound]
    audio.volume = volume

    audio.addEventListener("ended", () => {
      resolve()
    })

    audio.play()
  })
}
