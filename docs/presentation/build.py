"""Builds the Arabic product presentation as two HTML files (16:9 and phone
portrait) from the same slides; render.mjs turns them into PDFs.

    python3 docs/presentation/build.py && node <render.mjs>
"""
from pathlib import Path

HERE = Path(__file__).parent
LINK = 'health-journal.vercel.app'

def phone(img, caption=''):
    cap = f'<figcaption>{caption}</figcaption>' if caption else ''
    return f'<figure class="phone"><div class="screen"><img src="shots/{img}" alt=""></div>{cap}</figure>'

def phones(*items):
    return '<div class="phones">' + ''.join(phone(*i) if isinstance(i, tuple) else phone(i) for i in items) + '</div>'

def points(items):
    return '<ul class="points">' + ''.join(
        f'<li><i class="icon-{icon}"></i><span><b>{title}</b>{f"<small>{body}</small>" if body else ""}</span></li>'
        for icon, title, body in items) + '</ul>'

def grid(items):
    return '<div class="grid">' + ''.join(
        f'<div class="tile"><i class="icon-{icon}"></i><b>{title}</b><small>{body}</small></div>' for icon, title, body in items) + '</div>'

# (kicker, title, lead, text html, visual html, extra class)
SLIDES = [
    ('', 'سجلك الصحي', 'ذاكرتك الصحية في مكان واحد',
     '<p class="sub">تاريخك المرضي والعلاجي كاملًا، من أول تحليل لآخر روشتة.</p><p class="signoff">دمتم بصحة <span class="heart">❤</span></p>',
     phones('signin.png', 'home.png'), 'cover'),

    ('لماذا صنعناه', 'تاريخك الصحي متفرّق… وبيضيع', '',
     points([
         ('file-x', 'التقارير الورقية بتضيع', 'وكل معمل له شكل، وكل تحليل في مكان مختلف.'),
         ('message-circle', 'صور التحاليل على الواتساب', 'صعب ترجع لها، ومستحيل تشوف تطورها مع الوقت.'),
         ('stethoscope', '"معاك التحاليل القديمة؟"', 'سؤال كل طبيب… والإجابة غالبًا: لأ.'),
         ('pill', 'أدوية كتير ومواعيد كتير', 'وتغيير جرعات لا أحد يتذكر متى حصل.'),
         ('heart-handshake', 'وأهلك محتاجين متابعة', 'والدين أو أطفال، وأحيانًا من مدينة أو بلد آخر.'),
     ]), '', 'text-only'),

    ('الحل', 'ذاكرتك الصحية في مكان واحد', 'ثلاث قيم أساسية:',
     points([
         ('folder-heart', 'كل تقاريرك وروشتاتك محفوظة', 'صوّرها مرة واحدة، ومش هتضيع تاني.'),
         ('chart-line', 'شوف تطور كل تحليل مع الوقت', 'وما تغيّر في علاجك خلال نفس الفترة.'),
         ('clipboard-list', 'جاهز لزيارة الطبيب', 'تاريخك وأدويتك وأسئلتك في صفحة واحدة.'),
     ]) + '<p class="note">ولكل من تحب: ذاكرة صحية منفصلة لكل فرد في العائلة.</p>',
     phones('tests.jpg'), ''),

    ('يومك', 'أدويتك في موعدها، وكل شيء من زر واحد', '',
     points([
         ('bell-ring', 'تذكير بكل جرعة', 'تأخذها بلمسة، أو تؤجلها نصف ساعة.'),
         ('mic', 'قُلها بصوتك', 'بالعامية أو الفصحى أو الإنجليزية: "ضغطي 130 على 85".'),
         ('scan-line', 'صوّر تقرير أو روشتة أو علبة دواء', 'ويتحول لنتائج وأدوية مرتبة.'),
         ('heart-pulse', 'سجّل قراءة', 'ضغط، سكر، وزن، نبض، أكسجين، حرارة.'),
     ]), phones('home.png', 'add.png'), ''),

    ('الميزة الأهم', 'شاهد تطور كل تحليل… وما تغيّر في علاجك', '',
     points([
         ('chart-line', 'رسم لكل تحليل', 'من أول تقرير لآخر تقرير، مع المعدل الطبيعي.'),
         ('pill', 'تاريخك المرضي والعلاجي معًا', 'بدء دواء، تغيير جرعة، أو تغيير في نمط الحياة بجانب النتائج.'),
         ('book-open', 'ماذا تعني النتيجة؟', 'شرح مبسّط من مصادر طبية موثوقة.'),
     ]), phones('alt.png', 'hdl.png'), 'star'),

    ('قارن تقريرين', 'ما يحتاج متابعة… يظهر أولًا', '',
     points([
         ('triangle-alert', 'ما يحتاج متابعة في الأعلى', 'وما تحسّن وما ثبت بعده.'),
         ('table', 'سطر واحد لكل تحليل', 'قبل ← بعد، وسهم يوضح الاتجاه.'),
         ('calculator', 'الحساب من أرقام التقريرين', 'وليس بالذكاء الاصطناعي.'),
     ]), phones('compare.png'), ''),

    ('زيارة الطبيب', 'استعد لزيارتك… واحصل على أفضل استشارة', '',
     points([
         ('calendar-check', 'تذكير قبل الزيارة وبعدها', 'قبلها بيوم: جهّز ملخصك. بعدها: سجّل ما غيّره الطبيب.'),
         ('file-text', 'ملخص صفحة واحدة', 'الأمراض، الأدوية الحالية، القراءات، النتائج خارج المعدل، وتغيّرات حياتك.'),
         ('message-circle-question', 'أسئلتك مكتوبة', 'اكتبها في أي وقت، وتظهر في آخر الملخص.'),
         ('printer', 'اطبع أو احفظ PDF أو شارك', 'على هاتف الطبيب أو الواتساب.'),
     ]), phones('visit.png', 'summaryQuestions.png'), ''),

    ('افهم نتيجتك', 'معلومات من مصادر موثوقة، في مكانها', '',
     points([
         ('badge-check', 'من مصادر طبية موثوقة', 'ملخص قصير ونقاط أساسية، مع رابط المصدر.'),
         ('target', 'تظهر عندما تهمك', 'بسبب نتيجة تحليل أو دواء لديك، وليس مقالات عشوائية.'),
     ]), phones('library.png'), ''),

    ('المستشار', 'اسأل عن نتائجك وأدويتك', '',
     points([
         ('database', 'إجابات من سجلاتك المؤكدة فقط', 'مع روابط للتقارير التي يستند إليها.'),
         ('sparkles', 'أسئلة مقترحة من سجلاتك', 'وأسئلة متابعة بعد كل إجابة.'),
         ('shield-check', 'آمن', 'لا يشخّص ولا يغيّر أدويتك، ويرشدك للطبيب أو الطوارئ عند الحاجة.'),
     ]), phones('advisorAnswer.png'), ''),

    ('وأكثر', 'ميزات تجعل المتابعة سهلة', '',
     grid([
         ('scan-line', 'مسح التقارير والروشتات', 'حتى بخط اليد، مع مراجعة قبل الحفظ.'),
         ('camera', 'قراءة جهاز الضغط من صورة', 'صوّر الشاشة، والأرقام تُسجَّل.'),
         ('mic', 'التسجيل بالصوت', 'عربي وإنجليزي.'),
         ('calendar-heart', 'تسجيل يومي وملخص أسبوعي', 'كيف حالك اليوم، وكيف كان أسبوعك.'),
         ('stethoscope', 'فحوصات مقترحة حسب العمر', 'من إرشادات طبية موثوقة.'),
         ('eye-off', 'الوضع الخاص', 'يخفي الأرقام في الأماكن العامة.'),
     ]), '', 'text-only'),

    ('عائلتك', 'اطمئن على صحة من تحب', '',
     points([
         ('users', 'سجلات منفصلة لكل فرد', 'والديك، أطفالك، أو أي شخص ترعاه.'),
         ('share-2', 'مشاركة بموافقة صاحب السجل', 'عرض فقط، أو عرض ومساعدة. وإيقافها في أي وقت.'),
         ('bell-ring', 'تنبيه إذا فاتت جرعة', 'لمن يرعى الآخرين، بدون أسماء أو تفاصيل أدوية.'),
         ('arrow-left-right', 'تسليم السجلات لصاحبها', 'عندما يصبح لديه حساب خاص.'),
     ]), phones('sharing.png'), ''),

    ('خصوصيتك أولًا', 'بياناتك ملكك', '',
     grid([
         ('lock', 'مشفّرة', 'أثناء النقل والتخزين.'),
         ('map-pin', 'محفوظة في ألمانيا', 'خوادم داخل الاتحاد الأوروبي.'),
         ('brain', 'لا تُستخدم لتدريب الذكاء الاصطناعي', 'أبدًا.'),
         ('ban', 'لا إعلانات ولا بيع للبيانات', 'نموذجنا لا يعتمد على بياناتك.'),
         ('download', 'نزّل بياناتك كاملة', 'في أي وقت.'),
         ('trash-2', 'احذف حسابك', 'وكل سجلاتك، نهائيًا.'),
     ]), '', 'text-only'),

    ('لمن؟', 'مفيد لكل من يهتم بصحته', '',
     grid([
         ('activity', 'مرضى السكر والضغط والقلب', 'متابعة مستمرة للنتائج والأدوية.'),
         ('heart-handshake', 'من يرعى والديه', 'من نفس البيت أو من بلد آخر.'),
         ('baby', 'الأمهات والآباء', 'سجلات وتطعيمات الأطفال.'),
         ('flask-conical', 'من يعمل تحاليل دورية', 'كل تحليل في مكانه، وتطوره واضح.'),
         ('pill', 'من يتناول أكثر من دواء', 'مواعيد وجرعات بلا نسيان.'),
         ('plane', 'من يغيّر طبيبه أو مدينته', 'تاريخه الصحي معه في أي مكان.'),
     ]), '', 'text-only'),

    ('للشركاء والداعمين', 'الفرصة', '',
     points([
         ('globe', 'السوق', 'مصر والولايات المتحدة، ومنها المصريون في الخارج الذين يرعون أهلهم.'),
         ('megaphone-off', 'بدون إعلانات', 'المرحلة الأولى: أكبر عدد من المستخدمين بحسابات مجانية.'),
         ('heart-handshake', 'نموذج مستدام لاحقًا', 'باقة "رعاية العائلة" الاختيارية، وشراكات مع المعامل والصيدليات.'),
         ('shield-check', 'الثقة أولًا', 'لا بيع للبيانات ولا إعلانات أدوية، أبدًا.'),
     ]), '', 'text-only investor'),

    ('للشركاء والداعمين', 'كيف تدعموننا', '',
     points([
         ('rocket', 'تمويل الوصول للناس', 'حملات توعية ووصول للمستخدمين بدل الإعلانات المدفوعة داخل التطبيق.'),
         ('building-2', 'شراكات', 'جمعيات السكر والقلب، المعامل، الصيدليات، وجهات العمل لدعم موظفيها.'),
         ('stethoscope', 'مراجعة طبية', 'أطباء وصيادلة لمراجعة المحتوى والقواعد الطبية.'),
         ('chart-column', 'نقيس الأثر', 'التسجيل، أول سجل خلال يوم، والعودة خلال الأسبوع الأول، بدون بيانات شخصية.'),
     ]) + f'<p class="note">تواصل معنا لنبدأ معًا.</p>', '', 'text-only investor'),

    ('ابدأ الآن', 'مجاني، ويعمل على أي هاتف', '',
     f'''<div class="start">
        <img class="qr" src="shots/qr.svg" alt="QR">
        <div>
          <p class="link" dir="ltr">{LINK}</p>
          <ol class="steps">
            <li>افتح الرابط وسجّل ببريدك الإلكتروني، بدون كلمة مرور.</li>
            <li>أضفه للشاشة الرئيسية: مشاركة ← إضافة إلى الشاشة الرئيسية.</li>
            <li>صوّر أول تقرير أو أضف أول دواء.</li>
          </ol>
        </div>
      </div>
      <p class="signoff big">دمتم بصحة <span class="heart">❤</span></p>''',
     '', 'text-only end'),
]

