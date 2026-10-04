// PANOPTES / OpenAPPA session dashboard — data layer.
// Every fact below is drawn from the whitepaper produced in this session:
// "PANOPTES: Toward Survivable Security for LLM Agents", whose sources are
// arXiv:2607.24625v2 (the APPA NeurIPS 2026 workshop paper), openappa.com
// (project + evaluation pages), the GitHub README, and Bytes #525.
// Provenance labels: 'paper' | 'project page' | 'README' | 'secondary' —
// the paper NEVER mixes these; neither does this dashboard.

export type Provenance = 'paper' | 'project page' | 'README' | 'secondary' | 'simulation';

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  paper: 'arXiv paper',
  'project page': 'project page (not in paper)',
  README: 'GitHub README',
  secondary: 'secondary source (Bytes #525)',
  simulation: 'pedagogical model',
};

// ---------------------------------------------------------------- hero stats
export const HERO_STATS: { value: string; label: string; source: Provenance }[] = [
  {
    value: '0 / 1,320',
    label: 'attacks observed against guarded APPA across all evaluated episodes',
    source: 'paper',
  },
  {
    value: '64.2–91%',
    label: 'utility range across 6,600 controlled episodes, three models',
    source: 'paper',
  },
  {
    value: '88.0 → 35.0',
    label: 'Bench-Corp completion with recovery machinery progressively removed (ablation)',
    source: 'paper',
  },
  {
    value: '+4.22%',
    label: 'token overhead vs. stock agent on the Tau banking benchmark',
    source: 'project page',
  },
];

// ------------------------------------------------------- landscape: incident
export interface IncidentTurn {
  tool: string;
  title: string;
  detail: string;
  label: string;
}

export const INCIDENT_TURNS: IncidentTurn[] = [
  {
    tool: 'read_issue',
    title: 'Turn 1 · Agent reads bug report #4471',
    detail:
      'A public bug report contains a customer email address (maya@northwind.example) pasted by the reporter. Ordinary work input — and an attack surface.',
    label: 'ingests untrusted content · trust drops to suspicious',
  },
  {
    tool: 'search_docs',
    title: 'Turn 2 · Agent searches internal docs',
    detail:
      'Looks up similar crash signatures in the internal knowledge base. Perfectly benign, no sensitive data touched.',
    label: 'no change · label unchanged',
  },
  {
    tool: 'read_crm',
    title: 'Turn 3 · Agent checks the customer record',
    detail:
      'Reads the CRM to confirm the customer\u2019s plan tier before answering. Now the trajectory carries PII — the reader set narrows.',
    label: 'ingests customer PII · readers narrow to {support, agent}',
  },
  {
    tool: 'post_issue',
    title: 'Turn 4 · Agent files a public GitHub issue',
    detail:
      'Writes up the reproduction steps for the public tracker — and pastes the customer\u2019s email address from turn 1 into the description.',
    label: 'public release attempted · blocked by the label ratchet',
  },
];

export const LANDSCAPE_ANSWERS: {
  name: string;
  tag: string;
  verdict: string;
  points: string[];
}[] = [
  {
    name: 'Judge models (auto-modes)',
    tag: 'probabilistic, per-call',
    verdict: 'unsafe at scale',
    points: [
      'The judge is itself prompt-injectable, so harnesses hide tool outputs from it — it rules on actions whose data it has not seen.',
      'It evaluates calls one at a time; cross-call flows are invisible by construction.',
      'OpenAI reportedly states Codex auto-review catches 99.3% of prompt injections in synthetic evals — a 0.7% miss rate at millions of daily calls is a breach pipeline.',
    ],
  },
  {
    name: 'Static rules (blocklists, regexes)',
    tag: 'deterministic, myopic',
    verdict: 'no coverage proof',
    points: [
      'Block rm -rf / and the model writes a Python one-liner; block curl and it pushes to an external git remote.',
      'Nobody can prove a rule set closes every path, or that three mundane tools chained cannot leak.',
      'Converges to one of two failures: so tight it breaks the agent, or so intricate nobody can audit what it permits.',
    ],
  },
  {
    name: 'Deterministic IFC + recovery (APPA)',
    tag: 'deterministic, composition-aware',
    verdict: 'the serious contender',
    points: [
      'Enforces information-flow policy with a label algebra on every call — you cannot prompt-inject an algebra.',
      'The leak is a property of the composition of calls; labels make composition visible.',
      'Recovery machinery (sanitizers, authorities, forks) keeps a blocked agent working instead of stalling.',
    ],
  },
];

