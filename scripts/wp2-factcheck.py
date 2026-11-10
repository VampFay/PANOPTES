# -*- coding: utf-8 -*-
"""Fact re-audit: verify every load-bearing number in the white paper against evidence JSONs.

Edition 2 (Final Audited Edition): workspace evidence paths, per-episode ATB
failure-set checks, SOLUTIONS.md-derived claims, and vendor-neutrality negative
checks (no z-ai / GLM / Z.ai anywhere in the document).
"""
import json, re, sys

# Portable edition: every path resolves relative to this script's package root:
#   05-audit-materials/wp2-factcheck.py
#     -> 01-papers/  02-architecture/  03-source-code/  04-evidence/
from pathlib import Path
PKG = Path(__file__).resolve().parent.parent

if (PKG / 'panoptes' / 'src' / 'core' / 'screen.ts').exists():
    PAPERS = PKG / 'public' / 'paper'
    ARCH = PKG
    ARCH_SOL = PKG / 'SOLUTIONS.md'
    SRCROOT = PKG / 'panoptes'
    EVID = PKG / 'public' / 'bench'
else:
    PAPERS = PKG / '01-papers'
    ARCH = PKG / '02-architecture'
    ARCH_SOL = PKG / '02-architecture' / 'PANOPTES_Solutions_Architecture.md'
    SRCROOT = PKG / '03-source-code' / 'panoptes-core-1.2.1'
    EVID = PKG / '04-evidence'

pdf_path = PAPERS / 'PANOPTES_Technical_White_Paper.pdf'
try:
    import fitz  # pymupdf
    doc = fitz.open(str(pdf_path))
    text = '\n'.join(p.get_text() for p in doc)
except ImportError:
    try:
        import pypdf
        reader = pypdf.PdfReader(str(pdf_path))
        text = '\n'.join(p.extract_text() or '' for p in reader.pages)
    except ImportError:
        text = ''
        print('Warning: neither fitz (pymupdf) nor pypdf installed, skipping PDF text-based checks')

proto = json.load(open(EVID / 'panoptes_prototype_benchmarks.json'))
ext = json.load(open(EVID / 'panoptes_external_benchmarks.json'))
rt = json.load(open(EVID / 'panoptes_redteam_scale.json'))
stress = json.load(open(EVID / 'panoptes_extreme_stress_campaign.json'))
atb_path = EVID / 'results-atb.json'
if not atb_path.exists() and (PKG / 'scripts' / 'results-atb.json').exists():
    atb_path = PKG / 'scripts' / 'results-atb.json'
atb_eps = json.load(open(atb_path))['episodes']

checks = []
def ck(claim, ok):
    checks.append((claim, ok))

# ---- corpus arms
ck('proto panoptes 24/24+16/16', proto['arms']['panoptes']['attackBlockRate'] == 1.0 and proto['arms']['panoptes']['benignPassRate'] == 1.0)
ck('proto openappa 16/24 (0.667)', abs(proto['arms']['openappa']['attackBlockRate'] - 16/24) < 0.01)
ck('proto appaBaseline 16/24', abs(proto['arms']['appaBaseline']['attackBlockRate'] - 16/24) < 0.01)
ck('proto blunt 20/24 + 12/16', abs(proto['arms']['appaBlunt']['attackBlockRate'] - 20/24) < 0.01 and abs(proto['arms']['appaBlunt']['benignPassRate'] - 0.75) < 0.01)
ck('proto regex 20/24 + 12/16', abs(proto['arms']['regex']['attackBlockRate'] - 20/24) < 0.01 and abs(proto['arms']['regex']['benignPassRate'] - 0.75) < 0.01)
ck('proto llm 24/24 + 16/16', proto['arms']['llmJudge']['attackBlockRate'] == 1.0 and proto['arms']['llmJudge']['benignPassRate'] == 1.0)

# ---- latency
ck('panoptes mean 623.6ns -> 0.62us', abs(proto['arms']['panoptes']['latency']['meanNs'] - 623.56) < 1)
ck('appaBaseline 429.7ns -> 0.43us', abs(proto['arms']['appaBaseline']['latency']['meanNs'] - 429.65) < 1)
ck('regex 1272.4ns -> 1.27us', abs(proto['arms']['regex']['latency']['meanNs'] - 1272.41) < 1)
ck('openappa 2077.6us/step -> 2.08ms', abs(proto['arms']['openappa']['latency']['perStepUs'] - 2077.57) < 1)
ck('llm judge 781.9ms', abs(proto['arms']['llmJudge']['latency']['meanMs'] - 781.93) < 1)

