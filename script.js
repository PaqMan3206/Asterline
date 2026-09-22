const canvas = document.getElementById('systemCanvas');
const context = canvas.getContext('2d');
const landingCanvas = document.getElementById('landingCanvas');
const landingContext = landingCanvas.getContext('2d');
const seed = 817263;
const TAU = Math.PI * 2;

function seededRandom(initialSeed) {
  let state = initialSeed >>> 0;
  return function random() {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const random = seededRandom(seed);
const starNames = ['Asterion', 'Solenne', 'Veyra', 'Caelus', 'Morrow'];
const planetNames = ['Nera', 'Kestrel', 'Vanta', 'Orison', 'Caligo', 'Rhea', 'Tessera', 'Eos'];
const planetColors = ['#63d7d1', '#ff9e7a', '#d4a1ff', '#ffc769', '#71a9ee', '#e5789d', '#94dc91', '#c5c8db'];
const resourceNames = ['WATER', 'RARE METALS', 'BIOMASS', 'FUSION FUEL', 'SILICATES', 'CRYSTALS', 'FOODSTOCK', 'HELIUM-3'];
const facilityNames = ['ORBITAL HAB', 'MINING COLONY', 'RESEARCH ARRAY', 'FUEL REFINERY', 'TRADE PORT'];
const stars = createStarfield(260);
const system = createSystem();
let width = 0;
let height = 0;
let deviceRatio = 1;
let lastFrame = performance.now();
let simulationDays = 0;
let simulationSpeed = 1;
let isPlaying = true;
let originIndex = null;
let destinationIndex = null;
let credits = 0;
let fuel = 100;
let mission = { status: 'idle', launchDay: 0, arrivalDay: 0, fuelCost: 0, reward: 0 };
let activeFlights = [];
let fleetSize = 1;
let aircraftUpgradeLevels = [0];
let missionType = 'delivery';
let activeContract = null;
let discoveredCount = 2;
let nextDiscoveryCompletion = 1;
let navUpgradeLevel = 0;
let tankUpgradeLevel = 0;
let cargoUpgradeLevel = 0;
let chronoUpgradeLevel = 0;
let cameraZoom = 1;
let cameraFocusIndex = null;
let cameraPanX = 0;
let cameraPanY = 0;
let isDraggingMap = false;
let didDragMap = false;
let dragStartX = 0;
let dragStartY = 0;
let panStartX = 0;
let panStartY = 0;
let companyRank = 1;
let companyXp = 0;
let completedObjectives = [];
let progressionStats = { launches: 0, completions: 0, upgrades: 0, discoveries: 0, contractTypes: [] };
let commandLog = [];
let audioContext = null;
const missionProfiles = {
  delivery: { label: 'DELIVERY', objective: 'Transport standard freight', cargo: 'STANDARD FREIGHT', fuelMultiplier: 1, durationMultiplier: 1, reward: 1 },
  survey: { label: 'SURVEY', objective: 'Scan orbital signatures', cargo: 'SENSOR PACKAGE', fuelMultiplier: .72, durationMultiplier: .82, reward: .72 },
  rescue: { label: 'RESCUE', objective: 'Recover a stranded crew', cargo: 'LIFE SUPPORT', fuelMultiplier: 1.18, durationMultiplier: .7, reward: 1.55 },
  resource: { label: 'RESOURCE', objective: 'Deliver strategic materials', cargo: 'RESOURCE LOAD', fuelMultiplier: 1.3, durationMultiplier: 1.08, reward: 1.35 },
};
const objectives = [
  { id: 'first-flight', label: 'Launch an automated flight', goal: 1, reward: 100, metric: 'launches' },
  { id: 'reliable-carrier', label: 'Complete a mission', goal: 1, reward: 150, metric: 'completions' },
  { id: 'contract-network', label: 'Fly 3 contract types', goal: 3, reward: 200, metric: 'contractTypes' },
  { id: 'fleet-builder', label: 'Purchase a fleet upgrade', goal: 1, reward: 125, metric: 'upgrades' },
  { id: 'pathfinder', label: 'Discover 3 new worlds', goal: 3, reward: 250, metric: 'discoveries' },
];
const upgradeConfig = {
  nav: { label: 'NAVIGATION AI', baseCost: 2500, step: 1250, max: 4, rank: 1 },
  tank: { label: 'FUEL RESERVE', baseCost: 1500, step: 1000, max: 4, rank: 1 },
  cargo: { label: 'CARGO SYSTEMS', baseCost: 2000, step: 1500, max: 4, rank: 2 },
  chrono: { label: 'CHRONO RELAY', baseCost: 5000, step: 15000, max: 2, rank: 1 },
};

function getMissionProfile() {
  return missionProfiles[missionType];
}

function getFuelCapacity() {
  return 100 + tankUpgradeLevel * 25;
}

function rechargeFuel(daysElapsed) {
  if (daysElapsed <= 0 || fuel >= getFuelCapacity()) return false;
  const previousFuel = Math.floor(fuel);
  fuel = Math.min(getFuelCapacity(), fuel + daysElapsed * .5);
  return Math.floor(fuel) !== previousFuel;
}

function getUpgradeCost(type) {
  const config = upgradeConfig[type];
  const level = type === 'nav' ? navUpgradeLevel : type === 'tank' ? tankUpgradeLevel : type === 'cargo' ? cargoUpgradeLevel : chronoUpgradeLevel;
  return config.baseCost + level * config.step;
}

function getTimeSkipCost() {
  return 250 + discoveredCount * 125;
}

function getShipDurationMultiplier() {
  return Math.max(.68, 1 - navUpgradeLevel * .07);
}

function getAircraftUpgradeCost(index) {
  return 1800 + (aircraftUpgradeLevels[index] || 0) * 2200;
}

function getAvailableAircraftIndex() {
  const used = new Set(activeFlights.map((flight) => flight.aircraftIndex));
  return Array.from({ length: fleetSize }, (_, index) => index).find((index) => !used.has(index)) ?? 0;
}

function getAircraftCost() {
  return 4000 + Math.max(0, fleetSize - 1) * 3500;
}

function getMaximumSpeed() {
  return chronoUpgradeLevel >= 2 ? 16 : chronoUpgradeLevel >= 1 ? 4 : 1;
}

function getRewardMultiplier() {
  return 1 + cargoUpgradeLevel * .12;
}

function getMarketReward(destination, missionProfile) {
  const facilityBonus = destination.facility === 'TRADE PORT' ? 1.18 : 1;
  const resourceBonus = missionProfile.label === 'RESOURCE' ? 1.15 : 1;
  return facilityBonus * resourceBonus * (destination.marketPrice / 100);
}

function getContractProgressionMultiplier() {
  return Math.min(1.15, .45 + (discoveredCount - 2) * .18);
}

function getTransferDays(origin, destination, missionDurationMultiplier = 1, aircraftIndex = null) {
  const semiMajorAxis = (origin.orbitRadius + destination.orbitRadius) / 2;
  const baseDays = Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3)) * 365.25;
  const aircraftBonus = aircraftIndex === null ? 1 : Math.max(.72, 1 - (aircraftUpgradeLevels[aircraftIndex] || 0) * .08);
  return Math.round(baseDays * Math.min(1, .38 + (discoveredCount - 2) * .16) * missionDurationMultiplier * getShipDurationMultiplier() * aircraftBonus);
}

function getMissionOffers() {
  const types = ['delivery', 'survey', 'resource', 'rescue'];
  const offerCount = Math.min(types.length, Math.max(1, discoveredCount - 1));
  return types.slice(0, offerCount).map((type, index) => {
    const origin = index % discoveredCount;
    const destination = (origin + 1) % discoveredCount;
    const destinationWorld = system.planets[destination];
    const profile = missionProfiles[type];
    const transferDays = getTransferDays(system.planets[origin], destinationWorld, profile.durationMultiplier);
    const baseReward = 500 + destinationWorld.orbitRadius * 180 + index * 120;
    return { type, origin, destination, cargoUnits: 10 + index * 5 + Math.floor(destinationWorld.marketPrice / 40), deadline: Math.round(transferDays * (type === 'rescue' ? .95 : 1.35)), reward: Math.round(baseReward * getContractProgressionMultiplier() * getMarketReward(destinationWorld, profile)), brief: profile.objective };
  });
}

function getObjectiveProgress(objective) {
  const value = progressionStats[objective.metric];
  return Array.isArray(value) ? value.length : value;
}

function addLog(message, kind = 'event') {
  commandLog.unshift({ message, kind, day: simulationDays });
  commandLog = commandLog.slice(0, 7);
  renderCommandLog();
  playSignal(kind);
}

function playSignal(kind) {
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const frequencies = { event: 420, objective: 660, rank: 880 };
    oscillator.frequency.value = frequencies[kind] || frequencies.event;
    oscillator.type = 'sine';
    gain.gain.setValueAtTime(.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.035, audioContext.currentTime + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .18);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + .2);
  } catch (error) {
  }
}