// ---------------------------------------------------------- APPA definition
export const APPA_DEFS: { id: string; title: string; formula: string; body: string }[] = [
  {
    id: 'd1',
    title: 'Definition 1 · Security label and lattice',
    formula: 'L = (R, t)  ∈  P(U) × T',
    body: 'A trajectory carries a label: R is the finite set of authorized reader identities, t a trust level from a totally ordered chain (suspicious < trusted). Order by restrictiveness: (R\u2032, t\u2032) \u2264 (R, t) iff R\u2032 \u2286 R and t\u2032 \u2264 t. Combining streams is the component-wise meet (R, t) \u2227 (R\u2032, t\u2032) = (R \u2229 R\u2032, min(t, t\u2032)). Proposition 1 (Collapse) makes composition exact; Proposition 2 guarantees monotone descent — labels only ever restrict.',
  },
  {
    id: 'd2',
    title: 'Definition 2 · Prospective post-call label',
    formula: 'c\u03c4(L) = L \u2227 d\u03c4   — evaluated before dispatch',
    body: 'When the agent proposes tool call \u03c4 under label L, the monitor folds the tool\u2019s declared contribution d\u03c4 in FIRST, and evaluates release requirements, history predicates and hard gates against the prospective label. Proposition 4 shows this is necessary: for composite tools that read and release in one dispatch (share_legal_packet), a reactive monitor authorizes the egress and notices the ingestion only afterwards.',
  },
  {
    id: 'd3',
    title: 'The recovery layer · the actual innovation',
    formula: 'deny \u2192 machine-readable remedy plan',
    body: 'A bare forbidden makes an agent stall, retry, and fail. APPA returns remedies the policy permits: sanitizers transform payloads (mask secrets, redact PII) so data can flow to a wider audience; authorities approve one exact rendered call against a pre-declared mandate — never relaxing the session label; subagent forks isolate an untrusted or confidential read in a disposable child branch that exits only through abandonment, narrowing return, or a schema-attested channel (Theorem 8 confines taint to the branch boundary).',
  },
];

// ------------------------------------------------------------ benchmark data
export const BENCH_CORP_ROWS: {
  model: string;
  profile: string;
  appa: string;
  appaOpen: string;
  fm: string;
  fn: string;
  fopen: string;
}[] = [
  { model: 'GPT-5.6 Luna', profile: 'Standard', appa: '87 / 0', appaOpen: '90 / 31', fm: '41 / 30', fn: '36 / 34', fopen: '87 / 34' },
  { model: 'GPT-5.6 Luna', profile: 'Chaos', appa: '89 / 0', appaOpen: '91 / 35', fm: '36 / 34', fn: '38 / 31', fopen: '92 / 26' },
  { model: 'DeepSeek V4 Flash', profile: 'Standard', appa: '90 / 0', appaOpen: '88 / 33', fm: '41 / 34', fn: '44 / 35', fopen: '90 / 34' },
  { model: 'DeepSeek V4 Flash', profile: 'Chaos', appa: '89 / 0', appaOpen: '92 / 38', fm: '38 / 35', fn: '39 / 31', fopen: '94 / 45' },
  { model: 'Gemini 3.7 Flash', profile: 'Standard', appa: '89 / 0', appaOpen: '93 / 30', fm: '42 / 31', fn: '46 / 27', fopen: '92 / 31' },
  { model: 'Gemini 3.7 Flash', profile: 'Chaos', appa: '91 / 0', appaOpen: '92 / 30', fm: '45 / 26', fn: '43 / 29', fopen: '90 / 29' },
];

