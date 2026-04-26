# utils/analyzer.py — Core prescription analysis using Claude Vision API

import anthropic
import json
import re
import os
from typing import Optional


# ── Claude prompt for prescription analysis ─────────────────────────────────
SYSTEM_PROMPT = """You are MedChain AI, a medical prescription analysis assistant.
Your job is to carefully read prescription images and provide accurate, structured medical guidance.

IMPORTANT RULES:
- Only extract information that is clearly visible in the prescription
- Never invent or assume medicines not shown in the image
- Use simple language that patients can understand
- Always recommend consulting the prescribing doctor for clarification
- Be specific about dosages and timings when visible
- Flag any potential drug interactions or important warnings

You must ALWAYS respond with valid JSON only. No extra text before or after the JSON."""


ANALYSIS_PROMPT = """Analyze this medical prescription image carefully.

Extract all visible information and provide your response as a JSON object with this EXACT structure:

{
  "medicines": [
    {
      "name": "Medicine name as written",
      "generic_name": "Generic/chemical name if known",
      "dosage": "e.g. 500mg, 10mg",
      "frequency": "e.g. twice daily, every 8 hours",
      "duration": "e.g. 7 days, 1 month, ongoing",
      "route": "e.g. oral, topical"
    }
  ],
  "recommendations": [
    "Specific DO instruction 1",
    "Specific DO instruction 2",
    "..."
  ],
  "warnings": [
    "Specific DON'T or warning 1",
    "Specific DON'T or warning 2",
    "..."
  ],
  "diet_advice": [
    "Any food/diet related instructions"
  ],
  "follow_up": "When to see the doctor again if mentioned",
  "diagnosis": "Condition being treated if visible on prescription",
  "doctor_name": "Doctor's name if visible",
  "patient_name": "Patient name if visible",
  "prescription_date": "Date on prescription if visible",
  "notes": "Any other important information",
  "confidence": "high/medium/low — your confidence in the analysis",
  "warnings_disclaimer": "Always include: Consult your doctor before making any changes to your medication."
}

Rules:
- recommendations: Must have at least 4-6 practical DOs (taking with food, timing, hydration, etc.)
- warnings: Must have at least 4-6 specific DON'Ts (drug interactions, foods to avoid, activities, etc.)
- If a field is not visible in the image, use null for that field
- If you cannot read the prescription clearly, still provide general guidance based on what IS visible
- medicines array must never be empty — include at least what you can read
- Respond with ONLY the JSON object, nothing else"""


def clean_json_response(text: str) -> str:
    """Strip any markdown code fences or extra text around JSON."""
    # Remove ```json ... ``` or ``` ... ```
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    # Find the first { and last } to extract JSON
    start = text.find("{")
    end = text.rfind("}") + 1
    if start != -1 and end > start:
        return text[start:end]
    return text.strip()


async def analyze_prescription(
    base64_image: str,
    media_type: str,
    prescription_id: Optional[str] = None,
) -> dict:
    """
    Send prescription image to Claude Vision API and get structured analysis.

    Args:
        base64_image: Base64-encoded image data
        media_type: MIME type (image/jpeg, image/png, application/pdf)
        prescription_id: Optional ID for logging

    Returns:
        dict with medicines, recommendations, warnings, etc.
    """

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set in environment variables")

    client = anthropic.Anthropic(api_key=api_key)

    # ── Build message content ──────────────────────────────────────────────
    if media_type == "application/pdf":
        # PDF document format
        content = [
            {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": base64_image,
                },
            },
            {
                "type": "text",
                "text": ANALYSIS_PROMPT,
            },
        ]
    else:
        # Image format
        content = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": base64_image,
                },
            },
            {
                "type": "text",
                "text": ANALYSIS_PROMPT,
            },
        ]

    # ── Call Claude API ────────────────────────────────────────────────────
    print(f"[AI] Sending prescription {prescription_id or 'unknown'} to Claude...")

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": content,
            }
        ],
    )

    raw_text = response.content[0].text
    print(f"[AI] Claude response received ({len(raw_text)} chars)")

    # ── Parse JSON response ────────────────────────────────────────────────
    cleaned = clean_json_response(raw_text)

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError as e:
        print(f"[AI] JSON parse error: {e}. Raw: {raw_text[:200]}")
        # Return a safe fallback with whatever we got
        result = {
            "medicines": [],
            "recommendations": [
                "Take all medicines as prescribed by your doctor",
                "Complete the full course of medication",
                "Take medicines at regular intervals as directed",
                "Store medicines in a cool, dry place",
            ],
            "warnings": [
                "Do not skip doses",
                "Do not self-medicate or change dosage without consulting your doctor",
                "Keep medicines out of reach of children",
                "Do not take expired medicines",
            ],
            "diet_advice": [],
            "follow_up": None,
            "diagnosis": None,
            "doctor_name": None,
            "patient_name": None,
            "prescription_date": None,
            "notes": "Could not fully parse prescription — please consult your doctor directly.",
            "confidence": "low",
            "warnings_disclaimer": "Consult your doctor before making any changes to your medication.",
            "raw_claude_response": raw_text,
        }

    # ── Ensure minimum content ────────────────────────────────────────────
    if not result.get("recommendations"):
        result["recommendations"] = [
            "Take all medicines as prescribed",
            "Complete the full course even if you feel better",
            "Take medicines at the same time each day",
            "Store medicines properly as instructed",
        ]

    if not result.get("warnings"):
        result["warnings"] = [
            "Do not skip or double doses",
            "Do not share prescription medicines with others",
            "Avoid alcohol unless your doctor says it is safe",
            "Consult your doctor if you experience side effects",
        ]

    # Always add disclaimer
    result["warnings_disclaimer"] = (
        "This analysis is AI-generated for informational purposes only. "
        "Always consult your prescribing doctor before making any changes to your medication."
    )

    print(f"[AI] Analysis complete — {len(result.get('medicines', []))} medicines found")
    return result
