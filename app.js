const defaults = {
  depth: 30,
  time: 20,
  descentRate: 20,
  ascentRate: 10,
  secondDiveEnabled: true,
  surfaceInterval: 60,
  secondDepth: 20,
  secondTime: 25,
};

const compartments = [
  { label: "5 min", name: "Compartiment rapide", halfTime: 5 },
  { label: "7 min", name: "Compartiment rapide", halfTime: 7 },
  { label: "10 min", name: "Compartiment rapide", halfTime: 10 },
  { label: "15 min", name: "Compartiment rapide", halfTime: 15 },
  { label: "20 min", name: "Compartiment intermédiaire", halfTime: 20 },
  { label: "30 min", name: "Compartiment intermédiaire", halfTime: 30 },
  { label: "40 min", name: "Compartiment lent", halfTime: 40 },
  { label: "50 min", name: "Compartiment lent", halfTime: 50 },
  { label: "60 min", name: "Compartiment lent", halfTime: 60 },
  { label: "80 min", name: "Compartiment très lent", halfTime: 80 },
  { label: "100 min", name: "Compartiment très lent", halfTime: 100 },
  { label: "120 min", name: "Compartiment très lent", halfTime: 120 },
];

const WATER_VAPOR_PRESSURE = 0.0627;
const N2_FRACTION = 0.79;
const HALDANE_RATIO = 2;
const STEP_SIZE = 3;
const EPSILON = 1e-6;
const MAX_SEARCH_MINUTES = 600;

const elements = {
  depth: document.getElementById("depth"),
  time: document.getElementById("time"),
  descentRate: document.getElementById("descentRate"),
  ascentRate: document.getElementById("ascentRate"),
  secondDiveEnabled: document.getElementById("secondDiveEnabled"),
  surfaceInterval: document.getElementById("surfaceInterval"),
  secondDepth: document.getElementById("secondDepth"),
  secondTime: document.getElementById("secondTime"),
  depthValue: document.getElementById("depthValue"),
  timeValue: document.getElementById("timeValue"),
  descentRateValue: document.getElementById("descentRateValue"),
  ascentRateValue: document.getElementById("ascentRateValue"),
  surfaceIntervalValue: document.getElementById("surfaceIntervalValue"),
  secondDepthValue: document.getElementById("secondDepthValue"),
  secondTimeValue: document.getElementById("secondTimeValue"),
  summaryDepth: document.getElementById("summaryDepth"),
  summaryTime: document.getElementById("summaryTime"),
  summaryResult: document.getElementById("summaryResult"),
  pressureValue: document.getElementById("pressureValue"),
  ndlValue: document.getElementById("ndlValue"),
  controllingTissueValue: document.getElementById("controllingTissueValue"),
  sequenceTypeValue: document.getElementById("sequenceTypeValue"),
  surfaceIntervalSummaryValue: document.getElementById("surfaceIntervalSummaryValue"),
  maxCeilingValue: document.getElementById("maxCeilingValue"),
  ascentTimeValue: document.getElementById("ascentTimeValue"),
  runtimeValue: document.getElementById("runtimeValue"),
  steps: document.getElementById("steps"),
  timeline: document.getElementById("timeline"),
  tissues: document.getElementById("tissues"),
  resetButton: document.getElementById("resetButton"),
};

function roundToHalfMinute(value) {
  return Math.max(0, Math.round(value * 2) / 2);
}

function roundUpToThree(value) {
  return Math.max(0, value <= 0 ? 0 : Math.ceil(value / 3) * 3);
}

function formatMinutes(value) {
  const rounded = roundToHalfMinute(value);
  return Number.isInteger(rounded) ? `${rounded} min` : `${rounded.toFixed(1)} min`;
}

function formatStopMinutes(value) {
  return `${Math.max(1, Math.ceil(value))} min`;
}

function formatPressure(value) {
  return `${value.toFixed(2)} bar`;
}

function formatTension(value) {
  return `${value.toFixed(3)} bar`;
}

function formatDepth(value) {
  return `${value.toFixed(1)} m`;
}

function ambientPressure(depth) {
  return 1 + depth / 10;
}

function inspiredN2Pressure(depth) {
  return Math.max(0, (ambientPressure(depth) - WATER_VAPOR_PRESSURE) * N2_FRACTION);
}