export const ABLATION: { config: string; utility: number; asr: number; note: string }[] = [
  { config: 'APPA (guarded, full recovery)', utility: 88.0, asr: 0, note: 'sanitizers + authorities + forks + guided recovery' },
  { config: 'appa-nofork', utility: 56.5, asr: 0, note: 'subagent forks removed from advertisement' },
  { config: 'appa-noremedy', utility: 35.0, asr: 0, note: 'guided recovery removed — bare deny' },
];

export const ATB_ROWS: {
  model: string;
  profile: string;
  memory: number;
  autonomy: number;
  exfiltration: number;
}[] = [
  { model: 'Luna', profile: 'Standard', memory: 28, autonomy: 30, exfiltration: 25 },
  { model: 'Luna', profile: 'Chaos', memory: 29, autonomy: 30, exfiltration: 25 },
  { model: 'DeepSeek', profile: 'Standard', memory: 17, autonomy: 30, exfiltration: 30 },
  { model: 'DeepSeek', profile: 'Chaos', memory: 19, autonomy: 30, exfiltration: 34 },
  { model: 'Gemini', profile: 'Standard', memory: 26, autonomy: 30, exfiltration: 35 },
  { model: 'Gemini', profile: 'Chaos', memory: 27, autonomy: 30, exfiltration: 35 },
];

export const TAU_STATS: { value: string; label: string }[] = [
  { value: '151 / 388', label: 'simulations completed (guarded) vs 156/388 stock' },
  { value: '38.92%', label: 'mean reward vs 40.21% stock' },
  { value: '1,307,763', label: 'mean agent tokens per simulation' },
  { value: '+4.22%', label: 'token overhead over the stock agent' },
  { value: '11,355', label: 'policy checks served' },
  { value: '0', label: 'tool-execution errors' },
];

// ------------------------------------------------------------------ flaws F1–F5
export interface Flaw {
  id: string;
  name: string;
  short: string;
  body: string;
  evidence: { text: string; source: Provenance };
}