function renderCommandLog() {
  const log = document.getElementById('commandLog');
  if (!commandLog.length) {
    log.innerHTML = '<span class="log-empty">NO EVENTS RECORDED</span>';
    return;
  }
  log.innerHTML = commandLog.map((entry) => `<div class="log-entry"><i></i><div>${entry.message}<time>DAY ${entry.day.toFixed(1)}</time></div></div>`).join('');
}

function xpToNextRank() {
  return 100 + (companyRank - 1) * 75;
}

function awardXp(amount) {
  const previousRank = companyRank;
  companyXp += amount;
  while (companyXp >= xpToNextRank()) {
    companyXp -= xpToNextRank();
    companyRank += 1;
    credits += 1000;
  }
  if (companyRank > previousRank) addLog(`Company promoted to rank ${String(companyRank).padStart(2, '0')}.`, 'rank');
}

function checkObjectives() {
  let changed = false;
  objectives.forEach((objective) => {
    if (!completedObjectives.includes(objective.id) && getObjectiveProgress(objective) >= objective.goal) {
      completedObjectives.push(objective.id);
      awardXp(objective.reward);
      credits += 500;
      addLog(`Objective complete: ${objective.label}.`, 'objective');
      changed = true;
    }
  });
  updateProgressionUI();
  if (changed) saveProgress();
}

function updateProgressionUI() {
  const nextRank = xpToNextRank();
  document.getElementById('rankDisplay').textContent = `RANK ${String(companyRank).padStart(2, '0')}`;
  document.getElementById('xpDisplay').textContent = `${companyXp} / ${nextRank} XP`;
  document.getElementById('xpFill').style.width = `${Math.min(100, (companyXp / nextRank) * 100)}%`;
  document.getElementById('objectiveCount').textContent = `${completedObjectives.length} / ${objectives.length} DONE`;
  document.getElementById('objectiveList').innerHTML = objectives.map((objective) => {
    const progress = Math.min(objective.goal, getObjectiveProgress(objective));
    const complete = completedObjectives.includes(objective.id);
    return `<div class="objective-row ${complete ? 'is-complete' : ''}"><i class="objective-mark"></i><span>${objective.label}</span><b class="objective-progress">${complete ? 'DONE' : `${progress}/${objective.goal}`}</b></div>`;
  }).join('');
}

function createSystem() {
  const star = { name: starNames[Math.floor(random() * starNames.length)], type: random() > .5 ? 'G-TYPE MAIN SEQUENCE' : 'K-TYPE MAIN SEQUENCE', radius: 27 + random() * 7 };
  const planets = [];
  for (let index = 0; index < 2; index += 1) planets.push(createPlanet(index));
  return { star, planets };
}

function createPlanet(index) {
  const orbitRadius = 1.05 + Math.pow(index, 1.35) * .6 + random() * .16;
  return {
    name: planetNames[index] || `World-${String(index + 1).padStart(2, '0')}`,
    color: planetColors[index % planetColors.length],
    radius: 5 + random() * 5.5,
    orbitRadius,
    period: Math.round(82 * Math.pow(orbitRadius, 1.5)),
    angle: random() * TAU,
    eccentricity: random() * 0.08,
    hasRing: random() > 0.72,
    moons: random() > 0.58 ? 1 + Math.floor(random() * 2) : 0,
    resource: resourceNames[index % resourceNames.length],
    facility: facilityNames[Math.floor(random() * facilityNames.length)],
    marketPrice: 80 + Math.floor(random() * 120) + Math.floor(index * 4.5),
  };
}

function ensurePlanets(count) {
  while (system.planets.length < count) system.planets.push(createPlanet(system.planets.length));
}

function createStarfield(count) {
  return Array.from({ length: count }, () => ({
    x: random(), y: random(), size: .3 + random() * 1.45, alpha: .18 + random() * .62, tint: random() > .86 ? '#78d8da' : '#dce8ff',
  }));
}

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();
  deviceRatio = Math.min(window.devicePixelRatio || 1, 2);
  width = bounds.width;
  height = bounds.height;
  canvas.width = Math.floor(width * deviceRatio);
  canvas.height = Math.floor(height * deviceRatio);
  context.setTransform(deviceRatio, 0, 0, deviceRatio, 0, 0);
  landingCanvas.width = Math.floor(window.innerWidth * deviceRatio);
  landingCanvas.height = Math.floor(window.innerHeight * deviceRatio);
  landingContext.setTransform(deviceRatio, 0, 0, deviceRatio, 0, 0);
}

function drawLandingScene(now) {
  const sceneWidth = window.innerWidth;
  const sceneHeight = window.innerHeight;
  landingContext.clearRect(0, 0, sceneWidth, sceneHeight);
  const centerX = sceneWidth * .78;
  const centerY = sceneHeight * .52;
  const planetRadius = Math.min(sceneWidth, sceneHeight) * .23;
  const glow = landingContext.createRadialGradient(centerX - planetRadius * .35, centerY - planetRadius * .35, planetRadius * .08, centerX, centerY, planetRadius * 1.45);
  glow.addColorStop(0, '#ded0ff');
  glow.addColorStop(.18, '#9672d1');
  glow.addColorStop(.62, '#402968');
  glow.addColorStop(1, '#090611');
  landingContext.save();
  landingContext.globalAlpha = .75;
  landingContext.strokeStyle = 'rgba(181,140,255,.22)';
  landingContext.lineWidth = 1;
  for (let index = 0; index < 4; index += 1) {
    landingContext.beginPath();
    landingContext.ellipse(centerX, centerY, planetRadius * (1.45 + index * .28), planetRadius * (.34 + index * .08), -.22, 0, TAU);
    landingContext.stroke();
  }
  landingContext.restore();
  for (const star of stars) {
    landingContext.globalAlpha = star.alpha * .72;
    landingContext.fillStyle = star.tint;
    landingContext.beginPath(); landingContext.arc(star.x * sceneWidth, star.y * sceneHeight, star.size, 0, TAU); landingContext.fill();
  }
  landingContext.globalAlpha = 1;
  landingContext.fillStyle = glow;
  landingContext.shadowColor = '#8b5cf6'; landingContext.shadowBlur = 38;
  landingContext.beginPath(); landingContext.arc(centerX, centerY, planetRadius, 0, TAU); landingContext.fill();
  landingContext.shadowBlur = 0;
  landingContext.strokeStyle = 'rgba(228,199,255,.5)';
  landingContext.lineWidth = 2;
  landingContext.beginPath(); landingContext.arc(centerX, centerY, planetRadius * 1.05, -.75, 1.1); landingContext.stroke();
  const sweepAngle = (now / 2600) % TAU;
  landingContext.strokeStyle = 'rgba(228,199,255,.72)';
  landingContext.lineWidth = 1;
  landingContext.beginPath(); landingContext.moveTo(centerX, centerY); landingContext.lineTo(centerX + Math.cos(sweepAngle) * planetRadius * 1.35, centerY + Math.sin(sweepAngle) * planetRadius * 1.35); landingContext.stroke();
  landingContext.globalAlpha = 1;
}

function drawBackground() {
  const gradient = context.createRadialGradient(width * .55, height * .48, 20, width * .55, height * .48, Math.max(width, height) * .72);
  gradient.addColorStop(0, '#0a1118');
  gradient.addColorStop(.48, '#04070c');
  gradient.addColorStop(1, '#010205');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const nebula = context.createRadialGradient(width * .16, height * .75, 2, width * .16, height * .75, width * .48);
  nebula.addColorStop(0, 'rgba(83, 41, 83, .09)');
  nebula.addColorStop(1, 'rgba(83, 41, 83, 0)');
  context.fillStyle = nebula;
  context.fillRect(0, 0, width, height);
}

function drawStars() {
  for (const star of stars) {
    context.globalAlpha = star.alpha;
    context.fillStyle = star.tint;
    context.beginPath();
    context.arc(star.x * width, star.y * height, star.size, 0, TAU);
    context.fill();
  }
  context.globalAlpha = 1;
}

function getMapScale() {
  const outerOrbit = system.planets[system.planets.length - 1].orbitRadius;
  return Math.min(width, height) * .46 / outerOrbit;
}

