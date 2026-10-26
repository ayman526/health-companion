# Product presentation (Arabic)

- `سجلك-الصحي-عرض-16x9.pdf`: wide, for presenting on a screen.
- `سجلك-الصحي-عرض-للهاتف.pdf`: vertical, for sharing on phones and WhatsApp.

Both come from `build.py` (slide texts and layout) and the app screens in `shots/`.
To change a slide: edit `build.py`, run `python3 docs/presentation/build.py`, then
print `slides-16x9.html` (1920×1080) and `slides-phone.html` (1080×1920) to PDF
with backgrounds on (Chrome: Print → Save as PDF, or a headless browser).