export const FLAWS: Flaw[] = [
  {
    id: 'F1',
    name: 'Probabilistic endpoints inside the TCB',
    short: 'The algebra is deterministic; the system around it is not.',
    body: 'Sanitizers may be model-based; authorities may be an LLM-as-a-judge in auto-approval modes; annotators make model calls. Every one of these is an LLM endpoint inside the trusted computing base, reading raw, untrusted, attacker-influenceable data in order to label it. An attacker who cannot prompt-inject the algebra can still try to prompt-inject the annotator that feeds it. Concrete attack class: homoglyph PII a sanitizer passes untouched; a secret split across two innocuous fields whose halves recombine downstream; zero-width watermarks that survive redaction. The guarantee is label \u2286 enforcement, not label = reality.',
    evidence: {
      text: 'Custom sanitizers, \u201cincluding model-based ones,\u201d plug in with a declared blast radius; authorities may be \u201ca secondary model evaluator (an LLM-as-a-judge in auto-approval modes).\u201d',
      source: 'paper',
    },
  },
  {
    id: 'F2',
    name: 'The semantic gap',
    short: 'Labels are a lossy compression of the world; attackers live in the compression loss.',
    body: '\u201cIs this string a person\u2019s name?\u201d is a fact about the world, not about syntax. A finite lattice of audiences and trust levels compresses a world whose privacy-relevant properties are unbounded — and the compression loss is exactly where attacks live. This is the permanent condition of every label-based IFC system since Denning 1976; what APPA adds is that labels are sometimes assigned by corpus-trained models (F1), making the loss adversarially steerable rather than merely random. The right response: ground what can be grounded cryptographically, and detect leakage semantics-first at the decision boundary — which is what CNI does.',
    evidence: {
      text: 'The guarantee is label \u2286 enforcement, not label = reality. No finite label system assigns ground truth to \u201cis this sensitive\u201d across an unbounded input space.',
      source: 'paper',
    },
  },
  {
    id: 'F3',
    name: 'The monitor is not provably total',
    short: 'Raw egress, covert channels, and lying tools escape the perimeter.',
    body: 'The reference monitor sits at tool dispatch and protocol gateways. Raw egress escapes it: an agent with a shell tool can open a socket that never passes a tool contract. Covert channels escape it in principle: an agent that has read a secret and then merely CHOOSES which public tool to call next encodes one bit per decision, observable in commit logs, API timing, or choice of emoji. Lampson proved in 1973 that confinement cannot close these. And effects enter the log as reported — a tool that succeeds externally while reporting indeterminate simply vanishes from history. \u201cZero observed attacks\u201d should be read as \u201czero attacks of the classes scored.\u201d',
    evidence: {
      text: '\u201cCovert channels from a malicious model remain out of scope, and branching isolates prompt context rather than rolling back committed external effects.\u201d',
      source: 'paper',
    },
  },
  {
    id: 'F4',
    name: 'The monotone ratchet is an operational time bomb',
    short: 'Labels only restrict; there is no declassification lifecycle.',
    body: 'Monotonicity is theoretically elegant and operationally harsh. No \u201cpublishable after 30 days,\u201d no \u201ck-anonymized aggregates are public,\u201d no retention decay. The visible cost is in Table 3: memory tasks fail closed at 17\u201329 of 50 because writing to memory requires a trust level the ratcheted session no longer holds. The invisible cost is behavioral: operators facing a session that can no longer do anything useful have one sanctioned move — restart, discarding context — and one unsanctioned move: loosen the policy. That is the standard death spiral of deployed taint tracking. Nothing in the evaluation measures approval rates, time-to-approve, or fatigue over hundred-turn sessions.',
    evidence: {
      text: '\u201cFinite zero-ASR observations do not prove attacks impossible, and APPA\u2019s Memory Poisoning utility trails F-M\u2019s with every model.\u201d',
      source: 'paper',
    },
  },
  {
    id: 'F5',
    name: 'Benchmark epistemics',
    short: 'The suite supplying the headline table was authored by the system\u2019s own team.',
    body: 'Bench-Corp — source of the 88\u201390% vs 36\u201346% humiliation of Fides — was authored by the APPA team, and the evaluation page acknowledges it \u201cenforced rules those [Fides] configurations did not support, including recipient authorization, out-of-band approval, and required action ordering.\u201d Scoring a system on rules its competitor does not implement measures the rule set, not the engines. The correct reading of Table 1 is not \u201cAPPA beats Fides\u201d but \u201cunder one team\u2019s policy grammar, deterministic flow control with recovery dominates judge-based control on both axes.\u201d Independent replication does not yet exist.',
    evidence: {
      text: 'The evaluation page concedes the comparison is \u201cconfiguration-specific rather than an exhaustive baseline comparison.\u201d',
      source: 'project page',
    },
  },
];

// ---------------------------------------------------------------- five walls
export interface Wall {
  n: number;
  name: string;
  year: string;
  kind: 'theorem' | 'principle' | 'empirical';
  body: string;
}

