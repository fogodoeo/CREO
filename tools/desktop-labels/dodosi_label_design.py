"""Two portrait ticket stickers on the existing B1 PRO 50x30 stock.

Pure validation/rendering only. Never books a shipment or sends printer commands.
"""
import re
import json
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
    lots = label.get('bundle_lots')
    index = label.get('bundle_index')
    broadcast = str(label.get('broadcast_date') or '')
    try:
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', broadcast):
            raise ValueError()
        date.fromisoformat(broadcast)
    except ValueError:
        raise error_type('방송일을 확인해 주세요.')
    if not isinstance(lots, list) or not 1 <= len(lots) <= 12 or any(not isinstance(v, str) or not v.strip() or len(v) > 20 for v in lots):
        raise error_type('합배송 개체번호를 확인해 주세요. 최대 12칸까지 출력합니다.')
    if type(index) is not int or not 0 <= index < len(lots) or lots[index] != num:
        raise error_type('합배송에서 현재 개체 위치를 확인해 주세요.')
    summary = json.dumps({'date':broadcast, 'lots':lots, 'index':index}, ensure_ascii=False)
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

    text(person if departure else shop, 7, 25, 48, wrap=True)
    text(phone, 39, 10, 39)
    day = date.fromisoformat(date_value)
    text(f'{day.month}/{day.day}' + (f'({"월화수목금토일"[day.weekday()]})' if departure else ''), 59, 11, 50)
    footer = json.loads(summary)
    broadcast = date.fromisoformat(footer['date'])
    d.line((18, 462, 342, 462), fill=0, width=2)
    text(f'{broadcast.month}/{broadcast.day} 방송', 77, 6, 27)
    lots = footer['lots']
    cols = len(lots) if len(lots) <= 3 else 3 if len(lots) <= 9 else 4
    rows = (len(lots) + cols - 1) // cols
    gap = 4
    cell_width = (324 - gap * (cols - 1)) / cols
    cell_height = (72 - gap * (rows - 1)) / rows
    for i, lot in enumerate(lots):
        x = 18 + (i % cols) * (cell_width + gap)
        y = 510 + (i // cols) * (cell_height + gap)
        current = i == footer['index']
        box = (x, y, x + cell_width, y + cell_height)
        d.rectangle(box, outline=0, fill=0 if current else 255, width=2)
        font = p._fit_font_to_box(d, lot, font_path, cell_width-8, cell_height-6, max_size=30, min_size=8)
        p._draw_text_in_box(d, lot, font, (x+4,y+3,x+cell_width-4,y+cell_height-3), fill=255 if current else 0, align='center')
    return page


def render(num, shop, person, phone, date_value, summary='', departure=True, font_key=None):
    # Existing B1 pipeline is 576 dots across (50 mm) and 360 rows (30 mm).
    # Rotate portrait artwork into that feed orientation; don't change roll settings.
    portrait = render_portrait(num, shop, person, phone, date_value, summary, departure, font_key)
    return portrait.resize((360, 576), Image.Resampling.LANCZOS).rotate(90, expand=True)
