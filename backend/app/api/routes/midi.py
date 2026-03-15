"""
APC Mini MK2 MIDI mapping stub.

Exposes a static JSON mapping of the 8x8 grid (64 pads) to Music Matters functions.
MIDI note numbers follow the Akai APC Mini MK2 spec:
  - Pad (row=0,col=0) = note 56   (bottom-left on hardware, but we index top-left)
  - Notes increase left→right, then row goes down
  - Row 0 (top) = notes 56-63, Row 1 = notes 48-55, … Row 7 = notes 0-7
  - That matches the APC Mini MK2 default "Session" layout.

Functional mapping:
  Row 0  → Stem Lane: Drums    (8 scene slots)
  Row 1  → Stem Lane: Bass
  Row 2  → Stem Lane: Vocals
  Row 3  → Stem Lane: Guitar
  Row 4  → Stem Lane: Piano
  Row 5  → Stem Lane: Other
  Row 6  → Scene Launch / Smart Phrases  (col 0-5 = phrase buttons, col 6-7 = prev/next)
  Row 7  → Transport & Export
             col 0 = Play/Stop
             col 1 = Record Loop
             col 2 = Snap to Phrase
             col 3 = Save Loop
             col 4 = Export Ableton
             col 5 = Export Stems
             col 6 = BPM Tap
             col 7 = Panic (stop all)
"""

from fastapi import APIRouter
from typing import List, Dict, Any

router = APIRouter(prefix="/midi", tags=["midi"])

# APC Mini MK2 colour index (7-bit velocity values used as colour IDs)
COLOUR_OFF = 0
COLOUR_GREEN = 21
COLOUR_GREEN_BRIGHT = 26
COLOUR_BLUE = 67
COLOUR_BLUE_BRIGHT = 69
COLOUR_RED = 5
COLOUR_RED_BRIGHT = 7
COLOUR_YELLOW = 13
COLOUR_ORANGE = 9
COLOUR_PURPLE = 50
COLOUR_CYAN = 35
COLOUR_WHITE = 3

# Stem lane definitions (row → stem info)
STEM_ROWS: Dict[int, Dict[str, Any]] = {
    0: {"stem": "drums",  "label": "Drums",  "color_idle": COLOUR_RED,    "color_active": COLOUR_RED_BRIGHT},
    1: {"stem": "bass",   "label": "Bass",   "color_idle": COLOUR_ORANGE, "color_active": COLOUR_YELLOW},
    2: {"stem": "vocals", "label": "Vocals", "color_idle": COLOUR_BLUE,   "color_active": COLOUR_BLUE_BRIGHT},
    3: {"stem": "guitar", "label": "Guitar", "color_idle": COLOUR_GREEN,  "color_active": COLOUR_GREEN_BRIGHT},
    4: {"stem": "piano",  "label": "Piano",  "color_idle": COLOUR_PURPLE, "color_active": COLOUR_WHITE},
    5: {"stem": "other",  "label": "Other",  "color_idle": COLOUR_CYAN,   "color_active": COLOUR_WHITE},
}

PHRASE_COLS: Dict[int, str] = {
    0: "phrase:intro",
    1: "phrase:verse",
    2: "phrase:chorus",
    3: "phrase:drop",
    4: "phrase:bridge",
    5: "phrase:outro",
    6: "phrase:prev",
    7: "phrase:next",
}

TRANSPORT_COLS: Dict[int, Dict[str, Any]] = {
    0: {"function": "transport:play_stop",     "label": "Play/Stop",       "color_idle": COLOUR_GREEN,  "color_active": COLOUR_RED},
    1: {"function": "transport:record_loop",   "label": "Record Loop",     "color_idle": COLOUR_RED,    "color_active": COLOUR_RED_BRIGHT},
    2: {"function": "transport:snap_phrase",   "label": "Snap to Phrase",  "color_idle": COLOUR_BLUE,   "color_active": COLOUR_BLUE_BRIGHT},
    3: {"function": "transport:save_loop",     "label": "Save Loop",       "color_idle": COLOUR_YELLOW, "color_active": COLOUR_WHITE},
    4: {"function": "transport:export_ableton","label": "Export Ableton",  "color_idle": COLOUR_GREEN,  "color_active": COLOUR_WHITE},
    5: {"function": "transport:export_stems",  "label": "Export Stems",    "color_idle": COLOUR_PURPLE, "color_active": COLOUR_WHITE},
    6: {"function": "transport:bpm_tap",       "label": "BPM Tap",         "color_idle": COLOUR_ORANGE, "color_active": COLOUR_YELLOW},
    7: {"function": "transport:panic",         "label": "Panic",           "color_idle": COLOUR_RED,    "color_active": COLOUR_RED_BRIGHT},
}