export const WALLS: Wall[] = [
  {
    n: 1,
    name: "Rice's theorem",
    year: '1953',
    kind: 'theorem',
    body: '\u201cDoes this action leak?\u201d is a non-trivial semantic property of an open-ended program. Deciding it in general is equivalent to deciding the halting problem. Perfect static enforcement is impossible; every practical system enforces a decidable syntactic approximation of an undecidable semantic property — and the approximation gap is exactly where attacks live.',
  },
  {
    n: 2,
    name: 'Lampson\u2019s confinement result',
    year: '1973',
    kind: 'theorem',
    body: 'A process that observes a secret and controls anything publicly observable has a covert channel; capacity can be throttled but never zeroed without removing all observable choice. For agents: tool choice, timing, even error messages are observable. No content filter closes this; it is information-theoretic.',
  },
  {
    n: 3,
    name: 'The semantic gap',
    year: 'permanent',
    kind: 'principle',
    body: 'Labels are a finite compression of world semantics (F2). No finite label system assigns ground truth to \u201cis this sensitive\u201d across an unbounded input space.',
  },
  {
    n: 4,
    name: 'TCB conservation',
    year: 'structural',
    kind: 'principle',
    body: 'Trust does not vanish under scrutiny; it relocates. Minimize it, distribute it, fracture it across hostile implementors — but every verifier needs verifying, all the way down. The demand for a trust-free security system is a demand for a first unproven mover.',
  },
  {
    n: 5,
    name: 'The human hole',
    year: 'measurable',
    kind: 'empirical',
    body: 'The last authority in every deployed system is a person, and the person approves phishing emails at measurable rates. Human-in-the-loop is a blast radius, not a resolution.',
  },
];

// ------------------------------------------------------------ nine organs
export interface Organ {
  id: string;
  code: string;
  name: string;
  mechanism: string;
  answers: string;
  build: 'L1' | 'L2' | 'L2–L3' | 'L3' | 'L4';
  body: string;
}