CSS = """
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');
@import url('https://unpkg.com/lucide-static@0.454.0/font/lucide.css');
:root { --brand:#0b4f5c; --brand2:#127a85; --soft:#eff7f5; --canvas:#fafaf7; --ink:#14201f; --muted:#5d6b69; --amber:#a35f06; --amber-bg:#fdf3e2; --heart:#e24b4a; }
* { box-sizing:border-box; margin:0; padding:0 }
/* Right-to-left inside each slide; the page itself scrolls left to right (stable page coordinates). */
body { direction:rtl }
body { font-family:'IBM Plex Sans Arabic',sans-serif; color:var(--ink); background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact }
.slide { width:var(--w); height:var(--h); position:relative; overflow:hidden; background:var(--canvas); page-break-after:always; display:grid }
.slide::before { content:''; position:absolute; inset:0 0 auto 0; height:calc(var(--u)*0.9); background:var(--brand) }
.brandmark { position:absolute; top:calc(var(--u)*2.2); inset-inline-start:calc(var(--u)*4); display:flex; align-items:center; gap:calc(var(--u)*0.8); font-weight:600; color:var(--brand); font-size:calc(var(--u)*1.7) }
.brandmark img { width:calc(var(--u)*3); height:calc(var(--u)*3); border-radius:calc(var(--u)*0.7) }
.pageno { position:absolute; bottom:calc(var(--u)*2); inset-inline-end:calc(var(--u)*4); color:var(--muted); font-size:calc(var(--u)*1.3) }
.kicker { display:inline-block; background:var(--soft); color:var(--brand); font-weight:600; border-radius:999px; padding:calc(var(--u)*0.4) calc(var(--u)*1.4); font-size:calc(var(--u)*1.5) }
h1 { font-size:calc(var(--u)*4.4); line-height:1.25; font-weight:700; margin-top:calc(var(--u)*1.2); color:var(--ink) }
.lead { font-size:calc(var(--u)*2); color:var(--muted); margin-top:calc(var(--u)*0.8) }
.points { list-style:none; display:flex; flex-direction:column; gap:calc(var(--u)*1.5); margin-top:calc(var(--u)*2.4) }
.points li { display:flex; gap:calc(var(--u)*1.3); align-items:flex-start }
.points i { flex:none; width:calc(var(--u)*4.2); height:calc(var(--u)*4.2); border-radius:calc(var(--u)*1.1); background:var(--soft); color:var(--brand); display:grid; place-items:center; font-size:calc(var(--u)*2.2) }
.points b { display:block; font-size:calc(var(--u)*2.1); font-weight:600; line-height:1.35 }
.points small { display:block; font-size:calc(var(--u)*1.6); color:var(--muted); line-height:1.5; margin-top:calc(var(--u)*0.2) }
.grid { display:grid; grid-template-columns:repeat(var(--cols),1fr); gap:calc(var(--u)*1.5); margin-top:calc(var(--u)*2.6) }
.tile { background:#fff; border:1px solid #e3e8e6; border-radius:calc(var(--u)*1.6); padding:calc(var(--u)*1.8); display:flex; flex-direction:column; gap:calc(var(--u)*0.5) }
.tile i { width:calc(var(--u)*4); height:calc(var(--u)*4); border-radius:calc(var(--u)*1); background:var(--soft); color:var(--brand); display:grid; place-items:center; font-size:calc(var(--u)*2.1); margin-bottom:calc(var(--u)*0.5) }
.tile b { font-size:calc(var(--u)*1.95); font-weight:600; line-height:1.35 }
.tile small { font-size:calc(var(--u)*1.5); color:var(--muted); line-height:1.5 }
.note { margin-top:calc(var(--u)*2); background:var(--soft); color:var(--brand); border-radius:calc(var(--u)*1.2); padding:calc(var(--u)*1.1) calc(var(--u)*1.6); font-size:calc(var(--u)*1.7); font-weight:500 }
.phones { display:flex; gap:calc(var(--u)*2.4); justify-content:center; align-items:center; height:100% }
.phone { width:var(--pw); }
.screen { width:100%; aspect-ratio:9/19.5; border-radius:calc(var(--pw)*0.12); border:calc(var(--pw)*0.03) solid #1d2726; overflow:hidden; background:#fff; box-shadow:0 calc(var(--u)*1.5) calc(var(--u)*4) rgba(11,79,92,.18) }
.screen img { width:100%; height:100%; object-fit:cover; object-position:top }
.phones .phone:nth-child(2) { transform:translateY(calc(var(--u)*3)) }
.sub { font-size:calc(var(--u)*2.3); color:var(--muted); margin-top:calc(var(--u)*1.4); line-height:1.6 }
.signoff { font-size:calc(var(--u)*2.4); font-weight:600; margin-top:calc(var(--u)*3) }
.signoff.big { font-size:calc(var(--u)*3); text-align:center }
.heart { color:var(--heart) }
.cover h1 { font-size:calc(var(--u)*6); color:var(--brand) }
.cover .lead { font-size:calc(var(--u)*3.4); color:var(--ink); font-weight:600 }
.star .kicker { background:var(--amber-bg); color:var(--amber) }
.investor .kicker { background:var(--brand); color:#fff }
.start { display:flex; gap:calc(var(--u)*3); align-items:center; margin-top:calc(var(--u)*3) }
.qr { width:calc(var(--u)*17); height:calc(var(--u)*17); background:#fff; border-radius:calc(var(--u)*1.2); padding:calc(var(--u)*0.8); border:1px solid #e3e8e6 }
.link { font-size:calc(var(--u)*2.6); font-weight:700; color:var(--brand); text-align:right }
.steps { margin-top:calc(var(--u)*1.4); padding-inline-start:calc(var(--u)*2.6); font-size:calc(var(--u)*1.9); line-height:1.8 }
/* Wide 16:9: text on the reading side, phones beside it. */
.wide { --w:1920px; --h:1080px; --u:13.5px; --pw:340px; --cols:3 }
.wide .slide { grid-template-columns:1.05fr 1fr; padding:calc(var(--u)*9) calc(var(--u)*7) calc(var(--u)*6) }
.wide .slide.text-only { grid-template-columns:1fr }
.wide .text { align-self:center }
.wide .text-only .points { display:grid; grid-template-columns:1fr 1fr; column-gap:calc(var(--u)*4) }
.wide .cover .phone { --pw:360px }
.wide .end .text { text-align:center; display:flex; flex-direction:column; align-items:center }
.wide .end .start { justify-content:center }
/* Phone portrait 9:16: title, then phones, then points. */
.tall { --w:1080px; --h:1920px; --u:12px; --pw:330px; --cols:2 }
.tall .slide { grid-template-rows:auto 1fr; padding:calc(var(--u)*10) calc(var(--u)*6) calc(var(--u)*7); align-content:start }
.tall .visual { order:-1; margin:calc(var(--u)*1) 0 calc(var(--u)*3); height:calc(var(--u)*72) }
.tall .slide.text-only { grid-template-rows:1fr }
.tall .text-only .text { align-self:center }
.tall .points b { font-size:calc(var(--u)*2.5) }
.tall .points small { font-size:calc(var(--u)*1.9) }
.tall h1 { font-size:calc(var(--u)*5) }
.tall .cover .visual { height:calc(var(--u)*80) }
.tall .end .text { text-align:center; display:flex; flex-direction:column; align-items:center }
.tall .start { flex-direction:column }
.tall .qr { width:calc(var(--u)*30); height:calc(var(--u)*30) }
.tall .link { text-align:center }
.tall .grid .tile b { font-size:calc(var(--u)*2.3) }
.tall .grid .tile small { font-size:calc(var(--u)*1.8) }
@page { margin:0 }
"""

