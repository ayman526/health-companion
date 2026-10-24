import { describe, expect, it } from 'vitest'
import { detectEmergency } from './emergency'

describe('emergency pre-screen', () => {
  it.each([
    ['I have crushing chest pain and my arm hurts', 'chest_pain'],
    ['عندي ألم في صدري من ساعة', 'chest_pain'],
    ["I can't breathe properly", 'breathing'],
    ['مش قادر أتنفس', 'breathing'],
    ['his face is drooping and slurred speech', 'stroke'],
    ['وشي مايل وكلامي تقيل', 'stroke'],
    ['I want to die', 'suicide'],
    ['عايز أموت', 'suicide'],
    ['I am vomiting blood', 'bleeding'],
    ['برجع دم', 'bleeding'],
    ['my mother passed out and is unresponsive', 'unconscious'],
    ['اغمي عليه', 'unconscious'],
    ['my throat is swelling after the injection', 'allergy'],
    ['I took too many pills', 'overdose'],
    ['خدت شريط كامل', 'overdose'],
    ['my sugar is very low and I am shaking', 'low_sugar'],
    ['I think I am having a stroke', 'stroke'],
    ['I am having a hypo', 'low_sugar'],
    ['بلعت سم فار', 'overdose'],
    ['السكر نازل جدا', 'low_sugar'],
  ])('flags "%s"', (text, kind) => {
    expect(detectEmergency(text)).toContain(kind)
  })

  it.each([
    'How has my cholesterol changed since May?',
    'Compare my latest liver function results with the previous report.',
    'اشرح لي التقرير بالعربي البسيط',
    'What should I discuss with my doctor?',
    'Did my HbA1c improve after I started metformin?',
    'Is my stroke risk higher with high LDL?',
    'What does hypothyroidism mean for my TSH?',
    'جسمي تعبان شوية بعد الدوا الجديد',
    'ما اسم الدواء اللي بيقلل الكوليسترول؟',
  ])('does not flag ordinary questions: "%s"', (text) => {
    expect(detectEmergency(text)).toEqual([])
  })
})