export const ORGANS: Organ[] = [
  {
    id: 'o1',
    code: 'O1',
    name: 'Capability substrate',
    mechanism: 'Unforgeable destination tokens; no ambient authority',
    answers: 'F3, confused deputy',
    build: 'L2',
    body: 'Police anatomy rather than intent. In an object-capability system the agent never names destinations at all: every reachable destination is an unforgeable token the agent was handed — by the user, the policy, or another capability it holds. No ambient authority means the confused-deputy problem dies by construction. Sockets, files and remotes become capabilities the policy grants or withholds — the sandbox and the algebra stop being parallel, separately-bypassable systems.',
  },
  {
    id: 'o2',
    code: 'O2',
    name: 'Instruction-inert transclusion',
    mechanism: 'Closed schemas; provable channel-capacity bound',
    answers: 'F1, F2 at ingress',
    build: 'L2',
    body: 'The root cause of prompt injection is architectural: the context window is one undifferentiated namespace where instructions and data share an address space. PANOPTES generalizes APPA\u2019s bounded projections into an ingress law: untrusted text may enter primary context only as typed, bounded, closed-vocabulary projections with no imperative fields and no interpolation into prompts. Free prose is a Turing-complete attack channel; a closed schema is a channel with a provable bit-rate. You cannot stop injection — you can bound its bandwidth, meter it, and alarm when traffic approaches it.',
  },
  {
    id: 'o3',
    code: 'O3',
    name: 'CNI adjudication',
    mechanism: 'Counterfactual replay; causal leakage test',
    answers: 'F1, F2, Wall 2 residue',
    build: 'L3',
    body: 'The crown jewel. Define leakage causally — as a property of the model\u2019s decision function, not of the data — and test it at runtime by replaying boundary actions with secrets swapped for inert dummies. The algebra sees bytes; the adjudicator sees behavior.',
  },
  {
    id: 'o4',
    code: 'O4',
    name: 'The immune layer',
    mechanism: 'Synthesized canaries; red-team mutation; patch gauntlet',
    answers: 'F5, detection',
    build: 'L2–L3',
    body: 'Static defenses decay; immune systems do not, because they generate attacks faster than adversaries do. Continuously synthesize canary secrets — fake API keys, fake customer records, uniquely numbered and registered — and seed them through live traffic. Any canary surfacing where it should not is a detected breach with a forensic trail. A red-team agent mutates injection payloads against the deployed policy; every successful variant becomes a candidate patch after a formal dead-end check, canary replay, and regression suite. Affinity maturation for policy.',
  },
  {
    id: 'o5',
    code: 'O5',
    name: 'Gas-metered agency',
    mechanism: 'Priced risk budgets; bonds and slashing',
    answers: 'Wall 5 economics',
    build: 'L2',
    body: 'Binary allow/deny at the margin optimizes the wrong thing. Instead, price every action path by (label delta \u00d7 irreversibility \u00d7 blast radius): dangerous-but-legal paths become expensive, remedy paths cheap, and the agent plans around prices the way it already plans around token costs. Layer slashing on top: operators post security bonds to operate at elevated capability, and verified misbehavior burns stake. You cannot make attack impossible; you can make it unprofitable.',
  },
  {
    id: 'o6',
    code: 'O6',
    name: 'Escrowed time',
    mechanism: 'Delayed commits; compensating transactions',
    answers: 'F3 committed effects',
    build: 'L2',
    body: 'Irreversibility is the real enemy — a blocked leak is an incident, a completed one is a disclosure. Irreversible effects acquire a delayed-commit window: the email sits signed-but-unsent for N seconds, challengeable by the adjudicator or a circuit breaker; writes land as compensating transactions; world-facing actions snapshot prior state with a notarized rollback plan. Time is the last line of defense and the only one money cannot argue with.',
  },
  {
    id: 'o7',
    code: 'O7',
    name: 'N-version law + proof-carrying actions',
    mechanism: '3 hostile-team monitors; action certificates; CT logs',
    answers: 'Wall 4, F5',
    build: 'L3',
    body: 'TCB conservation says trust relocates; diversity says you can fracture it. Run the policy monitor as an n-version system — three independent implementations by three mutually hostile teams, majority rule — and compromise now requires subverting a majority of heterogeneous codebases at once. Every permitted effect ships with a proof-carrying action certificate: policy hash, event-log prefix, label derivation — verifiable by the destination itself. Certificates chain into an append-only, hash-chained, gossip-replicated action log: Certificate Transparency for agency.',
  },
  {
    id: 'o8',
    code: 'O8',
    name: 'The constitution outside the cage',
    mechanism: 'Signed, time-locked, sunsetting policy plane; breakers',
    answers: 'Wall 5, self-modification',
    build: 'L2',
    body: 'Policies live in a plane the agent structurally cannot reach: signed, quorum-gated, time-locked, and critically — expireable. Authority grants carry sunset clauses, so approval fatigue and privilege hygiene become the same mechanism: everything lapses unless affirmatively renewed. Org-wide circuit breakers give an operator a single, tested, physical action that halts all agents on evidence of compromise. Gödel\u2019s lesson applied as architecture: the law must be structurally unreachable by the governed.',
  },
  {
    id: 'o9',
    code: 'O9',
    name: 'Substrate convergence',
    mechanism: 'Noninterference training; data-minimizing agency',
    answers: 'All, asymptotically',
    build: 'L4',
    body: 'The endgame: the cage dissolves into the animal. Adversarial noninterference training — perturb untrusted-context tokens during training and penalize any change in action distribution, making injection-resistance a property of the weights. Data-minimizing agency — agents that reason over zero-knowledge predicates and encrypted capabilities, shrinking the leak surface to the cryptography itself. Neither ships this year; whichever lab ships substrate-level noninterference makes every runtime organ cheaper.',
  },
];

export const BUILD_LEVELS: Record<string, string> = {
  L1: 'ships in weeks',
  L2: 'quarters',
  'L2–L3': 'quarters to a team-year',
  L3: 'a small team-year',
  L4: 'research program',
};

