"""Per-picture metadata of the comics recipes (issue #573): alt text, safe
area, speaker anchors (mouth, head, face) and avoid zones, read off the
labelled 10 % grids (`postprocess.py grid`) and checked with
`postprocess.py check`. Writes ART_DIR/<slug>/manifest.json.

    python3 anchors.py ART_DIR
"""
import json, os, sys
from PIL import Image
ART = sys.argv[1] if len(sys.argv) > 1 else sys.exit("usage: anchors.py ART_DIR")

def R(x0, y0, x1, y1):
    return {"x": round(x0, 3), "y": round(y0, 3), "width": round(x1 - x0, 3), "height": round(y1 - y0, 3)}

def A(id, mouth, head=None, face=None):
    a = {"id": id, "x": mouth[0], "y": mouth[1]}
    if head: a["head"] = {"x": head[0], "y": head[1]}
    if face: a["face"] = R(*face)
    return a

def P(id, alt, safe, anchors=(), avoid=(), **extra):
    return dict(id=id, alt=alt, safe=R(*safe), anchors=list(anchors), avoid=[R(*r) for r in avoid], **extra)

M = {}
M["comic-page-splitters"] = [
 P("lh-arrive", "A girl in a yellow raincoat walks up a coastal path towards a red-and-white lighthouse, a fat orange cat trotting ahead; storm clouds gather over the sea.",
   (0.20, 0.08, 0.62, 0.90), [A("maya", (0.29, 0.52), (0.27, 0.47), (0.22, 0.42, 0.34, 0.58)), A("biscuit", (0.40, 0.68), (0.40, 0.66), (0.37, 0.64, 0.44, 0.72))],
   [(0.51, 0.09, 0.61, 0.52)]),
 P("lh-radio", "The old keeper, white-bearded in a navy sweater and cap, taps a valve radio in the lamp room, microphone in hand; the great lens glows beside him.",
   (0.0, 0.36, 0.62, 0.92), [A("tomas", (0.345, 0.52), (0.38, 0.44), (0.29, 0.40, 0.45, 0.58))], [(0.0, 0.44, 0.22, 0.70)]),
 P("lh-maya", "Close-up of Maya frowning at the floor and pointing down.",
   (0.20, 0.20, 0.80, 0.95), [A("maya", (0.54, 0.565), (0.50, 0.30), (0.40, 0.33, 0.64, 0.62))], [(0.27, 0.73, 0.52, 0.95)]),
 P("lh-biscuit", "Under the desk, the fat orange cat sleeps on his back on top of the black radio cable, squashing it flat.",
   (0.30, 0.26, 0.98, 0.85), [A("biscuit", (0.72, 0.355), (0.73, 0.32), (0.64, 0.27, 0.84, 0.45))], [(0.93, 0.28, 1.0, 0.52), (0.0, 0.72, 0.40, 0.82)]),
 P("lh-beam", "Night: the lighthouse beam sweeps over a dark sea; Maya and her grandfather stand on the lantern gallery, and far out a fishing boat shows its lights.",
   (0.14, 0.02, 0.87, 0.66), [A("maya", (0.235, 0.15), None, (0.21, 0.11, 0.26, 0.18)), A("tomas", (0.30, 0.145), None, (0.28, 0.11, 0.32, 0.17))],
   [(0.79, 0.55, 0.87, 0.64)]),
]
M["balloon-kinds"] = [
 P("bk-storm", "Storm at night in the lamp room: the keeper speaks into the radio microphone while Maya, wrapped in a blanket, listens wide-eyed.",
   (0.0, 0.25, 0.64, 0.98), [A("tomas", (0.30, 0.44), (0.32, 0.33), (0.26, 0.29, 0.39, 0.50)), A("maya", (0.475, 0.47), (0.48, 0.38), (0.43, 0.35, 0.52, 0.51)), A("skipper", (0.08, 0.52))],
   [(0.0, 0.38, 0.18, 0.66)]),
 P("bk-whisper", "Under the desk, Maya whispers behind her hand to the frightened orange cat.",
   (0.10, 0.18, 0.95, 0.82), [A("maya", (0.53, 0.47), (0.52, 0.33), (0.41, 0.30, 0.60, 0.52)), A("biscuit", (0.625, 0.635), (0.66, 0.57), (0.55, 0.50, 0.80, 0.72))]),
 P("bk-shout", "Close-up of the keeper shouting into the microphone, lit from below by the radio dials.",
   (0.20, 0.17, 0.75, 0.75), [A("tomas", (0.48, 0.47), (0.42, 0.33), (0.25, 0.28, 0.62, 0.60))], [(0.53, 0.43, 0.70, 0.70)]),
 P("bk-sea", "A small blue trawler heaves on storm waves at night; lightning on the left, the lighthouse beam on the right.",
   (0.10, 0.15, 0.95, 0.75), [A("skipper", (0.28, 0.63)), A("sfx", (0.16, 0.36))], [(0.13, 0.52, 0.37, 0.75), (0.85, 0.19, 0.93, 0.45)]),
 P("bk-window", "Maya presses her hands and nose to the rainy window, staring out at the storm.",
   (0.10, 0.18, 0.95, 0.95), [A("maya", (0.49, 0.41), (0.42, 0.30), (0.41, 0.33, 0.51, 0.46))], [(0.50, 0.33, 0.60, 0.50), (0.83, 0.45, 0.89, 0.53)]),
 P("bk-morning", "Next morning on the sunny rocks, Maya, the keeper and the cat wave happily; the lighthouse stands behind them.",
   (0.14, 0.03, 0.78, 0.83), [A("tomas", (0.565, 0.25), (0.56, 0.15), (0.51, 0.13, 0.61, 0.30)), A("maya", (0.465, 0.29), (0.45, 0.24), (0.41, 0.19, 0.50, 0.33)), A("biscuit", (0.685, 0.58), (0.69, 0.55), (0.64, 0.51, 0.73, 0.62))],
   [(0.66, 0.08, 0.74, 0.20), (0.34, 0.14, 0.40, 0.22)]),
]
M["splash-inset-broken-border"] = [
 P("sp-splash", "Splash: the red-and-white lighthouse in a night storm, waves exploding on the rocks, its beam cutting through the rain, lightning behind.",
   (0.10, 0.12, 0.90, 0.75), [A("sfx", (0.82, 0.40))], [(0.28, 0.15, 0.45, 0.50)]),
 P("sp-maya-face", "Maya's face behind a rain-streaked window, hood up, lit by the lamp.",
   (0.20, 0.15, 0.80, 0.75), [A("maya", (0.52, 0.48), (0.50, 0.25), (0.37, 0.27, 0.66, 0.58))]),
 P("sp-wave", "A huge wave bursts over black rocks below the lighthouse at night.",
   (0.35, 0.0, 0.95, 0.90), [A("sfx", (0.60, 0.35))], [(0.82, 0.02, 0.88, 0.32)]),
 P("sp-tomas", "The keeper in an oilskin on the lantern gallery holds up a storm lantern, beard whipping in the wind.",
   (0.30, 0.10, 0.98, 0.80), [A("tomas", (0.63, 0.345), (0.67, 0.24), (0.56, 0.17, 0.80, 0.42))], [(0.32, 0.13, 0.47, 0.46)],
   pop={"file": "sp-tomas-pop.png", "alt": "A herring gull flies across the panel's left border.", "box": R(0.0, 0.44, 0.34, 0.78)}),
 P("sp-gull", "A herring gull in flight, wings spread (transparent cut-out).", (0.0, 0.0, 1.0, 1.0), [], [], cutout=True),
]
M["manga-right-to-left"] = [
 P("k1", "A school's old wooden kendo dojo at dusk, its doors open and lit, an empty schoolyard in front.",
   (0.30, 0.25, 1.0, 0.85), [A("dojo", (0.66, 0.63))]),
 P("k2", "Hana, alone in the dojo, swings her bamboo sword overhead, ponytail flying.",
   (0.30, 0.0, 0.90, 0.95), [A("hana", (0.535, 0.28), (0.53, 0.22), (0.49, 0.14, 0.60, 0.31))], [(0.43, 0.0, 0.60, 0.12)]),
 P("k3", "Sora peeks around the sliding door, worried, clutching a shrine charm.",
   (0.40, 0.07, 0.75, 0.60), [A("sora", (0.545, 0.31), (0.55, 0.22), (0.47, 0.16, 0.67, 0.34))], [(0.49, 0.41, 0.57, 0.51)]),
 P("k4", "Extreme close-up of Hana's sweating, determined face.",
   (0.22, 0.14, 0.74, 0.84), [A("hana", (0.475, 0.665), (0.45, 0.35), (0.25, 0.20, 0.72, 0.78))]),
 P("k5", "Sora holds out the shrine charm to Hana, who looks at it in surprise, sword on her shoulder.",
   (0.10, 0.08, 0.95, 0.90), [A("sora", (0.325, 0.335), (0.29, 0.22), (0.26, 0.17, 0.37, 0.37)), A("hana", (0.675, 0.335), (0.665, 0.22), (0.62, 0.17, 0.73, 0.37))],
   [(0.43, 0.47, 0.49, 0.56)]),
 P("k6", "Coach Mori stands in the doorway, backlit, arms crossed.",
   (0.20, 0.12, 0.75, 0.90), [A("mori", (0.425, 0.215), (0.42, 0.17), (0.37, 0.13, 0.47, 0.24))]),
 P("k7", "Close-up of Coach Mori's stern face breaking into a small smile.",
   (0.35, 0.05, 1.0, 0.75), [A("mori", (0.69, 0.52), (0.60, 0.25), (0.40, 0.20, 0.95, 0.62))]),
 P("k8", "Kneeling in the dojo, Hana ties the charm to her uniform while Sora scratches his head, relieved.",
   (0.10, 0.02, 0.90, 0.92), [A("hana", (0.305, 0.245), (0.30, 0.17), (0.25, 0.10, 0.36, 0.27)), A("sora", (0.70, 0.25), (0.71, 0.15), (0.64, 0.10, 0.77, 0.28))],
   [(0.27, 0.43, 0.33, 0.55)]),
 P("k9", "Seen from behind at sunset, Hana and Sora sit on the school roof looking over the town.",
   (0.15, 0.35, 0.80, 0.92), [A("hana", (0.36, 0.52), (0.36, 0.48), (0.31, 0.43, 0.42, 0.57)), A("sora", (0.63, 0.52), (0.625, 0.47), (0.58, 0.41, 0.68, 0.56))]),
]
M["manga-action-slants"] = [
 P("a1", "Kendo final in a packed gym: two armoured fighters cross swords between three referees.",
   (0.20, 0.42, 0.80, 0.90), [A("hana", (0.31, 0.51), (0.31, 0.49), (0.28, 0.45, 0.35, 0.55)), A("rival", (0.68, 0.51), (0.68, 0.49), (0.65, 0.46, 0.71, 0.55)), A("shinpan", (0.575, 0.585), (0.575, 0.56), (0.56, 0.54, 0.59, 0.60))]),
 P("a2", "Hana's eyes through the bars of her helmet grille.",
   (0.10, 0.10, 0.90, 0.80), [A("hana", (0.50, 0.75), (0.50, 0.40), (0.15, 0.15, 0.85, 0.65))]),
 P("a3", "The opponent lunges at the viewer with a thrust, speed lines all round.",
   (0.05, 0.0, 0.95, 0.75), [A("rival", (0.70, 0.20), (0.70, 0.14), (0.63, 0.02, 0.78, 0.26))], [(0.02, 0.42, 0.25, 0.60)]),
 P("a4", "Hana leaps and strikes the top of the opponent's helmet; the bamboo sword bends on impact.",
   (0.10, 0.05, 0.90, 0.90), [A("hana", (0.43, 0.25), (0.43, 0.18), (0.38, 0.07, 0.48, 0.32)), A("sfx", (0.75, 0.25))], [(0.52, 0.48, 0.65, 0.64)]),
 P("a5", "Sora jumps up in the stands, fists raised, shouting with joy.",
   (0.08, 0.05, 0.95, 0.85), [A("sora", (0.51, 0.44), (0.50, 0.37), (0.40, 0.30, 0.62, 0.50))], [(0.08, 0.06, 0.20, 0.16), (0.64, 0.35, 0.74, 0.47)]),
 P("a6", "Coach Mori sits with arms crossed and eyes closed, nodding; behind him the referees raise their flags.",
   (0.02, 0.05, 0.90, 0.90), [A("mori", (0.29, 0.31), (0.29, 0.20), (0.22, 0.10, 0.36, 0.34))], [(0.55, 0.18, 0.95, 0.35)]),
]
CATS = lambda w, b, c: [A("shiro", *w), A("kuro", *b), A("mike", *c)]
M["yonkoma"] = [
 P("n1", "Mugi unlocks the cat cafe's glass door; the white, black and calico cats wait inside in a row.",
   (0.03, 0.08, 0.93, 0.88), [A("mugi", (0.205, 0.385), (0.17, 0.25), (0.10, 0.20, 0.30, 0.43))] + CATS(((0.50, 0.66), None, (0.44, 0.55, 0.57, 0.70)), ((0.66, 0.62), None, (0.61, 0.52, 0.73, 0.66)), ((0.83, 0.645), None, (0.77, 0.53, 0.89, 0.69)))),
 P("n2", "Mugi sets out three full food bowls in front of the three cats.",
   (0.03, 0.10, 0.97, 0.92), [A("mugi", (0.27, 0.465), (0.25, 0.30), (0.17, 0.26, 0.33, 0.50))] + CATS(((0.37, 0.63), None, (0.31, 0.52, 0.44, 0.68)), ((0.60, 0.64), None, (0.55, 0.52, 0.66, 0.68)), ((0.82, 0.62), None, (0.76, 0.52, 0.88, 0.66)))),
 P("n3", "All three cats push their heads into the same bowl while the other two bowls sit full.",
   (0.05, 0.15, 0.98, 0.92), CATS(((0.33, 0.66), (0.33, 0.62), None), ((0.50, 0.60), (0.50, 0.55), None), ((0.66, 0.68), (0.65, 0.64), None)) + [A("sfx", (0.50, 0.30))]),
 P("n4", "Mugi bites her toast while the three cats on the table stare at it with sparkling eyes.",
   (0.02, 0.15, 0.98, 0.95), [A("mugi", (0.80, 0.50), (0.85, 0.32), (0.75, 0.25, 0.95, 0.58))] + CATS(((0.17, 0.71), None, (0.10, 0.60, 0.24, 0.76)), ((0.32, 0.73), None, (0.26, 0.62, 0.38, 0.76)), ((0.46, 0.66), None, (0.40, 0.56, 0.52, 0.70))),
   [(0.60, 0.52, 0.75, 0.62)]),
 P("n5", "A tired office worker reaches out hopefully as he walks in; Mugi greets him from the counter.",
   (0.10, 0.10, 0.95, 0.95), [A("kyaku", (0.31, 0.42), (0.28, 0.30), (0.19, 0.22, 0.40, 0.48)), A("mugi", (0.76, 0.39), (0.76, 0.28), (0.68, 0.20, 0.86, 0.45))]),
 P("n6", "The three cats asleep in one pile on a round cushion.",
   (0.02, 0.15, 0.95, 0.92), CATS(((0.40, 0.42), (0.38, 0.39), None), ((0.41, 0.70), (0.41, 0.67), None), ((0.72, 0.58), (0.72, 0.55), None)) + [A("sfx", (0.30, 0.25))]),
 P("n7", "The office worker sighs at a cafe table with a coffee and opens his laptop.",
   (0.10, 0.15, 0.80, 0.90), [A("kyaku", (0.45, 0.62), (0.39, 0.40), (0.30, 0.30, 0.52, 0.68))]),
 P("n8", "The three cats sit on the laptop keyboard; the office worker cries tears of joy, hands in the air.",
   (0.05, 0.05, 0.98, 0.95), [A("kyaku", (0.29, 0.42), (0.25, 0.20), (0.15, 0.10, 0.42, 0.50))] + CATS(((0.42, 0.57), None, (0.36, 0.48, 0.49, 0.62)), ((0.59, 0.60), None, (0.53, 0.50, 0.65, 0.64)), ((0.74, 0.62), None, (0.68, 0.52, 0.80, 0.66)))),
]
M["tebeo-album-page"] = [
 P("t1", "A sunny Sunday in Madrid: an iron-and-glass market hall on a plaza with shoppers and pigeons.",
   (0.20, 0.25, 0.92, 0.92), []),
 P("t2", "Inside the market, Lola pulls her grandfather Paco by the hand, pointing ahead between the stalls.",
   (0.10, 0.10, 0.95, 0.95), [A("paco", (0.315, 0.28), (0.32, 0.20), (0.22, 0.13, 0.39, 0.32)), A("lola", (0.70, 0.415), (0.66, 0.33), (0.60, 0.30, 0.77, 0.47))], [(0.82, 0.40, 0.92, 0.46)]),
 P("t3", "Lola gazes up at a towering pyramid of oranges while Carmen, the fruit seller, polishes an orange.",
   (0.05, 0.10, 0.95, 0.95), [A("lola", (0.235, 0.43), (0.19, 0.36), (0.14, 0.30, 0.27, 0.48)), A("carmen", (0.795, 0.27), (0.80, 0.19), (0.74, 0.12, 0.87, 0.31))], [(0.40, 0.20, 0.60, 0.35)]),
 P("t4", "Lola reaches for an orange at the bottom of the pile; Paco, alarmed, raises a hand to stop her.",
   (0.05, 0.05, 0.98, 0.95), [A("paco", (0.31, 0.30), (0.28, 0.17), (0.17, 0.10, 0.37, 0.36)), A("lola", (0.635, 0.485), (0.61, 0.38), (0.48, 0.28, 0.75, 0.55))], [(0.70, 0.78, 0.85, 0.88), (0.10, 0.36, 0.25, 0.55)]),
 P("t5", "The orange pyramid collapses: oranges roll everywhere, Paco's beret flies off, Carmen throws up her hands, pigeons scatter.",
   (0.02, 0.08, 0.98, 0.95), [A("lola", (0.15, 0.44), (0.14, 0.37), (0.08, 0.32, 0.20, 0.47)), A("paco", (0.34, 0.31), (0.33, 0.27), (0.27, 0.22, 0.39, 0.36)), A("carmen", (0.81, 0.37), (0.80, 0.30), (0.74, 0.22, 0.87, 0.40)), A("sfx", (0.55, 0.45))],
   [(0.24, 0.12, 0.33, 0.22)]),
 P("t6", "Lola, Paco and Carmen kneel to gather the oranges into the beret and the apron, laughing; a pigeon pecks one.",
   (0.05, 0.08, 0.95, 0.95), [A("lola", (0.245, 0.42), (0.24, 0.33), (0.17, 0.27, 0.31, 0.47)), A("paco", (0.49, 0.30), (0.48, 0.22), (0.42, 0.14, 0.56, 0.34)), A("carmen", (0.73, 0.28), (0.73, 0.20), (0.67, 0.12, 0.80, 0.31))],
   [(0.74, 0.75, 0.88, 0.95)]),
 P("t7", "On a park bench, Lola and Paco peel oranges and laugh; a pigeon sits on Paco's beret.",
   (0.15, 0.0, 0.90, 0.95), [A("lola", (0.32, 0.45), (0.31, 0.35), (0.24, 0.30, 0.39, 0.52)), A("paco", (0.60, 0.38), (0.65, 0.25), (0.54, 0.20, 0.73, 0.44))], [(0.60, 0.01, 0.73, 0.16)]),
]
M["comic-double-spread"] = [
 P("ds1", "Panorama of the crowded market hall: tiny Lola stands lost on the far left; far right, her grandfather searches the crowd.",
   (0.02, 0.05, 0.98, 0.95), [A("lola", (0.065, 0.58), (0.063, 0.55), (0.045, 0.51, 0.085, 0.62)), A("paco", (0.925, 0.38), (0.925, 0.34), (0.90, 0.30, 0.95, 0.42))]),
 P("ds2", "Lola, tearful, stands among grown-ups' legs and shopping bags.",
   (0.25, 0.05, 0.75, 0.97), [A("lola", (0.505, 0.24), (0.48, 0.17), (0.40, 0.10, 0.58, 0.29))]),
 P("ds3", "Paco stands on a fruit crate and whistles through his fingers; shoppers turn to look.",
   (0.15, 0.05, 0.85, 0.97), [A("paco", (0.50, 0.20), (0.47, 0.14), (0.38, 0.08, 0.55, 0.24)), A("sfx", (0.62, 0.17))]),
 P("ds4", "Lola leaps into her grandfather's arms; his beret flies off and the stallholders smile.",
   (0.20, 0.05, 0.82, 0.95), [A("lola", (0.51, 0.27), (0.47, 0.20), (0.42, 0.14, 0.55, 0.33)), A("paco", (0.595, 0.31), (0.62, 0.22), (0.55, 0.14, 0.70, 0.36))], [(0.67, 0.06, 0.80, 0.28)]),
]
M["newspaper-daily-strip"] = [
 P("po1", "Pip the penguin waddles into Otto the walrus's tiny bakery, waving.",
   (0.02, 0.10, 0.95, 0.95), [A("pip", (0.27, 0.58), (0.20, 0.50), (0.11, 0.44, 0.33, 0.64)), A("otto", (0.67, 0.37), (0.70, 0.28), (0.56, 0.23, 0.80, 0.45))]),
 P("po2", "Otto proudly holds up a croissant as big as Pip.",
   (0.05, 0.0, 0.95, 0.95), [A("pip", (0.23, 0.62), (0.17, 0.56), (0.07, 0.50, 0.29, 0.68)), A("otto", (0.75, 0.31), (0.74, 0.20), (0.52, 0.14, 0.85, 0.36))], [(0.28, 0.17, 0.66, 0.56)]),
 P("po3", "Pip stands on the counter next to the giant croissant, scratching his head.",
   (0.02, 0.17, 0.98, 0.85), [A("pip", (0.275, 0.36), (0.20, 0.27), (0.10, 0.19, 0.35, 0.40))], [(0.34, 0.41, 0.98, 0.82)]),
 P("po4", "Otto munches the big half of the croissant; Pip holds a tiny end piece, deadpan.",
   (0.02, 0.02, 0.98, 0.95), [A("pip", (0.23, 0.61), (0.17, 0.53), (0.07, 0.48, 0.29, 0.66)), A("otto", (0.69, 0.36), (0.78, 0.25), (0.53, 0.19, 0.92, 0.42))], [(0.31, 0.63, 0.36, 0.71), (0.39, 0.32, 0.68, 0.50)]),
 P("po5", "Pip and Otto fish through a hole in an ice floe beside a tiny bakery hut.",
   (0.10, 0.05, 0.80, 0.95), [A("pip", (0.345, 0.53), (0.33, 0.48), (0.29, 0.40, 0.38, 0.58)), A("otto", (0.625, 0.33), (0.64, 0.22), (0.58, 0.17, 0.70, 0.40))]),
 P("po6", "Pip proudly holds up a tiny, unimpressed fish.",
   (0.05, 0.15, 0.95, 0.92), [A("pip", (0.46, 0.39), (0.40, 0.33), (0.35, 0.25, 0.55, 0.43)), A("fish", (0.66, 0.46), None, (0.64, 0.41, 0.71, 0.53))]),
 P("po7", "Otto reels in a soggy boot; Pip has fallen on his back laughing.",
   (0.02, 0.05, 0.98, 0.95), [A("pip", (0.195, 0.64), (0.17, 0.60), (0.10, 0.56, 0.25, 0.70)), A("otto", (0.795, 0.35), (0.80, 0.25), (0.70, 0.18, 0.88, 0.40)), A("sfx", (0.62, 0.70))], [(0.44, 0.30, 0.59, 0.62)]),
]
for slug, items in M.items():
    out = []
    for p in items:
        f = next(x for x in (p["id"] + ".jpg", p["id"] + ".png") if os.path.exists(os.path.join(ART, slug, x)))
        w, h = Image.open(os.path.join(ART, slug, f)).size
        e = {"id": p["id"], "file": f, "width": w, "height": h, "alt": p["alt"], "safeArea": p["safe"], "anchors": p["anchors"], "avoid": p["avoid"]}
        for k in ("pop", "cutout"):
            if k in p: e[k] = p[k]
        if "pop" in e:
            pw, ph = Image.open(os.path.join(ART, slug, e["pop"]["file"])).size
            e["pop"].update(width=pw, height=ph)
        out.append(e)
    json.dump(out, open(os.path.join(ART, slug, "manifest.json"), "w"), indent=1, ensure_ascii=False)
    print(slug, len(out))
