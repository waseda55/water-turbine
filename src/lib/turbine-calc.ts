import type { TurbineInputs, TurbineResults, TurbineType } from '@/types'

const RHO = 1000
const G   = 9.81
const PV  = 2.34
const PI  = Math.PI

function selectRatedSpeed(pw: number, head: number, freq: 50 | 60): { n: number; poles: number } {
  let bestN = 100, bestPoles = 2, bestDiff = Infinity
  for (let p = 2; p <= 80; p += 2) {
    const n = 120 * freq / p
    if (n < 100 || n > 1500) continue
    const ns = n * Math.sqrt(pw) / Math.pow(head, 1.25)
    const diff = Math.abs(ns - 150)
    if (diff < bestDiff) { bestDiff = diff; bestN = n; bestPoles = p }
  }
  return { n: bestN, poles: bestPoles }
}

const MANNING_N: Record<string, number> = { steel: 0.012, ductile: 0.013, frp: 0.010 }

function penstockHeadLoss(q: number, d: number, L: number, material: string): number {
  if (d <= 0 || L <= 0) return 0
  const v = q / (PI * d * d / 4)
  const n = MANNING_N[material] ?? 0.012
  const R = d / 4
  return (n * n * v * v * L) / Math.pow(R, 4 / 3)
}

export function calculate(inputs: TurbineInputs): TurbineResults {
  const { head, flowRate, turbineEff, generatorEff, suctionHead, altitude, frequency,
          powerFactor, operatingHours, capacityFactor, penstock } = inputs
  const etaT = turbineEff / 100
  const etaG = generatorEff / 100

  const turbinePower   = (RHO * G * flowRate * head * etaT) / 1000
  const generatorPower = turbinePower * etaG

  const { n: ratedRpm, poles } = selectRatedSpeed(turbinePower, head, frequency)
  const specificSpeed = ratedRpm * Math.sqrt(turbinePower) / Math.pow(head, 1.25)

  let turbineType: TurbineType
  let runawayCoeff: number
  if (head > 300 || specificSpeed < 100) {
    turbineType = 'ペルトン水車';   runawayCoeff = 1.8
  } else if (specificSpeed < 300) {
    turbineType = 'フランシス水車'; runawayCoeff = 1.8
  } else {
    turbineType = 'カプラン水車';   runawayCoeff = 2.5
  }

  const runawaySpeed = Math.round(ratedRpm * runawayCoeff)
  const atmPressure  = 101.325 * Math.exp(-altitude / 8500)

  let cavitationCoef: number | null = null
  let hsMax: number | null = null
  if (turbineType !== 'ペルトン水車') {
    cavitationCoef = turbineType === 'フランシス水車'
      ? 6.55e-6 * Math.pow(specificSpeed, 1.46)
      : 3.5e-5  * Math.pow(specificSpeed, 1.20)
    hsMax = (atmPressure - PV) / (RHO * G / 1000) - cavitationCoef * head
  }
  const cavOk = turbineType === 'ペルトン水車' ? null : suctionHead <= (hsMax ?? Infinity)

  // ── 寸法系 ──────────────────────────────────────────────────
  let runnerDiameter: number
  if (turbineType === 'ペルトン水車') {
    const Vu = 0.46 * Math.sqrt(2 * G * head)
    runnerDiameter = (60 * Vu) / (PI * ratedRpm)
  } else if (turbineType === 'フランシス水車') {
    runnerDiameter = 84.6 * Math.sqrt(flowRate) / (Math.pow(specificSpeed, 0.5) * Math.pow(ratedRpm, 0.5)) * 1.2
  } else {
    runnerDiameter = 84.6 * Math.sqrt(flowRate) / (Math.pow(specificSpeed, 0.3) * Math.pow(ratedRpm, 0.5)) * 0.9
  }

  const draftTubeDiameter = turbineType !== 'ペルトン水車'
    ? Math.sqrt(4 * flowRate / (PI * 4.0)) : null
  const casingDiameter = turbineType !== 'ペルトン水車' ? runnerDiameter * 1.4 : null
  const penstockDiameter = Math.sqrt(4 * flowRate / (PI * 2.0))
  const penstockVelocity = 2.0

  // ── 水理・構造系 ────────────────────────────────────────────
  const Ta  = 8.0
  const gd2 = (375 * turbinePower) / (ratedRpm * ratedRpm * Ta) * 1000

  const waveSpeed: Record<string, number> = { steel: 1200, ductile: 1000, frp: 700 }
  const a = waveSpeed[penstock.material] ?? 1000
  const vPen = flowRate / (PI * penstockDiameter * penstockDiameter / 4)
  const waterHammerHead = (a * vPen) / G
  const waterHammerRise = (waterHammerHead / head) * 100

  const headLoss = penstockHeadLoss(flowRate, penstockDiameter, penstock.length, penstock.material)
  const headLossRatio = (headLoss / head) * 100

  // ── 電気系 ──────────────────────────────────────────────────
  const generatorKva   = generatorPower / powerFactor
  const annualEnergy   = generatorPower * operatingHours * (capacityFactor / 100) / 1000
  const annualEnergyGwh = annualEnergy / 1000

  // ── 判定 ────────────────────────────────────────────────────
  const checks: TurbineResults['checks'] = {
    cavitation: turbineType === 'ペルトン水車'
      ? { result: 'N/A', message: 'ペルトン水車はキャビテーション無関係' }
      : { result: cavOk ? 'OK' : 'NG',
          message: `Hs=${suctionHead.toFixed(1)}m ≤ Hs_max=${hsMax!.toFixed(2)}m${!cavOk ? '　→ 設置位置を下流に近づけてください' : ''}` },
    specificSpeed: {
      result: specificSpeed >= 30 && specificSpeed <= 800 ? 'OK' : '注意',
      message: `Ns=${specificSpeed.toFixed(1)}（範囲 30〜800）${specificSpeed < 30 || specificSpeed > 800 ? '　→ 落差・流量見直し、機数分割を検討' : ''}`,
    },
    altitude: {
      result: altitude <= 1500 ? 'OK' : '注意',
      message: `標高 ${altitude}m　大気圧 ${atmPressure.toFixed(2)} kPa${altitude > 1500 ? '　→ キャビテーション余裕を再確認' : ''}`,
    },
    runaway: {
      message: `暴走速度 ${runawaySpeed} rpm（係数×${runawayCoeff}）　発電機・軸系設計の許容回転数と比較してください`,
    },
    headLoss: {
      result: headLossRatio <= 5 ? 'OK' : headLossRatio <= 10 ? '注意' : 'NG',
      message: `管路損失 hf=${headLoss.toFixed(2)}m（${headLossRatio.toFixed(1)}%）${headLossRatio > 10 ? '　→ 管径拡大または管路短縮を検討' : headLossRatio > 5 ? '　→ 管路損失がやや大きめです' : ''}`,
    },
    waterHammer: {
      result: waterHammerRise <= 20 ? 'OK' : waterHammerRise <= 40 ? '注意' : 'NG',
      message: `ΔH=${waterHammerHead.toFixed(1)}m（+${waterHammerRise.toFixed(1)}%）　遮断弁の閉鎖時間で緩和可能`,
    },
  }

  return {
    turbineType, turbinePower, generatorPower, specificSpeed,
    ratedRpm, poles, runawaySpeed, cavitationCoef, hsMax,
    atmPressure, runawayCoeff,
    dimensions: { runnerDiameter, draftTubeDiameter, casingDiameter, penstockDiameter, penstockVelocity },
    hydraulics: { gd2, waterHammerRise, waterHammerHead, penstock: { headLoss, headLossRatio } },
    electrical: { generatorKva, annualEnergy, annualEnergyGwh },
    checks,
  }
}

export function getEfficiencyCurve(turbineType: TurbineType, etaT: number) {
  const configs = {
    'ペルトン水車':   { k: 2.5, qPeak: 0.85 },
    'フランシス水車': { k: 3.0, qPeak: 0.80 },
    'カプラン水車':   { k: 4.0, qPeak: 0.75 },
  }
  return Array.from({ length: 81 }, (_, i) => {
    const q = 0.2 + i * 0.01
    const result: Record<string, number> = { q: Math.round(q * 100) }
    for (const [name, cfg] of Object.entries(configs)) {
      const eta = etaT * (1 - cfg.k * Math.pow(q - cfg.qPeak, 2))
      result[name] = Math.max(0, Math.min(100, eta * 100))
    }
    return result
  })
}
