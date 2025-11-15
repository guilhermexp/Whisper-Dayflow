use rdev::{listen, Event, EventType, Key};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::error::Error;

#[derive(Serialize)]
struct RdevEvent {
    event_type: String,
    name: Option<String>,
    time: std::time::SystemTime,
    data: String,
}

fn deal_event_to_json(event: Event) -> RdevEvent {
    let mut jsonify_event = RdevEvent {
        event_type: "".to_string(),
        name: event.name,
        time: event.time,
        data: "".to_string(),
    };
    match event.event_type {
        EventType::KeyPress(key) => {
            jsonify_event.event_type = "KeyPress".to_string();
            jsonify_event.data = json!({
                "key": format_key(key)
            })
            .to_string();
        }
        EventType::KeyRelease(key) => {
            jsonify_event.event_type = "KeyRelease".to_string();
            jsonify_event.data = json!({
                "key": format_key(key)
            })
            .to_string();
        }
        EventType::MouseMove { x, y } => {
            jsonify_event.event_type = "MouseMove".to_string();
            jsonify_event.data = json!({
                "x": x,
                "y": y
            })
            .to_string();
        }
        EventType::ButtonPress(key) => {
            jsonify_event.event_type = "ButtonPress".to_string();
            jsonify_event.data = json!({
                "key": format!("{:?}", key)
            })
            .to_string();
        }
        EventType::ButtonRelease(key) => {
            jsonify_event.event_type = "ButtonRelease".to_string();
            jsonify_event.data = json!({
                "key": format!("{:?}", key)
            })
            .to_string();
        }
        EventType::Wheel { delta_x, delta_y } => {
            jsonify_event.event_type = "Wheel".to_string();
            jsonify_event.data = json!({
                "delta_x": delta_x,
                "delta_y": delta_y
            })
            .to_string();
        }
    }

    jsonify_event
}

fn format_key(key: Key) -> String {
    #[cfg(target_os = "macos")]
    {
        if key == Key::ControlLeft {
            if let Ok(true) = is_fn_key_pressed() {
                return "Function".to_string();
            }
        }
    }

    format!("{:?}", key)
}

fn write_text(text: &str) {
    use enigo::{Enigo, Keyboard, Settings};

    let mut enigo = Enigo::new(&Settings::default()).unwrap();
    enigo.text(text).unwrap();
}

fn paste_from_clipboard() {
    use enigo::{Enigo, Key, Keyboard, Settings};

    let mut enigo = Enigo::new(&Settings::default()).unwrap();

    // Simulate Cmd+V on macOS, Ctrl+V on other platforms
    #[cfg(target_os = "macos")]
    {
        enigo.key(Key::Meta, enigo::Direction::Press).unwrap();
        enigo.key(Key::Unicode('v'), enigo::Direction::Click).unwrap();
        enigo.key(Key::Meta, enigo::Direction::Release).unwrap();
    }

    #[cfg(not(target_os = "macos"))]
    {
        enigo.key(Key::Control, enigo::Direction::Press).unwrap();
        enigo.key(Key::Unicode('v'), enigo::Direction::Click).unwrap();
        enigo.key(Key::Control, enigo::Direction::Release).unwrap();
    }
}

#[derive(Deserialize, Default)]
struct TranscribeOptions {
    language: Option<String>,
    threads: Option<usize>,
}

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() > 3 && args[1] == "transcribe" {
        let options = args
            .get(4)
            .and_then(|value| serde_json::from_str::<TranscribeOptions>(value).ok())
            .unwrap_or_default();

        match transcribe_audio(&args[2], &args[3], options) {
            Ok(result) => {
                println!("{}", result.trim());
                return;
            }
            Err(error) => {
                eprintln!("!error: {}", error);
                std::process::exit(1);
            }
        }
    }

    if args.len() > 1 && args[1] == "listen" {
        if let Err(error) = listen(move |event| match event.event_type {
            EventType::KeyPress(_) | EventType::KeyRelease(_) => {
                let event = deal_event_to_json(event);
                println!("{}", serde_json::to_string(&event).unwrap());
            }

            _ => {}
        }) {
            println!("!error: {:?}", error);
        }
    }

    if args.len() > 2 && args[1] == "write" {
        let text = args[2].clone();
        write_text(text.as_str());
        return;
    }

    if args.len() > 1 && args[1] == "paste" {
        paste_from_clipboard();
        return;
    }
}

#[cfg(target_os = "macos")]
mod apple_fn_key;
#[cfg(target_os = "macos")]
use apple_fn_key::is_fn_key_pressed;

#[cfg(not(target_os = "macos"))]
fn is_fn_key_pressed() -> Result<bool, ()> {
    Ok(false)
}

fn transcribe_audio(
    model_path: &str,
    audio_path: &str,
    options: TranscribeOptions,
) -> Result<String, Box<dyn Error>> {
    use whisper_rs::{
        FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters,
    };

    let ctx = WhisperContext::new_with_params(
        model_path,
        WhisperContextParameters {
            use_gpu: false,
            ..Default::default()
        },
    )?;
    let mut state = ctx.create_state()?;

    let mut reader = hound::WavReader::open(audio_path)?;
    let audio: Vec<f32> = reader
        .samples::<i16>()
        .map(|sample| sample.unwrap_or_default() as f32 / i16::MAX as f32)
        .collect();

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    let thread_count = options
        .threads
        .unwrap_or_else(num_cpus::get)
        .clamp(1, 8) as i32;
    params.set_n_threads(thread_count);

    // Configure params to force transcription
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    // Try to transcribe everything - disable silence detection
    params.set_max_len(0);
    params.set_max_initial_ts(0.0);
    params.set_no_context(false);
    params.set_single_segment(false);
    params.set_offset_ms(0);
    params.set_duration_ms(0);
    params.set_translate(false);
    params.set_no_timestamps(false);
    params.set_thold_pt(0.01); // Lower probability threshold
    params.set_thold_ptsum(0.01); // Lower sum threshold

    let language = options.language.unwrap_or_else(|| "auto".to_string());
    if language.eq_ignore_ascii_case("auto") {
        params.set_detect_language(true);
    } else {
        params.set_language(Some(&language));
    }

    eprintln!("Whisper params configured - forcing transcription with low thresholds");

    eprintln!("Audio samples loaded: {}", audio.len());
    eprintln!("Audio duration: ~{:.2}s", audio.len() as f32 / 16000.0);

    state.full(params, &audio)?;

    let num_segments = state.full_n_segments()?;
    eprintln!("Number of segments detected: {}", num_segments);

    if num_segments == 0 {
        eprintln!("WARNING: Zero segments detected - transcription failed");
        eprintln!("Possible causes:");
        eprintln!("  1. Audio contains no speech/only silence");
        eprintln!("  2. Audio volume is too low");
        eprintln!("  3. Model incompatibility with this audio format");
        eprintln!("  4. Bug in whisper.cpp or whisper-rs library");
        return Ok(String::new());
    }

    let mut transcript = String::new();
    for segment_idx in 0..num_segments {
        let segment = state.full_get_segment_text(segment_idx)?;
        eprintln!("Segment {}: \"{}\"", segment_idx, segment.trim());
        transcript.push_str(segment.trim());
        transcript.push(' ');
    }

    Ok(transcript.trim().to_string())
}
