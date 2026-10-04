/** Diagnostic: which corpus scenarios flipped verdicts after hardening, per arm. */
import { PanoptesEngine } from '../src/lib/panoptes-core/engine';
import { CORPUS, CANARIES, type Scenario } from '../src/lib/bench/corpus';

function runScenario(engine: PanoptesEngine, s: Scenario) {
  engine.beginTrace();
  let last = { decision: 'allow', reasons: [], organs: [] } as ReturnType<PanoptesEngine['decide']>;
  for (let t = 0; t < s.traces.length; t++) {
    if (t > 0) engine.beginTrace();
    for (const step of s.traces[t]) {
      last = engine.decide(step.tool, step.params);
    }
  }
  return last;
}

const arms: Array<[string, PanoptesEngine]> = [
  ['organs-on', new PanoptesEngine({ organs: true, canaries: CANARIES })],
  ['organs-off', new PanoptesEngine({ organs: false })],
];

for (const [name, engine] of arms) {
  const flipped: string[] = [];
  for (const s of CORPUS) {
    const v = runScenario(engine, s);
    const expected = name === 'organs-off' && ['T5', 'T6'].includes(s.taxon) ? 'allow' : s.family === 'attack' ? 'deny' : 'allow';
    if (v.decision !== expected) {
      flipped.push(`${s.id} (${s.taxon} ${s.family}): want ${expected} got ${v.decision} — ${v.reasons[0] ?? ''} [${v.organs.join(',')}]`);
    }
  }
  console.log(`\n${name}: ${flipped.length} unexpected verdicts`);
  for (const f of flipped) console.log('  ' + f);
}
