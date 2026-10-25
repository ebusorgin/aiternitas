// Full end-to-end walkthrough of the "Сгенерировать компанию" process,
// replicating userServer/socket/flowchart.mjs handler:
// generateCompanyStructure -> convertToFlowchartElements (no DB write).
// Clarification is auto-answered with "keep" (like clicking «Оставить как есть»).
import '../microservices/userServer/config.mjs';
import {
  generateCompanyStructure,
  convertToFlowchartElements,
} from '../microservices/userServer/services/openai.mjs';

const NAME = 'Барбершоп TopCut';
const DESC = 'Небольшой барбершоп, 1 точка, 4 человека вместе с владельцем';

const t0 = Date.now();
const log = (...a) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const onProgress = (p) => log(`PROGRESS step ${p.stepIndex}/${p.totalSteps || '?'} [${p.stepLabel}] ${p.message}`);

let clarificationAnswered = false;
const onClarification = (payload) => {
  log('CLARIFICATION:', payload.question, '| сейчас:', payload.summary);
  log('OPTIONS:', payload.options.map(o => `${o.id}(${o.label})`).join(', '));
  clarificationAnswered = true;
  // Auto-answer like the UI button «Оставить как есть»
  return Promise.resolve({ choice: 'keep', customText: '' });
};

const getAborted = () => false;
const onStepsPlan = (p) => log('STEPS PLAN:', JSON.stringify(p));

try {
  log(`=== START generation: "${NAME}" ===`);
  const structure = await generateCompanyStructure(NAME, DESC, onProgress, onClarification, getAborted, onStepsPlan);
  log('=== generateCompanyStructure OK ===');
  log('clarification was requested & answered:', clarificationAnswered);

  const { elements, connections } = convertToFlowchartElements(structure, NAME, DESC);
  log(`=== convertToFlowchartElements OK: ${elements.length} elements, ${connections.length} connections ===`);
  console.log('ELEMENTS:', elements.map(e => `${e.type}: ${e.name}`).join('\n  '));
  process.exit(0);
} catch (e) {
  console.error('=== GENERATION FAILED ===');
  console.error(e);
  process.exit(1);
}
