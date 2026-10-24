// Plain-language education per catalog test (English). General information
// only, consistent with NIH MedlinePlus lab-test pages; not personal advice.
// Clinician review: pending (SPEC.md §6). Keep sentences short and calm.
import type { TestInfo } from './types'

export const TEST_INFO_EN: Record<string, TestInfo> = {
  // ---------------------------------------------------------------- lipids
  total_cholesterol: {
    about: 'Cholesterol is a fat-like substance your body needs, carried in the blood. Total cholesterol adds up the different types.',
    high: 'High cholesterol over years can build up in artery walls (plaque), which raises the risk of heart attack and stroke. It usually causes no symptoms, which is why testing matters.',
    low: 'Low total cholesterol is usually not a concern. Very low levels are uncommon and are sometimes linked to other conditions your doctor may look at.',
    helps: 'A diet lower in saturated fat, more fiber, regular activity, a healthy weight and not smoking all help. Your doctor will judge your overall heart risk, not one number.',
  },
  ldl_c: {
    about: 'LDL is often called "bad" cholesterol. It is the main type that builds up in artery walls.',
    high: 'High LDL over time narrows arteries and raises the risk of heart attack and stroke. Lowering LDL is one of the best-proven ways to reduce that risk.',
    low: 'Low LDL is generally good for your heart. Your doctor may set a target depending on your overall risk.',
    helps: 'Less saturated and trans fat, more fiber (oats, beans, vegetables), regular exercise and a healthy weight lower LDL. Cholesterol medicines such as statins are very effective when prescribed.',
  },
  hdl_c: {
    about: 'HDL is often called "good" cholesterol. It helps carry cholesterol away from the arteries to the liver.',
    high: 'Higher HDL is usually linked with lower heart risk.',
    low: 'Low HDL is linked with higher heart risk, especially together with high LDL or triglycerides.',
    helps: 'Regular aerobic exercise, not smoking, losing extra weight and limiting refined carbohydrates can raise HDL.',
  },
  triglycerides: {
    about: 'Triglycerides are the most common type of fat in the blood. The body stores extra calories as triglycerides.',
    high: 'High triglycerides add to heart and blood-vessel risk. Very high levels can also inflame the pancreas (pancreatitis).',
    low: 'Low triglycerides are usually not a concern.',
    helps: 'Cutting sugar, sweet drinks, refined carbs and alcohol, losing extra weight and exercising regularly lower triglycerides. Results are most accurate after fasting if your lab asked for it.',
  },
  vldl_c: {
    about: 'VLDL is a type of cholesterol-carrying particle that also carries triglycerides. Labs often calculate it from your triglycerides.',
    high: 'High VLDL, like high LDL, contributes to plaque in the arteries and raises heart risk.',
    low: 'Low VLDL is usually not a concern.',
    helps: 'The same steps that lower triglycerides lower VLDL: less sugar and alcohol, more activity and a healthy weight.',
  },
  non_hdl_c: {
    about: 'Non-HDL cholesterol is your total cholesterol minus HDL. It counts all the cholesterol types that can build up in arteries.',
    high: 'High non-HDL cholesterol is linked with higher risk of heart attack and stroke. Some guidelines use it alongside LDL.',
    low: 'Low non-HDL cholesterol is generally good for your heart.',
    helps: 'Heart-healthy eating, regular activity, a healthy weight and, when prescribed, cholesterol medicine lower it.',
  },
  chol_hdl_ratio: {
    about: 'This ratio divides total cholesterol by HDL ("good") cholesterol. Some labs call it the "risk factor".',
    high: 'A higher ratio suggests a less favorable balance of cholesterol and a higher heart risk.',
    low: 'A lower ratio suggests a more favorable cholesterol balance.',
    helps: 'Lowering LDL and raising HDL both improve the ratio: healthy eating, exercise, not smoking and a healthy weight.',
  },
  ldl_hdl_ratio: {
    about: 'This ratio compares LDL ("bad") with HDL ("good") cholesterol.',
    high: 'A higher ratio suggests more cholesterol that can build up in arteries compared with cholesterol being cleared.',
    low: 'A lower ratio is generally more favorable for the heart.',
    helps: 'The same steps that improve LDL and HDL improve this ratio.',
  },
  // ---------------------------------------------------------------- glucose
  glucose_fasting: {
    about: 'Fasting glucose is your blood sugar after not eating for at least 8 hours. It shows how well your body manages sugar.',
    high: 'Repeated high fasting glucose can mean prediabetes or diabetes. Over years, high blood sugar can damage blood vessels, nerves, eyes and kidneys. One result alone is not a diagnosis.',
    low: 'Low blood sugar can cause shakiness, sweating, confusion or fainting. It is more common in people taking diabetes medicines.',
    helps: 'Regular activity, fewer sugary foods and drinks, more fiber and a healthy weight help control blood sugar.',
  },
  glucose: {
    about: 'This is your blood sugar at the time of the test, without fasting. It changes with meals.',
    high: 'A high random glucose can suggest diabetes, especially with symptoms such as thirst or frequent urination. Your doctor may confirm it with a fasting test or HbA1c.',
    low: 'Low blood sugar can cause shakiness, sweating or confusion and needs attention, especially if you take diabetes medicines.',
    helps: 'Balanced meals, fewer sugary drinks and regular activity help keep blood sugar steady.',
  },
  glucose_2h_pp: {
    about: 'This measures blood sugar 2 hours after a meal or a glucose drink. It shows how well your body handles sugar after eating.',
    high: 'A high result can point to prediabetes or diabetes. Your doctor will interpret it with your other tests.',
    low: 'Low blood sugar after meals is uncommon and should be discussed with your doctor if you have symptoms.',
    helps: 'Smaller portions of refined carbohydrates, more fiber and a short walk after meals can lower after-meal sugar.',
  },
  hba1c: {
    about: 'HbA1c shows your average blood sugar over about the last 2–3 months.',
    high: '5.7–6.4% is the prediabetes range and 6.5% or higher is the diabetes range (confirmed with a second test). Higher HbA1c over time raises the risk of damage to eyes, kidneys, nerves and the heart.',
    low: 'Low HbA1c is usually not a concern. Some blood conditions can affect the result.',
    helps: 'Healthy eating, regular activity, weight loss if needed and, when prescribed, diabetes medicine lower HbA1c. Even small drops reduce long-term risk.',
  },
  insulin: {
    about: 'Insulin is the hormone that moves sugar from the blood into your cells.',
    high: 'High fasting insulin can be a sign that the body is resisting insulin, which often comes before type 2 diabetes.',
    low: 'Low insulin can occur when the pancreas makes too little, as in type 1 diabetes. Your doctor will read it with your glucose.',
    helps: 'Regular exercise, weight loss and fewer refined carbohydrates improve how the body responds to insulin.',
  },
  // ---------------------------------------------------------------- liver
  alt: {
    about: 'ALT is an enzyme found mainly in the liver. When liver cells are irritated or damaged, ALT leaks into the blood.',
    high: 'A raised ALT can come from fatty liver, alcohol, some medicines (including some cholesterol medicines), viral hepatitis or muscle strain. Mild rises are common and often temporary; your doctor may repeat the test.',
    low: 'Low ALT is not a concern.',
    helps: 'Limiting alcohol, a healthy weight and avoiding unneeded supplements help the liver. Don\'t stop a prescribed medicine on your own; talk to your doctor first.',
  },
  ast: {
    about: 'AST is an enzyme found in the liver, heart and muscles.',
    high: 'A raised AST can come from the liver, but also from heavy exercise or muscle injury. Doctors usually read it together with ALT.',
    low: 'Low AST is not a concern.',
    helps: 'Limiting alcohol and keeping a healthy weight support the liver. Mention recent intense exercise to your doctor.',
  },
  ggt: {
    about: 'GGT is a liver enzyme that is sensitive to bile-duct problems and alcohol.',
    high: 'High GGT can be caused by alcohol, fatty liver, some medicines or blocked bile flow. It is not specific on its own.',
    low: 'Low GGT is not a concern.',
    helps: 'Cutting down on alcohol often lowers GGT. Your doctor will read it with other liver tests.',
  },
  alp: {
    about: 'Alkaline phosphatase (ALP) is an enzyme from the liver, bile ducts and bones.',
    high: 'High ALP can come from bile-duct problems or from bone growth and bone conditions. It is normally higher in teenagers and in pregnancy.',
    low: 'Low ALP is uncommon and can be linked with nutrition problems.',
    helps: 'Your doctor will look at other liver and bone tests to find the source.',
  },
  bilirubin_total: {
    about: 'Bilirubin is a yellow substance made when red blood cells break down. The liver clears it.',
    high: 'High bilirubin can cause yellow skin or eyes (jaundice). Causes include liver problems, blocked bile flow, faster red-cell breakdown, or a common harmless condition called Gilbert syndrome.',
    low: 'Low bilirubin is not a concern.',
    helps: 'Your doctor will interpret it with direct bilirubin and other liver tests.',
  },
  bilirubin_direct: {
    about: 'Direct bilirubin is the part of bilirubin the liver has already processed.',
    high: 'High direct bilirubin often points to the liver or bile ducts, for example a blockage.',
    low: 'Low direct bilirubin is not a concern.',
    helps: 'Your doctor will read it with total bilirubin and liver enzymes.',
  },
  albumin: {
    about: 'Albumin is the main protein made by the liver. It keeps fluid in your blood vessels and carries substances.',
    high: 'High albumin is usually due to dehydration.',
    low: 'Low albumin can come from liver or kidney disease, inflammation or poor nutrition, and can cause swelling.',
    helps: 'Enough protein in your diet and treating the underlying cause help.',
  },
  total_protein: {
    about: 'Total protein measures albumin and globulins together.',
    high: 'High total protein can be due to dehydration or long-term inflammation or infection.',
    low: 'Low total protein can come from liver or kidney problems or poor nutrition.',
    helps: 'Your doctor will look at albumin and globulin separately to understand the cause.',
  },
  globulin: {
    about: 'Globulins are proteins that include antibodies, which fight infection.',
    high: 'High globulin can be seen with long-term inflammation, infections or some immune conditions.',
    low: 'Low globulin can mean a weaker antibody response or protein loss.',
    helps: 'Your doctor will interpret it with albumin and other tests.',
  },
  ag_ratio: {
    about: 'The albumin/globulin ratio compares the two main blood proteins.',
    high: 'A high ratio is usually not a concern on its own.',
    low: 'A low ratio can be seen with liver disease, kidney disease or long-term inflammation.',
    helps: 'Your doctor reads it together with albumin and globulin.',
  },
  // ---------------------------------------------------------------- kidney
  creatinine: {
    about: 'Creatinine is a waste product from muscles that the kidneys filter out. It is a key test of kidney function.',
    high: 'High creatinine can mean the kidneys are filtering less well. It can also rise with dehydration, a high-protein meal, intense exercise or high muscle mass.',
    low: 'Low creatinine is usually due to low muscle mass and is rarely a concern.',
    helps: 'Drinking enough water, controlling blood pressure and blood sugar, and avoiding regular use of painkillers like ibuprofen without advice protect the kidneys.',
  },
  egfr: {
    about: 'eGFR estimates how much blood your kidneys filter each minute. It is calculated from creatinine, age and sex.',
    high: 'A high eGFR is usually not a concern.',
    low: 'A lower eGFR means the kidneys are filtering less. Below 60 for 3 months or more defines chronic kidney disease. Your doctor will often repeat the test.',
    helps: 'Controlling blood pressure and blood sugar, not smoking, staying hydrated and avoiding unnecessary painkillers protect kidney function.',
  },
  urea: {
    about: 'Urea is a waste product made when the body breaks down protein. The kidneys remove it.',
    high: 'High urea can come from reduced kidney function, dehydration, a high-protein diet or bleeding in the gut.',
    low: 'Low urea can come from a low-protein diet or liver problems.',
    helps: 'Drinking enough water helps. Your doctor will read it with creatinine.',
  },
  bun: {
    about: 'BUN (blood urea nitrogen) measures urea in the blood. It reflects kidney function and hydration.',
    high: 'High BUN can come from reduced kidney function, dehydration, a high-protein diet or bleeding in the gut.',
    low: 'Low BUN can come from a low-protein diet or liver problems.',
    helps: 'Staying hydrated helps. Your doctor will read it with creatinine.',
  },
  bun_creatinine_ratio: {
    about: 'This ratio compares BUN with creatinine and helps doctors understand why one of them is abnormal.',
    high: 'A high ratio often points to dehydration or bleeding in the gut rather than kidney damage.',
    low: 'A low ratio can be seen with liver problems or a low-protein diet.',
    helps: 'Your doctor interprets it with both values.',
  },
  uric_acid: {
    about: 'Uric acid is a waste product from breaking down purines, found in some foods and in the body.',
    high: 'High uric acid can cause gout (painful joint attacks) and kidney stones.',
    low: 'Low uric acid is usually not a concern.',
    helps: 'Less red meat, organ meat, some seafood, sugary drinks and alcohol (especially beer), drinking enough water and a healthy weight lower uric acid.',
  },
  urine_acr: {
    about: 'This urine test checks for small amounts of albumin (protein) leaking from the kidneys. It is an early sign of kidney damage.',
    high: 'A raised ratio, especially if repeated, suggests kidney damage. It is common in diabetes and high blood pressure and raises heart risk.',
    low: 'A low ratio is normal.',
    helps: 'Good control of blood sugar and blood pressure protects the kidneys. Your doctor may repeat the test, since exercise or infection can raise it temporarily.',
  },
  // ---------------------------------------------------------------- electrolytes and minerals
  sodium: {
    about: 'Sodium is a salt that controls the balance of water in your body and helps nerves and muscles work.',
    high: 'High sodium usually means the body has too little water, often from not drinking enough or losing fluids.',
    low: 'Low sodium can come from some medicines (such as water pills), drinking very large amounts of water, or heart, liver or kidney problems. Very low levels can cause confusion.',
    helps: 'Your doctor will look for the cause before changing what you drink or eat.',
  },
  potassium: {
    about: 'Potassium is a mineral that keeps your heart rhythm and muscles working normally.',
    high: 'High potassium can affect the heart rhythm. It can come from kidney problems or some medicines, or be falsely high if the blood sample was handled roughly.',
    low: 'Low potassium can cause weakness, cramps or heart-rhythm changes. It is often due to vomiting, diarrhea or water pills.',
    helps: 'Don\'t take potassium supplements or salt substitutes without your doctor\'s advice.',
  },
  chloride: {
    about: 'Chloride is a salt that works with sodium to balance fluids and acid in the body.',
    high: 'High chloride is often linked to dehydration or acid-base changes.',
    low: 'Low chloride can follow vomiting or some medicines.',
    helps: 'Your doctor reads it together with sodium and bicarbonate.',
  },
  bicarbonate: {
    about: 'Bicarbonate (CO2) shows the acid-base balance of your blood.',
    high: 'High bicarbonate can follow vomiting, dehydration or some medicines.',
    low: 'Low bicarbonate can mean the blood is too acidic, for example with kidney problems, uncontrolled diabetes or severe diarrhea.',
    helps: 'Your doctor will look for the cause.',
  },
  calcium: {
    about: 'Calcium keeps bones strong and helps muscles, nerves and the heart work.',
    high: 'High calcium can come from overactive parathyroid glands, too many supplements or other conditions. It can cause thirst, constipation or kidney stones.',
    low: 'Low calcium can come from low vitamin D, low albumin or kidney problems, and can cause tingling or cramps.',
    helps: 'Your doctor may check vitamin D and albumin. Take calcium supplements only as advised.',
  },
  magnesium: {
    about: 'Magnesium is a mineral needed for muscles, nerves, heart rhythm and blood sugar control.',
    high: 'High magnesium is uncommon and usually linked to kidney problems or supplements.',
    low: 'Low magnesium can cause cramps or heart-rhythm changes. It is often linked to some medicines, alcohol or poor diet.',
    helps: 'Leafy greens, nuts, seeds and whole grains are good sources.',
  },
  phosphorus: {
    about: 'Phosphorus works with calcium to build bones and teeth.',
    high: 'High phosphorus is most often linked to kidney problems.',
    low: 'Low phosphorus can come from poor nutrition, alcohol or some medicines.',
    helps: 'Your doctor reads it together with calcium and kidney tests.',
  },
  // ---------------------------------------------------------------- iron
  iron: {
    about: 'Serum iron measures the iron in your blood. Iron is needed to make hemoglobin.',
    high: 'High iron can come from supplements or iron-overload conditions, which can harm organs over time.',
    low: 'Low iron is a common cause of anemia and tiredness. Iron levels also change during the day and after meals.',
    helps: 'Doctors usually read iron together with ferritin and TIBC. Take iron supplements only if advised.',
  },
  tibc: {
    about: 'TIBC shows how much iron your blood can carry.',
    high: 'High TIBC often means the body is low on iron.',
    low: 'Low TIBC can be seen with iron overload, inflammation or poor nutrition.',
    helps: 'Your doctor reads it with iron and ferritin.',
  },
  transferrin_saturation: {
    about: 'This percentage shows how much of the iron-carrying protein (transferrin) is filled with iron.',
    high: 'A high saturation can suggest iron overload.',
    low: 'A low saturation suggests iron deficiency.',
    helps: 'Your doctor reads it with ferritin and iron.',
  },
  transferrin: {
    about: 'Transferrin is the protein that carries iron in the blood.',
    high: 'High transferrin often means the body is low on iron.',
    low: 'Low transferrin can be seen with inflammation, liver disease or poor nutrition.',
    helps: 'Your doctor reads it with other iron tests.',
  },
  ferritin: {
    about: 'Ferritin shows how much iron your body has stored.',
    high: 'High ferritin can come from inflammation, infection, liver disease or iron overload. It does not always mean too much iron.',
    low: 'Low ferritin is the most reliable sign of low iron stores, a common cause of tiredness and anemia.',
    helps: 'Iron-rich foods (red meat, beans, leafy greens) with vitamin C help absorption. Take iron supplements only if advised.',
  },
  // ---------------------------------------------------------------- blood count
  hemoglobin: {
    about: 'Hemoglobin is the protein in red blood cells that carries oxygen around the body.',
    high: 'High hemoglobin can come from smoking, living at high altitude, dehydration or conditions that make too many red cells.',
    low: 'Low hemoglobin is called anemia. It can cause tiredness, shortness of breath or pale skin. Common causes are low iron, blood loss or low B12 or folate.',
    helps: 'Your doctor will look for the cause (often with ferritin, B12 and folate) before treatment.',
  },
  rbc: {
    about: 'This counts your red blood cells, which carry oxygen.',
    high: 'A high count can come from dehydration, smoking or conditions that make too many red cells.',
    low: 'A low count is a sign of anemia.',
    helps: 'Your doctor reads it with hemoglobin and the red-cell indices.',
  },
  hematocrit: {
    about: 'Hematocrit (PCV) is the percentage of your blood made up of red blood cells.',
    high: 'High hematocrit is often due to dehydration or smoking.',
    low: 'Low hematocrit is a sign of anemia.',
    helps: 'Your doctor reads it with hemoglobin.',
  },
  mcv: {
    about: 'MCV is the average size of your red blood cells.',
    high: 'Large red cells can be linked to low vitamin B12 or folate, alcohol, thyroid or liver problems.',
    low: 'Small red cells are often linked to low iron or inherited conditions such as thalassemia trait.',
    helps: 'MCV helps your doctor find the cause of anemia.',
  },
  mch: {
    about: 'MCH is the average amount of hemoglobin in each red blood cell.',
    high: 'High MCH usually goes with large red cells (see MCV).',
    low: 'Low MCH is often linked to low iron or thalassemia trait.',
    helps: 'Your doctor reads it with MCV and hemoglobin.',
  },
  mchc: {
    about: 'MCHC is how concentrated the hemoglobin is inside red blood cells.',
    high: 'High MCHC is uncommon and can be seen with some inherited red-cell conditions.',
    low: 'Low MCHC is often seen with low iron.',
    helps: 'Your doctor reads it with the other red-cell indices.',
  },
  rdw: {
    about: 'RDW shows how much your red blood cells vary in size.',
    high: 'A high RDW can be an early sign of low iron, B12 or folate, especially with anemia.',
    low: 'A low RDW is not a concern.',
    helps: 'Your doctor reads it with MCV and hemoglobin.',
  },
  wbc: {
    about: 'White blood cells fight infection. This is the total count.',
    high: 'A high count often means the body is fighting an infection or inflammation. Stress, smoking and some medicines can also raise it.',
    low: 'A low count can follow viral infections or some medicines and can make infections more likely.',
    helps: 'Your doctor reads it with the types of white cells (the differential).',
  },
  platelets: {
    about: 'Platelets are small blood cells that help blood clot.',
    high: 'A high count can follow infection, inflammation, low iron or surgery. Rarely it is due to a bone-marrow condition.',
    low: 'A low count can cause easy bruising or bleeding. Causes include viral infections, some medicines and immune conditions.',
    helps: 'Tell your doctor about unusual bruising or bleeding.',
  },
  neutrophils_abs: {
    about: 'Neutrophils are the white cells that fight bacterial infections. This is their actual number.',
    high: 'A high count usually means a bacterial infection, inflammation or stress. Steroid medicines can also raise it.',
    low: 'A low count makes infections more likely. It can follow viral illness or some medicines; some people naturally have lower counts.',
    helps: 'If your count is low, tell your doctor promptly about any fever.',
  },
  neutrophils_pct: {
    about: 'The share of your white cells that are neutrophils, the cells that fight bacteria.',
    high: 'A higher share usually means a bacterial infection or inflammation.',
    low: 'A lower share is often seen with viral infections. The absolute count matters more than the percentage.',
    helps: 'Your doctor reads percentages together with the total white count.',
  },
  lymphocytes_abs: {
    about: 'Lymphocytes are white cells that fight viruses and make antibodies. This is their actual number.',
    high: 'A high count is often seen with viral infections.',
    low: 'A low count can follow illness, stress or some medicines.',
    helps: 'Your doctor reads it with the rest of the blood count.',
  },
  lymphocytes_pct: {
    about: 'The share of your white cells that are lymphocytes, which fight viruses.',
    high: 'A higher share is often seen with viral infections.',
    low: 'A lower share can follow stress or illness. The absolute count matters more than the percentage.',
    helps: 'Your doctor reads percentages together with the total white count.',
  },
  monocytes_abs: {
    about: 'Monocytes are white cells that clean up damaged cells and fight some infections.',
    high: 'A high count can be seen with long-lasting infections or inflammation.',
    low: 'A low count is usually not significant on its own.',
    helps: 'Your doctor reads it with the rest of the blood count.',
  },
  monocytes_pct: {
    about: 'The share of your white cells that are monocytes.',
    high: 'A higher share can be seen with infections or recovery from illness.',
    low: 'A lower share is usually not significant on its own.',
    helps: 'Your doctor reads percentages together with the total white count.',
  },
  eosinophils_abs: {
    about: 'Eosinophils are white cells involved in allergies and fighting parasites.',
    high: 'A high count is common with allergies, asthma, eczema or parasite infections.',
    low: 'A low count is usually not a concern.',
    helps: 'Tell your doctor about allergies or recent travel.',
  },
  eosinophils_pct: {
    about: 'The share of your white cells that are eosinophils (allergy and parasite fighters).',
    high: 'A higher share is common with allergies, asthma or parasite infections.',
    low: 'A lower share is usually not a concern.',
    helps: 'Your doctor reads percentages together with the total white count.',
  },
  basophils_abs: {
    about: 'Basophils are rare white cells involved in allergic reactions.',
    high: 'A raised count is uncommon and can be seen with allergies or some blood conditions.',
    low: 'A low count is usually not a concern.',
    helps: 'Your doctor reads it with the rest of the blood count.',
  },
  basophils_pct: {
    about: 'The share of your white cells that are basophils (rare allergy cells).',
    high: 'A higher share is uncommon and can be seen with allergies.',
    low: 'A lower share is usually not a concern.',
    helps: 'Your doctor reads percentages together with the total white count.',
  },
  // ---------------------------------------------------------------- thyroid
  tsh: {
    about: 'TSH is the signal your brain sends to the thyroid gland. It is the main test of thyroid function.',
    high: 'High TSH usually means the thyroid is underactive (hypothyroidism), which can cause tiredness, weight gain and feeling cold.',
    low: 'Low TSH usually means the thyroid is overactive (hyperthyroidism), which can cause weight loss, a fast heartbeat and anxiety. Too high a dose of thyroid medicine can also lower it.',
    helps: 'If you take thyroid medicine, take it as prescribed, usually on an empty stomach, and don\'t change the dose without your doctor.',
  },
  free_t4: {
    about: 'Free T4 is the main thyroid hormone available to your body.',
    high: 'High free T4 suggests an overactive thyroid or too high a dose of thyroid medicine.',
    low: 'Low free T4 suggests an underactive thyroid.',
    helps: 'Your doctor reads it together with TSH.',
  },
  free_t3: {
    about: 'Free T3 is the active thyroid hormone available to your body.',
    high: 'High free T3 suggests an overactive thyroid.',
    low: 'Low free T3 can be seen with an underactive thyroid or during illness.',
    helps: 'Your doctor reads it together with TSH and free T4.',
  },
  total_t3: {
    about: 'Total T3 measures all of the active thyroid hormone T3 in the blood.',
    high: 'High T3 suggests an overactive thyroid.',
    low: 'Low T3 can be seen with an underactive thyroid or during illness.',
    helps: 'Your doctor reads it together with TSH.',
  },
  total_t4: {
    about: 'Total T4 measures all of the thyroid hormone T4 in the blood, including the part bound to proteins.',
    high: 'High total T4 can mean an overactive thyroid; pregnancy and some medicines also raise it.',
    low: 'Low total T4 can mean an underactive thyroid.',
    helps: 'Your doctor reads it together with TSH.',
  },
  // ---------------------------------------------------------------- inflammation
  crp: {
    about: 'C-reactive protein (CRP) rises when there is inflammation or infection in the body.',
    high: 'High CRP shows inflammation somewhere in the body, from infections, injuries or long-term conditions. It does not show where.',
    low: 'Low CRP is normal.',
    helps: 'Your doctor will interpret it with your symptoms and may repeat it to track recovery.',
  },
  hs_crp: {
    about: 'High-sensitivity CRP measures low levels of inflammation and is used to help estimate heart risk.',
    high: 'A higher hs-CRP is linked with higher heart risk, but a recent cold or injury can raise it temporarily.',
    low: 'A low hs-CRP is favorable.',
    helps: 'Exercise, a healthy weight, not smoking and a heart-healthy diet can lower it.',
  },
  esr: {
    about: 'ESR measures how fast red blood cells settle in a tube. It is a general sign of inflammation.',
    high: 'A high ESR can come from infection, inflammation, anemia, pregnancy or older age. It is not specific on its own.',
    low: 'A low ESR is usually not a concern.',
    helps: 'Your doctor reads it with your symptoms and other tests.',
  },
  aso: {
    about: 'ASO measures antibodies to a strep bacteria toxin. It shows a recent strep infection, such as strep throat.',
    high: 'A high ASO suggests a recent strep infection. Doctors use it when checking for complications like rheumatic fever.',
    low: 'A low ASO means no sign of a recent strep infection.',
    helps: 'Your doctor will interpret it with your symptoms.',
  },
  rheumatoid_factor: {
    about: 'Rheumatoid factor is an antibody that can be found in rheumatoid arthritis and some other conditions.',
    high: 'A positive or high RF supports a diagnosis of rheumatoid arthritis but can also appear in healthy people and other conditions.',
    low: 'A negative RF does not rule out rheumatoid arthritis.',
    helps: 'Your doctor reads it with your symptoms and other tests.',
  },
  // ---------------------------------------------------------------- coagulation
  inr: {
    about: 'INR shows how long your blood takes to clot. It is used to monitor blood-thinning medicines such as warfarin.',
    high: 'A higher INR means blood clots more slowly. If you take warfarin, your doctor sets your own target range, often higher than the lab\'s normal range.',
    low: 'A lower INR means blood clots faster. On warfarin, it can mean the dose isn\'t enough.',
    helps: 'If you take warfarin, keep to your prescribed dose, keep your vitamin K intake (leafy greens) steady and don\'t change the dose yourself.',
  },
  pt: {
    about: 'Prothrombin time (PT) measures how long blood takes to clot.',
    high: 'A longer PT can come from blood thinners, liver disease or low vitamin K.',
    low: 'A short PT is usually not a concern.',
    helps: 'Your doctor reads it with INR.',
  },
  aptt: {
    about: 'aPTT is another test of how long blood takes to clot, through a different pathway than PT.',
    high: 'A longer aPTT can come from heparin, clotting-factor problems or liver disease.',
    low: 'A short aPTT is usually not a concern.',
    helps: 'Your doctor reads it with PT and INR.',
  },
  // ---------------------------------------------------------------- hormones
  psa_total: {
    about: 'PSA is a protein made by the prostate gland.',
    high: 'A raised PSA can come from an enlarged prostate, inflammation or infection, and sometimes prostate cancer. Recent ejaculation or cycling can also raise it.',
    low: 'A low PSA is normal.',
    helps: 'Your doctor will look at the trend over time and may repeat the test before any further steps.',
  },
  testosterone_total: {
    about: 'Testosterone is a hormone important for muscle, bone, mood and sexual health. Levels are highest in the morning.',
    high: 'High testosterone in women can cause acne or extra hair growth. In men it may come from supplements.',
    low: 'Low testosterone in men can cause tiredness, low sex drive and loss of muscle. It is best confirmed with a morning repeat test.',
    helps: 'Sleep, regular exercise and a healthy weight support healthy levels.',
  },
  prolactin: {
    about: 'Prolactin is a hormone that helps produce breast milk.',
    high: 'High prolactin can come from pregnancy, stress, some medicines, an underactive thyroid or a small benign pituitary growth. It can affect periods and fertility.',
    low: 'Low prolactin is usually not a concern.',
    helps: 'Your doctor may repeat the test, since stress and the time of day affect it.',
  },
  cortisol: {
    about: 'Cortisol is the body\'s main stress hormone. It is highest in the morning.',
    high: 'High cortisol can come from stress, illness, steroid medicines or, rarely, gland problems.',
    low: 'Low cortisol can cause tiredness, weakness and low blood pressure and may need further testing.',
    helps: 'The time of the test matters; your doctor reads it with when the sample was taken.',
  },
  // ---------------------------------------------------------------- pancreas and muscle
  amylase: {
    about: 'Amylase is an enzyme that helps digest starch. It comes from the pancreas and salivary glands.',
    high: 'High amylase can be a sign of an inflamed pancreas (pancreatitis), especially with belly pain.',
    low: 'Low amylase is usually not a concern.',
    helps: 'Severe belly pain needs prompt medical care.',
  },
  lipase: {
    about: 'Lipase is an enzyme from the pancreas that helps digest fats.',
    high: 'High lipase is a sensitive sign of pancreatitis, especially with severe upper belly pain.',
    low: 'Low lipase is usually not a concern.',
    helps: 'Severe belly pain needs prompt medical care. Alcohol and very high triglycerides are common causes of pancreatitis.',
  },
  ck: {
    about: 'Creatine kinase (CK) is an enzyme found in muscles, including the heart.',
    high: 'High CK often follows hard exercise or muscle injury. It can also rise with some medicines such as statins; tell your doctor about unexplained muscle pain or weakness.',
    low: 'Low CK is usually not a concern.',
    helps: 'Avoid intense exercise for a few days before a repeat test, and report muscle pain to your doctor.',
  },
  ldh: {
    about: 'LDH is an enzyme found in almost all body tissues.',
    high: 'High LDH shows tissue damage somewhere in the body. It is not specific and is read with other tests.',
    low: 'Low LDH is not a concern.',
    helps: 'Your doctor will interpret it with your other results.',
  },
  // ---------------------------------------------------------------- vitamins
  vitamin_d_25oh: {
    about: 'This test measures vitamin D, which helps your body absorb calcium and keep bones and muscles strong.',
    high: 'Very high vitamin D usually comes from taking too many supplements and can raise calcium levels.',
    low: 'Low vitamin D is very common and can weaken bones over time and cause aches or tiredness.',
    helps: 'Safe sun exposure, vitamin D-rich foods (oily fish, eggs, fortified foods) and supplements at the dose your doctor advises.',
  },
  vitamin_b12: {
    about: 'Vitamin B12 is needed for healthy nerves and red blood cells.',
    high: 'High B12 is usually due to supplements and is rarely a concern.',
    low: 'Low B12 can cause anemia, tiredness, numbness or memory problems. It is more common in vegetarians, older adults and people taking metformin or stomach-acid medicines.',
    helps: 'Animal foods (meat, fish, eggs, dairy) contain B12. Supplements or injections may be advised.',
  },
  folate: {
    about: 'Folate (vitamin B9) is needed to make red blood cells and is important before and during pregnancy.',
    high: 'High folate usually comes from supplements and is rarely a concern.',
    low: 'Low folate can cause anemia and tiredness.',
    helps: 'Leafy greens, beans, citrus and fortified grains are good sources.',
  },
  // ---------------------------------------------------------------- infection screening
  hcv_ab: {
    about: 'This test looks for antibodies to the hepatitis C virus. It shows whether you have ever been infected.',
    positive: 'A positive antibody test means you were infected at some point. A second test (HCV RNA) shows whether the virus is still active. Hepatitis C is curable with modern treatment.',
    helps: 'If positive, ask your doctor about the confirmatory test and treatment.',
  },
  hbsag: {
    about: 'This test looks for part of the hepatitis B virus in the blood.',
    positive: 'A positive result means a current hepatitis B infection. Your doctor will arrange further tests and follow-up.',
    helps: 'A negative result with no vaccination history may be a reason to ask about the hepatitis B vaccine.',
  },
}
