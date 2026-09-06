const defaults = {
  depth: 30,
  time: 20,
  descentRate: 20,
  ascentRate: 10,
  secondDiveEnabled: false,
  surfaceInterval: 60,
  secondDepth: 20,
  secondTime: 25,
  thirdSurfaceInterval: 60,
  thirdDepth: 18,
  thirdTime: 20,
};

const state = {
  phaseDiagramSelectedIndex: 0,
  additionalDives: [
    {
      enabled: false,
      surfaceInterval: defaults.thirdSurfaceInterval,
      depth: defaults.thirdDepth,
      time: defaults.thirdTime,
    },
  ],
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
  pressureValue: document.getElementById("pressureValue"),
  ndlValue: document.getElementById("ndlValue"),
  controllingTissueValue: document.getElementById("controllingTissueValue"),
  sequenceTypeValue: document.getElementById("sequenceTypeValue"),
  surfaceIntervalSummaryValue: document.getElementById("surfaceIntervalSummaryValue"),
  maxCeilingValue: document.getElementById("maxCeilingValue"),
  ascentTimeValue: document.getElementById("ascentTimeValue"),
  runtimeValue: document.getElementById("runtimeValue"),
  steps: document.getElementById("steps"),
  phaseDiagram: document.getElementById("phaseDiagram"),
  secondDiveParams: document.getElementById("secondDiveParams"),
  additionalDives: document.getElementById("additionalDives"),
  tissues: document.getElementById("tissues"),
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

function formatStopLabel(duration, depth) {
  return `Palier ${formatStopMinutes(duration)} à ${formatDepth(depth)}`;
}

function cloneDive(dive) {
  return {
    enabled: dive.enabled,
    surfaceInterval: dive.surfaceInterval,
    depth: dive.depth,
    time: dive.time,
  };
}

function formatSurfaceIntervals(intervals) {
  if (!intervals.length) {
    return "0 min";
  }

  return intervals.map((interval) => formatMinutes(interval)).join(" puis ");
}

function renderAdditionalDiveBlock(dive, index) {
  const diveNumber = index + 3;
  return `
    <article class="dive-card" data-dive-index="${index}">
      <div class="dive-card-head">
        <div>
          <h4>Plongée ${diveNumber}</h4>
          <p>L'intervalle de surface relie cette plongée à la précédente.</p>
        </div>
        <label class="toggle-row">
          <input data-field="enabled" data-dive-index="${index}" type="checkbox" ${dive.enabled ? "checked" : ""} />
          <span>Activer</span>
        </label>
      </div>

      <div class="dive-card-fields" ${dive.enabled ? "" : "hidden"}>
      <label class="field">
        <span>Intervalle surface</span>
        <div class="field-row">
          <input data-field="surfaceInterval" data-dive-index="${index}" type="range" min="0" max="720" step="1" value="${dive.surfaceInterval}" />
          <output>${formatMinutes(dive.surfaceInterval)}</output>
        </div>
      </label>

      <label class="field">
        <span>Profondeur plongée ${diveNumber}</span>
        <div class="field-row">
          <input data-field="depth" data-dive-index="${index}" type="range" min="6" max="60" step="1" value="${dive.depth}" />
          <output>${dive.depth} m</output>
        </div>
      </label>

      <label class="field">
        <span>Temps plongée ${diveNumber}</span>
        <div class="field-row">
          <input data-field="time" data-dive-index="${index}" type="range" min="5" max="180" step="1" value="${dive.time}" />
          <output>${dive.time} min</output>
        </div>
      </label>
      </div>
    </article>
  `;
}

function buildAdditionalDiveBlocks() {
  if (state.additionalDives.length === 0) {
    return '<p class="helper-text">Aucune plongée supplémentaire pour le moment. Utilise le bouton ci-dessus pour en ajouter une.</p>';
  }

  return state.additionalDives.map((dive, index) => renderAdditionalDiveBlock(dive, index)).join("");
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

function buildDiveSequence(depth, time, descentRate, ascentRate, secondDiveEnabled, surfaceInterval, secondDepth, secondTime, additionalDives = []) {
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

  function addSurfaceIntervalAndDive(previousDive, intervalMinutes, diveDepth, diveTime, diveLabel, diveNumber) {
    const safeIntervalMinutes = Math.max(0, intervalMinutes);
    const intervalTensions = simulateConstantPhase(previousDive.finalTensions, 0, safeIntervalMinutes);
    const intervalSnapshot = buildSnapshot(intervalTensions, 0);
    const relationship = safeIntervalMinutes < 15 ? "consécutive" : "successive";
    const nextDive = buildDiveModel(diveDepth, diveTime, descentRate, ascentRate, {
      initialTensions: intervalTensions,
      labelPrefix: diveLabel,
      startLabel: `Départ de la plongée ${diveNumber}`,
      startKind: "surfaceStart",
      startDepth: 0,
    });

    return {
      intervalPhase: {
        label: `Intervalle surface ${formatMinutes(safeIntervalMinutes)}`,
        kind: "surfaceInterval",
        duration: safeIntervalMinutes,
        depth: 0,
        relationship,
        nextDiveNumber: diveNumber,
      },
      intervalPhaseSnapshot: {
        label: `Intervalle surface ${formatMinutes(safeIntervalMinutes)}`,
        kind: "surfaceInterval",
        depth: 0,
        duration: safeIntervalMinutes,
        nextDiveNumber: diveNumber,
        ambientPressure: ambientPressure(0),
        snapshot: intervalSnapshot,
        tensions: cloneTensions(intervalTensions),
        relationship,
      },
      nextDive,
      relationship,
      intervalMinutes: safeIntervalMinutes,
    };
  }

  const divePlan = [
    {
      surfaceInterval,
      depth: secondDepth,
      time: secondTime,
    },
    ...additionalDives.filter((dive) => dive.enabled).map(cloneDive),
  ];

  let combinedPhases = [...firstDive.phases];
  let combinedSnapshots = [...firstDive.phaseSnapshots];
  let combinedRuntime = firstDive.totalRuntime;
  let combinedAscentTime = firstDive.totalAscentTime;
  let finalModel = firstDive;
  const transitions = [];
  const surfaceIntervals = [];

  divePlan.forEach((dive, index) => {
    const diveNumber = index + 2;
    const transition = addSurfaceIntervalAndDive(finalModel, dive.surfaceInterval, dive.depth, dive.time, `Plongée ${diveNumber}`, diveNumber);

    transitions.push(transition);
    surfaceIntervals.push(transition.intervalMinutes);
    combinedPhases = [...combinedPhases, transition.intervalPhase, ...transition.nextDive.phases];
    combinedSnapshots = [...combinedSnapshots, transition.intervalPhaseSnapshot, ...transition.nextDive.phaseSnapshots];
    combinedRuntime += transition.intervalMinutes + transition.nextDive.totalRuntime;
    combinedAscentTime += transition.intervalMinutes + transition.nextDive.totalAscentTime;
    finalModel = transition.nextDive;
  });

  const sequenceType = transitions.length === 0
    ? "Plongée simple"
    : `Série de ${transitions.length + 1} plongées (${transitions.map((transition) => transition.relationship).join(", ")})`;

  return {
    sequenceType,
    surfaceInterval: surfaceIntervals[0] || 0,
    surfaceIntervals,
    phases: combinedPhases,
    phaseSnapshots: combinedSnapshots,
    finalModel,
    primaryModel: firstDive,
    combinedAscentTime,
    combinedRuntime,
    relationship: transitions[0]?.relationship || "simple",
    relationships: transitions.map((transition) => transition.relationship),
    dives: divePlan,
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
        label: `${labelPrefix}${formatStopLabel(holdMinutes, currentDepth)}`,
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
  lines.push(`7. Le compartiment directeur du profil est ${model.controllingTissue.name} (${model.controllingTissue.label}), avec un plafond théorique maximal de ${formatDepth(model.maxCeiling)}.`);

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

function buildPhaseDepthText(phase) {
  if (phase.kind === "descent") {
    return `${formatDepth(phase.from)} → ${formatDepth(phase.to)}`;
  }

  if (phase.kind === "ascent") {
    return `${formatDepth(phase.from)} → ${formatDepth(phase.to)}`;
  }

  if (phase.kind === "surfaceInterval" || phase.kind === "surface" || phase.kind === "surfaceStart") {
    return "Surface";
  }

  return formatDepth(phase.depth ?? 0);
}

function getPhasePlotDepth(phase) {
  if (phase.kind === "descent" || phase.kind === "ascent") {
    return phase.to;
  }

  if (phase.kind === "surfaceInterval" || phase.kind === "surface" || phase.kind === "surfaceStart") {
    return 0;
  }

  return phase.depth ?? 0;
}

function getPhaseStartDepth(phase) {
  if (phase.kind === "descent" || phase.kind === "ascent") {
    return phase.from;
  }

  if (phase.kind === "surfaceInterval" || phase.kind === "surface" || phase.kind === "surfaceStart") {
    return 0;
  }

  return phase.depth ?? 0;
}

function getPhaseDiagramNumber(index) {
  return String(index + 1);
}

function getPhaseDiagramLegendText(phase, index) {
  const number = index + 1;

  if (phase.kind === "descent") {
    return `${number}. Début descente ${formatDepth(phase.from)} → ${formatDepth(phase.to)}`;
  }

  if (phase.kind === "bottom") {
    return `${number}. Début fond à ${formatDepth(phase.depth)}`;
  }

  if (phase.kind === "stop") {
    return `${number}. ${formatStopLabel(phase.duration, phase.depth)}`;
  }

  if (phase.kind === "ascent") {
    return `${number}. Début remontée ${formatDepth(phase.from)} → ${formatDepth(phase.to)}`;
  }

  if (phase.kind === "surfaceInterval") {
    return `${number}. Début intervalle surface`;
  }

  if (phase.kind === "surfaceStart") {
    return `${number}. Début surface`;
  }

  return `${number}. ${phase.label}`;
}

function getPhaseDiagramPhaseText(sequence, phase, index, duration) {
  const parts = [];
  const startSnapshot = sequence.phaseSnapshots[index]?.snapshot;
  const endSnapshot = sequence.phaseSnapshots[index + 1]?.snapshot;

  parts.push(getPhaseDiagramNumber(index));

  if (startSnapshot && endSnapshot) {
    const startControl = getControllingTissue(startSnapshot);
    const endControl = getControllingTissue(endSnapshot);
    parts.push(`Tissu directeur: ${endControl.label} (${endControl.name})`);
    parts.push(`TN2 directeur: ${formatTension(startControl.tension)} → ${formatTension(endControl.tension)}`);
  }

  parts.push(`Durée: ${formatMinutes(duration)}`);

  if (phase.kind === "surfaceInterval") {
    parts.push(`Type: ${phase.relationship === "consécutive" ? "plongée consécutive" : "plongée successive"}`);
  }

  if (phase.kind === "descent" || phase.kind === "ascent") {
    parts.push(`Trajet: ${formatDepth(phase.from)} → ${formatDepth(phase.to)}`);
  } else if (phase.kind === "bottom") {
    parts.push(`Profondeur: ${formatDepth(phase.depth)}`);
  } else if (phase.kind === "stop") {
    parts[parts.length - 1] = formatStopLabel(duration, phase.depth);
  }

  return parts.join(" • ");
}

function getPhaseDiagramTooltipText(sequence, phase, index, duration) {
  return getPhaseDiagramPhaseText(sequence, phase, index, duration);
}

function getSelectedPhaseDiagramText(sequence, selectedIndex) {
  const phase = sequence.phases[selectedIndex];
  if (!phase) {
    return "Touchez une phase du graphique pour afficher ses informations.";
  }

  return getPhaseDiagramPhaseText(sequence, phase, selectedIndex, phase.duration);
}

function buildPhaseDiagram(sequence) {
  const phases = sequence.phases;
  const chartPhases = phases;
  const selectedPhaseIndex = Math.min(Math.max(0, state.phaseDiagramSelectedIndex), Math.max(0, phases.length - 1));
  const height = 360;
  const paddingX = 64;
  const paddingY = 32;
  const totalDuration = Math.max(1, phases.reduce((sum, phase) => sum + phase.duration, 0));
  const minimumPlotWidth = 1400;
  const durationScale = 40;
  const durationOffset = 26;
  const phaseWeights = chartPhases.map((phase) => durationOffset + Math.sqrt(Math.max(phase.duration, 1)) * durationScale);
  const totalCompressedWidth = phaseWeights.reduce((sum, value) => sum + value, 0);
  const width = Math.max(minimumPlotWidth, Math.ceil(totalCompressedWidth) + paddingX * 2);
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingY * 2 - 18;
  const maxDepth = Math.max(3, ...chartPhases.map((phase) => getPhasePlotDepth(phase)));
  const labelY = height - paddingY + 18;

  let elapsed = 0;
  let compressedCursor = 0;
  const segments = chartPhases.map((phase, index) => {
    const duration = phase.duration;
    const weight = phaseWeights[index];
    const xStart = paddingX + compressedCursor;
    const xEnd = xStart + weight;
    const startDepth = getPhaseStartDepth(phase);
    const endDepth = getPhasePlotDepth(phase);
    const yStart = paddingY + (startDepth / maxDepth) * plotHeight;
    const yEnd = paddingY + (endDepth / maxDepth) * plotHeight;
    const isFlat = Math.abs(startDepth - endDepth) <= EPSILON;
    const plateauX = xStart + 4;
    const plateauWidth = Math.max(0, weight - 8);
    const relationshipLabel = phase.kind === "surfaceInterval"
      ? (phase.relationship === "consécutive" ? "Consécutive" : "Successive")
      : null;

    const segment = {
      phase,
      xStart,
      xEnd,
      yStart,
      yEnd,
      x: xStart + weight / 2,
      y: (yStart + yEnd) / 2,
      depth: startDepth,
      isFlat,
      plateauX,
      plateauWidth,
      plateauY: yStart - 5,
      relationshipLabel,
      relationshipLabelX: (xStart + xEnd) / 2,
      relationshipLabelY: Math.max(paddingY + 18, yStart + 18),
      duration,
      elapsed,
    };

    elapsed += duration;
    compressedCursor += weight;
    return segment;
  });

  const timeMarks = segments.map((segment) => ({ x: segment.xStart, time: segment.elapsed }));
  if (timeMarks[timeMarks.length - 1]?.time !== totalDuration) {
    timeMarks.push({ x: paddingX + totalCompressedWidth, time: totalDuration });
  }

  const xAxisTicks = timeMarks
    .map((tick) => {
      const timeValue = typeof tick === "number" ? tick : tick.time;
      const x = typeof tick === "number" ? paddingX + (timeValue / totalDuration) * plotWidth : tick.x;
      return `
        <g class="phase-diagram-timeaxis">
          <line x1="${x}" y1="${height - paddingY}" x2="${x}" y2="${height - paddingY + 8}"></line>
          <text x="${x}" y="${labelY}" text-anchor="middle">${formatMinutes(timeValue)}</text>
        </g>
      `;
    })
    .join("");

  const depthStep = maxDepth <= 12 ? 3 : maxDepth <= 30 ? 6 : 10;
  const depthMarks = [];

  for (let depth = 0; depth <= maxDepth + EPSILON; depth += depthStep) {
    depthMarks.push(Math.min(maxDepth, depth));
  }

  if (depthMarks[depthMarks.length - 1] !== maxDepth) {
    depthMarks.push(maxDepth);
  }

  const gridLines = depthMarks
    .map((depth) => {
      const y = paddingY + (depth / maxDepth) * plotHeight;
      return `
        <g class="phase-diagram-gridline">
          <line x1="${paddingX}" y1="${y}" x2="${width - paddingX}" y2="${y}"></line>
          <text x="${paddingX - 12}" y="${y + 4}" text-anchor="end">${formatDepth(depth)}</text>
        </g>
      `;
    })
    .join("");

  const polylinePoints = segments
    .flatMap((segment) => [`${segment.xStart},${segment.yStart}`, `${segment.xEnd},${segment.yEnd}`])
    .join(" ");
  const areaPoints = `${paddingX},${height - paddingY} ${polylinePoints} ${paddingX + totalCompressedWidth},${height - paddingY}`;

  return `
      <div class="phase-diagram-scroll">
        <svg class="phase-diagram-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Graphique des phases avec profondeur et durée">
          <defs>
            <linearGradient id="phaseAreaGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="rgba(118, 228, 214, 0.28)" />
              <stop offset="100%" stop-color="rgba(138, 180, 255, 0.05)" />
            </linearGradient>
            <linearGradient id="phaseLineGradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stop-color="#76e4d6" />
              <stop offset="100%" stop-color="#8ab4ff" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width="${width}" height="${height}" rx="20" class="phase-diagram-background"></rect>
          <g class="phase-diagram-axes">
            <line x1="${paddingX}" y1="${paddingY}" x2="${paddingX}" y2="${height - paddingY}"></line>
            <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}"></line>
          </g>
          <g class="phase-diagram-grid">${gridLines}</g>
          <g class="phase-diagram-timeaxis-group">
            ${xAxisTicks}
          </g>
          <path d="M ${areaPoints}" fill="url(#phaseAreaGradient)"></path>
          ${segments
            .map(
              (segment, index) => `
                <g class="phase-diagram-segment-group phase-diagram-segment-group--${segment.phase.kind}${index === selectedPhaseIndex ? ' phase-diagram-segment-group--selected' : ''}" data-phase-index="${index}" aria-label="${getPhaseDiagramTooltipText(sequence, segment.phase, index, segment.duration)}">
                  <title>${getPhaseDiagramTooltipText(sequence, segment.phase, index, segment.duration)}</title>
                  ${segment.isFlat ? `<rect class="phase-diagram-plateau phase-diagram-plateau--${segment.phase.kind}" x="${segment.plateauX}" y="${segment.plateauY}" width="${segment.plateauWidth}" height="10" rx="5"></rect>` : ""}
                  <line class="phase-diagram-segment phase-diagram-segment--${segment.phase.kind}${segment.isFlat ? ' phase-diagram-segment--flat' : ''}" x1="${segment.xStart}" y1="${segment.yStart}" x2="${segment.xEnd}" y2="${segment.yEnd}"></line>
                  ${segment.relationshipLabel ? `
                    <g class="phase-diagram-relationship phase-diagram-relationship--${segment.phase.relationship}">
                      <rect x="${segment.relationshipLabelX - 46}" y="${segment.relationshipLabelY - 15}" width="92" height="22" rx="11"></rect>
                      <text x="${segment.relationshipLabelX}" y="${segment.relationshipLabelY}" text-anchor="middle">${segment.relationshipLabel}</text>
                    </g>
                  ` : ""}
                  <g class="phase-diagram-point phase-diagram-point--${segment.phase.kind}">
                    <circle cx="${segment.x}" cy="${segment.y}" r="13"></circle>
                    <text x="${segment.x}" y="${segment.y + 4}" text-anchor="middle" class="phase-diagram-point-number">${getPhaseDiagramNumber(index)}</text>
                  </g>
                </g>
              `
            )
            .join("")}
        </svg>
      </div>
      <div class="phase-diagram-info" aria-live="polite">
        <strong>Infos de phase</strong>
        <p>${getSelectedPhaseDiagramText(sequence, Math.min(state.phaseDiagramSelectedIndex, sequence.phases.length - 1))}</p>
      </div>
      <div class="phase-diagram-axis-label">Temps écoulé (min, échelle schématique)</div>
    </div>
  `;
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
    return `Au fond, le tissu directeur est ${tissueName}. Il impose un plafond théorique de ${ceilingText}, ce qui impose un palier à ${nextDepthText}.`;
  }

  if (phase.kind === "stop") {
    return nextPhase
      ? `Après ${formatStopLabel(phase.duration, phase.depth)}, le tissu directeur reste ${tissueName}. La phase suivante devient compatible vers ${nextDepthText}.`
      : `Après ce palier, le tissu directeur reste ${tissueName} avec un plafond de ${ceilingText}.`;
  }

  if (phase.kind === "ascent") {
    return `Arrivée à ${formatDepth(phase.depth)}: le tissu directeur est ${tissueName}. Son plafond théorique est de ${ceilingText}, ce qui impose de rester à cette profondeur tant que la suite du profil n'est pas compatible.`;
  }

  if (phase.kind === "surfaceInterval") {
    if (phase.relationship === "consécutive") {
      return `Intervalle de surface de ${formatMinutes(phase.duration)}: il est inférieur à 15 min, donc la plongée suivante reste considérée comme consécutive. Les tissus continuent néanmoins à désaturer à la surface.`;
    }

    return `Intervalle de surface de ${formatMinutes(phase.duration)}: les tissus désaturent à la surface avant la plongée suivante. L'immersion suivante est traitée comme successive avec azote résiduel.`;
  }

  if (phase.kind === "surfaceStart") {
    return `Départ de la plongée suivante en surface avec azote résiduel: le tissu directeur est ${tissueName}. L'immersion suivante continue à partir de cette tension résiduelle.`;
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
      text: `Le compartiment directeur est celui qui présente le plafond le plus élevé sur le profil complet. Ici, c'est ${model.controllingTissue.label} (${model.controllingTissue.name}) avec un plafond maximal de ${formatDepth(model.maxCeiling)}.`,
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
        : `Pour chaque phase, on cherche la plus petite durée de maintien, t, telle qu'après le palier puis la remontée vers la phase suivante, la tension de tous les tissus vérifie P_tissu ≤ 2 × P_ambiante. Dans le code, cette durée est trouvée par dichotomie. Le premier palier dure ${formatMinutes(model.stops[0].minutes)}.`,
    },
    {
      title: "9. Plongées successives et consécutives",
      text: sequence.sequenceType === "Plongée simple"
        ? `Aucune deuxième plongée n'est activée. Si tu ajoutes une seconde immersion, un intervalle de moins de 15 min sera traité comme une plongée consécutive, sinon comme une plongée successive avec azote résiduel.`
        : `La série enchaîne ${sequence.dives.map((dive, index) => `la plongée ${index + 2} à ${formatDepth(dive.depth)} pendant ${formatMinutes(dive.time)}`).join(", ")}. Les intervalles de surface sont ${formatSurfaceIntervals(sequence.surfaceIntervals)}. Ici, la série est traitée comme ${sequence.sequenceType.toLowerCase()}.`,
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

function syncSecondDiveParamsVisibility(secondDiveEnabled) {
  elements.secondDiveParams.hidden = !secondDiveEnabled;
  elements.secondDiveParams.setAttribute("aria-hidden", String(!secondDiveEnabled));

  elements.secondDiveParams.querySelectorAll("input, output").forEach((element) => {
    if (element.tagName === "INPUT") {
      element.disabled = !secondDiveEnabled;
    }
  });
}

function syncAdditionalDivesVisibility(secondDiveEnabled) {
  const visible = secondDiveEnabled;
  elements.additionalDives.hidden = !visible;
  elements.additionalDives.setAttribute("aria-hidden", String(!visible));

  elements.additionalDives.querySelectorAll("input").forEach((element) => {
    element.disabled = !visible;
  });
}

function syncSliderOutput(input) {
  const output = input.nextElementSibling;
  if (!(output instanceof HTMLOutputElement)) {
    return;
  }

  const value = Number(input.value);
  switch (input.dataset.field || input.id) {
    case "surfaceInterval":
      output.textContent = formatMinutes(value);
      break;
    case "depth":
    case "secondDepth":
      output.textContent = `${value} m`;
      break;
    case "time":
    case "secondTime":
      output.textContent = `${value} min`;
      break;
    case "descentRate":
    case "ascentRate":
      output.textContent = `${value} m/min`;
      break;
    default:
      break;
  }
}

function syncVisibleSliderValues() {
  syncSliderOutput(elements.depth);
  syncSliderOutput(elements.time);
  syncSliderOutput(elements.descentRate);
  syncSliderOutput(elements.ascentRate);
  syncSliderOutput(elements.surfaceInterval);
  syncSliderOutput(elements.secondDepth);
  syncSliderOutput(elements.secondTime);

  elements.additionalDives.querySelectorAll("input[type='range']").forEach((input) => {
    if (input instanceof HTMLInputElement) {
      syncSliderOutput(input);
    }
  });
}

function updateAdditionalDiveFieldVisibility() {
  elements.additionalDives.querySelectorAll(".dive-card").forEach((card) => {
    const diveIndex = Number(card.dataset.diveIndex);
    const dive = state.additionalDives[diveIndex];
    const fields = card.querySelector(".dive-card-fields");
    if (fields && dive) {
      fields.hidden = !dive.enabled;
    }
  });
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
  const sequence = buildDiveSequence(
    depth,
    time,
    descentRate,
    ascentRate,
    secondDiveEnabled,
    surfaceInterval,
    secondDepth,
    secondTime,
    state.additionalDives
  );
  const model = sequence.finalModel;

  syncSecondDiveParamsVisibility(secondDiveEnabled);
  elements.additionalDives.innerHTML = buildAdditionalDiveBlocks();
  syncAdditionalDivesVisibility(secondDiveEnabled);
  updateAdditionalDiveFieldVisibility();

  syncVisibleSliderValues();

  elements.pressureValue.textContent = formatPressure(sequence.primaryModel.pressure);
  elements.ndlValue.textContent = formatMinutes(sequence.primaryModel.ndl);
  elements.controllingTissueValue.textContent = `${model.controllingTissue.label} (${model.controllingTissue.name})`;
  elements.sequenceTypeValue.textContent = sequence.sequenceType;
  elements.surfaceIntervalSummaryValue.textContent = secondDiveEnabled ? formatSurfaceIntervals(sequence.surfaceIntervals) : "0 min";
  elements.maxCeilingValue.textContent = model.maxCeiling <= EPSILON ? "0 m" : formatDepth(model.maxCeiling);
  elements.ascentTimeValue.textContent = formatMinutes(sequence.combinedAscentTime);
  elements.runtimeValue.textContent = formatMinutes(sequence.combinedRuntime);

  elements.steps.innerHTML = buildExplanation(depth, time, descentRate, ascentRate, model)
    .map((step) => `<li>${step}</li>`)
    .join("");

  if (elements.phaseDiagram) {
    const phaseDiagramScroll = elements.phaseDiagram.querySelector(".phase-diagram-scroll");
    const previousPhaseDiagramScrollLeft = phaseDiagramScroll instanceof HTMLElement ? phaseDiagramScroll.scrollLeft : 0;

    elements.phaseDiagram.innerHTML = buildPhaseDiagram(sequence);

    const nextPhaseDiagramScroll = elements.phaseDiagram.querySelector(".phase-diagram-scroll");
    if (nextPhaseDiagramScroll instanceof HTMLElement) {
      nextPhaseDiagramScroll.scrollLeft = previousPhaseDiagramScrollLeft;
    }
  }

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

elements.depth.addEventListener("input", syncVisibleSliderValues);
elements.time.addEventListener("input", syncVisibleSliderValues);
elements.descentRate.addEventListener("input", syncVisibleSliderValues);
elements.ascentRate.addEventListener("input", syncVisibleSliderValues);
elements.surfaceInterval.addEventListener("input", syncVisibleSliderValues);
elements.secondDepth.addEventListener("input", syncVisibleSliderValues);
elements.secondTime.addEventListener("input", syncVisibleSliderValues);

elements.additionalDives.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type === "range") {
    syncSliderOutput(target);
  }
});

elements.depth.addEventListener("change", render);
elements.time.addEventListener("change", render);
elements.descentRate.addEventListener("change", render);
elements.ascentRate.addEventListener("change", render);
elements.secondDiveEnabled.addEventListener("change", render);
elements.surfaceInterval.addEventListener("change", render);
elements.secondDepth.addEventListener("change", render);
elements.secondTime.addEventListener("change", render);

elements.additionalDives.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const diveIndex = Number(target.dataset.diveIndex);
  const field = target.dataset.field;
  const dive = state.additionalDives[diveIndex];

  if (!dive || !field) {
    return;
  }

  dive[field] = field === "enabled" ? target.checked : Number(target.value);
  render();
});

if (elements.phaseDiagram) {
  elements.phaseDiagram.addEventListener("click", (event) => {
    const target = event.target;
    const segment = target instanceof Element ? target.closest("[data-phase-index]") : null;
    if (!segment) {
      return;
    }

    const phaseIndex = Number(segment.getAttribute("data-phase-index"));
    if (Number.isNaN(phaseIndex)) {
      return;
    }

    state.phaseDiagramSelectedIndex = phaseIndex;
    render();
  });

  elements.phaseDiagram.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const segment = target.closest("[data-phase-index]");
    if (!segment) {
      return;
    }

    event.preventDefault();
    const phaseIndex = Number(segment.getAttribute("data-phase-index"));
    if (Number.isNaN(phaseIndex)) {
      return;
    }

    state.phaseDiagramSelectedIndex = phaseIndex;
    render();
  });
}

render();
