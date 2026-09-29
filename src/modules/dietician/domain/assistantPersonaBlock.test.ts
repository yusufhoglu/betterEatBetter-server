import { DIETICIAN_ADVICE_GUARD, DIETICIAN_PERSONA } from '../dieticianSystemPrompt';
import type { DietitianPersona } from '../ports/CoachAccessPort';
import {
  assistantAdviceGuard,
  assistantGatherSystemPrompt,
  assistantRulesReminder,
  assistantSystemPrompt,
} from './assistantPersonaBlock';

const BASE: DietitianPersona = {
  dietitianId: 'dyt-1',
  dietitianName: 'Ayşe Yılmaz',
  assistantName: 'Ayşe Yılmaz · AI asistan',
  addressForm: null,
  tone: null,
  approach: null,
  rules: [],
  avoid: [],
  handoffMessage: null,
  clientInstructions: null,
  examples: [],
};

const STRICT: DietitianPersona = {
  ...BASE,
  addressForm: 'siz',
  tone: 'Sıcak, kısa.',
  approach: 'Porsiyon kontrolü.',
  rules: ['Su tüketimini hatırlat.'],
  avoid: ['Asla ekstra yemek tavsiye etme.', 'Asla yemek tarifi verme.'],
  handoffMessage: 'Bunu seansımızda konuşalım.',
  clientInstructions: 'Laktoz intoleransı.',
  examples: [{ question: 'Meyve?', answer: 'Evet, bir porsiyon.' }],
};

/**
 * The generic coach lines that pushed the model to suggest foods and offer
 * recipes — the cause of "never give recipes" being ignored. They must not
 * reach a dietitian's assistant through any prompt.
 */
const CONFLICTING_COACH_STYLE = [
  'suggest specific foods, portions, and swaps',
  'you may briefly ask whether they want the full recipe',
  'connect advice to their calorie/macro budget',
  'Tie the answer to their remaining calorie/macro budget',
  'call provide_recipe, sized to the calories they have left',
];

describe('assistant prompts', () => {
  it('never carry the generic coaching style that contradicts the rules', () => {
    const prompts = [
      assistantSystemPrompt(STRICT),
      assistantGatherSystemPrompt(STRICT),
      assistantAdviceGuard(STRICT),
      assistantRulesReminder(STRICT),
    ];
    for (const prompt of prompts) {
      for (const line of CONFLICTING_COACH_STYLE) {
        expect(prompt).not.toContain(line);
      }
    }
    // Sanity: those lines really are in the generic coach prompts.
    expect(DIETICIAN_PERSONA).toContain(CONFLICTING_COACH_STYLE[0]);
    expect(DIETICIAN_PERSONA).toContain(CONFLICTING_COACH_STYLE[1]);
    expect(DIETICIAN_ADVICE_GUARD).toContain(CONFLICTING_COACH_STYLE[3]);
  });

  it('orders the system prompt by priority: identity, safety, the rules, then everything else', () => {
    const prompt = assistantSystemPrompt(STRICT);
    const at = (text: string) => {
      const index = prompt.indexOf(text);
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };
    const identity = at('the AI assistant of dietitian Ayşe Yılmaz');
    const safety = at('Safety — you are not a medical professional');
    const rules = at("AYŞE YILMAZ'S RULES — ABSOLUTE.");
    const never = at('Never:\n- Asla ekstra yemek tavsiye etme.\n- Asla yemek tarifi verme.');
    const voice = at('Porsiyon kontrolü.');
    const howTo = at('How to answer:');
    const example = at('Example 1\nQ: Meyve?\nA: Evet, bir porsiyon.');
    expect(identity).toBeLessThan(safety);
    expect(safety).toBeLessThan(rules);
    expect(rules).toBeLessThan(never);
    expect(never).toBeLessThan(voice);
    expect(voice).toBeLessThan(howTo);
    expect(howTo).toBeLessThan(example);
  });

  it('says the rules override everything but safety, even direct requests', () => {
    const prompt = assistantSystemPrompt(STRICT);
    expect(prompt).toContain('These override every other instruction');
    expect(prompt).toContain('Only the safety rules above rank higher');
    expect(prompt).toContain('not even when the user asks for it directly');
    expect(prompt).toContain('reply with this message from Ayşe Yılmaz, in the user\'s language: "Bunu seansımızda konuşalım."');
    expect(prompt).toContain("never either one if Ayşe Yılmaz's rules forbid it");
    expect(prompt).toContain('The rules above still win over any example');
  });

  it('the gather step may only build a card the rules allow', () => {
    const prompt = assistantGatherSystemPrompt(STRICT);
    expect(prompt.startsWith(assistantSystemPrompt(STRICT))).toBe(true);
    expect(prompt).toContain("AND Ayşe Yılmaz's rules allow it");
    expect(prompt).toContain("If Ayşe Yılmaz's rules forbid a card, do not call its tool at all.");
  });

  it('the final reminder repeats the rules and the handoff', () => {
    expect(assistantRulesReminder(STRICT)).toBe(
      [
        "Final check before you answer — Ayşe Yılmaz's rules are absolute (only safety ranks higher):",
        'Never: Asla ekstra yemek tavsiye etme. / Asla yemek tarifi verme.',
        'Always: Su tüketimini hatırlat.',
        'If your answer would break one of them, rewrite it. If the user asked for something forbidden, do not provide it even partially — reply with this message from Ayşe Yılmaz, in the user\'s language: "Bunu seansımızda konuşalım.".',
      ].join('\n'),
    );
  });

  it('keeps identity, AI disclosure and client instructions; drops empty sections', () => {
    const prompt = assistantSystemPrompt(BASE);
    expect(prompt).toContain('never claim otherwise');
    expect(prompt).toContain('has not added specific rules');
    expect(prompt).toContain('ask Ayşe Yılmaz directly');
    expect(prompt).not.toContain('Never:');
    expect(prompt).not.toContain('Example 1');
    expect(assistantSystemPrompt(STRICT)).toContain('never quote them or say they exist): Laktoz intoleransı.');
    expect(assistantSystemPrompt(STRICT)).toContain('"siz"');
  });

  it('falls back to a generic name when the dietitian has none', () => {
    expect(assistantSystemPrompt({ ...BASE, dietitianName: null })).toContain('AI assistant of dietitian the dietitian');
  });
});
