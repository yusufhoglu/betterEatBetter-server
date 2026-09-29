import type { DietitianPersona } from '../ports/CoachAccessPort';
import { buildAssistantPersonaBlock } from './assistantPersonaBlock';

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

describe('buildAssistantPersonaBlock', () => {
  it('always states who the assistant speaks for and that it is an AI', () => {
    const block = buildAssistantPersonaBlock(BASE);
    expect(block).toContain('"Ayşe Yılmaz · AI asistan", the AI assistant of dietitian Ayşe Yılmaz');
    expect(block).toContain('never claim otherwise');
    expect(block).toContain('never over the safety rules');
    expect(block).toContain('ask Ayşe Yılmaz directly');
    // Empty sections are left out.
    expect(block).not.toContain('Always:');
    expect(block).not.toContain('Example 1');
  });

  it('renders every section the dietitian filled in', () => {
    const block = buildAssistantPersonaBlock({
      ...BASE,
      addressForm: 'siz',
      tone: 'Sıcak, kısa.',
      approach: 'Porsiyon kontrolü.',
      rules: ['Bir öneri ver.'],
      avoid: ['Takviye önerme.'],
      handoffMessage: 'Bunu seansımızda konuşalım.',
      clientInstructions: 'Laktoz intoleransı.',
      examples: [{ question: 'Meyve?', answer: 'Evet, bir porsiyon.' }],
    });
    expect(block).toContain('"siz"');
    expect(block).toContain('Sıcak, kısa.');
    expect(block).toContain('Porsiyon kontrolü.');
    expect(block).toContain('Always:\n- Bir öneri ver.');
    expect(block).toContain('Never:\n- Takviye önerme.');
    expect(block).toContain('"Bunu seansımızda konuşalım."');
    expect(block).toContain('never quote them');
    expect(block).toContain('Laktoz intoleransı.');
    expect(block).toContain('Example 1\nQ: Meyve?\nA: Evet, bir porsiyon.');
  });

  it('falls back to a generic name when the dietitian has none', () => {
    expect(buildAssistantPersonaBlock({ ...BASE, dietitianName: null })).toContain(
      'AI assistant of dietitian the dietitian',
    );
  });
});
