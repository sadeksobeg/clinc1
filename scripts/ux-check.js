const fs = require('fs');
const path = require('path');

function resolveRepoRoot(startDir) {
  let current = startDir;
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(current, 'frontend', 'ClinicSaaS.Web', 'src', 'app');
    if (fs.existsSync(candidate)) return { root: current, src: candidate };
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

const resolved = resolveRepoRoot(process.cwd());
if (!resolved) {
  console.error(`Source directory not found from: ${process.cwd()}`);
  process.exit(1);
}

const rootDir = resolved.root;
const srcDir = resolved.src;
const strict = process.argv.includes('--strict');
const scoreThreshold = 80;
const coverageThreshold = 85;
const decisionCoverageThreshold = 60;
const predictionCoverageThreshold = 60;
const CONTRACT_REQUIRED_ROUTES = [
  'communications-campaigns.component.ts',
  'communications-templates.component.ts',
  'platform-billing.component.ts',
  'platform-audit.component.ts',
  'platform-health.component.ts',
];

const issues = [];
let contractTargets = 0;
let contractCoverage = 0;
const DECISION_REQUIRED_ROUTES = ['platform-overview.component.ts'];
let decisionTargets = 0;
let decisionCoverage = 0;
let predictionTargets = 0;
let predictionCoverage = 0;

function shouldSkip(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.includes('/node_modules/') || normalized.includes('/dist/') || normalized.includes('/.angular/');
}

function report(type, message, filePath) {
  issues.push({ type, message, file: filePath });
}

function isHtmlFile(fileName) {
  return fileName.endsWith('.html');
}

function isContractTarget(normalizedPath) {
  return [
    '/pages/platform/platform-overview.component.ts',
    '/pages/platform/platform-support.component.ts',
    '/pages/platform/platform-billing.component.ts',
    '/pages/platform/platform-audit.component.ts',
    '/pages/platform/platform-health.component.ts',
    '/pages/doctor/doctor-dashboard.component.ts',
    '/pages/reception/reception-dashboard.component.ts',
    '/pages/clinic/clinic-analytics.component.ts',
    '/pages/communications/communications-conversations.component.ts',
    '/pages/communications/communications-campaigns.component.ts',
    '/pages/communications/communications-templates.component.ts',
  ].some((suffix) => normalizedPath.endsWith(suffix));
}

function scan(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (shouldSkip(fullPath)) continue;

    if (entry.isDirectory()) {
      scan(fullPath);
      continue;
    }

    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.html')) continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    const normalized = fullPath.replace(/\\/g, '/');
    const isTemplateLike = normalized.endsWith('.component.ts') || normalized.endsWith('.component.html');
    const htmlOnly = isHtmlFile(entry.name);

    if (/style\s*=/.test(content) || /\[style\]/.test(content)) {
      report('error', 'Inline styles are not allowed', normalized);
    }

    if (/\b(margin|padding)\s*:/.test(content)) {
      report('error', 'Raw spacing detected (use mc-space-* tokens/classes)', normalized);
    }

    if (isTemplateLike && /(conversionRatePercent|conversion)/i.test(content) && !content.includes('mc-signal')) {
      report('warn', 'Conversion appears without mc-signal usage', normalized);
    }

    if (isTemplateLike && /urgent/i.test(content) && !content.includes('mc-priority-urgent')) {
      report('warn', 'Urgent state appears without mc-priority-urgent', normalized);
    }

    if (isTemplateLike && isContractTarget(normalized) && /class="mc-panel/.test(content)) {
      report('error', 'Use <mc-panel> contract component instead of raw mc-panel class', normalized);
    }

    if (CONTRACT_REQUIRED_ROUTES.some((route) => normalized.endsWith(route))) {
      if (!content.includes('<mc-panel')) {
        report('error', 'Page must use mc-panel as layout root', normalized);
      }
    }

    if (DECISION_REQUIRED_ROUTES.some((route) => normalized.endsWith(route))) {
      decisionTargets += 1;
      if (content.includes('<mc-decision')) {
        decisionCoverage += 1;
      }
      if (/mc-signal-(danger|warning|info)|signalNo/.test(content) && !content.includes('<mc-decision')) {
        report('error', 'Critical page has signal(s) but missing mc-decision layer', normalized);
      }
    }

    if (normalized.endsWith('/core/mc-prediction.engine.ts')) {
      predictionTargets += 1;
      if (/type:\s*'churn_risk'/.test(content) && /type:\s*'no_show_risk'/.test(content) && /type:\s*'overload_soon'/.test(content)) {
        predictionCoverage += 1;
      }
      if (!content.includes('suggestedAction')) {
        report('warn', 'Prediction engine should include action suggestions for at least one risk', normalized);
      }
    }

    if (normalized.endsWith('/core/mc-decision.engine.ts')) {
      if (!content.includes('mapPredictionToDecision') || !content.includes('predictionEngine.run')) {
        report('error', 'Prediction layer exists without required decision mapping', normalized);
      }
    }

    if (
      isTemplateLike &&
      isContractTarget(normalized) &&
      /signalNo|mc-signal-(danger|warning|info)|mc-signal-title|mc-signal-copy/.test(content) &&
      !content.includes('<mc-signal')
    ) {
      report('error', 'Signal states must use <mc-signal> contract component', normalized);
    }

    if (isTemplateLike && isContractTarget(normalized) && /ui-empty/.test(content) && !content.includes('<mc-empty')) {
      report('warn', 'Empty states should use <mc-empty> contract component', normalized);
    }

    if (
      isTemplateLike &&
      isContractTarget(normalized) &&
      /dashboard|overview|workspace|support|analytics|conversations/.test(normalized) &&
      !content.includes('<mc-panel')
    ) {
      report('warn', 'Mission Control page missing <mc-panel> contract usage', normalized);
    }

    if (isTemplateLike && content.includes('<mc-decision') && !content.includes('mc-action')) {
      report('info', 'Decision layer should expose at least one actionable path (mc-action)', normalized);
    }

    if (
      isTemplateLike &&
      isContractTarget(normalized) &&
      /\(click\)="(review|confirmPayment|activate|assign|close|markPaid)\(/.test(content)
    ) {
      report('error', 'Use mc-action instead of direct click handlers for operational decisions', normalized);
    }

    const ACTION_REQUIRED_ROUTES = [
      'platform-subscriptions.component.ts',
      'platform-support.component.ts',
      'platform-billing.component.ts',
    ];
    if (
      normalized.endsWith('.component.ts') &&
      ACTION_REQUIRED_ROUTES.some((route) => normalized.endsWith(route)) &&
      content.includes('http.post(') &&
      !content.includes('<mc-action')
    ) {
      report('warn', 'Decision actions should go through mc-action system', normalized);
    }

    if (
      isTemplateLike &&
      CONTRACT_REQUIRED_ROUTES.some((route) => normalized.endsWith(route)) &&
      (/class="\s*flex/.test(content) || /class="[^"]*\bgrid\b/.test(content))
    ) {
      report('info', 'Use mc-layout primitives instead of raw flex/grid for route-level layout', normalized);
    }

    if (normalized.endsWith('.component.ts') && isContractTarget(normalized)) {
      contractTargets += 1;
      if (content.includes('<mc-panel')) {
        contractCoverage += 1;
      }
    }

    if (normalized.endsWith('/platform-overview.component.ts') && !/focus/i.test(content)) {
      report('error', 'Missing focus mode behavior in platform overview', normalized);
    }

    if (htmlOnly && /\bNo\b/.test(content) && !/<button|routerLink=/.test(content)) {
      report('warn', 'Possible empty state without CTA', normalized);
    }

    if (isTemplateLike && !content.includes('mc-stack-panel') && !content.includes('ui-layout-')) {
      report('info', 'Consider using mc-stack-panel for consistent section rhythm', normalized);
    }
  }
}

scan(srcDir);

const penalty = { error: 30, warn: 10, info: 0 };
let score = 100;
for (const issue of issues) {
  score -= penalty[issue.type] || 0;
}
if (score < 0) score = 0;

const icon = { error: '❌', warn: '⚠️', info: 'ℹ️' };
if (issues.length > 0) {
  console.log('\nUX Gate Findings:\n');
  for (const issue of issues) {
    console.log(`${icon[issue.type] || '•'} ${issue.message} (${issue.file})`);
  }
}

console.log(`\nUX Score: ${score}/100`);
const coveragePercent = contractTargets > 0 ? (contractCoverage / contractTargets) * 100 : 100;
console.log(`Contract Coverage: ${coveragePercent.toFixed(1)}% (${contractCoverage}/${contractTargets})`);
const decisionCoveragePercent = decisionTargets > 0 ? (decisionCoverage / decisionTargets) * 100 : 100;
console.log(`Decision Coverage: ${decisionCoveragePercent.toFixed(1)}% (${decisionCoverage}/${decisionTargets})`);
const predictionCoveragePercent = predictionTargets > 0 ? (predictionCoverage / predictionTargets) * 100 : 100;
console.log(`Prediction Coverage: ${predictionCoveragePercent.toFixed(1)}% (${predictionCoverage}/${predictionTargets})`);

const hasErrors = issues.some((i) => i.type === 'error');
const hasWarnings = issues.some((i) => i.type === 'warn');

if (hasErrors) {
  console.error('\n🚫 UX Gate FAILED (Critical issues found)');
  process.exit(1);
}

if (strict && hasWarnings) {
  console.error('\n🚫 UX Gate FAILED (Warnings not allowed in strict mode)');
  process.exit(1);
}

if (strict && score < scoreThreshold) {
  console.error(`\n🚫 UX Gate FAILED (Score below ${scoreThreshold} in strict mode)`);
  process.exit(1);
}

if (strict && coveragePercent < coverageThreshold) {
  console.error(`\n🚫 UX Gate FAILED (Contract coverage below ${coverageThreshold}% in strict mode)`);
  process.exit(1);
}

if (strict && decisionCoveragePercent < decisionCoverageThreshold) {
  console.error(`\n🚫 UX Gate FAILED (Decision coverage below ${decisionCoverageThreshold}% in strict mode)`);
  process.exit(1);
}

if (strict && predictionCoveragePercent < predictionCoverageThreshold) {
  console.error(`\n🚫 UX Gate FAILED (Prediction coverage below ${predictionCoverageThreshold}% in strict mode)`);
  process.exit(1);
}

console.log('\n✅ UX Gate Passed\n');