function halfTimeConstant(halfTime) {
  return Math.log(2) / halfTime;
}

function updateConstant(tension, inspiredPressure, minutes, halfTime) {
  if (minutes <= 0) {
    return tension;
  }

  const k = halfTimeConstant(halfTime);
  return inspiredPressure + (tension - inspiredPressure) * Math.exp(-k * minutes);
}

function updateSchreiner(tension, inspiredStart, inspiredEnd, minutes, halfTime) {
  if (minutes <= 0) {
    return tension;
  }

  const k = halfTimeConstant(halfTime);
  const rate = (inspiredEnd - inspiredStart) / minutes;
  return inspiredEnd - rate / k + (tension - inspiredStart + rate / k) * Math.exp(-k * minutes);
}

function buildSurfaceEquilibrium() {
  const surfaceInspired = inspiredN2Pressure(0);
  return compartments.map(() => surfaceInspired);
}

function simulateConstantPhase(tensions, depth, minutes) {
  const inspiredPressure = inspiredN2Pressure(depth);
  return tensions.map((tension, index) => updateConstant(tension, inspiredPressure, minutes, compartments[index].halfTime));
}

function simulateTravelPhase(tensions, fromDepth, toDepth, minutes) {
  const inspiredStart = inspiredN2Pressure(fromDepth);
  const inspiredEnd = inspiredN2Pressure(toDepth);
  return tensions.map((tension, index) => updateSchreiner(tension, inspiredStart, inspiredEnd, minutes, compartments[index].halfTime));
}

function buildSnapshot(tensions, depth) {
  const ambient = ambientPressure(depth);
  const allowed = HALDANE_RATIO * ambient;

  return compartments.map((compartment, index) => {
    const tension = tensions[index];
    const ceilingDepth = Math.max(0, (tension / HALDANE_RATIO - 1) * 10);
    const recommendedStopDepth = ceilingDepth <= EPSILON ? 0 : roundUpToThree(ceilingDepth);

    return {
      ...compartment,
      tension,
      ratio: tension / ambient,
      allowed,
      margin: allowed - tension,
      ceilingDepth,
      recommendedStopDepth,
      safe: tension <= allowed + EPSILON,
    };
  });
}

function cloneTensions(tensions) {
  return tensions.slice();
}

function getControllingTissue(snapshot) {
  return snapshot.reduce((best, tissue) => (tissue.ceilingDepth > best.ceilingDepth ? tissue : best), snapshot[0]);
}

function chooseNextStopDepth(maxCeiling, currentDepth) {
  if (maxCeiling <= EPSILON) {
    return 0;
  }

  return Math.max(STEP_SIZE, Math.min(currentDepth, roundUpToThree(maxCeiling)));
}

function isSafeAtDepth(tensions, depth) {
  const allowed = HALDANE_RATIO * ambientPressure(depth);
  return tensions.every((tension) => tension <= allowed + EPSILON);
}

function findHoldMinutes(tensions, currentDepth, nextDepth, travelMinutes) {
  let low = 0;
  let high = MAX_SEARCH_MINUTES;

  for (let iteration = 0; iteration < 48; iteration += 1) {
    const middle = (low + high) / 2;
    const held = simulateConstantPhase(tensions, currentDepth, middle);
    const projected = simulateTravelPhase(held, currentDepth, nextDepth, travelMinutes);

    if (isSafeAtDepth(projected, nextDepth)) {
      high = middle;
    } else {
      low = middle;
    }
  }

  return Math.max(1, Math.ceil(high));
}