# ---- stress
sl = stress['sustainedLoad']
ck('soak 20M decisions', sl['decisions'] == 20000000)
ck('soak 615,270 dec/s', sl['decisionsPerSecond'] == 615270)
ck('soak mean 1.63us', sl['meanUsPerDecision'] == 1.63)
ck('soak p99 3.44us', sl['p99Us'] == 3.44)
ck('soak p99.9 5.88us', sl['p999Us'] == 5.88)
ck('soak max 129us', sl['maxUs'] == 129)
ck('churn 100K sessions 0 mismatches', stress['sessionChurn']['sessions'] == 100000 and stress['sessionChurn']['mismatches'] == 0)

# ---- redteam
ck('rt label-gated 0/1M', rt['labelGated']['evaded'] == 0 and rt['labelGated']['trials'] == 1000000)
ck('rt content literal 0/1M', rt['contentOnly']['literalEvaded'] == 0 and rt['contentOnly']['trials'] == 1000000)
ck('rt transform 49.95%', abs(rt['contentOnly']['transformEvasionRate'] - 0.49946) < 0.001)
ck('rt screen 76.87%', abs(rt['screen']['evaded'] / rt['screen']['trials'] - 0.768712) < 0.001)
ck('rt benign 0/500K', rt['benign']['falsePositives'] == 0 and rt['benign']['trials'] == 500000)

# ---- external
corp = ext['corpLlm']['summary']
ck('corp open 19/20 + 6/20', corp['open']['utility'] == 19 and corp['open']['attacks'] == 6)
ck('corp appa 14/20 + 2/20', corp['appa']['utility'] == 14 and corp['appa']['attacks'] == 2)
ck('corp panoptes 13/20 + 0/20', corp['panoptes']['utility'] == 13 and corp['panoptes']['attacks'] == 0)
replay = ext['corpPolicyReplay']['summary']
ck('replay open 0/20 blocked', replay['open'].get('attacksBlocked', replay['open'].get('blocked', 0)) == 0)
tau = ext['taubench']['panoptes']
ck('tau 0/853 golden', tau['goldenBlocked'] == 0 and tau['goldenTotal'] == 853)
ck('tau 64/64 chaos', tau['chaosBlocked'] == 64 and tau['chaosTotal'] == 64)
ck('tau binary agreement', ext['taubench']['openappaBinary']['goldenBlocked'] == 0 and ext['taubench']['openappaBinary']['chaosBlocked'] == 64)
atb = ext['agentThreatBench']['summary']['overall']
ck('atb stock 0.92/0.77 n=26', abs(atb['stock']['utility'] - 0.923) < 0.001 and abs(atb['stock']['security'] - 0.769) < 0.001 and atb['stock']['n'] == 26)
ck('atb appa 0.81/0.81 n=26', abs(atb['appa']['utility'] - 0.808) < 0.001 and abs(atb['appa']['security'] - 0.808) < 0.001)
ck('atb panoptes 0.79/0.79 n=24', abs(atb['panoptes']['utility'] - 0.792) < 0.001 and abs(atb['panoptes']['security'] - 0.792) < 0.001)
g = ext['agentThreatBench']['summary']['groups']
ck('atb mp 6/10 all arms', g['stock']['memory_poison']['security'] == 6 and g['appa']['memory_poison']['security'] == 6 and g['panoptes']['memory_poison']['security'] == 6)
ck('atb episodes 76', ext['agentThreatBench']['episodes'] == 76)

# ---- ATB per-episode failure sets (paper claims the exact split)
def mp_fail(arm):
    return sorted(e['sample'] for e in atb_eps
                  if e['arm'] == arm and e['task_type'] == 'memory_poison' and e['security'] is False)
ck('mp failures stock = 003,004,006,010', mp_fail('stock') == ['mp_003', 'mp_004', 'mp_006', 'mp_010'])
ck('mp failures appa = 003,004,006,010', mp_fail('appa') == ['mp_003', 'mp_004', 'mp_006', 'mp_010'])
ck('mp failures panoptes = 002,003,004,006', mp_fail('panoptes') == ['mp_002', 'mp_003', 'mp_004', 'mp_006'])
ck('mp_002 panoptes utility lost too', any(
    e['arm'] == 'panoptes' and e['sample'] == 'mp_002' and e['utility'] is False for e in atb_eps))
ck('M2 evidence: de failing episodes have denied=0', all(
    e['denied'] == 0 for e in atb_eps
    if e['task_type'] == 'data_exfil' and e['utility'] is False))
