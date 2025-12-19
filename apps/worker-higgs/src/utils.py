import io
from io import BytesIO
from pydub import AudioSegment

def compress_audio(wav_path: str, target_format="mp3", bitrate="64k") -> BytesIO:
    """Converts WAV to compressed format in memory. Fallback to WAV if ffmpeg missing."""
    buffer = BytesIO()
    try:
        audio = AudioSegment.from_wav(wav_path)
        audio.export(buffer, format=target_format, bitrate=bitrate)
    except Exception as e:
        print(f"WARNING: Compression failed (ffmpeg missing?), falling back to WAV. Error: {e}")
        # Fallback: Just read the WAV file into buffer
        with open(wav_path, "rb") as f:
            buffer.write(f.read())
    
    buffer.seek(0)
    return buffer