function buildDiveSequence(depth, time, descentRate, ascentRate, secondDiveEnabled, surfaceInterval, secondDepth, secondTime) {
  const firstDive = buildDiveModel(depth, time, descentRate, ascentRate, {
    labelPrefix: "Plongée 1",
  });

  if (!secondDiveEnabled) {
    return {
      sequenceType: "Plongée simple",
      surfaceInterval: 0,
      phases: firstDive.phases,
      phaseSnapshots: firstDive.phaseSnapshots,
      finalModel: firstDive,
      primaryModel: firstDive,
      combinedAscentTime: firstDive.totalAscentTime,
      combinedRuntime: firstDive.totalRuntime,
      relationship: "simple",
    };
  }

  const intervalMinutes = Math.max(0, surfaceInterval);
  const intervalTensions = simulateConstantPhase(firstDive.finalTensions, 0, intervalMinutes);
  const intervalSnapshot = buildSnapshot(intervalTensions, 0);
  const relationship = intervalMinutes < 15 ? "consécutive" : "successive";
  const secondDive = buildDiveModel(secondDepth, secondTime, descentRate, ascentRate, {
    initialTensions: intervalTensions,
    labelPrefix: "Plongée 2",
    startLabel: relationship === "consécutive" ? "Départ de la plongée consécutive" : "Départ de la plongée successive",
    startKind: "surfaceStart",
    startDepth: 0,
  });

  const intervalPhase = {
    label: `Intervalle surface ${formatMinutes(intervalMinutes)}`,
    kind: "surfaceInterval",
    duration: intervalMinutes,
    depth: 0,
    relationship,
  };

  const intervalPhaseSnapshot = {
    label: `Intervalle surface ${formatMinutes(intervalMinutes)}`,
    kind: "surfaceInterval",
    depth: 0,
    duration: intervalMinutes,
    ambientPressure: ambientPressure(0),
    snapshot: intervalSnapshot,
    tensions: cloneTensions(intervalTensions),
    relationship,
  };

  return {
    sequenceType: relationship === "consécutive" ? "Plongée consécutive" : "Plongée successive",
    surfaceInterval: intervalMinutes,
    phases: [...firstDive.phases, intervalPhase, ...secondDive.phases],
    phaseSnapshots: [...firstDive.phaseSnapshots, intervalPhaseSnapshot, ...secondDive.phaseSnapshots],
    finalModel: secondDive,
    primaryModel: firstDive,
    combinedAscentTime: firstDive.totalAscentTime + intervalMinutes + secondDive.totalAscentTime,
    combinedRuntime: firstDive.totalRuntime + intervalMinutes + secondDive.totalRuntime,
    relationship,
  };
}

function simulateDirectAscentToSurface(tensions, currentDepth, ascentRate) {
  const minutes = currentDepth / ascentRate;
  const projected = simulateTravelPhase(tensions, currentDepth, 0, minutes);
  return {
    minutes,
    projected,
    safe: isSafeAtDepth(projected, 0),
  };
}