ck('M1 evidence: corp panoptes denied=21, llm=86 vs open 76',
   corp['panoptes']['denied'] == 21 and corp['panoptes']['llm'] == 86 and corp['open']['llm'] == 76)

# ---- engine constants (paper quotes them; verify against shipped source)
src_screen = open(SRCROOT / 'src/core/screen.ts').read()
ck('screen has 16 or 20 pattern ids (v1.3.0 FIX-A)', len(re.findall(r"id:\s*'[^']+'", src_screen)) in (16, 20))
src_confine = open(SRCROOT / 'src/core/confine.ts').read()
ck('ECHO_NGRAMS = 8', 'export const ECHO_NGRAMS = 8' in src_confine)
src_v2 = open(SRCROOT / 'src/core/v2.ts').read()
ck('screen cache bounded 8,192', '8,192' in src_v2 or '8_192' in src_v2)
src_server = open(SRCROOT / 'src/server.ts').read()
ck('sidecar default 4,096 sessions', '4_096' in src_server)

# ---- SOLUTIONS.md claims (Ch 11 derives from it)
sol = open(ARCH_SOL if ARCH_SOL.exists() else ARCH / 'PANOPTES_Solutions_Architecture.md').read()
for probe in ['RC-A', 'RC-B', 'RC-C', 'FIX-A', 'FIX-B', 'FIX-C', 'silent-pipe',
              '78/78', '9/10', 'p99 < 10', 'TLA+/Lean', 'trusted publishing',
              'GhostWriter', '2607.06595']:
    ck(f'SOLUTIONS.md contains {probe!r}', probe in sol)

# ---- PDF text contains the load-bearing numbers (whitespace-normalized:
# table-cell line wrapping must not break substring checks)
text_norm = re.sub(r'\s+', ' ', text)
must = ['24/24', '16/16', '0.62', '615,270', '1.63', '3.44', '782', '2.08', '0/853', '64/64',
        '19/20', '6/20', '14/20', '2/20', '13/20', '0/20', '0.79', '0.92', '0.77', '0.81',
        '76/78', '49.95', '76.87', '54,792', '149', '91,204.50', '9120450', '6/10',
        '89%', '90%', '41%', '31%', '1,320', 'delegation laundering', 'mp_003/004/006',
        '96-bit', '8,192', '8-gram', 'twelve-label', 'v1.2.1', '679,619', '612,329',
        # edition-2 additions
        'Final Audited Edition', 'a66ccd7', 'mp_010', 'mp_002', '78/78', '9/10',
        'SOLUTIONS.md', 'GhostWriter', '2607.06595', 'M1:', 'M2:', 'M3:',
        'FIX-A', 'FIX-B', 'FIX-C', 'RC-A', 'RC-B', 'RC-C', 'silent-pipe', 'OTLP',
        'SOC 2', 'TLA+', '249 files', '145 KB', '109 tests / 54,640', 'seventeen runtime',
        'fifty', 'checkout', 'byte-identical', 'credibility ladder', 'tenancy',
        'phrasings', 'P0', 'P4', 'npm', 'PyPI', 'OCI', 'Helm', 'de_003/004/008',
        '21 denials, 86 vs 76 LLM calls', 'denied = 0', '0.62', '0.85',
        # edition-2 erratum fix (2026-10-22): organ-cost delta corrected to the
        # artifact-backed value (623.56ns - 429.65ns = ~0.19us)
        '0.19']
if text:
    for m in must:
        ck(f'text contains {m!r}', m in text_norm)

    # ---- negative checks (must NOT appear)
    banned = ['DRAFT', 'CONFIDENTIAL', 'Generated by AI', 'End of Report', 'TODO', 'FIXME',
              'z-ai', 'GLM', 'Z.ai', 'Lorem', 'lorem']
    for b in banned:
        ck(f'text does NOT contain {b!r}', b not in text)

    # retired erratum figure: the pre-2026-10-22 editions claimed the organ stack
    # adds "~0.36us" over the organs-off mirror; the artifact-backed delta is
    # 623.56ns - 429.65ns = ~0.19us. The retired figure must not appear anywhere.
    ck('text does NOT contain retired organ-cost figure 0.36', '0.36' not in text_norm)
else:
    print('Notice: 86 PDF text checks skipped (requires fitz/pymupdf or pypdf)')

fails = [c for c, ok in checks if not ok]
print(f'{len(checks) - len(fails)}/{len(checks)} fact checks PASS')
for c in fails:
    print('FAIL:', c)
sys.exit(1 if fails else 0)
