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
        f"Global snapshot: {ctx.get('total', 0)} aircraft tracked, "
        f"{ctx.get('inAir', 0)} airborne, {ctx.get('onGround', 0)} on the ground, "
        f"{ctx.get('countries', 0)} origin countries.",
    ]

    emg = ctx.get("emergencies", 0)
    if emg > 0:
        lines.append(f"ALERT: {emg} aircraft on emergency squawk codes.")
        if ctx.get("emergencyFlights"):
            details = "; ".join(
                f"{f['callsign']} (squawk {f['squawk']} = {f['meaning']})"
                for f in ctx["emergencyFlights"]
            )
            lines.append(f"Emergency flights: {details}")
    else:
        lines.append("No emergency squawk codes active.")

    if ctx.get("topAirlines"):
        lines.append(f"Busiest airlines: {', '.join(ctx['topAirlines'][:5])}")
    if ctx.get("topCountries"):
        lines.append(f"Top origin countries: {', '.join(ctx['topCountries'][:5])}")
    if ctx.get("avgAlt"):
        lines.append(
            f"Avg cruising altitude: {ctx['avgAlt']:,} ft | Avg ground speed: {ctx.get('avgSpeed', '?')} kts"
        )
    if ctx.get("altDist"):
        d = ctx["altDist"]
        lines.append(
            f"Altitude bands: {d.get('high',0)} above FL300, "
            f"{d.get('mid',0)} at FL100–FL300, {d.get('low',0)} below FL100"
        )

    s = ctx.get("selected")
    if s:
        parts = [f"\nSelected flight: {s.get('callsign','Unknown')} (ICAO24: {s.get('icao24','?')})"]
        if s.get("registration"):
            parts.append(f"  Registration: {s['registration']}")
        if s.get("type"):
            parts.append(f"  Aircraft type: {s['type']}")
        if s.get("operator"):
            parts.append(f"  Operator/owner: {s['operator']}")
        if s.get("from") and s.get("to"):
            parts.append(f"  Route: {s['from']} → {s['to']}")
        elif s.get("from"):
            parts.append(f"  Departed from: {s['from']}")

        if s.get("onGround"):
            parts.append("  Status: on the ground")
        else:
            stat = []
            if s.get("alt"):
                stat.append(f"alt {s['alt']:,} ft")
            if s.get("speed"):
                stat.append(f"speed {s['speed']} kts")
            if s.get("heading") is not None:
                stat.append(f"heading {s['heading']}°")
            vr = s.get("vertRate")
            if vr is not None:
                if vr > 200:
                    stat.append(f"climbing {vr} ft/min")
                elif vr < -200:
                    stat.append(f"descending {abs(vr)} ft/min")
                else:
                    stat.append("level flight")
            if stat:
                parts.append(f"  Status: airborne — {', '.join(stat)}")

        if s.get("origin"):
            parts.append(f"  Origin country: {s['origin']}")
        sq = str(s.get("squawk") or "")
        if sq and sq not in ("0", ""):
            parts.append(f"  Squawk: {sq}")
        lines.append("\n".join(parts))

    return "Live air traffic data:\n" + "\n".join(lines)


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
                "You are FlightScope AI, a knowledgeable aviation assistant embedded in a real-time global flight tracker. "
                "For questions about current traffic, use the live data snapshot provided. "
                "For questions about aviation concepts, aircraft types, airlines, airports, procedures, or history — use your general knowledge freely. "
                "Keep answers to 2–4 sentences. Never say you cannot answer if you can use general aviation knowledge. "
                "If specific live data is unavailable, say so in one clause and then answer from general knowledge."
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
            max_tokens=300,
            temperature=0.4,
        )
        answer = response.choices[0].message.content.strip()
        return {"answer": answer}
    except Exception as e:
        err = str(e)
        if "loading" in err.lower() or "503" in err:
            return {"answer": "The AI model is warming up — please try again in 20 seconds.", "error": True}
        return {"answer": f"AI temporarily unavailable. ({err[:120]})", "error": True}
