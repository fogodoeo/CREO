"""Two portrait ticket stickers on the existing B1 PRO 50x30 stock.

Pure validation/rendering only. Never books a shipment or sends printer commands.
"""
import re
from datetime import date
from PIL import Image, ImageDraw

LAYOUTS = ('dodosi_departure_b1', 'dodosi_arrival_b1')


def normalize_ticket(label, error_type=ValueError):
    def required(key, limit=80):
        value = ' '.join(str(label.get(key) or '').split())
        if not value or len(value) > limit:
            raise error_type('도도시 라벨 정보를 확인해 주세요: ' + key)
        return value

    def mobile(key):
        value = re.sub(r'\D', '', str(label.get(key) or ''))
        if not re.fullmatch(r'01\d{8,9}', value):
            raise error_type('도도시 연락처를 확인해 주세요.')
        return value

    dates = []
    for key in ('dropoff_date', 'arrival_date'):
        value = str(label.get(key) or '')
        try:
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                raise ValueError()
            dates.append(date.fromisoformat(value))
        except ValueError:
            raise error_type('도도시 배송 일정을 확인해 주세요.')
    if dates[1] < dates[0]:
        raise error_type('도착 예정일이 맡김일보다 빠릅니다.')
    num = required('lot_number', 20)
    summary = ' '.join(str(label.get('bundle_summary') or '').split())[:60]
    jobs = []
    for index, (shop, person, phone) in enumerate((('origin', 'sender_name', 'sender_phone'), ('destination', 'winner_name', 'winner_phone'))):
        jobs.append({'num': num, 'item_name': required(shop, 180), 'winner_name': required(person, 40),
                     'winner_phone': mobile(phone), 'company': dates[index].isoformat(),
                     'sold_price': summary, 'label_layout': LAYOUTS[index]})
    return jobs


def render_portrait(num, shop, person, phone, date_value, summary='', departure=True, font_key=None):
    import niimbot_printer as p
    page = Image.new('L', (360, 600), 255)
    d = ImageDraw.Draw(page)
    _, font_path = p.get_font_paths(font_key)

    def text(value, top, height, size, wrap=False):
        box = (18, round(top * 6), 342, round((top + height) * 6))
        if wrap:
            parts = re.split(r'(?<=\])\s+', str(value), maxsplit=1) if str(value).startswith('[') else []
            if len(parts) == 2:
                lines = parts
                font = p._fit_multiline_font_to_box(d, lines, font_path, 324, box[3]-box[1], max_size=size, min_size=12, line_gap=2)
            else:
                font, lines = p._fit_wrapped_lines_to_box(d, str(value), font_path, 324, box[3]-box[1],
                                                      max_size=size, min_size=12, max_lines=3, line_gap=2)
            p._draw_multiline_text_in_box(d, lines, font, box, line_gap=2, align='left')
        else:
            font = p._fit_font_to_box(d, str(value), font_path, 324, box[3]-box[1], max_size=size, min_size=10)
            p._draw_text_in_box(d, str(value), font, box, align='left')

    text('도도시 · 출발' if departure else '도도시 · 도착', 2.5, 6, 28)
    d.line((18, 51, 342, 51), fill=0, width=2)
    text(num, 9, 11, 58)
    text('출발지' if departure else '도착지', 22, 4, 22)
    text(shop, 27, 14, 39, wrap=True)
    text('보내는 분' if departure else '받는 분', 44, 4, 22)
    text(person, 49, 8, 40)
    text(re.sub(r'^(\d{3})(\d{3,4})(\d{4})$', r'\1-\2-\3', phone), 58, 7, 30)
    text('맡기는 날 · 예정' if departure else '찾는 날 · 도착 예정', 70, 4, 22)
    day = date.fromisoformat(date_value)
    text(f'{day.month}/{day.day}({"월화수목금토일"[day.weekday()]})', 75, 10, 44)
    d.line((18, 540, 342, 540), fill=0, width=2)
    text(summary, 90, 5, 22)
    return page


def render(num, shop, person, phone, date_value, summary='', departure=True, font_key=None):
    # Existing B1 pipeline is 576 dots across (50 mm) and 360 rows (30 mm).
    # Rotate portrait artwork into that feed orientation; don't change roll settings.
    portrait = render_portrait(num, shop, person, phone, date_value, summary, departure, font_key)
    return portrait.resize((360, 576), Image.Resampling.LANCZOS).rotate(90, expand=True)