function drawSystem(time) {
  const centerX = width * .52;
  const centerY = height * .53;
  const scale = getMapScale();
  const maxOrbit = system.planets[discoveredCount - 1].orbitRadius * scale;

  context.save();
  context.translate(centerX, centerY);
  if (cameraFocusIndex !== null) {
    const focus = getPlanetState(system.planets[cameraFocusIndex], time);
    context.scale(cameraZoom, cameraZoom);
    context.translate(cameraPanX / cameraZoom, cameraPanY / cameraZoom);
    context.translate(-focus.x, -focus.y);
  } else {
    context.scale(cameraZoom, cameraZoom);
    context.translate(cameraPanX / cameraZoom, cameraPanY / cameraZoom);
  }
  context.strokeStyle = 'rgba(125, 164, 197, .16)';
  context.lineWidth = 1;
  for (const planet of system.planets.slice(0, discoveredCount)) {
    const orbitWidth = planet.orbitRadius * scale;
    context.beginPath();
    const orbitTilt = .66 + system.planets.indexOf(planet) * .035;
    context.ellipse(0, 0, orbitWidth, orbitWidth * orbitTilt * (1 - planet.eccentricity), 0, 0, TAU);
    context.stroke();
  }
  drawTransferPreview(time, scale);
  drawOtherFleetShips(time, scale);

  const starGlow = context.createRadialGradient(0, 0, 4, 0, 0, 80);
  starGlow.addColorStop(0, 'rgba(255, 215, 126, .32)');
  starGlow.addColorStop(.35, 'rgba(248, 155, 84, .12)');
  starGlow.addColorStop(1, 'rgba(248, 155, 84, 0)');
  context.fillStyle = starGlow;
  context.beginPath(); context.arc(0, 0, 80, 0, TAU); context.fill();
  context.fillStyle = '#ffc774';
  context.shadowColor = '#ff9f5c'; context.shadowBlur = 18;
  context.beginPath(); context.arc(0, 0, system.star.radius, 0, TAU); context.fill();
  context.shadowBlur = 0;
  context.fillStyle = '#fff1bc';
  context.beginPath(); context.arc(-7, -8, system.star.radius * .35, 0, TAU); context.fill();
  context.strokeStyle = 'rgba(255, 206, 118, .65)';
  context.beginPath(); context.moveTo(-48, 0); context.lineTo(48, 0); context.moveTo(0, -48); context.lineTo(0, 48); context.stroke();
  context.fillStyle = '#d7b67a'; context.font = '600 10px Barlow Condensed'; context.letterSpacing = '2px'; context.fillText(system.star.name.toUpperCase(), 37, -35);

  for (const planet of system.planets.slice(0, discoveredCount)) {
    const orbitSize = planet.orbitRadius * scale;
    const angle = planet.angle + (time / planet.period) * TAU;
    const x = Math.cos(angle) * orbitSize;
    const depth = (Math.sin(angle) + 1) / 2;
    const orbitTilt = .66 + planetIndexSafe(planet) * .035;
    const y = Math.sin(angle) * orbitSize * orbitTilt * (1 - planet.eccentricity);
    const depthScale = .82 + depth * .22;
    const visualRadius = planet.radius * depthScale;
    const labelSide = x >= 0 ? 1 : -1;
    const planetIndex = system.planets.indexOf(planet);
    if (planetIndex === originIndex || planetIndex === destinationIndex) {
      context.strokeStyle = planetIndex === originIndex ? '#b58cff' : '#ff91c8';
      context.lineWidth = 2;
      context.beginPath(); context.arc(x, y, visualRadius + 7, 0, TAU); context.stroke();
      context.lineWidth = 1;
    }
    context.strokeStyle = planet.color;
    context.globalAlpha = .2;
    context.beginPath(); context.moveTo(x, y); context.lineTo(x + labelSide * 12, y - 12); context.stroke();
    context.globalAlpha = 1;
    if (planet.hasRing) { context.strokeStyle = planet.color; context.globalAlpha = .55; context.lineWidth = 2; context.beginPath(); context.ellipse(x, y, visualRadius * 1.8, visualRadius * .65, -.25, 0, TAU); context.stroke(); context.lineWidth = 1; context.globalAlpha = 1; }
    const sphereGradient = context.createRadialGradient(x - visualRadius * .38, y - visualRadius * .42, visualRadius * .08, x, y, visualRadius * 1.15);
    sphereGradient.addColorStop(0, '#ffffff');
    sphereGradient.addColorStop(.18, planet.color);
    sphereGradient.addColorStop(.72, planet.color);
    sphereGradient.addColorStop(1, 'rgba(3, 8, 20, .9)');
    context.fillStyle = sphereGradient; context.shadowColor = planet.color; context.shadowBlur = 12 * depthScale;
    context.beginPath(); context.arc(x, y, visualRadius, 0, TAU); context.fill(); context.shadowBlur = 0;
    context.fillStyle = planet.color; context.font = '600 11px Barlow Condensed'; context.fillText(planet.name.toUpperCase(), x + labelSide * 16, y - 15);
    context.fillStyle = '#65758f'; context.font = '9px Barlow Condensed'; context.fillText(`${planet.orbitRadius.toFixed(2)} AU`, x + labelSide * 16, y - 4);
  }
  context.restore();
  void maxOrbit;
}

function planetIndexSafe(planet) {
  return Math.max(0, system.planets.indexOf(planet));
}

function getPlanetState(planet, time) {
  const orbitSize = planet.orbitRadius * getMapScale();
  const angle = planet.angle + (time / planet.period) * TAU;
  const tilt = .66 + planetIndexSafe(planet) * .035;
  return { angle, radius: orbitSize, x: Math.cos(angle) * orbitSize, y: Math.sin(angle) * orbitSize * tilt * (1 - planet.eccentricity) };
}

