(() => {
  "use strict";

  window.RCP_MELODY_DEFS =
    window.RCP_MELODY_DEFS || {};

  Object.assign(
    window.RCP_MELODY_DEFS,
    {
      // 120 BPM; the rest preserves the original phrase's t=0.5 second note.
      // Use the same wave32 instrument as bankCompleted.
      "secondChance": {
        "id": "secondChance",
        "bpm": 140,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.002,
          "gate": 0.82,
          "release": 0.025,
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          { "note": 31, "beats": 0.25 },
          { "note": 36, "beats": 0.25 },
          { "note": 41, "beats": 0.25 },
          { "note": 36, "beats": 0.25 },
          { "note": 41, "beats": 0.25 },
          { "note": 43, "beats": 0.5 }
        ]
      },
      "tableConfirm": {
        "id": "tableConfirm",
        "bpm": 400,
        "instrument": {
          "wave": "square",
          "volume": 0.1,
          "attack": 0.002,
          "gate": 0.82,
          "release": 0.025
        },
        "notes": [
          {
            "note": 72,
            "beats": 0.25
          },
          {
            "note": 79,
            "beats": 0.25
          }
        ]
      },
      "bankCompleted": {
        "id": "bankCompleted",
        "bpm": 160,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.002,
          "gate": 0.82,
          "release": 0.025,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 55,
            "beats": 0.25
          },
          {
            "note": 58,
            "beats": 0.25
          },
          {
            "note": 63,
            "beats": 0.25
          },
          {
            "note": 55,
            "beats": 0.25
          },
          {
            "note": 48,
            "beats": 0.5
          }
        ]
      },
      "comboTarget": {
        "id": "comboTarget",
        "bpm": 160,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.002,
          "gate": 0.82,
          "release": 0.025,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 48,
            "beats": 0.25
          },
          {
            "note": 51,
            "beats": 0.25
          },
          {
            "note": 53,
            "beats": 0.25
          },
          {
            "note": 55,
            "beats": 0.25
          },
          {
            "note": 60,
            "beats": 0.25
          },
          {
            "note": 53,
            "beats": 0.25
          },
          {
            "note": 46,
            "beats": 0.25
          },
          {
            "note": 48,
            "beats": 0.25
          }
        ]
      },
      "start": {
        "id": "start",
        "bpm": 160,
        "instrument": {
          "wave": "wave32",
          "volume": 0.25,
          "attack": 0.004,
          "gate": 0.88,
          "release": 0.04,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 39,
            "beats": 0.25
          },
          {
            "note": 42,
            "beats": 0.25
          },
          {
            "note": 43,
            "beats": 0.25
          },
          {
            "note": 46,
            "beats": 0.25
          },
          {
            "note": 48,
            "beats": 0.25
          },
          {
            "note": 51,
            "beats": 0.25
          },
          {
            "note": 39,
            "beats": 0.75
          }
        ]
      },
      "boosted": {
        "id": "boosted",
        "bpm": 180,
        "instrument": {
          "wave": "wave32",
          "volume": 0.25,
          "attack": 0.004,
          "gate": 0.88,
          "release": 0.04,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 31,
            "beats": 0.5
          },
          {
            "note": 34,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 39,
            "beats": 0.5
          },
          {
            "note": 43,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 39,
            "beats": 0.5
          },
          {
            "note": 43,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 39,
            "beats": 0.5
          },
          {
            "note": 43,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 39,
            "beats": 0.5
          },
          {
            "note": 43,
            "beats": 0.5
          },
          {
            "note": 43,
            "beats": 0.5
          },
          {
            "note": 42,
            "beats": 0.5
          },
          {
            "note": 41,
            "beats": 0.5
          },
          {
            "note": 43,
            "beats": 0.5
          },
          {
            "note": 42,
            "beats": 0.5
          },
          {
            "note": 41,
            "beats": 0.5
          },
          {
            "note": 31,
            "beats": 0.5
          },
          {
            "note": 34,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 39,
            "beats": 0.5
          },
          {
            "note": 43,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 39,
            "beats": 0.5
          },
          {
            "note": 43,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 39,
            "beats": 0.5
          },
          {
            "note": 43,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 39,
            "beats": 0.5
          },
          {
            "note": 43,
            "beats": 0.5
          },
          {
            "note": 43,
            "beats": 0.5
          },
          {
            "note": 42,
            "beats": 0.5
          },
          {
            "rest": true,
            "beats": 0.5
          },
          {
            "note": 41,
            "beats": 0.5
          },
          {
            "rest": true,
            "beats": 0.5
          },
          {
            "note": 31,
            "beats": 0.5
          },
          {
            "rest": true,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          }
        ]
      },
      "gameOver": {
        "id": "gameOver",
        "bpm": 180,
        "instrument": {
          "wave": "wave32",
          "volume": 0.25,
          "attack": 0.004,
          "gate": 0.88,
          "release": 0.04,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 48,
            "beats": 0.5
          },
          {
            "rest": true,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          },
          {
            "note": 43,
            "beats": 0.5
          },
          {
            "note": 42,
            "beats": 0.5
          },
          {
            "note": 41,
            "beats": 0.5
          },
          {
            "note": 34,
            "beats": 0.5
          },
          {
            "rest": true,
            "beats": 0.5
          },
          {
            "note": 36,
            "beats": 0.5
          }
        ]
      },
      "boostCollect": {
        "id": "boostCollect",
        "bpm": 180,
        "instrument": {
          "wave": "wave32",
          "volume": 0.25,
          "attack": 0.004,
          "gate": 0.88,
          "release": 0.04,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 53,
            "beats": 0.25
          },
          {
            "note": 55,
            "beats": 0.25
          },
          {
            "note": 58,
            "beats": 0.25
          },
          {
            "note": 60,
            "beats": 0.25
          },
          {
            "note": 63,
            "beats": 0.25
          },
          {
            "note": 63,
            "beats": 0.25
          },
          {
            "note": 63,
            "beats": 0.25
          }
        ]
      },
      "toplane": {
        "id": "toplane",
        "bpm": 148,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.004,
          "gate": 0.88,
          "release": 0.04,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 51,
            "beats": 0.25
          },
          {
            "note": 54,
            "beats": 0.25
          },
          {
            "note": 55,
            "beats": 0.25
          },
          {
            "note": 60,
            "beats": 0.25
          },
          {
            "note": 58,
            "beats": 0.5
          }
        ]
      },
      "ballLost": {
        "id": "ballLost",
        "bpm": 148,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.004,
          "gate": 0.88,
          "release": 0.04,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 43,
            "beats": 0.25
          },
          {
            "note": 41,
            "beats": 0.25
          },
          {
            "note": 34,
            "beats": 0.25
          },
          {
            "note": 36,
            "beats": 0.5
          }
        ]
      },
      "levelUp": {
        "id": "levelUp",
        "bpm": 160,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.002,
          "gate": 0.82,
          "release": 0.025,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 55,
            "beats": 0.25
          },
          {
            "note": 53,
            "beats": 0.25
          },
          {
            "note": 54,
            "beats": 0.25
          },
          {
            "note": 55,
            "beats": 0.25
          },
          {
            "note": 58,
            "beats": 0.25
          },
          {
            "note": 60,
            "beats": 0.25
          }
        ]
      },
      "valueUp": {
        "id": "valueUp",
        "bpm": 160,
        "instrument": {
          "wave": "triangle",
          "volume": 0.2,
          "attack": 0.002,
          "gate": 0.82,
          "release": 0.025,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          }
        },
        "notes": [
          {
            "note": 55,
            "beats": 0.25
          },
          {
            "note": 60,
            "beats": 0.25
          },
          {
            "note": 67,
            "beats": 0.25
          }
        ]
      },
      "saucerLevel2": {
        "id": "saucerLevel2",
        "bpm": 180,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.002,
          "gate": 0.82,
          "release": 0.025,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 55,
            "beats": 0.25
          },
          {
            "note": 58,
            "beats": 0.25
          },
          {
            "note": 60,
            "beats": 0.25
          },
          {
            "note": 65,
            "beats": 0.25
          },
          {
            "note": 58,
            "beats": 0.25
          },
          {
            "note": 60,
            "beats": 0.25
          }
        ]
      },
      "bonusPowerMax": {
        "id": "bonusPowerMax",
        "bpm": 140,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.002,
          "gate": 0.82,
          "release": 0.025,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 55,
            "beats": 0.25
          },
          {
            "note": 60,
            "beats": 0.25
          },
          {
            "note": 67,
            "beats": 0.25
          },
          {
            "note": 72,
            "beats": 0.25
          }
        ]
      },
      "inactive": {
        "id": "inactive",
        "bpm": 180,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.002,
          "gate": 0.82,
          "release": 0.025,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 41,
            "beats": 0.25
          },
          {
            "note": 36,
            "beats": 0.25
          },
          {
            "note": 36,
            "beats": 0.25
          }
        ]
      },
      "bonusGain": {
        "id": "bonusGain",
        "bpm": 180,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.004,
          "gate": 0.88,
          "release": 0.04,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 54,
            "beats": 0.25
          },
          {
            "note": 55,
            "beats": 0.25
          },
          {
            "note": 58,
            "beats": 0.25
          },
          {
            "note": 60,
            "beats": 0.25
          }
        ]
      },
      "ball2": {
        "id": "ball2",
        "bpm": 160,
        "instrument": {
          "wave": "wave32",
          "volume": 0.25,
          "attack": 0.004,
          "gate": 0.88,
          "release": 0.04,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 41,
            "beats": 0.25
          },
          {
            "note": 43,
            "beats": 0.25
          },
          {
            "note": 46,
            "beats": 0.25
          },
          {
            "note": 46,
            "beats": 0.25
          },
          {
            "note": 36,
            "beats": 0.5
          }
        ]
      },
      "ball3": {
        "id": "ball3",
        "bpm": 160,
        "instrument": {
          "wave": "wave32",
          "volume": 0.25,
          "attack": 0.004,
          "gate": 0.88,
          "release": 0.04,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 41,
            "beats": 0.25
          },
          {
            "note": 39,
            "beats": 0.25
          },
          {
            "note": 36,
            "beats": 0.25
          },
          {
            "note": 43,
            "beats": 0.25
          },
          {
            "note": 48,
            "beats": 0.5
          }
        ]
      },
      "ball4": {
        "id": "ball4",
        "bpm": 160,
        "instrument": {
          "wave": "wave32",
          "volume": 0.25,
          "attack": 0.004,
          "gate": 0.88,
          "release": 0.04,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 41,
            "beats": 0.25
          },
          {
            "note": 43,
            "beats": 0.25
          },
          {
            "note": 46,
            "beats": 0.25
          },
          {
            "note": 34,
            "beats": 0.25
          },
          {
            "note": 36,
            "beats": 0.5
          }
        ]
      },
      "ball5": {
        "id": "ball5",
        "bpm": 160,
        "instrument": {
          "wave": "wave32",
          "volume": 0.25,
          "attack": 0.004,
          "gate": 0.88,
          "release": 0.04,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 43,
            "beats": 0.25
          },
          {
            "note": 46,
            "beats": 0.25
          },
          {
            "note": 41,
            "beats": 0.25
          },
          {
            "note": 43,
            "beats": 0.25
          },
          {
            "note": 48,
            "beats": 0.5
          }
        ]
      },
      "valueTarget": {
        "id": "valueTarget",
        "bpm": 160,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.004,
          "gate": 0.88,
          "release": 0.04,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 53,
            "beats": 0.25
          },
          {
            "note": 55,
            "beats": 0.25
          },
          {
            "note": 58,
            "beats": 0.25
          },
          {
            "note": 58,
            "beats": 0.25
          },
          {
            "note": 58,
            "beats": 0.25
          }
        ]
      },
      "slot777": {
        "id": "slot777",
        "bpm": 160,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.002,
          "gate": 0.82,
          "release": 0.025,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 70,
            "beats": 0.25
          },
          {
            "note": 72,
            "beats": 0.25
          },
          {
            "note": 75,
            "beats": 0.25
          },
          {
            "note": 77,
            "beats": 0.25
          },
          {
            "note": 78,
            "beats": 0.25
          },
          {
            "note": 79,
            "beats": 0.25
          },
          {
            "note": 84,
            "beats": 0.5
          }
        ]
      },
      "slotBell": {
        "id": "slotBell",
        "bpm": 160,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.002,
          "gate": 0.82,
          "release": 0.025,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 70,
            "beats": 0.25
          },
          {
            "note": 72,
            "beats": 0.25
          },
          {
            "note": 75,
            "beats": 0.25
          },
          {
            "note": 77,
            "beats": 0.25
          },
          {
            "note": 84,
            "beats": 0.25
          }
        ]
      },
      "slotBar": {
        "id": "slotBar",
        "bpm": 160,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.002,
          "gate": 0.82,
          "release": 0.025,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 70,
            "beats": 0.25
          },
          {
            "note": 72,
            "beats": 0.25
          },
          {
            "note": 75,
            "beats": 0.25
          },
          {
            "note": 72,
            "beats": 0.25
          },
          {
            "note": 79,
            "beats": 0.25
          }
        ]
      },
      "slotFeature": {
        "id": "slotFeature",
        "bpm": 160,
        "instrument": {
          "wave": "wave32",
          "volume": 0.20,
          "attack": 0.002,
          "gate": 0.82,
          "release": 0.025,
          "filter": {
            "type": "none",
            "freq": 1200,
            "q": 1
          },
          "wave32": {
            "nibbles": "0147DEEECB975321000122468ADECCA8"
          }
        },
        "notes": [
          {
            "note": 58,
            "beats": 0.25
          },
          {
            "note": 55,
            "beats": 0.25
          },
          {
            "note": 60,
            "beats": 0.5
          }
        ]
      }
    }
  );

  const upperSaucerMelodyBases = {
    upperSlotBar: "slotBar",
    upperSlotBell: "slotBell",
    upperSlot777: "slot777"
  };

  for (const [id, baseId] of Object.entries(upperSaucerMelodyBases)) {
    const base = window.RCP_MELODY_DEFS[baseId];
    if (!base) continue;

    window.RCP_MELODY_DEFS[id] = {
      ...base,
      id,
      instrument: {
        ...base.instrument,
        layers: [
          { detune: -10, volume: 0.05 },
          { detune: 10, volume: 0.05 }
        ]
      },
      notes: base.notes.map(note => ({ ...note }))
    };
  }
})();
