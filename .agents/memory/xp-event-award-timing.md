---
name: XP event award timing
description: The timing boundary for temporary XP multipliers in Integral's existing XP systems.
---

Temporary XP multipliers apply once to the normal XP amount at each existing award boundary: after a message's normal randomized amount is calculated, or after a voice session's normal XP total is calculated. Manual admin XP commands remain unaffected.

**Why:** Message XP is awarded per eligible message, while voice XP is calculated and awarded when a voice session ends. Applying at those existing boundaries avoids changing cooldowns, random base XP, leveling, or other XP behavior.

**How to apply:** If the XP award paths change, keep the multiplier at the single point where each normal XP amount is committed and ensure no caller applies it a second time.
