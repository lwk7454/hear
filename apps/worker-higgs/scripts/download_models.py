import os
import argparse
from huggingface_hub import snapshot_download
from pathlib import Path

def download_models(target_dir: str):
    models = {
        "bosonai/higgs-audio-v2-generation-3B-base": "base_model",
        "bosonai/higgs-audio-v2-tokenizer": "tokenizer"
    }
    
    target_path = Path(target_dir)
    target_path.mkdir(parents=True, exist_ok=True)
    
    for repo_id, subfolder in models.items():
        print(f"--> Downloading {repo_id} to {target_path / repo_id}...")
        snapshot_download(
            repo_id=repo_id,
            local_dir=str(target_path / repo_id),
            local_dir_use_symlinks=False
        )

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download Higgs models for Aliyun NAS/OSS")
    parser.add_argument("--dir", type=str, required=True, help="Target directory (e.g. /mnt/nas/higgs_models)")
    args = parser.parse_args()
    
    download_models(args.dir)
    print("\nDone! Now you can mount this directory to your Aliyun FC instance.")
    print(f"Set HIGGS_MODEL_PATH={args.dir}/bosonai/higgs-audio-v2-generation-3B-base")
    print(f"Set HIGGS_TOKENIZER_PATH={args.dir}/bosonai/higgs-audio-v2-tokenizer")