function calculateNoDecompressionLimit(depth, descentRate, ascentRate) {
  let low = 0;
  let high = MAX_SEARCH_MINUTES;

  for (let iteration = 0; iteration < 48; iteration += 1) {
    const middle = (low + high) / 2;
    let tissues = buildSurfaceEquilibrium();
    tissues = simulateTravelPhase(tissues, 0, depth, depth / descentRate);
    tissues = simulateConstantPhase(tissues, depth, middle);
    const directAscent = simulateDirectAscentToSurface(tissues, depth, ascentRate);

    if (directAscent.safe) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return low;
}

function buildDiveModel(depth, time, descentRate, ascentRate, options = {}) {
  const phases = [];
  const phaseSnapshots = [];
  const labelPrefix = options.labelPrefix ? `${options.labelPrefix} - ` : "";
  const initialTensions = options.initialTensions ? cloneTensions(options.initialTensions) : buildSurfaceEquilibrium();
  const startLabel = options.startLabel || "Surface initiale";
  const startKind = options.startKind || "surface";
  const startDepth = options.startDepth ?? 0;
  let tissues = cloneTensions(initialTensions);

  function recordPhase(label, kind, currentDepth, currentTissues, duration = 0, metadata = {}) {
    const snapshot = buildSnapshot(currentTissues, currentDepth);
    phaseSnapshots.push({
      label: `${labelPrefix}${label}`,
      kind,
      depth: currentDepth,
      duration,
      ambientPressure: ambientPressure(currentDepth),
      snapshot,
      tensions: cloneTensions(currentTissues),
      ...metadata,
    });
    return snapshot;
  }

  recordPhase(startLabel, startKind, startDepth, tissues, 0);

  const descentMinutes = depth / descentRate;
  tissues = simulateTravelPhase(tissues, startDepth, depth, descentMinutes);
  phases.push({ label: `${labelPrefix}Descente ${startDepth} m → ${depth} m`, kind: "descent", duration: descentMinutes, from: startDepth, to: depth });
  recordPhase(`Fin de descente à ${depth} m`, "descent", depth, tissues, descentMinutes);

  tissues = simulateConstantPhase(tissues, depth, time);
  phases.push({ label: `${labelPrefix}Fond à ${depth} m`, kind: "bottom", duration: time, depth });
  const bottomSnapshot = recordPhase(`Fin du fond à ${depth} m`, "bottom", depth, tissues, time);

  const controllingTissue = getControllingTissue(bottomSnapshot);
  const maxCeiling = controllingTissue.ceilingDepth;
  const ndl = calculateNoDecompressionLimit(depth, descentRate, ascentRate);

  const stops = [];
  let currentDepth = depth;

  while (currentDepth > 0) {
    const snapshot = buildSnapshot(tissues, currentDepth);
    const control = getControllingTissue(snapshot);

    if (control.ceilingDepth <= EPSILON) {
      const ascentMinutes = currentDepth / ascentRate;
      tissues = simulateTravelPhase(tissues, currentDepth, 0, ascentMinutes);
      phases.push({ label: `${labelPrefix}Montée ${currentDepth} m → surface`, kind: "ascent", duration: ascentMinutes, from: currentDepth, to: 0 });
      recordPhase(`Arrivée surface depuis ${currentDepth} m`, "ascent", 0, tissues, ascentMinutes);
      currentDepth = 0;
      break;
    }

    const stopDepth = chooseNextStopDepth(control.ceilingDepth, currentDepth);

    if (stopDepth >= currentDepth - EPSILON) {
      const nextDepth = Math.max(0, currentDepth - STEP_SIZE);
      const travelMinutes = (currentDepth - nextDepth) / ascentRate;
      const holdMinutes = findHoldMinutes(tissues, currentDepth, nextDepth, travelMinutes);
      tissues = simulateConstantPhase(tissues, currentDepth, holdMinutes);
      const heldSnapshot = buildSnapshot(tissues, currentDepth);
      const heldControl = getControllingTissue(heldSnapshot);

      stops.push({
        depth: currentDepth,
        minutes: holdMinutes,
        controllingTissue: heldControl.label,
        ceilingDepth: heldControl.ceilingDepth,
        recommendedStopDepth: heldControl.recommendedStopDepth,
      });

      phases.push({
        label: `${labelPrefix}Palier à ${currentDepth} m`,
        kind: "stop",
        duration: holdMinutes,
        depth: currentDepth,
        controllingTissue: heldControl.label,
        ceilingDepth: heldControl.ceilingDepth,
      });
      recordPhase(`Fin du palier à ${currentDepth} m`, "stop", currentDepth, tissues, holdMinutes);

      const ascentMinutes = (currentDepth - nextDepth) / ascentRate;
      tissues = simulateTravelPhase(tissues, currentDepth, nextDepth, ascentMinutes);
      phases.push({
        label: `${labelPrefix}Montée ${currentDepth} m → ${nextDepth} m`,
        kind: "ascent",
        duration: ascentMinutes,
        from: currentDepth,
        to: nextDepth,
      });
      recordPhase(`Arrivée à ${nextDepth} m`, "ascent", nextDepth, tissues, ascentMinutes);
      currentDepth = nextDepth;

      continue;
    }

    const ascentMinutes = (currentDepth - stopDepth) / ascentRate;
    tissues = simulateTravelPhase(tissues, currentDepth, stopDepth, ascentMinutes);
    phases.push({
      label: `${labelPrefix}Montée ${currentDepth} m → ${stopDepth} m`,
      kind: "ascent",
      duration: ascentMinutes,
      from: currentDepth,
      to: stopDepth,
    });
    recordPhase(`Arrivée à ${stopDepth} m`, "ascent", stopDepth, tissues, ascentMinutes);
    currentDepth = stopDepth;
  }

  const surfaceSnapshot = phaseSnapshots[phaseSnapshots.length - 1]?.depth === 0 ? phaseSnapshots[phaseSnapshots.length - 1].snapshot : recordPhase("Surface finale", "surface", 0, tissues, 0);
  const safeToSurface = isSafeAtDepth(tissues, 0);
  const totalAscentTime = phases.filter((phase) => phase.kind === "ascent" || phase.kind === "stop").reduce((sum, phase) => sum + phase.duration, 0);
  const totalRuntime = descentMinutes + time + totalAscentTime;
  const firstStop = stops[0] || null;

  return {
    pressure: ambientPressure(depth),
    ndl,
    bottomSnapshot,
    controllingTissue,
    maxCeiling,
    stops,
    firstStop,
    phases,
    phaseSnapshots,
    totalAscentTime,
    totalRuntime,
    safeToSurface,
    surfaceSnapshot,
    finalTensions: cloneTensions(tissues),
  };
}

function buildExplanation(depth, time, descentRate, ascentRate, model) {
  const lines = [
    `1. On initialise les ${compartments.length} compartiments MN90 à la tension d'azote inspiré en surface: ${formatTension(inspiredN2Pressure(0))}.`,
    `2. La descente de 0 à ${depth} m est suivie avec la formule de Schreiner, puis le fond dure ${time} min.`,
    `3. Chaque compartiment suit P_tissu(t) = P_i + (P_0 - P_i)e^{-kt} en pression constante, avec k = ln(2) / T1/2.`,
    `4. Pour la remontée, on recalcule les tensions à chaque phase: arrivée au palier, attente au palier, puis départ vers la phase suivante. Le critère reste P_tissu ≤ 2 × P_ambiante.`,
  ];

  if (model.stops.length === 0) {
    lines.push(`5. Aucun palier n'est nécessaire ici: le compartiment directeur reste sous le plafond Haldane autorisé jusqu'à la surface.`);
  } else {
    const stopText = model.stops.map((stop) => `${formatMinutes(stop.minutes)} à ${formatDepth(stop.depth)}`).join(", ");
    lines.push(`5. Le modèle impose ${model.stops.length} palier(s): ${stopText}. Le premier arrêt est piloté par ${model.firstStop.controllingTissue}.`);
  }

  lines.push(`6. Le temps total de remontée est de ${formatMinutes(model.totalAscentTime)} et la durée totale du profil est de ${formatMinutes(model.totalRuntime)}.`);
  lines.push(`7. Le tissu directeur au fond est ${model.controllingTissue.name} (${model.controllingTissue.label}), avec un plafond théorique de ${formatDepth(model.maxCeiling)}.`);

  return lines;
}

function buildTimeline(sequence) {
  const segments = sequence.phases;

  const totalDuration = segments.reduce((sum, segment) => sum + segment.duration, 0);

  return segments.map((segment) => ({
    label: segment.label,
    value: formatMinutes(segment.duration),
    width: Math.max(12, Math.round((segment.duration / totalDuration) * 100)),
    kind: segment.kind,
  }));
}

function buildPhaseExplanation(phase, controllingTissue, nextPhase, model) {
  const tissueName = `${controllingTissue.label} (${controllingTissue.name})`;
  const ceilingText = controllingTissue.ceilingDepth <= EPSILON ? "0 m" : formatDepth(controllingTissue.ceilingDepth);
  const nextDepthText = nextPhase ? formatDepth(nextPhase.depth) : "la surface";

  if (phase.kind === "surface") {
    return `Départ en surface: tous les tissus partent à ${formatTension(controllingTissue.tension)} d'azote inspiré.`;
  }

  if (phase.kind === "descent") {
    return `Fin de descente à ${formatDepth(phase.depth)}: le tissu directeur est ${tissueName}. Sa tension atteint ${formatTension(controllingTissue.tension)} et son plafond théorique est de ${ceilingText}.`;
  }

  if (phase.kind === "bottom") {
    return `Au fond, le tissu directeur est ${tissueName}. Il impose un plafond théorique de ${ceilingText}, ce qui signifie que la remontée ne peut pas se faire directement jusqu'à ${nextDepthText}.`;
  }

  if (phase.kind === "stop") {
    const stopDurationText = formatStopMinutes(phase.duration);
    return nextPhase
      ? `Après ${stopDurationText} de palier à ${formatDepth(phase.depth)}, le tissu directeur reste ${tissueName}. La phase suivante devient compatible vers ${nextDepthText}.`
      : `Après ce palier, le tissu directeur reste ${tissueName} avec un plafond de ${ceilingText}.`;
  }

  if (phase.kind === "ascent") {
    return `Arrivée à ${formatDepth(phase.depth)}: le tissu directeur est ${tissueName}. Son plafond théorique est de ${ceilingText}, ce qui impose d'arrêter la remontée à ce niveau avant de poursuivre.`;
  }

  if (phase.kind === "surfaceInterval") {
    if (phase.relationship === "consécutive") {
      return `Intervalle de surface de ${formatMinutes(phase.duration)}: il est inférieur à 15 min, donc la seconde immersion reste considérée comme consécutive. Les tissus continuent néanmoins à désaturer à la surface.`;
    }

    return `Intervalle de surface de ${formatMinutes(phase.duration)}: les tissus désaturent à la surface avant la deuxième immersion. La seconde plongée est traitée comme successive avec azote résiduel.`;
  }

  if (phase.kind === "surfaceStart") {
    return `Départ de la deuxième plongée en surface avec azote résiduel: le tissu directeur est ${tissueName}. La deuxième immersion continue à partir de cette tension résiduelle.`;
  }

  return `Le tissu directeur est ${tissueName}, avec un plafond théorique de ${ceilingText}.`;
}

function buildPhaseTable(model) {
  const headerCells = compartments.map((compartment) => `<div class="phase-cell">${compartment.label}</div>`).join("");
  const rows = model.phaseSnapshots.map((phase, index) => {
    const controllingTissue = getControllingTissue(phase.snapshot);
    const nextPhase = model.phaseSnapshots[index + 1] || null;
    const explanation = buildPhaseExplanation(phase, controllingTissue, nextPhase, model);
    const cells = phase.snapshot
      .map((tissue) => {
        const isControl = tissue.label === controllingTissue.label;
        return `<div class="phase-cell phase-number ${isControl ? "phase-number--control" : ""}">${formatTension(tissue.tension)}${isControl ? "<small>Directeur</small>" : ""}</div>`;
      })
      .join("");

    return `
      <div class="phase-row ${index === 0 ? "phase-head" : ""}">
        <div class="phase-cell phase-label">${phase.label}</div>
        <div class="phase-cell phase-depth">${formatDepth(phase.depth)}</div>
        <div class="phase-cell phase-explanation">${explanation}</div>
        ${cells}
      </div>
    `;
  }).join("");

  return `
    <div class="phase-row phase-head">
      <div class="phase-cell">Phase</div>
      <div class="phase-cell">Profondeur</div>
      <div class="phase-cell">Explication</div>
      ${headerCells}
    </div>
    ${rows}
  `;
}

function buildCourse(sequence, depth, time, descentRate, ascentRate, secondDepth, secondTime, surfaceInterval) {
  const model = sequence.finalModel;
  const surfaceInspired = inspiredN2Pressure(0);
  const depthInspired = inspiredN2Pressure(depth);
  const descentMinutes = depth / descentRate;
  const directAscentMinutes = depth / ascentRate;

  const items = [
    {
      title: "1. Pression inspirée en surface",
      text: `On part de ${formatTension(surfaceInspired)} d'azote inspiré à la surface, calculé à partir de l'air sec corrigé par la vapeur d'eau.`,
    },
    {
      title: "2. Descente",
      text: `La descente de 0 à ${depth} m dure ${formatMinutes(descentMinutes)} à ${descentRate} m/min. Pendant cette phase, la pression inspirée monte jusqu'à ${formatTension(depthInspired)}.`,
    },
    {
      title: "3. Séjour au fond",
      text: `Le fond dure ${formatMinutes(time)}. Les compartiments MN90 utilisés ici ont pour demi-vies: ${compartments.map((compartment) => compartment.label).join(", ")}.`,
    },
    {
      title: "4. Tension tissulaire",
      text: `Pour un tissu donné: P_tissu(t) = P_i + (P_0 - P_i)e^{-kt}, avec k = ln(2) / T1/2. Ici, P_i est la pression inspirée au fond et P_0 la tension du tissu avant l'immersion.`,
    },
    {
      title: "5. Critère Haldane",
      text: `Un tissu est considéré acceptable si sa tension reste inférieure ou égale à 2 × P_ambiante. Le plafond théorique est déduit en inversant ce rapport: plafond = max(0, (P_tissu / 2 - 1) × 10).`,
    },
    {
      title: "6. Compartiment directeur",
      text: `Le compartiment directeur est celui qui présente le plafond le plus élevé. Dans ce profil, c'est ${model.controllingTissue.label} (${model.controllingTissue.name}) avec un plafond maximal de ${formatDepth(model.maxCeiling)}.`,
    },
    {
      title: "7. Remontée par paliers",
      text: model.stops.length === 0
        ? `La remontée directe vers la surface reste compatible avec la règle Haldane; aucun palier n'est imposé dans ce profil.`
        : `Chaque palier est recalculé à la phase suivante: ${model.stops.map((stop) => `${formatMinutes(stop.minutes)} à ${formatDepth(stop.depth)}`).join(", ")}.`,
    },
    {
      title: "8. Durée des paliers",
      text: model.stops.length === 0
        ? `La durée de palier est nulle ici parce qu'aucun tissu ne dépasse le plafond autorisé au moment de la remontée. La surface est atteinte directement.`
        : `Pour chaque phase, on cherche la plus petite durée de maintien t telle qu'après le palier puis la remontée vers la phase suivante, la tension de tous les tissus vérifie P_tissu ≤ 2 × P_ambiante. Dans le code, cette durée est trouvée par dichotomie. Le premier palier dure ${formatMinutes(model.stops[0].minutes)}.`,
    },
    {
      title: "9. Plongées successives et consécutives",
      text: sequence.sequenceType === "Plongée simple"
        ? `Aucune deuxième plongée n'est activée. Si tu ajoutes une seconde immersion, un intervalle de moins de 15 min sera traité comme une plongée consécutive, sinon comme une plongée successive avec azote résiduel.`
        : `L'intervalle de surface est de ${formatMinutes(surfaceInterval)} avant une seconde plongée à ${secondDepth} m pendant ${formatMinutes(secondTime)}. Ici, la série est traitée comme ${sequence.sequenceType.toLowerCase()}.`,
    },
    {
      title: "10. Temps total",
      text: `Temps de remontée total: ${formatMinutes(model.totalAscentTime)}. En ajoutant le fond, la durée du profil atteint ${formatMinutes(model.totalRuntime)}.`,
    },
    {
      title: "11. Point de vigilance",
      text: `Même si ce calcul suit Haldane, il reste une démonstration pédagogique. Une vraie planification de plongée nécessite des tables validées et la prise en compte des procédures locales.`,
    },
    {
      title: "12. Contrôle rapide",
      text: `Si la remontée directe est impossible, l'algorithme ajoute un palier jusqu'à ce que la projection tissulaire soit à nouveau compatible avec le palier suivant ou la surface. Une remontée directe prendrait environ ${formatMinutes(directAscentMinutes)} sans palier.`,
    },
  ];

  return items;
}

function renderTissues(snapshot, maxCeiling) {
  elements.tissues.innerHTML = snapshot
    .map((tissue) => {
      const isControl = Math.abs(tissue.ceilingDepth - maxCeiling) < 0.05;
      const status = isControl
        ? "Directeur"
        : tissue.recommendedStopDepth === 0
          ? "Sans plafond"
          : `Plafond ${formatDepth(tissue.ceilingDepth)}`;
      const width = Math.min(100, Math.max(4, (tissue.ceilingDepth / Math.max(maxCeiling || 1, 1)) * 100));

      return `
        <article class="tissue-card ${isControl ? "tissue-card--control" : ""}">
          <div class="tissue-top">
            <div>
              <div class="tissue-name">${tissue.name}</div>
              <div class="tissue-label">${tissue.label}</div>
            </div>
            <span class="status-pill ${isControl ? "" : "status-pill--muted"}">${status}</span>
          </div>
          <div class="tissue-grid">
            <div class="tissue-row"><span>Tension N2</span><strong>${formatTension(tissue.tension)}</strong></div>
            <div class="tissue-row"><span>Ratio actuel</span><strong>${tissue.ratio.toFixed(2)} ×</strong></div>
            <div class="tissue-row"><span>Plafond théorique</span><strong>${formatDepth(tissue.ceilingDepth)}</strong></div>
            <div class="tissue-row"><span>Palier 3 m conseillé</span><strong>${tissue.recommendedStopDepth === 0 ? "Surface" : `${tissue.recommendedStopDepth} m`}</strong></div>
            <div class="tissue-row"><span>Marge Haldane</span><strong>${formatPressure(tissue.margin)}</strong></div>
          </div>
          <div class="tissue-bar"><span class="tissue-fill" style="--width:${width}%"></span></div>
        </article>
      `;
    })
    .join("");
}

function render() {
  const depth = Number(elements.depth.value);
  const time = Number(elements.time.value);
  const descentRate = Number(elements.descentRate.value);
  const ascentRate = Number(elements.ascentRate.value);
  const secondDiveEnabled = elements.secondDiveEnabled.checked;
  const surfaceInterval = Number(elements.surfaceInterval.value);
  const secondDepth = Number(elements.secondDepth.value);
  const secondTime = Number(elements.secondTime.value);
  const sequence = buildDiveSequence(depth, time, descentRate, ascentRate, secondDiveEnabled, surfaceInterval, secondDepth, secondTime);
  const model = sequence.finalModel;

  elements.depthValue.textContent = `${depth} m`;
  elements.timeValue.textContent = `${time} min`;
  elements.descentRateValue.textContent = `${descentRate} m/min`;
  elements.ascentRateValue.textContent = `${ascentRate} m/min`;
  elements.surfaceIntervalValue.textContent = formatMinutes(surfaceInterval);
  elements.secondDepthValue.textContent = `${secondDepth} m`;
  elements.secondTimeValue.textContent = `${secondTime} min`;

  elements.summaryDepth.textContent = `${depth} m`;
  elements.summaryTime.textContent = `${time} min`;
  elements.summaryResult.textContent = sequence.sequenceType;

  elements.pressureValue.textContent = formatPressure(sequence.primaryModel.pressure);
  elements.ndlValue.textContent = formatMinutes(sequence.primaryModel.ndl);
  elements.controllingTissueValue.textContent = `${model.controllingTissue.label} (${model.controllingTissue.name})`;
  elements.sequenceTypeValue.textContent = sequence.sequenceType;
  elements.surfaceIntervalSummaryValue.textContent = secondDiveEnabled ? formatMinutes(sequence.surfaceInterval) : "0 min";
  elements.maxCeilingValue.textContent = model.maxCeiling <= EPSILON ? "0 m" : formatDepth(model.maxCeiling);
  elements.ascentTimeValue.textContent = formatMinutes(sequence.combinedAscentTime);
  elements.runtimeValue.textContent = formatMinutes(sequence.combinedRuntime);

  elements.steps.innerHTML = buildExplanation(depth, time, descentRate, ascentRate, model)
    .map((step) => `<li>${step}</li>`)
    .join("");

  const timelineSegments = buildTimeline(sequence);
  elements.timeline.innerHTML = timelineSegments
    .map(
      (segment) => `
        <div class="timeline-item">
          <div class="timeline-label">${segment.label}</div>
          <div class="timeline-bar"><span class="timeline-fill" style="--width:${segment.width}%"></span></div>
          <div class="timeline-meta">${segment.value}</div>
        </div>
      `
    )
    .join("");

  renderTissues(model.bottomSnapshot, model.maxCeiling);

  const phaseTableElement = document.getElementById("phaseTable");
  phaseTableElement.innerHTML = buildPhaseTable(sequence);

  const courseItems = buildCourse(sequence, depth, time, descentRate, ascentRate, secondDepth, secondTime, surfaceInterval);
  const courseElement = document.getElementById("course");
  courseElement.innerHTML = courseItems
    .map(
      (item) => `
        <article class="course-item">
          <strong>${item.title}</strong>
          <p>${item.text}</p>
        </article>
      `
    )
    .join("");
}

function resetDemo() {
  elements.depth.value = defaults.depth;
  elements.time.value = defaults.time;
  elements.descentRate.value = defaults.descentRate;
  elements.ascentRate.value = defaults.ascentRate;
  elements.secondDiveEnabled.checked = defaults.secondDiveEnabled;
  elements.surfaceInterval.value = defaults.surfaceInterval;
  elements.secondDepth.value = defaults.secondDepth;
  elements.secondTime.value = defaults.secondTime;
  render();
}

elements.depth.addEventListener("input", render);
elements.time.addEventListener("input", render);
elements.descentRate.addEventListener("input", render);
elements.ascentRate.addEventListener("input", render);
elements.secondDiveEnabled.addEventListener("change", render);
elements.surfaceInterval.addEventListener("input", render);
elements.secondDepth.addEventListener("input", render);
elements.secondTime.addEventListener("input", render);
elements.resetButton.addEventListener("click", resetDemo);

render();
