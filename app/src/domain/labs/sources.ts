// Every clinical rule in the catalog points at one of these sources (SPEC.md §6).
// None of the rules has been reviewed by a clinician yet.
export const RULES_VERSION = '2026-10-24.1'
export const CLINICIAN_REVIEW = 'pending' as const

export const SOURCES = {
  ada2025_dx: {
    short: 'ADA 2025',
    title: 'ADA Standards of Care in Diabetes—2025, §2 Diagnosis and Classification (Tables 2.1, 2.2)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11635041/',
    published: '2024-12',
  },
  ada2025_hypo: {
    short: 'ADA 2025',
    title: 'ADA Standards of Care in Diabetes—2025, §6 Glycemic Goals and Hypoglycemia; §16 (level 2 hypoglycemia < 54 mg/dL)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/11635037',
    published: '2024-12',
  },
  aha_acc_2018_chol: {
    short: 'AHA/ACC 2018',
    title: '2018 AHA/ACC Guideline on the Management of Blood Cholesterol (LDL-C ≥ 190 mg/dL statin benefit group)',
    url: 'https://www.lipid.org/sites/default/files/nla_clinicianhandout_2018cholgl.pdf',
    published: '2018-11',
  },
  kdigo_gfr: {
    short: 'KDIGO',
    title: 'KDIGO CKD classification, GFR categories G1–G5 (National Kidney Foundation)',
    url: 'https://www.kidney.org/how-to-classify-ckd',
    published: '2024',
  },
  acg2017_liver: {
    short: 'ACG 2017',
    title: 'ACG Clinical Guideline: Evaluation of Abnormal Liver Chemistries. Kwo PY et al. Am J Gastroenterol 2017;112:18–35',
    url: 'https://bpb-us-w2.wpmucdn.com/u.osu.edu/dist/0/123048/files/2023/07/AJG-Kwo-et-al-ACG-Liver-Chemistries-Guideline-2017.pdf',
    published: '2017-01',
  },
  critical_values: {
    short: 'Hospital lab lists',
    title: 'Hospital laboratory critical-value lists (UChicago Medicine; Meritus Health), following the CLSI GP47 approach. Limits vary by lab.',
    url: 'https://edge.sitecorecloud.io/unichicagomc-81nbqnb3/media/pdfs/adult-pdfs/research/critical_value_list.pdf',
    published: '2018',
  },
  ada_monitoring: {
    short: 'ADA',
    title: 'ADA Standards of Care in Diabetes, §6 Glycemic Goals, Rec. 6.2: assess A1C at least twice a year when meeting goals; at least quarterly after a therapy change or when not meeting goals (general goal <7%)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9810469/',
    published: '2023-01',
  },
  ada_prediabetes: {
    short: 'ADA',
    title: 'ADA Standards of Care in Diabetes, §3 Prevention or Delay of Diabetes, Rec. 3.1: in prediabetes, monitor for diabetes at least annually',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12690170',
    published: '2025-12',
  },
  ada_ckd: {
    short: 'ADA 2025',
    title: 'ADA Standards of Care in Diabetes—2025, §11 Chronic Kidney Disease, Rec. 11.1a: urine albumin-to-creatinine ratio and eGFR at least annually in type 2 diabetes',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/11635029',
    published: '2024-12',
  },
  aha_acc_2018_followup: {
    short: 'AHA/ACC 2018',
    title: '2018 AHA/ACC Cholesterol Guideline: lipid panel 4–12 weeks after starting or changing lipid-lowering therapy, then every 3–12 months as needed',
    url: 'https://www.lipid.org/resource/clinicians-should-monitor-ldl-c-after-starting-lipid-lowering-therapy/',
    published: '2018-11',
  },
  levothyroxine_monitoring: {
    short: 'FDA label · AACE',
    title: 'Levothyroxine prescribing information (FDA label) and AACE: TSH 6–8 weeks after a dose change; every 6–12 months once stable',
    url: 'https://medlibrary.org/lib/rx/meds/levothyroxine-sodium/page/2/',
    published: '2024',
  },
  aha_bp: {
    short: 'AHA/ACC',
    title: 'American Heart Association: Understanding blood pressure readings (ACC/AHA adult categories: normal <120/<80, elevated 120–129/<80, stage 1 130–139 or 80–89, stage 2 ≥140 or ≥90; over 180/120 needs prompt attention)',
    url: 'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings',
    published: '2025',
  },
  ada_glucose_targets: {
    short: 'ADA 2025',
    title: 'ADA Standards of Care in Diabetes—2025, §6 Glycemic Goals: before meals 80–130 mg/dL, 1–2 hours after a meal below 180 mg/dL; low blood sugar below 70 mg/dL (level 1) and below 54 mg/dL (level 2)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/11635037',
    published: '2024-12',
  },
  who_bmi: {
    short: 'WHO',
    title: 'World Health Organization: body mass index categories for adults (underweight <18.5, healthy 18.5–24.9, overweight 25–29.9, obesity ≥30)',
    url: 'https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight',
    published: '2024',
  },
  aha_heart_rate: {
    short: 'AHA',
    title: 'American Heart Association: a normal resting heart rate for adults is 60–100 beats per minute; well-trained athletes and people on some medicines can be lower',
    url: 'https://www.heart.org/en/healthy-living/fitness/fitness-basics/target-heart-rates',
    published: '2024',
  },
  nhs_pulse_oximeter: {
    short: 'NHS',
    title: 'NHS: pulse oximeters. Usually 95% or higher; 93–94% get advice the same day; 92% or below get urgent help. Readings can be less accurate on darker skin, cold fingers or nail polish; follow any different target your doctor gave you',
    url: 'https://www.nhs.uk/conditions/pulse-oximetry/',
    published: '2024',
  },
  nhs_fever: {
    short: 'NHS',
    title: 'NHS: a high temperature (fever) is 38°C or above; babies under 3 months with 38°C or above need urgent medical advice; below 35°C can be hypothermia',
    url: 'https://www.nhs.uk/conditions/fever-in-adults/',
    published: '2024',
  },
  eflm_bv: {
    short: 'EFLM',
    title: 'EFLM Biological Variation Database (2021 + updates), as tabulated in Bio-Rad Q-1680',
    url: 'https://www.bio-rad.com/sites/default/files/2025-02/biological-variation-Q-1680.pdf',
    published: '2025-02',
  },
} as const

export type SourceId = keyof typeof SOURCES
