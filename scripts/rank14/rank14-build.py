# -*- coding: utf-8 -*-
"""PANOPTES vs the Field — Competitive Ranking Report (14 pp target).

ReportLab build: typographic cover + TOC + 8 sections, 8 tables, 6 figures,
footer with page numbers, clean metadata (PANOPTES Project).
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, Image, PageBreak, KeepTogether)
from reportlab.platypus.tableofcontents import TableOfContents

from rank14_content import COVER, TOC_ENTRIES, SECTIONS

SCRIPTS = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("RANK14_OUT", os.path.join(SCRIPTS, "..", "..", "public", "bench", "PANOPTES_Competitive_Ranking_Report.pdf"))
ASSETS = os.environ.get("RANK14_ASSETS", os.path.join(SCRIPTS, "rank14-assets"))

ACCENT = colors.HexColor("#1B6B7A")
GOLD = colors.HexColor("#C89F62")
INK = colors.HexColor("#222222")
MUTE = colors.HexColor("#666666")
FAINT = colors.HexColor("#EEF3F2")
BORDER = colors.HexColor("#D5DEDC")

PAGE_W, PAGE_H = A4
ML = MR = 58
MT, MB = 64, 60
AVAIL_W = PAGE_W - ML - MR

# ---------------- fonts ----------------
FD = "/usr/share/fonts/truetype/freefont"
pdfmetrics.registerFont(TTFont("Tinos", f"{FD}/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("Tinos-Bold", f"{FD}/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("Tinos-Italic", f"{FD}/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("Carlito", f"{FD}/FreeSans.ttf"))
pdfmetrics.registerFont(TTFont("Carlito-Bold", f"{FD}/FreeSansBold.ttf"))

S = {
    "body": ParagraphStyle("body", fontName="Tinos", fontSize=10.7, leading=16.4, textColor=INK,
                           alignment=TA_LEFT, spaceAfter=10),
    "h2": ParagraphStyle("h2", fontName="Carlito-Bold", fontSize=14, leading=18, textColor=ACCENT,
                         spaceBefore=20, spaceAfter=10),
    "cap": ParagraphStyle("cap", fontName="Carlito", fontSize=8.7, leading=12, textColor=MUTE,
                          alignment=TA_CENTER, spaceBefore=6, spaceAfter=6),
    "th": ParagraphStyle("th", fontName="Carlito-Bold", fontSize=9.0, leading=11.5, textColor=colors.white),
    "td": ParagraphStyle("td", fontName="Carlito", fontSize=9.0, leading=11.8, textColor=INK),
    "tdl": ParagraphStyle("tdl", fontName="Carlito-Bold", fontSize=9.0, leading=11.8, textColor=INK),
    "stat": ParagraphStyle("stat", fontName="Tinos-Bold", fontSize=12.5, leading=17.5, textColor=ACCENT,
                           alignment=TA_CENTER, borderPadding=8),
    "toc": ParagraphStyle("toc", fontName="Tinos", fontSize=10.6, leading=26, textColor=INK),
    "cover_kicker": ParagraphStyle("cover_kicker", fontName="Carlito-Bold", fontSize=8.4, leading=11,
                                   textColor=ACCENT, alignment=TA_CENTER),
    "cover_title": ParagraphStyle("cover_title", fontName="Tinos-Bold", fontSize=34, leading=40,
                                  textColor=INK, alignment=TA_CENTER),
    "cover_sub": ParagraphStyle("cover_sub", fontName="Tinos", fontSize=11.2, leading=16.8,
                                textColor=colors.HexColor("#444444"), alignment=TA_CENTER),
    "cover_series": ParagraphStyle("cover_series", fontName="Carlito", fontSize=9, leading=13,
                                   textColor=MUTE, alignment=TA_CENTER),
    "cover_date": ParagraphStyle("cover_date", fontName="Carlito-Bold", fontSize=9, leading=13,
                                 textColor=GOLD, alignment=TA_CENTER),
}

# ---------------- doc template with TOC ----------------
class RankDoc(BaseDocTemplate):
    def __init__(self, fn, **kw):
        super().__init__(fn, **kw)
        self.toc_entries = []

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == "h2":
            txt = flowable.getPlainText()
            self.notify("TOCEntry", (0, txt, self.page - 2))

def on_page(canv, doc):
    n = doc.page
    if n == 1:
        return  # cover: no header/footer
    canv.saveState()
    canv.setFont("Carlito", 8)
    canv.setFillColor(MUTE)
    canv.drawString(ML, PAGE_H - 40, "PANOPTES vs the Field — Competitive Ranking Report")
    canv.setStrokeColor(BORDER); canv.setLineWidth(0.6)
    canv.line(ML, PAGE_H - 46, PAGE_W - MR, PAGE_H - 46)
    if n == 2:
        canv.drawCentredString(PAGE_W / 2, MB - 18, "i")
    else:
        canv.drawCentredString(PAGE_W / 2, MB - 18, str(n - 2))
        canv.drawString(ML, MB - 18, "")
    canv.drawRightString(PAGE_W - MR, MB - 18, "PANOPTES Research · prototype measurements, runs of 2026-10-02 · 2026-10-21")
    canv.restoreState()

doc = RankDoc(OUT, pagesize=A4, leftMargin=ML, rightMargin=MR, topMargin=MT, bottomMargin=MB,
              title="PANOPTES vs the Field — Competitive Ranking Report",
              author="PANOPTES Project", creator="PANOPTES Project", producer="PANOPTES Project",
              subject="Measured head-to-head ranking of the PANOPTES prototype against OpenAPPA v0.30.0, "
                      "a blunt-patch variant, a regex/DLP blocklist, and an LLM-as-judge")
frame = Frame(ML, MB, AVAIL_W, PAGE_H - MT - MB, id="main")
doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=on_page)])

# ---------------- flowables ----------------
story = []

# cover
story.append(Spacer(1, 26 * mm))
rule = Table([[""]], colWidths=[52 * mm], rowHeights=[2.2])
rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT)]))
rule.hAlign = "CENTER"
story.append(rule)
story.append(Spacer(1, 8 * mm))
story.append(Paragraph(COVER["banner"], S["cover_kicker"]))
story.append(Spacer(1, 6 * mm))
for line in COVER["title"].split("\n"):
    story.append(Paragraph(line, S["cover_title"]))
story.append(Spacer(1, 7 * mm))
story.append(Paragraph(COVER["subtitle"], S["cover_sub"]))
story.append(Spacer(1, 12 * mm))
story.append(Paragraph(COVER["series"], S["cover_series"]))
story.append(Spacer(1, 4 * mm))
story.append(Paragraph(COVER["date"], S["cover_date"]))
story.append(PageBreak())

# TOC
story.append(Paragraph("Table of Contents", ParagraphStyle(
    "h_toc", fontName="Carlito-Bold", fontSize=15, textColor=INK, spaceAfter=14)))
toc = TableOfContents()
toc.levelStyles = [ParagraphStyle("t0", fontName="Tinos", fontSize=10.6, leading=22, textColor=INK)]
story.append(toc)
story.append(PageBreak())

def build_table(spec):
    header, rows, ratios = spec["header"], spec["rows"], spec["ratios"]
    width = AVAIL_W * 0.995
    col_w = [r * width for r in ratios]
    assert sum(col_w) <= AVAIL_W + 0.5
    data = [[Paragraph("<b>%s</b>" % h, S["th"]) for h in header]]
    for row in rows:
        data.append([Paragraph(str(c), S["tdl"] if j == 0 else S["td"]) for j, c in enumerate(row)])
    t = Table(data, colWidths=col_w, hAlign="CENTER", repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FAINT]),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t

def stat_band(text):
    p = Paragraph(text, S["stat"])
    t = Table([[p]], colWidths=[AVAIL_W * 0.86])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FAINT),
        ("BOX", (0, 0), (-1, -1), 0.8, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    t.hAlign = "CENTER"
    return t

def stat4_band(items):
    cells = []
    for big, small in items:
        cells.append([
            Paragraph(f"<b>{big}</b>", ParagraphStyle("s4b", fontName="Tinos-Bold", fontSize=17,
                                                      leading=20, textColor=ACCENT, alignment=TA_CENTER)),
            Paragraph(small, ParagraphStyle("s4s", fontName="Carlito", fontSize=8.2, leading=10.5,
                                            textColor=MUTE, alignment=TA_CENTER)),
        ])
    data = [[c[0] for c in cells], [c[1] for c in cells]]
    t = Table(data, colWidths=[AVAIL_W * 0.995 / 4] * 4)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FAINT),
        ("BOX", (0, 0), (-1, -1), 0.8, ACCENT),
        ("LINEBEFORE", (1, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 10), ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
        ("TOPPADDING", (0, 1), (-1, 1), 2), ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    t.hAlign = "CENTER"
    return t

def add_figure(fname, max_w_in, caption):
    path = os.path.join(SCRIPTS, fname)
    from PIL import Image as PILImage
    with PILImage.open(path) as im:
        w, h = im.size
    max_w = min(max_w_in * inch if False else AVAIL_W, AVAIL_W)  # inches unused; cap at frame width
    from reportlab.lib.units import inch
    avail_h = 255
    scale = min(AVAIL_W / (w / 200.0), avail_h / (h / 200.0), 1.0)
    dw, dh = (w / 200.0) * scale, (h / 200.0) * scale
    img = Image(path, width=dw, height=dh)
    img.hAlign = "CENTER"
    return KeepTogether([img, Paragraph(caption, S["cap"])])

from reportlab.lib.units import inch  # noqa

# sections
for si, sec in enumerate(SECTIONS):
    for item in sec:
        kind = item[0]
        if kind == "body":
            story.append(Paragraph(item[1], S["body"]))
        elif kind == "h2":
            story.append(Paragraph(item[1], S["h2"]))
        elif kind == "caption":
            story.append(Paragraph(item[1], ParagraphStyle(
                "cap_pre", fontName="Carlito-Bold", fontSize=8.6, leading=11.5, textColor=INK,
                spaceBefore=8, spaceAfter=3)))
        elif kind == "table":
            story.append(build_table(item[1]))
            story.append(Spacer(1, 6))
        elif kind == "stat":
            story.append(Spacer(1, 4))
            story.append(stat_band(item[1]))
            story.append(Spacer(1, 10))
        elif kind == "stat4":
            story.append(Spacer(1, 4))
            story.append(stat4_band(item[1]))
            story.append(Spacer(1, 10))
        elif kind == "figure":
            story.append(add_figure(item[1], item[2], item[3]))
            story.append(Spacer(1, 4))

doc.multiBuild(story)
print("built:", OUT)
from pypdf import PdfReader
r = PdfReader(OUT)
import os
print("pages:", len(r.pages), "| size:", os.path.getsize(OUT), "bytes")
print("meta:", dict(r.metadata))