def slide_html(i, total, kicker, title, lead, text, visual, cls, tall):
    head = f'<span class="kicker">{kicker}</span>' if kicker else ''
    lead_html = f'<p class="lead">{lead}</p>' if lead else ''
    text_block = f'<div class="text">{head}<h1>{title}</h1>{lead_html}{text}</div>'
    vis = f'<div class="visual">{visual}</div>' if visual else ''
    # Tall: the title sits above the phones; wide: text then phones (RTL puts text on the right).
    if tall and visual:
        body = f'<div class="text">{head}<h1>{title}</h1>{lead_html}</div>{vis}<div class="text">{text}</div>'
        cls += ' has-visual'
    else:
        body = text_block + vis
    mark = '' if 'cover' in cls else '<div class="brandmark"><img src="../../app/public/icons/icon-192.png" alt="">سجلك الصحي</div>'
    return f'<section class="slide {cls}">{mark}{body}<div class="pageno" dir="ltr">{i} / {total}</div></section>'

def build(name, tall):
    total = len(SLIDES)
    slides = ''.join(slide_html(i + 1, total, *s, tall) for i, s in enumerate(SLIDES))
    extra = '.tall .slide.has-visual { grid-template-rows:auto auto 1fr }' if tall else ''
    html = f'<!doctype html><html lang="ar"><head><meta charset="utf-8"><title>سجلك الصحي</title><style>{CSS}{extra}</style></head><body class="{"tall" if tall else "wide"}">{slides}</body></html>'
    (HERE / name).write_text(html, encoding='utf-8')

build('slides-16x9.html', tall=False)
build('slides-phone.html', tall=True)
print('built', len(SLIDES), 'slides')