function drawTransferPreview(time, scale) {
  if (originIndex === null || destinationIndex === null) return;
  const origin = system.planets[originIndex];
  const destination = system.planets[destinationIndex];
  const activeFlight = activeFlights.find((flight) => flight.originIndex === originIndex && flight.destinationIndex === destinationIndex);
  const routeProfile = activeFlight ? missionProfiles[activeFlight.type] : getMissionProfile();
  const routeAircraftIndex = activeFlight?.aircraftIndex ?? getAvailableAircraftIndex();
  const transferDays = getTransferDays(origin, destination, routeProfile.durationMultiplier, routeAircraftIndex);
  const routeStartTime = activeFlight ? activeFlight.launchDay : time;
  const routeArrivalTime = activeFlight ? activeFlight.arrivalDay : routeStartTime + transferDays;
  const start = getPlanetState(origin, routeStartTime);
  const projectedDestination = getPlanetState(destination, routeArrivalTime);
  const outward = destination.orbitRadius > origin.orbitRadius;
  const innerRadius = Math.min(origin.orbitRadius, destination.orbitRadius) * scale;
  const outerRadius = Math.max(origin.orbitRadius, destination.orbitRadius) * scale;
  const travelDirection = outward ? 1 : -1;
  let angularSweep = normalizeAngle(projectedDestination.angle - start.angle);
  if (travelDirection > 0 && angularSweep < 0) angularSweep += TAU;
  if (travelDirection < 0 && angularSweep > 0) angularSweep -= TAU;
  if (Math.abs(angularSweep) < .05) angularSweep = travelDirection * Math.PI;
  const transferSemiMajor = (innerRadius + outerRadius) / 2;
  const transferEccentricity = (outerRadius - innerRadius) / (outerRadius + innerRadius);
  const transferPeriapsisAngle = outward ? start.angle : start.angle + Math.PI;
  const requiredAngle = start.angle + travelDirection * Math.PI;
  const requiredRadius = destination.orbitRadius * scale;
  const requiredTilt = .66 + destinationIndex * .035;
  const requiredX = Math.cos(requiredAngle) * requiredRadius;
  const requiredY = Math.sin(requiredAngle) * requiredRadius * requiredTilt;
  const phaseError = Math.abs(normalizeAngle(projectedDestination.angle - requiredAngle));
  const windowOpen = phaseError < .28;
  context.save();
  context.strokeStyle = '#a477ec';
  context.globalAlpha = windowOpen ? 1 : Math.max(.48, 1 - phaseError / Math.PI * .35);
  context.setLineDash([]);
  context.lineWidth = 2.25;
  context.beginPath();
  for (let step = 0; step <= 70; step += 1) {
    const progress = step / 70;
    const angle = start.angle + angularSweep * progress;
    const easedProgress = progress * progress * (3 - 2 * progress);
    const radius = innerRadius + (outerRadius - innerRadius) * (outward ? easedProgress : 1 - easedProgress);
    const startTilt = .66 + originIndex * .035;
    const destinationTilt = .66 + destinationIndex * .035;
    const tilt = startTilt + (destinationTilt - startTilt) * progress;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * tilt;
    if (step === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.stroke();
  context.setLineDash([]);
  drawVelocityVector(start.x, start.y, start.angle, '#a477ec');
  drawVelocityVector(projectedDestination.x, projectedDestination.y, projectedDestination.angle, '#ffbd69');
  context.strokeStyle = '#ffbd69';
  context.beginPath(); context.arc(projectedDestination.x, projectedDestination.y, 7, 0, TAU); context.stroke();
  if (!windowOpen && !activeFlight) {
    context.save();
    context.strokeStyle = '#ffffff';
    context.fillStyle = '#ffffff';
    context.globalAlpha = .82;
    context.setLineDash([4, 5]);
    context.lineWidth = 1.5;
    const correctionRadius = (requiredRadius + start.radius) / 2;
    const correctionEccentricity = Math.abs(requiredRadius - start.radius) / (requiredRadius + start.radius);
    const correctionSweep = travelDirection * Math.PI;
    const correctionStartTilt = .66 + originIndex * .035;
    context.beginPath();
    for (let step = 0; step <= 30; step += 1) {
      const progress = step / 30;
      const angle = start.angle + correctionSweep * progress;
      const orbitalRadius = correctionRadius * (1 - correctionEccentricity * correctionEccentricity) / (1 + correctionEccentricity * travelDirection * Math.cos(angle - start.angle));
      const correctionTilt = correctionStartTilt + (requiredTilt - correctionStartTilt) * progress;
      const curveX = Math.cos(angle) * orbitalRadius;
      const curveY = Math.sin(angle) * orbitalRadius * correctionTilt;
      if (step === 0) context.moveTo(curveX, curveY); else context.lineTo(curveX, curveY);
    }
    context.stroke();
    context.setLineDash([]);
    context.beginPath(); context.arc(requiredX, requiredY, 8, 0, TAU); context.stroke();
    context.beginPath(); context.arc(requiredX, requiredY, 2.5, 0, TAU); context.fill();
    context.restore();
  }
  if (activeFlight) {
    const progress = Math.min(1, (simulationDays - activeFlight.launchDay) / (activeFlight.arrivalDay - activeFlight.launchDay));
    const shipAngle = start.angle + angularSweep * progress;
    const easedProgress = progress * progress * (3 - 2 * progress);
    const shipRadius = innerRadius + (outerRadius - innerRadius) * (outward ? easedProgress : 1 - easedProgress);
    const startTilt = .66 + originIndex * .035;
    const destinationTilt = .66 + destinationIndex * .035;
    const shipTilt = startTilt + (destinationTilt - startTilt) * progress;
    const shipX = Math.cos(shipAngle) * shipRadius;
    const shipY = Math.sin(shipAngle) * shipRadius * shipTilt;
    drawSpacecraft(shipX, shipY, shipAngle, '#e4c7ff', progress, shipRadius, startTilt, destinationTilt, angularSweep >= 0 ? 1 : -1);
  }
  context.restore();
}

function drawOtherFleetShips(time, scale) {
  activeFlights.forEach((flight) => {
    if (flight.originIndex === originIndex && flight.destinationIndex === destinationIndex) return;
    const origin = system.planets[flight.originIndex];
    const destination = system.planets[flight.destinationIndex];
    if (!origin || !destination) return;
    const start = getPlanetState(origin, flight.launchDay);
    const target = getPlanetState(destination, flight.arrivalDay);
    const progress = Math.min(1, Math.max(0, (simulationDays - flight.launchDay) / (flight.arrivalDay - flight.launchDay)));
    const outward = destination.orbitRadius > origin.orbitRadius;
    const radius = Math.min(origin.orbitRadius, destination.orbitRadius) * scale + (Math.max(origin.orbitRadius, destination.orbitRadius) - Math.min(origin.orbitRadius, destination.orbitRadius)) * scale * progress;
    const travelDirection = destination.orbitRadius > origin.orbitRadius ? 1 : -1;
    const angle = start.angle + travelDirection * Math.PI * progress;
    const tilt = (.66 + flight.originIndex * .035) + ((.66 + flight.destinationIndex * .035) - (.66 + flight.originIndex * .035)) * progress;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * tilt;
    drawSpacecraft(x, y, angle, outward ? '#b58cff' : '#e4c7ff', progress, radius, .66 + flight.originIndex * .035, .66 + flight.destinationIndex * .035, travelDirection);
  });
}

function drawSpacecraft(x, y, angle, color, progress, radius, startTilt, destinationTilt, travelDirection = 1) {
  context.save();
  context.fillStyle = '#ffffff';
  context.shadowColor = '#ffffff';
  context.shadowBlur = 8;
  context.beginPath();
  context.arc(x, y, 2.5, 0, TAU);
  context.fill();
  context.shadowBlur = 0;
  context.restore();
}

function drawVelocityVector(x, y, angle, color) {
  const length = 25;
  const endX = x - Math.sin(angle) * length;
  const endY = y + Math.cos(angle) * length;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1.5;
  context.beginPath(); context.moveTo(x, y); context.lineTo(endX, endY); context.stroke();
  context.beginPath(); context.moveTo(endX, endY); context.lineTo(endX - 4, endY - 3); context.lineTo(endX - 2, endY + 4); context.closePath(); context.fill();
}

function updateInterface() {
  document.getElementById('seedDisplay').textContent = `SEED: ${seed}`;
  document.getElementById('planetCount').textContent = `${discoveredCount} WORLDS DISCOVERED`;
  const completedMissions = progressionStats.completions;
  const missionsToNextDiscovery = Math.max(0, nextDiscoveryCompletion - completedMissions);
  const previousDiscoveryTarget = discoveredCount <= 2 ? 0 : Math.max(0, nextDiscoveryCompletion - Math.ceil(Math.pow(1.45, discoveredCount - 2)));
  const discoverySpan = Math.max(1, nextDiscoveryCompletion - previousDiscoveryTarget);
  const discoveryProgress = Math.min(100, Math.max(0, ((completedMissions - previousDiscoveryTarget) / discoverySpan) * 100));
  document.getElementById('discoverySummary').textContent = missionsToNextDiscovery === 0 ? 'New frontier world ready to chart' : `${missionsToNextDiscovery} mission${missionsToNextDiscovery === 1 ? '' : 's'} until the next world`;
  document.getElementById('discoveryFill').style.width = `${discoveryProgress}%`;
  document.getElementById('discoveryProgress').textContent = missionsToNextDiscovery === 0 ? 'DISCOVERY READY' : `${completedMissions} COMPLETED / ${nextDiscoveryCompletion} REQUIRED`;
  document.getElementById('starName').textContent = system.star.name;
  document.getElementById('starType').textContent = system.star.type;
  document.getElementById('planetList').innerHTML = system.planets.slice(0, discoveredCount).map((planet, index) => `<button class="planet-item ${index === originIndex || index === destinationIndex ? 'is-selected' : ''}" type="button" data-planet-index="${index}"><span class="planet-swatch" style="color:${planet.color};background:${planet.color}"></span><b>${planet.name}</b><span class="planet-distance">${planet.orbitRadius.toFixed(2)} AU</span></button>`).join('');
  document.querySelectorAll('.planet-item').forEach((button) => button.addEventListener('click', () => selectPlanet(Number(button.dataset.planetIndex))));
  renderMissionOffers();
  updateSelectionReadout();
}

function renderMissionOffers() {
  const offers = document.getElementById('missionOffers');
  const missionOffers = getMissionOffers();
  offers.innerHTML = missionOffers.map((offer, index) => `<button class="mission-offer ${offer.origin === originIndex && offer.destination === destinationIndex && offer.type === missionType ? 'is-accepted' : ''}" type="button" data-offer-index="${index}" ${mission.status !== 'idle' ? 'disabled' : ''}><span class="offer-route">${system.planets[offer.origin].name} > ${system.planets[offer.destination].name}</span><span class="offer-type">${missionProfiles[offer.type].label}</span><span class="offer-detail">${offer.brief} / ${offer.cargoUnits} T / ${offer.deadline} D</span><span class="offer-reward">${offer.reward.toLocaleString()} CR</span></button>`).join('');
  document.querySelectorAll('.mission-offer').forEach((button) => button.addEventListener('click', () => acceptMissionOffer(Number(button.dataset.offerIndex))));
}

function acceptMissionOffer(index) {
  const offer = getMissionOffers()[index];
  if (!offer || mission.status !== 'idle') return;
  missionType = offer.type;
  activeContract = offer;
  originIndex = offer.origin;
  destinationIndex = offer.destination;
  focusOnPlanet(destinationIndex);
  document.getElementById('missionType').value = missionType;
  addLog(`Contract accepted: ${system.planets[originIndex].name} to ${system.planets[destinationIndex].name}.`);
  updateInterface();
  saveProgress();
}
function isAcceptedContractRoute() {
  return Boolean(activeContract && activeContract.origin === originIndex && activeContract.destination === destinationIndex && activeContract.type === missionType);
}

function selectPlanet(index) {
  if (originIndex === null || destinationIndex !== null) {
    originIndex = index;
    destinationIndex = null;
  } else if (index !== originIndex) {
    destinationIndex = index;
  }
  activeContract = null;
  focusOnPlanet(index);
    document.getElementById('routeHint').textContent = destinationIndex === null ? (originIndex === null ? 'Choose a contract or select an origin world to begin.' : 'Select a destination world to complete the route.') : isAcceptedContractRoute() ? `${activeContract?.brief || getMissionProfile().objective}. Check the window, then launch.` : 'Preview only. Accept a matching contract to authorize launch.';
  updateInterface();
  saveProgress();
}

function updateSelectionReadout() {
  const selectedIndex = destinationIndex ?? originIndex;
  const selectedPlanet = selectedIndex === null ? null : system.planets[selectedIndex];
  document.getElementById('selectionReadout').innerHTML = selectedPlanet ? `<span class="selection-name">${selectedPlanet.name}</span><span class="selection-meta">${selectedPlanet.resource} / ${selectedPlanet.facility}</span><span class="selection-meta">ORBIT ${selectedPlanet.orbitRadius.toFixed(2)} AU / MARKET ${selectedPlanet.marketPrice} CR</span>` : '<span class="selection-empty">CLICK A WORLD TO INSPECT</span>';
  const hasRoute = originIndex !== null && destinationIndex !== null;
  const flight = hasRoute ? activeFlights.find((activeFlight) => activeFlight.originIndex === originIndex && activeFlight.destinationIndex === destinationIndex) : null;
  const state = mission.status === 'preparing' ? 'PREPARING' : flight ? 'IN TRANSIT' : mission.status === 'complete' ? 'COMPLETE' : hasRoute ? 'CHECK WINDOW' : 'READY';
  document.getElementById('missionState').textContent = state;
  document.getElementById('routeTitle').textContent = destinationIndex === null ? (originIndex === null ? 'Awaiting your first route' : 'Choose a destination') : `${system.planets[originIndex].name} route ready`;
  document.getElementById('routeHint').textContent = destinationIndex === null ? (originIndex === null ? 'Choose a contract or select an origin world to begin.' : 'Select a destination world to complete the route.') : `${activeContract?.brief || getMissionProfile().objective}. Check the window, then launch.`;
  const meta = document.getElementById('contractMeta');
  if (hasRoute) {
    const profile = activeContract ? missionProfiles[activeContract.type] : getMissionProfile();
    meta.innerHTML = `<span>${profile.label}</span><span><strong>${activeContract?.cargoUnits || '--'} T</strong> CARGO</span><span><strong>${activeContract?.deadline || '--'} D</strong> DEADLINE</span>`;
    meta.classList.remove('is-hidden');
  } else {
    meta.innerHTML = '';
    meta.classList.add('is-hidden');
  }
  document.getElementById('originRouteName').textContent = originIndex === null ? 'ORIGIN' : system.planets[originIndex].name.toUpperCase();
  document.getElementById('destinationRouteName').textContent = destinationIndex === null ? 'DESTINATION' : system.planets[destinationIndex].name.toUpperCase();
  document.getElementById('originRouteNode').classList.toggle('is-set', originIndex !== null);
  document.getElementById('destinationRouteNode').classList.toggle('is-set', destinationIndex !== null);
  updateRoutePreview();
}

function updateRoutePreview() {
  const readout = document.getElementById('routeReadout');
  if (originIndex === null || destinationIndex === null) {
    readout.innerHTML = '<span class="selection-empty">SELECT TWO WORLDS TO PLOT</span>';
    updateMissionControls();
    updateRouteTracker();
    return;
  }
  const origin = system.planets[originIndex];
  const destination = system.planets[destinationIndex];
  const originRadius = origin.orbitRadius;
  const destinationRadius = destination.orbitRadius;
  const semiMajorAxis = (originRadius + destinationRadius) / 2;
  const transferDays = getTransferDays(origin, destination, getMissionProfile().durationMultiplier);
  const circularOriginVelocity = 29.78 / Math.sqrt(originRadius);
  const circularDestinationVelocity = 29.78 / Math.sqrt(destinationRadius);
  const transferOriginVelocity = circularOriginVelocity * Math.sqrt((2 * destinationRadius) / (originRadius + destinationRadius));
  const transferDestinationVelocity = circularDestinationVelocity * Math.sqrt((2 * originRadius) / (originRadius + destinationRadius));
  const deltaV = Math.abs(transferOriginVelocity - circularOriginVelocity) + Math.abs(circularDestinationVelocity - transferDestinationVelocity);
  const baseFuelUnits = Math.max(1, Math.round(deltaV * 4.5));
  const fuelUnits = Math.max(1, Math.ceil(baseFuelUnits * getMissionProfile().fuelMultiplier / (1 + navUpgradeLevel * .12)));
  const originState = getPlanetState(origin, simulationDays);
  const destinationState = getPlanetState(destination, simulationDays);
  const outward = destinationRadius > originRadius;
  const requiredArrivalAngle = originState.angle + (outward ? Math.PI : -Math.PI);
  const projectedDestinationAngle = destinationState.angle + (transferDays / destination.period) * TAU;
  const phaseError = Math.abs(normalizeAngle(projectedDestinationAngle - requiredArrivalAngle));
  const interceptReady = phaseError < .28;
  const nextWindowDays = interceptReady ? 0 : getNextWindowDays(origin, destination, transferDays, simulationDays);
  const activeFlight = activeFlights.find((flight) => flight.originIndex === originIndex && flight.destinationIndex === destinationIndex);
  const status = mission.status === 'preparing' ? `PREPARING / DEPARTURE IN ${Math.max(0, Math.ceil(mission.prepRemaining))} SECONDS` : activeFlight ? `IN TRANSIT / ARRIVAL IN ${Math.max(0, Math.ceil(activeFlight.arrivalDay - simulationDays))} DAYS` : mission.status === 'complete' ? `${getMissionProfile().label} COMPLETE / REWARD RECEIVED` : !isAcceptedContractRoute() ? 'PREVIEW ONLY / ACCEPT A MATCHING CONTRACT TO LAUNCH' : interceptReady ? 'WINDOW OPEN / INTERCEPT PREDICTED' : `WINDOW CLOSED / ERROR ${(phaseError * 180 / Math.PI).toFixed(0)} DEG / OPENS IN ${nextWindowDays ?? '--'} DAYS`;
  const canLaunch = isAcceptedContractRoute() && interceptReady && fuel >= fuelUnits && mission.status === 'idle' && activeFlights.length < fleetSize;
  document.getElementById('missionState').textContent = mission.status === 'preparing' ? 'PREPARING' : activeFlight ? 'IN TRANSIT' : mission.status === 'complete' ? 'COMPLETE' : canLaunch ? 'ROUTE READY' : activeFlights.length >= fleetSize ? 'FLEET FULL' : 'WAITING FOR WINDOW';
  readout.innerHTML = `<div class="route-metric"><span>TRANSFER TIME</span><strong>${Math.round(transferDays)} D</strong></div><div class="route-metric"><span>DELTA-V</span><strong>${deltaV.toFixed(2)} KM/S</strong></div><div class="route-metric"><span>${getMissionProfile().label} FUEL</span><strong>${fuelUnits} UNITS</strong></div><div class="route-metric"><span>ARRIVAL WINDOW</span><strong>${(phaseError * 180 / Math.PI).toFixed(0)} DEG</strong></div><span class="route-status">${status}</span>`;
  updateMissionControls({ transferDays, fuelUnits, interceptReady, phaseError });
  updateRouteTracker({ transferDays, phaseError, nextWindowDays });
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function getNextWindowDays(origin, destination, transferDays, currentDays) {
  const maxSearchDays = Math.min(20000, Math.max(365, origin.period * destination.period));
  for (let waitDays = 1; waitDays <= maxSearchDays; waitDays += 1) {
    const originState = getPlanetState(origin, currentDays + waitDays);
    const destinationState = getPlanetState(destination, currentDays + waitDays);
    const requiredAngle = originState.angle + (destination.orbitRadius > origin.orbitRadius ? Math.PI : -Math.PI);
    const projectedAngle = destinationState.angle + (transferDays / destination.period) * TAU;
    if (Math.abs(normalizeAngle(projectedAngle - requiredAngle)) < .28) return waitDays;
  }
  return null;
}

function updateMissionControls(route = null) {
  const waitButton = document.getElementById('waitButton');
  const launchButton = document.getElementById('launchButton');
  const hasRoute = originIndex !== null && destinationIndex !== null;
  waitButton.disabled = !hasRoute || mission.status === 'preparing' || mission.status === 'complete' || credits < getTimeSkipCost();
  waitButton.textContent = `WAIT 30 D / ${getTimeSkipCost().toLocaleString()} CR`;
  launchButton.disabled = !route?.interceptReady || !isAcceptedContractRoute() || fuel < (route?.fuelUnits ?? Infinity) || mission.status !== 'idle' || activeFlights.length >= fleetSize;
  launchButton.textContent = mission.status === 'preparing' ? `PREP ${Math.ceil(mission.prepRemaining)}S` : activeFlights.length >= fleetSize ? 'FLEET FULL' : 'LAUNCH';
}

function updateRouteTracker(route = null) {
  const tracker = document.getElementById('routeTracker');
  if (!route || originIndex === null || destinationIndex === null) {
    tracker.classList.add('is-hidden');
    return;
  }
  tracker.classList.remove('is-hidden');
  const preparing = mission.status === 'preparing';
  const activeFlight = originIndex === null || destinationIndex === null ? null : activeFlights.find((flight) => flight.originIndex === originIndex && flight.destinationIndex === destinationIndex);
  const inTransit = Boolean(activeFlight);
  const complete = mission.status === 'complete';
  const progress = complete ? 100 : preparing ? Math.min(100, Math.max(0, ((10 - mission.prepRemaining) / 10) * 100)) : inTransit ? Math.min(100, Math.max(0, ((simulationDays - activeFlight.launchDay) / (activeFlight.arrivalDay - activeFlight.launchDay)) * 100)) : 0;
  document.getElementById('trackerStatus').textContent = complete ? 'DELIVERED' : preparing ? 'PREPARING' : inTransit ? 'IN TRANSIT' : 'PLANNING';
  document.getElementById('trackerRoute').textContent = `${system.planets[originIndex].name.toUpperCase()}  >  ${system.planets[destinationIndex].name.toUpperCase()}`;
  document.getElementById('trackerProgressFill').style.width = `${progress}%`;
  const remainingDays = inTransit ? Math.max(0, activeFlight.arrivalDay - simulationDays) : route.transferDays;
  document.getElementById('trackerEta').textContent = complete ? 'COMPLETE' : preparing ? `T-${Math.max(0, Math.ceil(mission.prepRemaining))}S` : formatRealEta(remainingDays);
  document.getElementById('trackerProgress').textContent = `${Math.round(progress)}%`;
  document.getElementById('trackerWindow').textContent = preparing || inTransit || complete ? 'LOCKED' : route.nextWindowDays ? `OPENS ${route.nextWindowDays} D` : 'OPEN';
}

function formatRealEta(simulationDaysRemaining) {
  if (!isPlaying) return 'PAUSED';
  const totalSeconds = Math.max(0, Math.ceil(simulationDaysRemaining / simulationSpeed));
  if (totalSeconds < 60) return `${totalSeconds}S REAL`;
  const totalMinutes = Math.ceil(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}M REAL`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}H ${minutes}M REAL` : `${hours}H REAL`;
}

function launchMission() {
  if (originIndex === null || destinationIndex === null || mission.status !== 'idle' || !isAcceptedContractRoute()) return;
  mission = { status: 'preparing', prepRemaining: 10, launchDay: 0, arrivalDay: 0, fuelCost: 0, reward: 0, type: missionType };
  addLog(`Launch preparation started for ${system.planets[originIndex].name} to ${system.planets[destinationIndex].name}.`);
  updateMissionUI();
  saveProgress();
}

function beginMissionFlight() {
  if (originIndex === null || destinationIndex === null || mission.status !== 'preparing') return;
  const origin = system.planets[originIndex];
  const destination = system.planets[destinationIndex];
  const aircraftIndex = getAvailableAircraftIndex();
  const transferDays = getTransferDays(origin, destination, getMissionProfile().durationMultiplier, aircraftIndex);
  const deltaV = Math.abs((29.78 / Math.sqrt(origin.orbitRadius)) * Math.sqrt((2 * destination.orbitRadius) / (origin.orbitRadius + destination.orbitRadius)) - 29.78 / Math.sqrt(origin.orbitRadius)) + Math.abs(29.78 / Math.sqrt(destination.orbitRadius) - (29.78 / Math.sqrt(destination.orbitRadius)) * Math.sqrt((2 * origin.orbitRadius) / (origin.orbitRadius + destination.orbitRadius)));
  const baseFuelCost = Math.max(1, Math.round(deltaV * 4.5));
  const fuelCost = Math.max(1, Math.ceil(baseFuelCost * getMissionProfile().fuelMultiplier / (1 + navUpgradeLevel * .12)));
  fuel -= fuelCost;
  const reward = Math.max(500, Math.round((4000 - transferDays * 1.2) * getMissionProfile().reward * getMarketReward(destination, getMissionProfile()) * getRewardMultiplier()));
  activeFlights.push({ originIndex, destinationIndex, aircraftIndex, type: missionType, launchDay: simulationDays, arrivalDay: simulationDays + transferDays, fuelCost, reward });
  mission = { status: 'idle', launchDay: 0, arrivalDay: 0, fuelCost: 0, reward: 0 };
  addLog(`Ship departed on ${getMissionProfile().label.toLowerCase()} route.`);
  progressionStats.launches += 1;
  if (!progressionStats.contractTypes.includes(missionType)) progressionStats.contractTypes.push(missionType);
  checkObjectives();
  updateMissionUI();
  saveProgress();
}

function updateMissionUI() {
  document.getElementById('fleetDisplay').innerHTML = `${activeFlights.length + (mission.status === 'preparing' ? 1 : 0)} / ${fleetSize} <small>CRAFT</small>`;
  document.getElementById('creditsDisplay').innerHTML = `${credits.toLocaleString()} <small>CR</small>`;
  document.getElementById('fuelDisplay').innerHTML = `${fuel} <small>/ ${getFuelCapacity()} UNITS</small>`;
  document.getElementById('upgradeBudget').textContent = `${credits.toLocaleString()} CR`;
  const navButton = document.getElementById('navUpgradeButton');
  const tankButton = document.getElementById('tankUpgradeButton');
  const cargoButton = document.getElementById('cargoUpgradeButton');
  const chronoButton = document.getElementById('chronoUpgradeButton');
  updateUpgradeButton(navButton, 'nav', navUpgradeLevel);
  updateUpgradeButton(tankButton, 'tank', tankUpgradeLevel);
  updateUpgradeButton(cargoButton, 'cargo', cargoUpgradeLevel);
  updateUpgradeButton(chronoButton, 'chrono', chronoUpgradeLevel);
  renderFleetView();
  document.querySelectorAll('.speed-button').forEach((button) => {
    const speed = Number(button.dataset.speed);
    button.disabled = speed > getMaximumSpeed();
    button.classList.toggle('is-active', speed === simulationSpeed);
  });
  updateProgressionUI();
  renderMissionOffers();
  updateRoutePreview();
}

function renderFleetView() {
  const cards = document.getElementById('fleetCards');
  cards.innerHTML = Array.from({ length: fleetSize }, (_, index) => {
    const flight = activeFlights.find((activeFlight) => activeFlight.aircraftIndex === index);
    const level = aircraftUpgradeLevels[index] || 0;
    const upgradeCost = getAircraftUpgradeCost(index);
    return `<div class="fleet-card"><strong>ASTERLINE-${String(index + 1).padStart(2, '0')}</strong><small>${flight ? `${system.planets[flight.originIndex]?.name || 'ORIGIN'} > ${system.planets[flight.destinationIndex]?.name || 'DESTINATION'}` : 'AVAILABLE FOR CONTRACT'}</small><b>${flight ? 'ACTIVE' : 'READY'}</b><span class="ship-upgrade-line">SPEED LVL ${level} <button class="ship-upgrade-button" type="button" data-aircraft-index="${index}" ${credits < upgradeCost ? 'disabled' : ''}>UPGRADE ${upgradeCost.toLocaleString()} CR</button></span></div>`;
  }).join('');
  document.querySelectorAll('.ship-upgrade-button').forEach((button) => button.addEventListener('click', () => upgradeAircraft(Number(button.dataset.aircraftIndex))));
  const cost = getAircraftCost();
  const buyButton = document.getElementById('buyAircraftButton');
  buyButton.textContent = fleetSize >= 8 ? 'FLEET MAXIMUM' : `ADD AIRCRAFT / ${cost.toLocaleString()} CR`;
  buyButton.disabled = fleetSize >= 8 || credits < cost;
  document.getElementById('fleetCapacityText').textContent = `${activeFlights.length} / ${fleetSize} ACTIVE SLOTS`;
}

function upgradeAircraft(index) {
  if (index < 0 || index >= fleetSize) return;
  const cost = getAircraftUpgradeCost(index);
  if (credits < cost) return;
  credits -= cost;
  aircraftUpgradeLevels[index] = (aircraftUpgradeLevels[index] || 0) + 1;
  addLog(`Aircraft ASTERLINE-${String(index + 1).padStart(2, '0')} upgraded to speed level ${aircraftUpgradeLevels[index]}.`);
  updateMissionUI();
  saveProgress();
}

function setIntelTab(tab) {
  const fleetMode = tab === 'fleet';
  document.querySelector('.intel-panel').classList.toggle('fleet-mode', fleetMode);
  document.getElementById('fleetView').classList.toggle('is-hidden', !fleetMode);
  document.getElementById('systemTab').classList.toggle('is-active', !fleetMode);
  document.getElementById('fleetTab').classList.toggle('is-active', fleetMode);
  document.getElementById('intelTitle').textContent = fleetMode ? 'Fleet Command' : 'System Scan';
}

function updateUpgradeButton(button, type, level) {
  const config = upgradeConfig[type];
  const cost = getUpgradeCost(type);
  const locked = companyRank < config.rank;
  const maxed = level >= config.max;
  const label = maxed ? 'MAX' : locked ? `RANK ${config.rank}` : `${cost.toLocaleString()} CR`;
  button.querySelector('em').textContent = `LVL ${level}`;
  button.querySelector('strong').textContent = label;
  button.disabled = maxed || locked || credits < cost;
}

function saveProgress() {
  localStorage.setItem('helios-dispatch-save', JSON.stringify({ seed, simulationDays, credits, fuel, mission, activeFlights, fleetSize, aircraftUpgradeLevels, activeContract, missionType, discoveredCount, nextDiscoveryCompletion, navUpgradeLevel, tankUpgradeLevel, cargoUpgradeLevel, chronoUpgradeLevel, originIndex, destinationIndex, companyRank, companyXp, completedObjectives, progressionStats, commandLog }));
  document.getElementById('saveStatus').textContent = 'LOCAL SAVE / JUST UPDATED';
}

function loadProgress() {
  const saved = localStorage.getItem('helios-dispatch-save');
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    if (data.seed !== seed) return;
    simulationDays = Number(data.simulationDays) || 0;
    credits = Number.isFinite(Number(data.credits)) ? Number(data.credits) : 0;
    fuel = Number(data.fuel) || 100;
    mission = data.mission || mission;
    activeContract = data.activeContract || null;
    activeFlights = Array.isArray(data.activeFlights) ? data.activeFlights : [];
    fleetSize = Math.max(1, Math.min(8, Number(data.fleetSize) || 1));
    aircraftUpgradeLevels = Array.isArray(data.aircraftUpgradeLevels) ? data.aircraftUpgradeLevels.slice(0, fleetSize).map((level) => Math.max(0, Number(level) || 0)) : Array(fleetSize).fill(0);
    while (aircraftUpgradeLevels.length < fleetSize) aircraftUpgradeLevels.push(0);
    activeFlights.forEach((flight, index) => { if (!Number.isInteger(flight.aircraftIndex)) flight.aircraftIndex = index % fleetSize; });
    if (activeFlights.length === 0 && data.mission?.status === 'launched') activeFlights.push({ ...data.mission, originIndex: data.originIndex, destinationIndex: data.destinationIndex, type: data.mission.type || data.missionType || 'delivery' });
    missionType = missionProfiles[data.missionType] ? data.missionType : 'delivery';
    discoveredCount = Number.isInteger(data.discoveredCount) ? Math.max(2, data.discoveredCount) : 8;
    ensurePlanets(discoveredCount);
    nextDiscoveryCompletion = Math.max(Number(data.nextDiscoveryCompletion) || (Number(data.progressionStats?.completions) || 0) + 1, 1);
    navUpgradeLevel = Math.min(3, Number(data.navUpgradeLevel) || 0);
    tankUpgradeLevel = Math.min(3, Number(data.tankUpgradeLevel) || 0);
    cargoUpgradeLevel = Math.min(4, Number(data.cargoUpgradeLevel) || 0);
    chronoUpgradeLevel = Math.min(2, Number(data.chronoUpgradeLevel) || 0);
    companyRank = Math.max(1, Number(data.companyRank) || 1);
    companyXp = Math.max(0, Number(data.companyXp) || 0);
    completedObjectives = Array.isArray(data.completedObjectives) ? data.completedObjectives : [];
    progressionStats = { ...progressionStats, ...(data.progressionStats || {}) };
    commandLog = Array.isArray(data.commandLog) ? data.commandLog.slice(0, 7) : [];
    originIndex = Number.isInteger(data.originIndex) ? data.originIndex : null;
    destinationIndex = Number.isInteger(data.destinationIndex) ? data.destinationIndex : null;
    if (originIndex !== null && originIndex >= discoveredCount) originIndex = null;
    if (destinationIndex !== null && destinationIndex >= discoveredCount) destinationIndex = null;
    fuel = Math.min(fuel, getFuelCapacity());
  } catch (error) {
    localStorage.removeItem('helios-dispatch-save');
  }
}

function resetGameState() {
  localStorage.removeItem('helios-dispatch-save');
  simulationDays = 0;
  simulationSpeed = 1;
  isPlaying = true;
  originIndex = null;
  destinationIndex = null;
  discoveredCount = 2;
  nextDiscoveryCompletion = 1;
  credits = 0;
  fuel = 100;
  mission = { status: 'idle', launchDay: 0, arrivalDay: 0, fuelCost: 0, reward: 0 };
  activeFlights = [];
  fleetSize = 1;
  aircraftUpgradeLevels = [0];
  missionType = 'delivery';
  activeContract = null;
  navUpgradeLevel = 0;
  tankUpgradeLevel = 0;
  cargoUpgradeLevel = 0;
  chronoUpgradeLevel = 0;
  companyRank = 1;
  companyXp = 0;
  completedObjectives = [];
  progressionStats = { launches: 0, completions: 0, upgrades: 0, discoveries: 0, contractTypes: [] };
  commandLog = [];
  cameraZoom = 1;
  cameraFocusIndex = null;
  cameraPanX = 0;
  cameraPanY = 0;
  updateInterface();
  updateMissionUI();
  updateZoomControl();
  renderCommandLog();
}

function enterGame() {
  document.getElementById('landingScreen').classList.add('is-hidden');
  document.getElementById('gameApp').classList.remove('app-hidden');
}

function returnHome() {
  saveProgress();
  document.getElementById('gameApp').classList.add('app-hidden');
  document.getElementById('landingScreen').classList.remove('is-hidden');
  document.getElementById('tutorialOverlay').classList.add('is-hidden');
  refreshSaveManager();
}

const tutorialSteps = [
  { title: 'Accept a contract', text: 'Start with the contract board. Each offer names an origin, destination, mission type, and reward.', icon: '01' },
  { title: 'Explore the frontier', text: 'Drag the map to explore. New Command begins with two known worlds, and each completed route reveals another.', icon: '02' },
  { title: 'Wait, prepare, launch', text: 'Wait for a launch window, then launch. A ten-second preparation phase begins before your automated ship departs.', icon: '03' },
];
let tutorialStep = 0;

function showTutorial() {
  if (localStorage.getItem('helios-dispatch-tutorial-seen')) return;
  tutorialStep = 0;
  updateTutorial();
  document.getElementById('tutorialOverlay').classList.remove('is-hidden');
}

function updateTutorial() {
  const step = tutorialSteps[tutorialStep];
  document.getElementById('tutorialStepLabel').textContent = `${String(tutorialStep + 1).padStart(2, '0')} / ${tutorialSteps.length}`;
  document.getElementById('tutorialIcon').textContent = step.icon;
  document.getElementById('tutorialTitle').textContent = step.title;
  document.getElementById('tutorialText').textContent = step.text;
  document.querySelectorAll('.tutorial-dots i').forEach((dot, index) => dot.classList.toggle('is-active', index === tutorialStep));
  document.getElementById('tutorialNext').textContent = tutorialStep === tutorialSteps.length - 1 ? 'ENTER COMMAND' : 'NEXT';
}

function closeTutorial() {
  localStorage.setItem('helios-dispatch-tutorial-seen', '1');
  document.getElementById('tutorialOverlay').classList.add('is-hidden');
}

function refreshSaveManager() {
  const saveSlot = document.getElementById('saveSlot');
  const continueButton = document.getElementById('continueButton');
  const saved = localStorage.getItem('helios-dispatch-save');
  continueButton.disabled = !saved;
  if (!saved) {
    saveSlot.innerHTML = '<div class="save-slot-empty">NO COMMAND PROFILE FOUND</div>';
    return;
  }
  try {
    const data = JSON.parse(saved);
    const missionLabel = data.mission?.status === 'launched' ? 'IN TRANSIT' : data.mission?.status === 'complete' ? 'MISSION COMPLETE' : 'STANDBY';
    saveSlot.innerHTML = `<div class="save-slot-card"><div><strong>LOCAL COMMAND PROFILE</strong><small>RANK ${String(data.companyRank || 1).padStart(2, '0')} / ${(data.credits || 0).toLocaleString()} CR / ${missionLabel}</small></div><button id="deleteSaveButton" class="delete-save-button" type="button">DELETE</button></div>`;
    document.getElementById('deleteSaveButton').addEventListener('click', () => { localStorage.removeItem('helios-dispatch-save'); refreshSaveManager(); });
  } catch (error) {
    localStorage.removeItem('helios-dispatch-save');
    refreshSaveManager();
  }
}

function initializeStartScreen() {
  setTimeout(() => {
    document.getElementById('loadingScreen').classList.add('is-hidden');
    document.getElementById('landingScreen').classList.remove('is-hidden');
    refreshSaveManager();
  }, 2000);
}

function getPlanetPosition(planet, time) {
  const centerX = width * .52;
  const centerY = height * .53;
  const scale = getMapScale();
  const angle = planet.angle + (time / planet.period) * TAU;
  const tilt = .66 + planetIndexSafe(planet) * .035;
  return { x: centerX + Math.cos(angle) * planet.orbitRadius * scale, y: centerY + Math.sin(angle) * planet.orbitRadius * scale * tilt * (1 - planet.eccentricity) };
}

function focusOnPlanet(index) {
  cameraFocusIndex = index;
  cameraPanX = 0;
  cameraPanY = 0;
  cameraZoom = Math.max(cameraZoom, 1.45);
  updateZoomControl();
}

function setZoom(nextZoom) {
  cameraZoom = Math.max(.75, Math.min(3.2, nextZoom));
  updateZoomControl();
}

function updateZoomControl() {
  document.getElementById('zoomReset').textContent = `${cameraZoom.toFixed(1)}x`;
}

function getScreenPlanetPosition(planet, time) {
  const state = getPlanetState(planet, time);
  let focusX = 0;
  let focusY = 0;
  if (cameraFocusIndex !== null) {
    const focus = getPlanetState(system.planets[cameraFocusIndex], time);
    focusX = focus.x;
    focusY = focus.y;
  }
  return { x: width * .52 + (state.x - focusX) * cameraZoom + cameraPanX, y: height * .53 + (state.y - focusY) * cameraZoom + cameraPanY };
}

function render(now) {
  const delta = Math.min((now - lastFrame) / 1000, .1);
  lastFrame = now;
  let fuelChanged = false;
  if (isPlaying) {
    const elapsedDays = delta * simulationSpeed;
    simulationDays += elapsedDays;
    fuelChanged = rechargeFuel(elapsedDays);
  }
  drawLandingScene(now);
  if (mission.status === 'preparing') {
    const previousSecond = Math.ceil(mission.prepRemaining);
    mission.prepRemaining -= delta;
    if (mission.prepRemaining <= 0) beginMissionFlight();
    else if (Math.ceil(mission.prepRemaining) !== previousSecond) updateMissionUI();
  }
  context.clearRect(0, 0, width, height);
  drawBackground();
  drawStars();
  drawSystem(simulationDays);
  const arrivedFlights = activeFlights.filter((flight) => simulationDays >= flight.arrivalDay);
  if (arrivedFlights.length) {
    arrivedFlights.forEach((flight) => {
      credits += flight.reward;
      addLog(`${missionProfiles[flight.type].label} mission complete. ${flight.reward.toLocaleString()} CR received.`);
      progressionStats.completions += 1;
      if (progressionStats.completions >= nextDiscoveryCompletion) {
        ensurePlanets(discoveredCount + 1);
        discoveredCount += 1;
        nextDiscoveryCompletion += Math.ceil(Math.pow(1.45, discoveredCount - 2));
        progressionStats.discoveries += 1;
        credits += 750;
        addLog(`New world discovered: ${system.planets[discoveredCount - 1].name}. Next discovery requires ${Math.max(0, nextDiscoveryCompletion - progressionStats.completions)} more completed missions.`);
      }
    });
    activeFlights = activeFlights.filter((flight) => simulationDays < flight.arrivalDay);
    checkObjectives();
    updateInterface();
    updateMissionUI();
    saveProgress();
  }
  if (fuelChanged && !arrivedFlights.length) updateMissionUI();
  if (originIndex !== null && destinationIndex !== null) updateRoutePreview();
  document.getElementById('ageDisplay').textContent = `${simulationDays.toFixed(1).padStart(5, '0')} d`;
  requestAnimationFrame(render);
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);
canvas.addEventListener('click', (event) => {
  if (didDragMap) {
    didDragMap = false;
    return;
  }
  const bounds = canvas.getBoundingClientRect();
  const clickX = (event.clientX - bounds.left) * (width / bounds.width);
  const clickY = (event.clientY - bounds.top) * (height / bounds.height);
  let closestIndex = null;
  let closestDistance = 22;
  system.planets.slice(0, discoveredCount).forEach((planet, index) => {
    const position = getScreenPlanetPosition(planet, simulationDays);
    const distance = Math.hypot(clickX - position.x, clickY - position.y);
    if (distance < closestDistance) { closestIndex = index; closestDistance = distance; }
  });
  if (closestIndex !== null) selectPlanet(closestIndex);
});
canvas.addEventListener('pointerdown', (event) => {
  isDraggingMap = true;
  didDragMap = false;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  panStartX = cameraPanX;
  panStartY = cameraPanY;
  cameraFocusIndex = null;
  canvas.setPointerCapture(event.pointerId);
  canvas.closest('.map-stage').classList.add('is-dragging');
});
canvas.addEventListener('pointermove', (event) => {
  if (!isDraggingMap) return;
  const distance = Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY);
  if (distance > 4) didDragMap = true;
  cameraPanX = panStartX + event.clientX - dragStartX;
  cameraPanY = panStartY + event.clientY - dragStartY;
});
canvas.addEventListener('pointerup', (event) => {
  isDraggingMap = false;
  canvas.releasePointerCapture(event.pointerId);
  canvas.closest('.map-stage').classList.remove('is-dragging');
});
canvas.addEventListener('pointercancel', () => {
  isDraggingMap = false;
  canvas.closest('.map-stage').classList.remove('is-dragging');
});
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  setZoom(cameraZoom + (event.deltaY < 0 ? .15 : -.15));
}, { passive: false });
document.getElementById('playToggle').addEventListener('click', (event) => {
  isPlaying = !isPlaying;
  event.currentTarget.textContent = isPlaying ? '||' : '▶';
  event.currentTarget.setAttribute('aria-label', isPlaying ? 'Pause simulation' : 'Resume simulation');
  event.currentTarget.title = isPlaying ? 'Pause simulation' : 'Resume simulation';
  if (originIndex !== null && destinationIndex !== null) updateRoutePreview();
});
document.querySelectorAll('.speed-button').forEach((button) => {
  button.addEventListener('click', () => {
    const requestedSpeed = Number(button.dataset.speed);
    if (requestedSpeed > getMaximumSpeed()) return;
    simulationSpeed = requestedSpeed;
    document.querySelectorAll('.speed-button').forEach((speedButton) => speedButton.classList.remove('is-active'));
    button.classList.add('is-active');
    if (originIndex !== null && destinationIndex !== null) updateRoutePreview();
  });
});
document.getElementById('waitButton').addEventListener('click', () => {
  const cost = getTimeSkipCost();
  if (credits < cost || mission.status === 'preparing' || mission.status === 'complete') return;
  credits -= cost;
  simulationDays += 30;
  rechargeFuel(30);
  addLog(`Advanced simulation by 30 days for ${cost.toLocaleString()} CR.`);
  updateMissionUI();
  saveProgress();
});
document.getElementById('launchButton').addEventListener('click', launchMission);
document.getElementById('zoomIn').addEventListener('click', () => setZoom(cameraZoom + .25));
document.getElementById('zoomOut').addEventListener('click', () => setZoom(cameraZoom - .25));
document.getElementById('zoomReset').addEventListener('click', () => { cameraFocusIndex = null; cameraPanX = 0; cameraPanY = 0; setZoom(1); });
document.getElementById('missionType').addEventListener('change', (event) => {
  missionType = event.target.value;
  const matchingOffer = getMissionOffers().find((offer) => offer.type === missionType && offer.origin === originIndex && offer.destination === destinationIndex);
  activeContract = matchingOffer || null;
  updateInterface();
  saveProgress();
});
function purchaseUpgrade(type) {
  const config = upgradeConfig[type];
  const level = type === 'nav' ? navUpgradeLevel : type === 'tank' ? tankUpgradeLevel : type === 'cargo' ? cargoUpgradeLevel : chronoUpgradeLevel;
  const cost = getUpgradeCost(type);
  if (level >= config.max || companyRank < config.rank || credits < cost) return;
  credits -= cost;
  if (type === 'nav') navUpgradeLevel += 1;
  if (type === 'tank') { tankUpgradeLevel += 1; fuel += 25; }
  if (type === 'cargo') cargoUpgradeLevel += 1;
  if (type === 'chrono') {
    chronoUpgradeLevel += 1;
    if (simulationSpeed > getMaximumSpeed()) simulationSpeed = getMaximumSpeed();
  }
  progressionStats.upgrades += 1;
  addLog(`${config.label} upgraded to level ${level + 1}.`);
  checkObjectives();
  updateMissionUI();
  saveProgress();
}
document.getElementById('navUpgradeButton').addEventListener('click', () => purchaseUpgrade('nav'));
document.getElementById('tankUpgradeButton').addEventListener('click', () => purchaseUpgrade('tank'));
document.getElementById('cargoUpgradeButton').addEventListener('click', () => purchaseUpgrade('cargo'));
document.getElementById('chronoUpgradeButton').addEventListener('click', () => purchaseUpgrade('chrono'));
document.getElementById('systemTab').addEventListener('click', () => setIntelTab('system'));
document.getElementById('fleetTab').addEventListener('click', () => setIntelTab('fleet'));
document.getElementById('buyAircraftButton').addEventListener('click', () => {
  const cost = getAircraftCost();
  if (fleetSize >= 8 || credits < cost) return;
  credits -= cost;
  fleetSize += 1;
  addLog(`Aircraft added to fleet. Fleet capacity is now ${fleetSize}.`);
  updateMissionUI();
  saveProgress();
});
loadProgress();
document.getElementById('missionType').value = missionType;
updateInterface();
updateMissionUI();
updateZoomControl();
renderCommandLog();
document.getElementById('continueButton').addEventListener('click', enterGame);
document.getElementById('homeButton').addEventListener('click', returnHome);
document.getElementById('newGameButton').addEventListener('click', () => { resetGameState(); enterGame(); showTutorial(); });
document.getElementById('manageSavesButton').addEventListener('click', () => document.getElementById('saveManager').classList.toggle('is-hidden'));
document.getElementById('closeSavesButton').addEventListener('click', () => document.getElementById('saveManager').classList.add('is-hidden'));
document.getElementById('tutorialSkip').addEventListener('click', closeTutorial);
document.getElementById('tutorialNext').addEventListener('click', () => { if (tutorialStep === tutorialSteps.length - 1) closeTutorial(); else { tutorialStep += 1; updateTutorial(); } });
initializeStartScreen();
requestAnimationFrame(render);
