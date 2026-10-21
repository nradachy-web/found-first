"""Regenerate the public, blank planning kit; no client data or network access."""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "resources/found-first-field-kit.pdf"
BLACK = colors.HexColor("#111111")
GRAY = colors.HexColor("#555555")
BODY = ParagraphStyle("body", fontName="Helvetica", fontSize=10, leading=15, textColor=GRAY)
NOTE = ParagraphStyle("note", parent=BODY, fontSize=8, leading=11)
TITLE = ParagraphStyle("title", parent=BODY, fontName="Helvetica-Bold", fontSize=11, leading=15, textColor=BLACK)
c = canvas.Canvas(str(OUTPUT), pagesize=(612, 792), invariant=1)
c.setTitle("Found First - AI Visibility Field Kit - October 21, 2026")
c.setAuthor("Found First")


def para(text, x, top, width=516, style=BODY):
    block = Paragraph(text, style)
    _, height = block.wrap(width, 700)
    block.drawOn(c, x, top - height)
    return top - height


def frame(number, label, title, subtitle):
    c.setFillColor(BLACK)
    c.drawImage(str(ROOT / "assets/logo-horizontal.png"), 48, 738, width=145, height=48, preserveAspectRatio=True, mask="auto")
    c.setFont("Courier", 7)
    c.setFillColor(GRAY)
    c.drawRightString(564, 754, "FIELD KIT / 2026.10.21")
    c.setStrokeColor(colors.HexColor("#cccccc"))
    c.line(48, 729, 564, 729)
    c.drawString(48, 703, f"0{number} / {label}")
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 34)
    for index, line in enumerate(title):
        c.drawString(48, 662 - index * 39, line)
    para(subtitle, 48, 588)
    c.setFillColor(GRAY)
    c.setFont("Courier", 7)
    c.line(48, 60, 564, 60)
    c.drawString(48, 43, "AI VISIBILITY / AEO / CHATGPT ADS")
    c.drawRightString(564, 43, f"0{number} / 04")


frame(1, "THE READINESS CHECK", ["Be part of", "the answer."],
      "Use this blank planning kit to identify information gaps, keep evidence and agree useful work. It contains no client results or live study data.")
top = 513
for heading, text in [
    ("Keep business facts accurate.", "Check services, contact details, locations and relevant profiles. Use the service area the business actually covers."),
    ("Make useful pages accessible.", "Review crawl and indexing settings, canonical URLs and readable content. Check the Search Console generative-AI inclusion setting separately."),
    ("Answer a real customer decision.", "Explain fit, scope, price drivers, process and limitations. Use first-hand knowledge and current sources; a city-name swap is not a useful new page."),
    ("Keep evidence and approval together.", "Retain the source, version, approved facts and media permissions. Review final copy and destination, then verify publication."),
    ("Separate visibility from outcomes.", "Track impressions, sampled citations, identifiable referrals, received inquiries and confirmed revenue separately. Missing evidence stays unknown."),
    ("Agree the work before it starts.", "Choose the level of ongoing work and agree deliverables. Final allowances, term, billing, ownership, hosting and support belong in the written scope. New builds and media spend are separate."),
]:
    c.rect(48, top - 11, 9, 9, stroke=1, fill=0)
    bottom = para(heading, 70, top + 1, 494, TITLE)
    bottom = para(text, 70, bottom - 6, 494)
    top = bottom - 17
para("This is a planning checklist, not a ranking score. Google does not require a special AI file or schema. Eligibility does not guarantee inclusion or recommendations.", 48, 103, style=NOTE)
c.showPage()

frame(2, "THE SOURCE STUDY", ["Start with", "the buyer."],
      "Agree the niche, actual market and intended customer. These example question types are planning prompts, not a generated question pack or measured demand.")
top = 510
for number, heading, text in [
    (1, "DISCOVER", "Which [providers] handle [need] in [actual service area]?"),
    (2, "UNDERSTAND COST", "What affects the cost of [service or product]?"),
    (3, "CHECK FIT", "Does [provider] handle [specific requirement]?"),
    (4, "COMPARE", "What should I compare before choosing [category]?"),
    (5, "REDUCE RISK", "What should I verify before hiring [provider]?"),
]:
    c.setFont("Courier", 8)
    c.setFillColor(GRAY)
    c.drawString(48, top, f"0{number} / {heading}")
    para(text, 48, top - 10, style=TITLE)
    top -= 58
