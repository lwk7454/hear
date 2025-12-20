import os
import torch
from transformers import (
    AutoModel,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForSeq2Seq
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

# This script is a template meant to be run on RunPod
# Usage: python finetune_lora.py --character_id <id> --data_path <path>

def train(character_id, data_path):
    model_id = "THUDM/glm-4-voice-9b"
    
    tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
    model = AutoModel.from_pretrained(
        model_id,
        trust_remote_code=True,
        load_in_4bit=True,
        device_map="auto",
        torch_dtype=torch.bfloat16
    )
    
    model = prepare_model_for_kbit_training(model)
    
    config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=["audio_tokenizer", "llm"], # Target modules for GLM-4-Voice
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM"
    )
    
    model = get_peft_model(model, config)
    
    # Training Arguments
    training_args = TrainingArguments(
        output_dir=f"./outputs/{character_id}",
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        learning_rate=2e-4,
        fp16=False,
        bf16=True,
        logging_steps=10,
        max_steps=500, # Adjust based on data size
        save_total_limit=3,
        report_to="none"
    )
    
    # Placeholder for Dataset loading
    # dataset = load_my_audio_text_pairs(data_path)
    
    # trainer = Trainer(
    #     model=model,
    #     args=training_args,
    #     train_dataset=dataset,
    #     data_collator=DataCollatorForSeq2Seq(tokenizer, padding=True)
    # )
    
    # trainer.train()
    # model.save_pretrained(f"/workspace/adapters/{character_id}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--character_id", type=str, required=True)
    parser.add_argument("--data_path", type=str, required=True)
    args = parser.parse_args()
    
    train(args.character_id, args.data_path)
