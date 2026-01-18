import json
import requests

def smart_chunk_and_tag(text, api_key):
    """
    Uses OpenRouter to split text into semantic chunks and add emotional tags.
    Returns a list of strings, where each string is a tagged chunk.
    """
    if not api_key or api_key == "mock_key":
        print("Warning: No valid API key for smart chunking (or mock key used). Falling back to simple splitting.")
        # If mock key, maybe simulate logic?
        if api_key == "mock_key":
            return [f"[MockTag] {text[:50]}...", f"[MockTag] {text[50:]}"]
        return [text]

    print("Requesting Smart Chunking from LLM...")
    
    prompt = f"""
你是一名专业的童话故事编辑。你的任务是将以下故事文本分割成适合朗读的"语义片段"，并为每个片段添加情感标签和音效标签。

规则：
1. **分割**：将文本分成多个片段。每个片段应该是一个完整的语义单位（如一句话或两三句话）。
   - 中文片段限制在 150 字以内。
   - 英文片段限制在 100 词以内。
   - 不要把长句硬生生切断，要在标点符号处断句。
2. **情感标签**：在每个片段的**开头**加上一个最合适的情感标签。
   - 标签必须用**方括号**包裹，例如 [快乐]。
   - 可用情感标签：[快乐], [温柔], [惊奇], [难过], [害怕], [调皮], [严肃], [亲切], [兴奋], [空灵], [神秘], [活泼], [吃力].
3. **输出格式**：必须严格返回一个 JSON 字符串数组 ([]). 不要包含 markdown 代码块标记。

示例输入：
"从前有一只小兔子，它非常喜欢吃胡萝卜。有一天，它走进了一片神秘的森林，里面黑漆漆的，什么也看不见。"

示例输出：
[
    "[活泼] 从前有一只小兔子，它非常喜欢吃胡萝卜。",
    "[神秘] 有一天，它走进了一片神秘的森林，里面黑漆漆的，什么也看不见。"
]

待处理文本：
{text}
"""

    try:
        response = requests.post(
            url="https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            data=json.dumps({
                "model": "deepseek/deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7
            }),
            timeout=30
        )
        response.raise_for_status()
        result = response.json()
        content = result['choices'][0]['message']['content'].strip()
        
        # Clean up markdown code blocks if present
        if content.startswith("```"):
            content = content.strip("`")
            if content.startswith("json"):
                content = content[4:]
        
        chunks = json.loads(content)
        
        if not isinstance(chunks, list):
            raise ValueError("LLM returned valid JSON but not a list.")
            
        print(f"Smart Chunking success. {len(chunks)} chunks created.")
        print(chunks)
        return chunks
        
    except Exception as e:
        print(f"Smart Chunking failed: {e}. Falling back to single chunk.")
        return [text]
