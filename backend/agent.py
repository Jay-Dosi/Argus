import os
import time
import base64
import json
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))

class ActivityAnalysis(BaseModel):
    category: str = Field(description=(
        "one of: coding, browsing, social_media, video, document, "
        "communication, shopping, entertainment, other"
    ))
    application_or_site: str = Field(description="short label, e.g. 'VS Code', 'YouTube'")
    task_summary: str = Field(description="one short sentence, no names, no account/personal identifiers")
    contains_sensitive_content: bool = Field(description="true if login forms, financial data, or personal docs are visible")
    confidence: float

PROMPT = """You are classifying a single browser screenshot for a personal activity log.
Tab title: {title}
Domain: {domain}

Do not include any names, emails, account numbers, or other personally identifying
text you see in the screenshot in your summary — describe the activity generically.
"""

def analyze_screenshot(image_b64: str, tab_title: str, domain: str):
    start_time = time.time()
    
    try:
        image_bytes = base64.b64decode(image_b64)
        
        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type='image/jpeg'),
                PROMPT.format(title=tab_title, domain=domain)
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ActivityAnalysis,
                temperature=0.1,
            )
        )
        
        parsed = json.loads(response.text)
        latency_ms = int((time.time() - start_time) * 1000)
        return parsed, latency_ms
    except Exception as e:
        print(f"Error during AI analysis: {e}")
        return None, int((time.time() - start_time) * 1000)
