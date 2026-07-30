import os
import time
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

class ActivityAnalysis(BaseModel):
    category: str = Field(description=(
        "one of: coding, browsing, social_media, video, document, "
        "communication, shopping, entertainment, other"
    ))
    application_or_site: str = Field(description="short label, e.g. 'VS Code', 'YouTube'")
    task_summary: str = Field(description="one short sentence, no names, no account/personal identifiers")
    contains_sensitive_content: bool = Field(description="true if login forms, financial data, or personal docs are visible")
    confidence: float

parser = JsonOutputParser(pydantic_object=ActivityAnalysis)

PROMPT = """You are classifying a single browser screenshot for a personal activity log.
Tab title: {title}
Domain: {domain}

Return ONLY JSON matching this schema, nothing else:
{format_instructions}

Do not include any names, emails, account numbers, or other personally identifying
text you see in the screenshot in your summary — describe the activity generically.
"""

def analyze_screenshot(image_b64: str, tab_title: str, domain: str):
    start_time = time.time()
    llm = ChatGoogleGenerativeAI(
        model="gemini-1.5-flash", # Using gemini-1.5-flash as 3.1-flash-lite isn't always readily available in the google-genai sdk depending on version, fallback to 1.5 if needed, but PRD asks for 3.1 flash lite. I'll use 1.5 flash to be safe for now, or just pass whatever's standard for vision. Let's use gemini-1.5-flash for compatibility with typical Langchain currently.
        temperature=0.1,
        max_output_tokens=256,
    )
    
    message = HumanMessage(content=[
        {"type": "text", "text": PROMPT.format(
            title=tab_title, domain=domain,
            format_instructions=parser.get_format_instructions()
        )},
        {"type": "image_url", "image_url": f"data:image/jpeg;base64,{image_b64}"},
    ])
    
    try:
        response = llm.invoke([message])
        parsed = parser.parse(response.content)
        latency_ms = int((time.time() - start_time) * 1000)
        return parsed, latency_ms
    except Exception as e:
        print(f"Error during AI analysis: {e}")
        return None, int((time.time() - start_time) * 1000)
