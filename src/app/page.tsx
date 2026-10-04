import { Nav } from '@/components/panoptes/nav';
import { PanoptesBoot } from '@/components/panoptes/boot';
import { Hero } from '@/components/panoptes/hero';
import { Landscape } from '@/components/panoptes/landscape';
import { AppaMechanics } from '@/components/panoptes/appa-mechanics';
import { LatticeLab } from '@/components/panoptes/lattice-lab';
import { RatchetLab } from '@/components/panoptes/ratchet-lab';
import { Benchmarks } from '@/components/panoptes/benchmarks';
import { Flaws } from '@/components/panoptes/flaws';
import { Walls } from '@/components/panoptes/walls';
import { Organs } from '@/components/panoptes/organs';
import { CniLab } from '@/components/panoptes/cni-lab';
import { CapacityLab } from '@/components/panoptes/capacity-lab';
import { ImmuneLab } from '@/components/panoptes/immune-lab';
import { EconomicsLab } from '@/components/panoptes/economics-lab';
import { PrototypeBench } from '@/components/panoptes/prototype-bench';
import { ExternalBench } from '@/components/panoptes/external-bench';
import { ScaleProof } from '@/components/panoptes/scale-proof';
import { UsageGuide } from '@/components/panoptes/usage-guide';
import { RiskBudget } from '@/components/panoptes/risk-budget';
import { Roadmap } from '@/components/panoptes/roadmap';
import { DownloadSection, Footer } from '@/components/panoptes/download-section';

export default function Home() {
  return (
    <div className="grain relative flex min-h-screen flex-col bg-zinc-950 text-zinc-200">
      <PanoptesBoot />
      <div aria-hidden className="backdrop-observatory pointer-events-none fixed inset-0" />
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_120%,rgba(13,11,7,0.9),transparent_60%)]" />
      <Nav />
      <main className="relative flex-1">
        <Hero />
        <Landscape />
        <AppaMechanics />
        <LatticeLab />
        <RatchetLab />
        <Benchmarks />
        <Flaws />
        <Walls />
        <Organs />
        <CniLab />
        <CapacityLab />
        <ImmuneLab />
        <EconomicsLab />
        <PrototypeBench />
        <ExternalBench />
        <ScaleProof />
        <UsageGuide />
        <Roadmap />
        <RiskBudget />
        <DownloadSection />
      </main>
      <Footer />
    </div>
  );
}
