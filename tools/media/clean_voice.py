#!/usr/bin/env python3
"""
clean_voice.py — voice cleanup for the AI Video Editor (outdoor / noisy footage).

Cleans the voice on a video's audio, gain-matches the result back to the source's RMS
("denoise only, levels preserved"), and remuxes with the video stream COPIED (fast,
non-destructive, keeps 4K60). Original file is never modified.

Method: local RNNoise (ffmpeg arnndn, model via --model, default sh). Free/offline;
only PARTIALLY removes dynamic broadband noise like running water (spectral/RNN tools
can't fully separate it), but needs no API key or network access.

Usage:
  python tools/media/clean_voice.py IN.mp4 [--model sh] [-o OUT.mp4] [--no-preserve-loudness] [--keep]

Needs ffmpeg/ffprobe on PATH. RNNoise models live in tools/media/models/rnnoise/<model>.rnnn.
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def run(cmd, **kw):
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, **kw)
    if r.returncode != 0:
        sys.stderr.write("\nCOMMAND FAILED:\n  " + " ".join(cmd) + "\n" + r.stdout[-3000:] + "\n")
        raise SystemExit(1)
    return r.stdout


def probe_dur(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                      "-of", "default=nw=1:nk=1", path]).strip())


def astat(path, label):
    out = run(["ffmpeg", "-hide_banner", "-i", path, "-af", "astats=metadata=1", "-f", "null", os.devnull])
    m = re.search(rf"{label}:\s*(-?[\d.]+)", out)
    return float(m.group(1)) if m else None


def arg(args, name, default=None):
    return args[args.index(name) + 1] if name in args else default


def main():
    args = sys.argv[1:]
    keep = "--keep" in args
    preserve = "--no-preserve-loudness" not in args
    model = arg(args, "--model", "sh")
    out = arg(args, "-o")
    skip = {out, model, arg(args, "--model")}
    pos = [a for a in args if not a.startswith("-") and a not in skip]
    if not pos:
        sys.exit("usage: clean_voice.py IN.mp4 [--model sh] [-o OUT.mp4] "
                 "[--no-preserve-loudness] [--keep]")
    src = pos[0] if os.path.isabs(pos[0]) else os.path.join(ROOT, pos[0])
    if not out:
        base, ext = os.path.splitext(src)
        out = base + f"-clean-{model}" + ext
    out = out if os.path.isabs(out) else os.path.join(ROOT, out)

    work = os.path.join(os.path.dirname(out), "_clean_tmp")
    os.makedirs(work, exist_ok=True)
    audio_in = os.path.join(work, "audio_in.wav")

    print(f"src: {os.path.relpath(src, ROOT)}   method: rnnoise ({model})")
    dur = probe_dur(src)

    # 1) extract mono audio (the master is dual-mono; mono halves size, loses nothing)
    print("extracting audio -> mono wav ...")
    run(["ffmpeg", "-y", "-hide_banner", "-i", src, "-vn", "-ac", "1", "-ar", "44100",
         "-c:a", "pcm_s16le", audio_in])

    # 2) produce the cleaned voice track: high-pass sub-90Hz rumble + RNNoise suppression
    mpath = os.path.join(ROOT, "tools", "media", "models", "rnnoise", f"{model}.rnnn")
    if not os.path.exists(mpath):
        sys.exit(f"RNNoise model not found: {mpath}")
    iso = os.path.join(work, "isolated.wav")
    # arnndn's model path goes INSIDE the filtergraph, where `:` (option separator) and
    # `\` (escape) mangle a Windows absolute path. Run ffmpeg from ROOT and pass a
    # relative, forward-slash, colon-free path instead.
    mrel = f"tools/media/models/rnnoise/{model}.rnnn"
    print(f"denoising locally via RNNoise ({model}) ...")
    run(["ffmpeg", "-y", "-hide_banner", "-i", audio_in,
         "-af", f"highpass=f=90,arnndn=m={mrel}", "-ar", "44100", iso], cwd=ROOT)

    # 3) preserve loudness: match cleaned track back to the source's RMS (speech-dominated,
    #    ungated) — NOT integrated LUFS, which is gated + inflated by the removed noise and
    #    would over-boost the voice into clipping. Cap so the peak never exceeds the ceiling.
    gain, CEIL = 0.0, -1.0
    if preserve:
        src_rms, iso_rms, iso_peak = astat(src, "RMS level dB"), astat(iso, "RMS level dB"), astat(iso, "Peak level dB")
        if None not in (src_rms, iso_rms, iso_peak):
            gain = src_rms - iso_rms
            if iso_peak + gain > CEIL:      # flat-gain cap (no compression) to avoid clipping
                gain = CEIL - iso_peak
        print(f"level: src RMS {src_rms} dB, cleaned RMS {iso_rms} dB / peak {iso_peak} dB -> gain {gain:+.2f} dB")

    # 4) remux: video COPIED, cleaned audio (gain-matched, padded to video length)
    print("remux (video copy) ...")
    run(["ffmpeg", "-y", "-hide_banner", "-i", src, "-i", iso,
         "-filter_complex", f"[1:a]volume={gain:.2f}dB,apad[a]",
         "-map", "0:v:0", "-map", "[a]", "-shortest",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out])

    od = probe_dur(out)
    print(f"\ndone -> {os.path.relpath(out, ROOT)}  ({od:.1f}s, video copied, voice cleaned)")
    if abs(od - dur) > 0.15:
        print(f"  WARNING: duration drift {od-dur:+.2f}s vs source")
    if not keep:
        import shutil
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