para("Keep the record, not just a score.", 48, 210, style=TITLE)
para("Freeze exact questions and context; repeat fresh web-enabled requests. Save model, provider, search configuration, date, repetition, raw answer and outcome. Distinguish executed search, exposed retrieved sources and citations. Review whether the answer is substantive and its sources support it before reporting recurrence.", 48, 187)
para("An API study measures that API configuration. Consumer-app behavior needs separate checks. A sample is not market share, and a citation is not proof that a later content change caused an improvement.", 48, 108, style=NOTE)
c.showPage()

frame(3, "THE CAMPAIGN BRIEF", ["Give the test", "a reason to exist."],
      "Agree the objective, readiness, scope and review criteria before committing work or media spend. Use the downloadable campaign brief for the full record.")
top = 511
for heading, text in [
    ("Buyer, offer and destination", "Who is deciding, what do they need, and which working page provides the useful next step?"),
    ("Claims, permissions and readiness", "Keep approved evidence and assets. Confirm account eligibility, access, billing, creative and launch authority."),
    ("Qualified outcome", "Define a useful inquiry, opportunity or purchase and identify the record that verifies it."),
    ("Budget and decision rule", "Record billing currency, current minimums, budget type and spend limit. Daily budgets are average targets; campaign-total budgets control the total. Service fees and media are separate."),
    ("Delivery and next review", "Name the owner, approval, publishing check and next action. Record written service periods and renewal; no automatic extension is implied."),
]:
    bottom = para(heading, 48, top, style=TITLE)
    bottom = para(text, 48, bottom - 5)
    top = bottom - 19
para("Current references / reviewed October 21, 2026", 48, 156, style=TITLE)
para('<link href="https://support.google.com/webmasters/answer/16984139">Google Generative AI performance report</link> | <link href="https://support.google.com/webmasters/answer/16908024">Google inclusion control</link><br/><link href="https://help.openai.com/en/articles/20001210-create-campaigns-for-chatgpt-ads">OpenAI campaign budgets</link> | <link href="https://help.openai.com/en/articles/20001245-ads-manager-availability">Ads Manager availability</link>', 48, 136, style=NOTE)
para("Free initial visibility check: nick@modernapexstrategies.com<br/>befoundfirst.ai/", 48, 99, style=NOTE)
c.showPage()
frame(4, "THE SERVICE PROPOSAL", ["Choose the work.", "Agree the scope."],
      "Proposed monthly service fees for one brand and one existing website. Advertising spend is separate. Final allowances and commercial terms are confirmed in writing before work starts.")
para("Foundation / $2,000 per month", 48, 514, style=TITLE)
para("Eligible ChatGPT campaign management and one initial improvement round on agreed existing pages. Includes campaign and inquiry reporting. Ongoing website optimization, customer-question research and recurring answer pages are not included.", 48, 492)
para("Growth / $3,500 per month", 48, 423, style=TITLE)
para("Everything in Foundation, plus website optimization at least once per month, an ongoing monthly research cycle and new or substantially improved answer pages. Final page and campaign allowances are agreed in your scope.", 48, 401)
para("Expansion / $5,000 per month", 48, 332, style=TITLE)
para("Everything in Growth, with the same website-page allowance. Adds adaptation, approval, scheduling and distribution of content through relevant channels, plus channel reporting. The publishing plan follows audience fit; there is no fixed post quota.", 48, 310)
para("Scope, readiness and costs", 48, 241, style=TITLE)
para("New websites, major repairs, rebuilds, migrations and custom integrations need separate scope. Hosting, support and third-party costs are identified in the quote. Confirm delivery allowances, billing periods, term, renewal and ownership in writing. Ads launch only after eligibility, access, billing, creative, destination and media budget approval are confirmed.", 48, 220, style=NOTE)
para("Distribution excludes community management, inbox handling, automated outreach, filming and on-site photography. No automatic renewal or guaranteed AI recommendations, rankings, leads or sales. Platform availability and policies apply.", 48, 151, style=NOTE)
para('<link href="https://befoundfirst.ai/#programs">befoundfirst.ai / programs</link> | nick@modernapexstrategies.com', 48, 87, style=NOTE)
c.save()
print(OUTPUT)