// ---------------------------------------------------------------- roadmap
export const ROADMAP: {
  phase: string;
  window: string;
  title: string;
  body: string;
  deliverables: string[];
  risk: string;
  success: string;
}[] = [
  {
    phase: 'Phase 1',
    window: 'months 0–3',
    title: 'Feed the RFC while it is soft',
    body: 'APPA is published as Preview & RFC — maximum design leverage exists right now, while the config and wire surfaces are still allowed to break. Two contributions fit the RFC\u2019s own stated concerns and require no new theory.',
    deliverables: [
      'Provenance-channel labels: base label assignment on cryptographic facts (signed tool responses, mTLS identities, attested origins); model-based annotators may only RAISE labels, never lower them — converting F1\u2019s softest seam into a fail-closed refiner over cryptographic ground truth.',
      'Policy model-checking: compile appa.toml + the tool graph into a TLA+/Alloy model, enumerate reachable label states, emit counterexample traces — \u201cthis policy dead-ends after read X then read Y.\u201d Verification, not testing; attacks F4 directly.',
    ],
    risk: 'RFC churn breaks the surface',
    success: 'Both merged as RFC items with working prototype checks public',
  },
  {
    phase: 'Phase 2',
    window: 'months 3–12',
    title: 'The CNI prototype and the killer demo',
    body: 'Build the adjudicator around APPA as its fast path — the two-tier monitor, instrumented on the AgentThreatBench harness with canary-tagged secrets. The milestone that matters is singular: an attack that passes the algebra and is caught by the adjudicator.',
    deliverables: [
      'Two-tier monitor: algebra fast path on every call, counterfactual replay on boundary actions only.',
      'Paired-episode protocol: every episode run twice — true secret vs inert dummy, identical seeds — scoring ASR, utility, overhead, and the residue-rate: fraction of episodes where the algebra passes and the adjudicator diverges.',
      'The honest possibility that the residue is zero is what makes the experiment science rather than marketing.',
    ],
    risk: 'Residue-rate measures zero',
    success: 'Published residue result (either sign); overhead \u2264 ~15% decision tokens; remedy-plan integration',
  },
  {
    phase: 'Phase 3',
    window: 'year 1+',
    title: 'The trust layer',
    body: 'With the adjudicator proven, assemble the vendor-neutral stack: the layer airlines and banks can underwrite — because insurability is what converts security from a cost center into a market.',
    deliverables: [
      'Inert transclusion (O2) as an ingress library.',
      'Proof-carrying certificates and transparency logs (O7) as infrastructure every agent vendor needs and nobody ships.',
      'Escrowed-time adapters (O6) for the effect surfaces that matter per vertical; the immune layer (O4) as the operational service.',
    ],
    risk: 'Vendor NIH; standardization drag',
    success: 'First external audit of an action log completed',
  },
];

export const KEY_REFERENCES: string[] = [
  'Kravchenko et al. APPA: Recoverable Information-Flow Control for Real-World LLM Agents. arXiv:2607.24625v2, NeurIPS 2026 Workshop on Agents in the Wild.',
  'archestra-ai/OpenAPPA. GitHub, MIT license. openappa.com project and evaluation pages.',
  'Denning, D. E. A Lattice Model of Secure Information Flow. CACM 19(5), 1976.',
  'Goguen & Meseguer. Security Policies and Security Models. IEEE S&P 1982.',
  'Lampson, B. W. A Note on the Confinement Problem. CACM 16(10), 1973.',
  'Rice, H. G. Classes of Recursively Enumerable Sets. Trans. AMS 74, 1953.',
  'Pearl, J. Causality: Models, Reasoning, and Inference. Cambridge UP, 2009.',
  'Avizienis, A. The N-Version Approach to Fault-Tolerant Software. IEEE TSE 1985.',
  'Laurie, Langley & Kasper. Certificate Transparency. RFC 6962, 2013.',
  'Bytes #525: \u201cChildproofing the ungovernable.\u201d Fireship / bytes.dev, Sep 29 2026.',
];
