"""
AI chat endpoint — routes questions about live flight data through Mistral-7B via HuggingFace.
Requires HF_TOKEN in .env (free account token from hf.co/settings/tokens).
"""
import os
import asyncio
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

try:
    from huggingface_hub import AsyncInferenceClient
    _HF_AVAILABLE = True
except ImportError:
    _HF_AVAILABLE = False

_client = None

def _get_client():
    global _client
    if _client is None and _HF_AVAILABLE:
        _client = AsyncInferenceClient(
            token=os.getenv("HF_TOKEN"),
        )
    return _client


class ChatRequest(BaseModel):
    question: str
    context: dict = {}


def _build_context_str(ctx: dict) -> str:
    lines = [
        f"- {ctx.get('total', 0)} aircraft tracked worldwide",
        f"- {ctx.get('inAir', 0)} airborne, {ctx.get('onGround', 0)} on the ground",
        f"- {ctx.get('countries', 0)} origin countries represented",
        f"- {ctx.get('emergencies', 0)} emergency squawk codes currently active",
    ]
    if ctx.get("topAirlines"):
        lines.append(f"- Busiest airlines: {', '.join(ctx['topAirlines'][:5])}")
    if ctx.get("avgAlt"):
        lines.append(f"- Average cruising altitude: {ctx['avgAlt']:,} ft")
    if ctx.get("avgSpeed"):
        lines.append(f"- Average ground speed: {ctx['avgSpeed']} knots")
    if ctx.get("selected"):
        s = ctx["selected"]
        sel = f"- User has selected: {s.get('callsign', 'Unknown')}"
        if s.get("from") and s.get("to"):
            sel += f" ({s['from']} → {s['to']})"
        if s.get("alt"):
            sel += f", altitude {s['alt']:,} ft"
        if s.get("speed"):
            sel += f", speed {s['speed']} kts"
        if s.get("heading") is not None:
            sel += f", heading {s['heading']}°"
        lines.append(sel)
    return "Current live air traffic data:\n" + "\n".join(lines)


@router.post("/api/ai/chat")
async def ai_chat(body: ChatRequest):
    if not _HF_AVAILABLE:
        return {"answer": "huggingface_hub is not installed. Run: pip install huggingface_hub", "error": True}

    token = os.getenv("HF_TOKEN")
    if not token:
        return {"answer": "AI assistant requires HF_TOKEN in your .env file. Get a free token at hf.co/settings/tokens.", "error": True}

    ctx_str = _build_context_str(body.context)

    messages = [
        {
            "role": "system",
            "content": (
                "You are FlightScope AI, an aviation assistant embedded in a real-time global flight tracker. "
                "Answer questions about current air traffic using only the statistics provided. "
                "Be concise — 1 to 3 sentences. Do not apologise or explain what you cannot do. "
                "If the data does not contain the answer, say so briefly and suggest what the user could look for."
            ),
        },
        {
            "role": "user",
            "content": f"{ctx_str}\n\nQuestion: {body.question}",
        },
    ]

    try:
        client = _get_client()
        response = await client.chat_completion(
            model="Qwen/Qwen2.5-72B-Instruct",
            messages=messages,
            max_tokens=180,
            temperature=0.5,
        )
        answer = response.choices[0].message.content.strip()
        return {"answer": answer}
    except Exception as e:
        err = str(e)
        if "loading" in err.lower() or "503" in err:
            return {"answer": "The AI model is warming up — please try again in 20 seconds.", "error": True}
        return {"answer": f"AI temporarily unavailable. ({err[:120]})", "error": True}