def _note_for(row: int, col: int) -> int:
    """
    APC Mini MK2 MIDI note for a given (row, col).
    Row 0 = top row, Row 7 = bottom row.
    Hardware note layout (top-left = 56, top-right = 63):
      note = 56 - (row * 8) + col
    """
    return 56 - (row * 8) + col


def _build_mappings() -> List[Dict[str, Any]]:
    mappings = []
    for row in range(8):
        for col in range(8):
            note = _note_for(row, col)

            if row in STEM_ROWS:
                stem_info = STEM_ROWS[row]
                mapping = {
                    "note": note,
                    "channel": 1,
                    "row": row,
                    "col": col,
                    "function": f"stem:{stem_info['stem']}:scene:{col}",
                    "label": f"{stem_info['label']} Scene {col + 1}",
                    "color_idle": stem_info["color_idle"],
                    "color_active": stem_info["color_active"],
                    "group": "stem_lane",
                }

            elif row == 6:
                func = PHRASE_COLS.get(col, f"phrase:slot:{col}")
                label_map = {
                    "phrase:intro":  "Intro",
                    "phrase:verse":  "Verse",
                    "phrase:chorus": "Chorus",
                    "phrase:drop":   "Drop",
                    "phrase:bridge": "Bridge",
                    "phrase:outro":  "Outro",
                    "phrase:prev":   "← Prev",
                    "phrase:next":   "Next →",
                }
                mapping = {
                    "note": note,
                    "channel": 1,
                    "row": row,
                    "col": col,
                    "function": func,
                    "label": label_map.get(func, func),
                    "color_idle": COLOUR_CYAN,
                    "color_active": COLOUR_WHITE,
                    "group": "phrase",
                }

            else:  # row == 7, transport
                t = TRANSPORT_COLS.get(col, {"function": f"transport:unused:{col}", "label": f"Unused {col}", "color_idle": COLOUR_OFF, "color_active": COLOUR_OFF})
                mapping = {
                    "note": note,
                    "channel": 1,
                    "row": row,
                    "col": col,
                    "function": t["function"],
                    "label": t["label"],
                    "color_idle": t["color_idle"],
                    "color_active": t["color_active"],
                    "group": "transport",
                }

            mappings.append(mapping)

    return mappings


_MAPPINGS = _build_mappings()


@router.get("/apc-mini-mk2/mapping")
def get_apc_mini_mk2_mapping():
    """
    Return the full 8x8 grid MIDI note mapping for the APC Mini MK2.

    Each entry contains:
    - note: MIDI note number (0-127)
    - channel: MIDI channel (1)
    - row/col: grid coordinates (0-indexed, top-left)
    - function: dot-separated action identifier
    - label: human-readable label
    - color_idle: APC colour velocity when pad is inactive
    - color_active: APC colour velocity when pad is active/lit
    - group: stem_lane | phrase | transport
    """
    return {
        "device": "APC Mini MK2",
        "grid": "8x8",
        "total_pads": 64,
        "note_layout": "top-left=56, decrements by 8 per row, increments by 1 per col",
        "mappings": _MAPPINGS,
    }


@router.get("/apc-mini-mk2/mapping/group/{group}")
def get_group_mapping(group: str):
    """Return mappings filtered by group: stem_lane | phrase | transport."""
    filtered = [m for m in _MAPPINGS if m["group"] == group]
    if not filtered:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"No mappings found for group '{group}'")
    return {"group": group, "mappings": filtered}
