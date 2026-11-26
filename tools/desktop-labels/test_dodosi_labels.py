import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

APP = os.environ.get('CREO_LABEL_APP', '')
if APP:
    sys.path.insert(0, APP)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dodosi_label_design import normalize_ticket, render_portrait


def ticket():
    return dict(kind='dodosi_ticket',lot_number='A01',origin='크레용(대구)',sender_name='발송인',sender_phone='01000000001',
                destination='[서울/강동] 티그리스게코',winner_name='수령인',winner_phone='01000000002',
                dropoff_date='2026-11-24',arrival_date='2026-11-28',broadcast_date='2026-11-23',bundle_lots=['A01','B02','C03'],bundle_index=0)


class TicketTest(unittest.TestCase):
    def test_pair_and_serialization_preserve_order(self):
        jobs=normalize_ticket(ticket())
        self.assertEqual([j['label_layout'] for j in jobs],['dodosi_departure_b1','dodosi_arrival_b1'])
        self.assertEqual(jobs[0]['winner_name'],'발송인')
        self.assertEqual(jobs[1]['winner_name'],'수령인')
        self.assertEqual(json.loads(json.dumps(jobs)),jobs)
        self.assertEqual(json.loads(jobs[0]['sold_price']),{'date':'2026-11-23','lots':['A01','B02','C03'],'index':0})

    def test_invalid_data_is_not_silently_truncated(self):
        for key,value in [('sender_phone',''),('arrival_date','2026-11-22'),('dropoff_date','2026-02-30'),('lot_number',''),('destination','x'*181),('broadcast_date',''),('bundle_index',2),('bundle_lots',['A01']*13)]:
            with self.assertRaises(ValueError):normalize_ticket({**ticket(),key:value})

    def test_side_selection_keeps_order_and_defaults_to_two(self):
        for sides,expected in [(['departure'],['dodosi_departure_b1']),(['arrival'],['dodosi_arrival_b1']),(['arrival','departure'],['dodosi_departure_b1','dodosi_arrival_b1'])]:
            jobs=normalize_ticket({**ticket(),'sides':sides})
            self.assertEqual([j['label_layout'] for j in jobs],expected)
        self.assertEqual(len(normalize_ticket(ticket())),2)
        for sides in [[],None,'departure',['unknown'],['arrival','arrival'],[{}]]:
            with self.assertRaises(ValueError):normalize_ticket({**ticket(),'sides':sides})

    @unittest.skipUnless(APP,'installed app integration')
    def test_bridge_and_bitmap_without_printer_io(self):
        import label_print_bridge as b
        import niimbot_printer as p
        jobs=b.normalize_label_request({'labels':[ticket(),dict(lot_number='B02',winner_name='기존',winner_phone='01000000003',destination='파르게 · 서울')]})
        self.assertEqual(len(jobs),3)
        self.assertEqual(jobs[2]['label_layout'],'shipping_b1_50x30')
        for job in jobs[:2]:
            image=p.create_label(**job)
            self.assertEqual(image.size,(576,360))
            self.assertIsNotNone(image.getbbox())
        with self.assertRaises(b.LabelBridgeRequestError):
            b.normalize_label_request({'labels':[ticket(),{**ticket(),'winner_phone':''}]})

    def test_unknown_dates_are_blank_but_partial_or_invalid_dates_are_rejected(self):
        item={**ticket(),'dropoff_date':'','arrival_date':''}
        jobs=normalize_ticket(item)
        self.assertEqual([j['company'] for j in jobs],['',''])
        self.assertEqual(jobs[1]['winner_name'],'수령인')
        for key in ('dropoff_date','arrival_date'):
            with self.assertRaises(ValueError):normalize_ticket({**ticket(),key:''})

    @unittest.skipUnless(APP,'installed app integration')
    def test_undated_bitmap_leaves_date_area_empty_and_bridge_accepts(self):
        from PIL import ImageOps
        import label_print_bridge as b
        import niimbot_printer as p
        jobs=b.normalize_label_request({'labels':[{**ticket(),'dropoff_date':'','arrival_date':''}]})
        for index,job in enumerate(jobs):
            page=render_portrait(job['num'],job['item_name'],job['winner_name'],job['winner_phone'],job['company'],job['sold_price'],index==0)
            self.assertIsNone(ImageOps.invert(page.crop((0,474,360,540))).getbbox())
            self.assertIsNotNone(ImageOps.invert(page.crop((0,234,360,420))).getbbox())
            self.assertEqual(p.create_label(**job).size,(576,360))

    @unittest.skipUnless(APP,'installed app integration')
    def test_arrival_recipient_phone_date_and_single_line_lots(self):
        import niimbot_printer as p
        item=ticket()
        with patch.object(p,'_draw_text_in_box',wraps=p._draw_text_in_box) as draw:
            page=render_portrait('A01',item['destination'],item['winner_name'],item['winner_phone'],item['arrival_date'],normalize_ticket(item)[1]['sold_price'],False)
        calls={call.args[1]:call for call in draw.call_args_list}
        self.assertEqual(calls['수령인'].args[3][1:4:2],(234,294))
        self.assertEqual(calls['01000000002'].args[3][1:4:2],(354,420))
        self.assertEqual(calls['11/28'].args[3][1:4:2],(474,540))
        for lot in item['bundle_lots']:
            self.assertEqual(calls[lot].args[3][1:4:2],(3,39))
        self.assertEqual(calls['A01'].kwargs['fill'],255)
        self.assertEqual(calls['B02'].kwargs['fill'],0)
        self.assertEqual(page.size,(360,600))

    @unittest.skipUnless(APP,'installed app integration')
    def test_departure_has_origin_sender_phone_and_dropoff_date(self):
        import niimbot_printer as p
        item=ticket()
        with patch.object(p,'_draw_multiline_text_in_box',wraps=p._draw_multiline_text_in_box) as multiline, patch.object(p,'_draw_text_in_box',wraps=p._draw_text_in_box) as draw:
            render_portrait('A01',item['origin'],item['sender_name'],item['sender_phone'],item['dropoff_date'],normalize_ticket(item)[0]['sold_price'],True)
        self.assertEqual(multiline.call_args.args[1],['크레용(대구)'])
        self.assertEqual(multiline.call_args.args[3][1:4:2],(42,192))
        calls={call.args[1]:call for call in draw.call_args_list}
        self.assertEqual(calls['발송인'].args[3][1:4:2],(234,294))
        self.assertEqual(calls['01000000001'].args[3][1:4:2],(354,420))
        self.assertEqual(calls['11/24(화)'].args[3][1:4:2],(474,540))

    @unittest.skipUnless(APP,'installed app integration')
    def test_twelve_lots_stay_on_one_line_within_stock(self):
        import niimbot_printer as p
        item={**ticket(),'bundle_lots':[f'A{i:02}' for i in range(1,13)]}
        with patch.object(p,'_draw_text_in_box',wraps=p._draw_text_in_box) as draw:
            render_portrait('A01',item['destination'],item['winner_name'],item['winner_phone'],item['arrival_date'],normalize_ticket(item)[1]['sold_price'],False)
        calls=[c for c in draw.call_args_list if c.args[1] in item['bundle_lots']]
        self.assertEqual(len(calls),12)
        self.assertTrue(all(c.args[3][1]==3 and c.args[3][2]<=342 for c in calls))

    @unittest.skipUnless(APP,'installed app integration')
    def test_http_batch_queues_left_then_right_without_printing(self):
        import http.client
        import label_print_bridge as b
        received=[]
        bridge=b.start_label_print_bridge(lambda jobs:received.extend(jobs) or len(jobs),port=0)
        try:
            conn=http.client.HTTPConnection('127.0.0.1',bridge.port,timeout=3)
            headers={'Origin':'https://creok.onrender.com','Content-Type':'application/json'}
            conn.request('GET','/v1/status',headers=headers)
            self.assertGreaterEqual(json.loads(conn.getresponse().read())['dodosiTicketVersion'],4)
            conn.request('POST','/v1/labels',json.dumps({'labels':[ticket(),ticket()]}).encode(),headers)
            response=conn.getresponse();self.assertEqual(response.status,202)
            self.assertEqual(json.loads(response.read())['accepted'],4)
            self.assertEqual([j['label_layout'] for j in received],['dodosi_departure_b1','dodosi_arrival_b1']*2)
            conn.request('POST','/v1/labels',json.dumps({'labels':[ticket(),{**ticket(),'sender_phone':''}]}).encode(),headers)
            response=conn.getresponse();response.read();self.assertEqual(response.status,400);self.assertEqual(len(received),4)
            for side in ['departure','arrival']:
                received.clear()
                conn.request('POST','/v1/labels',json.dumps({'labels':[{**ticket(),'sides':[side]},{**ticket(),'sides':[side]}]}).encode(),headers)
                response=conn.getresponse();self.assertEqual(response.status,202)
                self.assertEqual(json.loads(response.read())['accepted'],2)
                self.assertEqual([j['label_layout'] for j in received],['dodosi_'+side+'_b1']*2)
            conn.request('POST','/v1/labels',json.dumps({'labels':[ticket(),{**ticket(),'sides':[]}]}).encode(),headers)
            response=conn.getresponse();response.read();self.assertEqual(response.status,400);self.assertEqual(len(received),2)
        finally:bridge.shutdown()


if __name__=='__main__':unittest.main()
