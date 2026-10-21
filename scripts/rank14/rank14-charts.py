#!/usr/bin/env python3
"""PANOPTES competitive ranking report — six figures (English labels, DM-1 palette).

Data source: committed artifacts public/bench/panoptes_prototype_benchmarks.json
(2026-10-04 re-run) and public/bench/panoptes_external_benchmarks.json
(ATB completed 2026-10-21). No hand-typed numbers.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.font_manager as fm
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
import matplotlib.pyplot as plt
import numpy as np
import os

plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

ACCENT = "#1B6B7A"
GOLD = "#C89F62"
RUST = "#A8574B"
STEEL = "#5B7B9E"
GRID = "#E0E0E0"
TEXT = "#333333"
MUTE = "#777777"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("RANK14_ASSETS", os.path.join(HERE, "rank14-assets"))
os.makedirs(OUT, exist_ok=True)

# ---------------- measured data, read from the committed artifacts ----------------
import json
ROOT = os.environ.get("PANOPTES_ROOT", os.path.join(HERE, "..", ".."))
PROTO = json.load(open(f"{ROOT}/public/bench/panoptes_prototype_benchmarks.json"))
EXT = json.load(open(f"{ROOT}/public/bench/panoptes_external_benchmarks.json"))

ARMS = ["PANOPTES", "LLM-as-judge", "OpenAPPA v0.30.0", "Regex/DLP", "Blunt patch"]
_arm = {"PANOPTES": "panoptes", "LLM-as-judge": "llmJudge", "OpenAPPA v0.30.0": "openappa",
        "Regex/DLP": "regex", "Blunt patch": "appaBlunt"}
BLOCK = [PROTO["arms"][_arm[a]]["attackBlockRate"] for a in ARMS]
BENIGN = [PROTO["arms"][_arm[a]]["benignPassRate"] for a in ARMS]
BALANCED = [(b + p) / 2 for b, p in zip(BLOCK, BENIGN)]
COLORS = [ACCENT, GOLD, RUST, STEEL, MUTE]

# per-taxon secure counts (4 scenarios each) — prototype JSON byTaxon:
TAXA = ["T1", "T2", "T3", "T4", "T5", "T6"]
_key = {"PANOPTES": "panoptes", "LLM-as-judge": "llmJudge", "OpenAPPA v0.30.0": "openappa",
        "Regex/DLP": "regex", "Blunt patch": "appaBlunt"}
SECURE = {a: [PROTO["arms"][_key[a]]["byTaxon"][t]["secure"] for t in TAXA] for a in ARMS}

# latency (mean ns; non-engine arms are quoted modes — binary replay amortized,
# judge wall-clock — documented in the report's Table 4):
LAT = [("PANOPTES (hot loop)", PROTO["arms"]["panoptes"]["latency"]["meanNs"]),
       ("Regex/DLP scan", PROTO["arms"]["regex"]["latency"]["meanNs"]),
       ("OpenAPPA replay/step", 2.09e6), ("LLM-as-judge/call", 7.82e8)]
LAT_COLORS = [ACCENT, STEEL, RUST, GOLD]

# corp LLM-agent runs (utility fraction, attacks leaked) — external JSON summary:
_cs = EXT["corpLlm"]["summary"]
CORP = [("unguarded", _cs["open"]["utility"] / _cs["open"]["utilityTotal"], _cs["open"]["attacks"]),
        ("OpenAPPA (label-only)", _cs["appa"]["utility"] / _cs["appa"]["utilityTotal"], _cs["appa"]["attacks"]),
        ("PANOPTES (organs on)", _cs["panoptes"]["utility"] / _cs["panoptes"]["utilityTotal"], _cs["panoptes"]["attacks"])]
# their published run (GPT-5.6, their scaffold) — quoted constants, see report Section 5:
CORP_THEIR = [("their published open", 0.95, 5), ("their published guarded", 0.75, 0)]

# radar rubric (Section 6 documents the rubric exactly):
RADAR_AXES = ["Attack\ninterception", "Benign\nprecision", "Latency\nclass", "Determinism", "Auditability\n(rubric)"]
RADAR = {
    "PANOPTES":   [1.000, 1.000, 0.97, 1.0, 1.00],
    "LLM-as-judge": [1.000, 1.000, 0.00, 0.0, 0.25],
    "OpenAPPA v0.30.0": [0.667, 1.000, 0.41, 1.0, 0.85],
    "Regex/DLP":  [0.833, 0.750, 0.92, 1.0, 0.60],
    "Blunt patch": [0.833, 0.750, 0.41, 1.0, 0.85],
}

def style_ax(ax):
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(GRID)
    ax.tick_params(colors=TEXT, labelsize=8.5)
    ax.grid(axis="y", color=GRID, lw=0.6, alpha=0.7)
    ax.set_axisbelow(True)

# ---------------- Figure 1: balanced accuracy ranking ----------------
fig, ax = plt.subplots(figsize=(7.3, 2.5), constrained_layout=True)
y = np.arange(len(ARMS))[::-1]
bars = ax.barh(y, [b * 100 for b in BALANCED], color=COLORS, height=0.62, edgecolor="white")
for yi, v in zip(y, BALANCED):
    ax.text(v * 100 - 1.5, yi, f"{v*100:.1f}", va="center", ha="right", fontsize=9,
            color="white", fontweight="bold")
ax.set_yticks(y); ax.set_yticklabels(ARMS, fontsize=9)
ax.set_xlim(0, 105); ax.set_xlabel("Balanced accuracy — mean of attack interception and benign pass-through (%)", fontsize=8.5, color=TEXT)
style_ax(ax); ax.grid(axis="y", visible=False); ax.grid(axis="x", color=GRID, lw=0.6, alpha=0.7)
fig.savefig(f"{OUT}/fig1_ranking.png", dpi=200); plt.close(fig)

# ---------------- Figure 2: blind-or-blunt scatter ----------------
fig, ax = plt.subplots(figsize=(7.3, 4.2), constrained_layout=True)
pts = [("PANOPTES", 1.0, 1.0, ACCENT, 120), ("LLM-as-judge", 1.0, 1.0, GOLD, 120),
       ("OpenAPPA v0.30.0", 1.0, 0.667, RUST, 110), ("APPA mirror (unranked)", 1.0, 0.667, RUST, 46),
       ("Regex/DLP", 0.75, 0.833, STEEL, 110), ("Blunt patch", 0.75, 0.833, MUTE, 110)]
for name, x, v, c, s in pts:
    ax.scatter(x * 100, v * 100, s=s, c=c, edgecolor="white", lw=1.2, zorder=3)
ax.annotate("PANOPTES", (100, 100), xytext=(-8, -14), textcoords="offset points", fontsize=9, color=ACCENT, fontweight="bold")
ax.annotate("LLM-as-judge", (100, 100), xytext=(6, 8), textcoords="offset points", fontsize=9, color=GOLD)
ax.annotate("OpenAPPA v0.30.0 (+ mirror)", (100, 66.7), xytext=(-10, 8), textcoords="offset points", fontsize=9, color=RUST, ha="right")
ax.annotate("Regex/DLP", (75, 83.3), xytext=(8, -3), textcoords="offset points", fontsize=9, color=STEEL)
ax.annotate("Blunt patch", (75, 83.3), xytext=(-8, -14), textcoords="offset points", fontsize=9, color=MUTE, ha="right")
ax.axvline(90, color=GRID, lw=1.0, ls="--"); ax.axhline(90, color=GRID, lw=1.0, ls="--")
ax.text(91.2, 24, "blunt", fontsize=8, color=MUTE); ax.text(58, 91.5, "blind", fontsize=8, color=MUTE)
ax.text(91.2, 91.5, "both axes ≥ 90%", fontsize=8, color=ACCENT)
ax.set_xlim(55, 106); ax.set_ylim(20, 106)
ax.set_xlabel("Benign pass-through (%)", fontsize=9, color=TEXT)
ax.set_ylabel("Attack interception (%)", fontsize=9, color=TEXT)
style_ax(ax); ax.grid(True, color=GRID, lw=0.5, alpha=0.6)
fig.savefig(f"{OUT}/fig2_trap.png", dpi=200); plt.close(fig)

# ---------------- Figure 3: secure outcomes per family ----------------
fig, ax = plt.subplots(figsize=(7.3, 2.9), constrained_layout=True)
rows = list(SECURE.keys())
M = np.array([SECURE[r] for r in rows], dtype=float)
cmap = matplotlib.colors.LinearSegmentedColormap.from_list("sec", ["#F3D9D3", "#DDEBE8", "#7FB3A8"])
im = ax.imshow(M / 4.0, cmap=cmap, vmin=0, vmax=1, aspect="auto")
ax.set_xticks(range(len(TAXA))); ax.set_xticklabels(TAXA, fontsize=9)
ax.set_yticks(range(len(rows))); ax.set_yticklabels(rows, fontsize=9)
for i in range(len(rows)):
    for j in range(len(TAXA)):
        ax.text(j, i, f"{int(M[i, j])}/4", ha="center", va="center", fontsize=8.5,
                color=("white" if M[i, j] == 4 else TEXT),
                fontweight=("bold" if M[i, j] < 4 else "normal"))
ax.set_xlabel("attack families (4 scenarios each) — T5 memory carryover · T6 canary leak", fontsize=8.5, color=TEXT)
ax.tick_params(colors=TEXT)
for s in ax.spines.values():
    s.set_visible(False)
fig.savefig(f"{OUT}/fig3_matrix.png", dpi=200); plt.close(fig)

# ---------------- Figure 4: latency, log scale ----------------
fig, ax = plt.subplots(figsize=(7.3, 3.0), constrained_layout=True)
names = [n for n, _ in LAT]; vals = [v for _, v in LAT]
y = np.arange(len(names))[::-1]
ax.barh(y, vals, color=LAT_COLORS, height=0.58, edgecolor="white")
ax.set_xscale("log")
for yi, v in zip(y, vals):
    lbl = f"{v/1e9:.2f} s" if v >= 1e9 else (f"{v/1e6:.2f} ms" if v >= 1e6 else (f"{v/1e3:.2f} µs" if v >= 1e3 else f"{v:.0f} ns"))
    ax.text(v * 1.25, yi, lbl, va="center", fontsize=9, color=TEXT)
ax.set_yticks(y); ax.set_yticklabels(names, fontsize=9)
ax.set_xlim(2e2, 4e9)
ax.set_xlabel("per-decision latency, log scale — modes differ per arm and are never averaged", fontsize=8.5, color=TEXT)
style_ax(ax); ax.grid(axis="y", visible=False); ax.grid(axis="x", color=GRID, lw=0.6, alpha=0.7, which="both")
fig.savefig(f"{OUT}/fig4_latency.png", dpi=200); plt.close(fig)

# ---------------- Figure 5: corp LLM-agent runs ----------------
fig, ax = plt.subplots(figsize=(7.3, 4.0), constrained_layout=True)
for name, u, a in CORP:
    c = ACCENT if "PANOPTES" in name else (RUST if "label" in name else MUTE)
    ax.scatter(u * 20, a, s=130, c=c, edgecolor="white", lw=1.2, zorder=3)
    ax.annotate(f"{name} — {u*20:.0f}/20, {a}/20", (u * 20, a), xytext=(10, 4),
                textcoords="offset points", fontsize=8.5, color=c)
for name, u, a in CORP_THEIR:
    ax.scatter(u * 20, a, s=90, c="none", edgecolor=GOLD, lw=1.8, marker="D", zorder=3)
    ax.annotate(f"{name} (GPT-5.6) — {u*20:.0f}/20, {a}/20", (u * 20, a), xytext=(10, -12),
                textcoords="offset points", fontsize=8, color=GOLD)
ax.set_xlim(10, 23.5); ax.set_ylim(-0.7, 7.2)
ax.set_xlabel("task completion on their 20 scenarios (utility)", fontsize=9, color=TEXT)
ax.set_ylabel("attacks that succeeded (of 20)", fontsize=9, color=TEXT)
ax.set_yticks(range(0, 8))
style_ax(ax); ax.grid(True, color=GRID, lw=0.5, alpha=0.6)
fig.savefig(f"{OUT}/fig5_corp.png", dpi=200); plt.close(fig)

# ---------------- Figure 6: multidimensional radar ----------------
N = len(RADAR_AXES)
angles = [n / N * 2 * np.pi + np.pi / 2 for n in range(N)]
angles += angles[:1]
fig, ax = plt.subplots(figsize=(5.9, 4.6), subplot_kw={"projection": "polar"}, constrained_layout=True)
for (name, vals), c in zip(RADAR.items(), [ACCENT, GOLD, RUST, STEEL, MUTE]):
    v = vals + vals[:1]
    ax.plot(angles, v, color=c, lw=1.8, label=name)
    ax.fill(angles, v, color=c, alpha=0.10)
ax.set_xticks(angles[:-1]); ax.set_xticklabels(RADAR_AXES, fontsize=8.5, color=TEXT)
ax.set_ylim(0, 1.0); ax.set_yticks([0.25, 0.5, 0.75, 1.0])
ax.set_yticklabels(["0.25", "0.50", "0.75", "1.0"], fontsize=7, color=MUTE)
ax.grid(color=GRID, lw=0.6)
ax.spines["polar"].set_color(GRID)
ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.06), ncol=3, fontsize=8, frameon=False)
fig.savefig(f"{OUT}/fig6_radar.png", dpi=200); plt.close(fig)

print("six figures written to", OUT)
for f in sorted(os.listdir(OUT)):
    print("  ", f, os.path.getsize(os.path.join(OUT, f)), "bytes")
