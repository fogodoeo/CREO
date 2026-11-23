import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

APP = os.environ.get('CREO_LABEL_APP', '')
if APP:
    sys.path.insert(0, APP)
from dodosi_label_design import normalize_ticket, render_portrait


def ticket():
    return dict(kind='dodosi_ticket',lot_number='A01',origin='크레용(대구)',sender_name='발송인',sender_phone='01000000001',
                destination='[서울/강동] 티그리스게코',winner_name='수령인',winner_phone='01000000002',
                dropoff_date='2026-11-24',arrival_date='2026-11-28',bundle_summary='합배송 2마리')


class TicketTest(unittest.TestCase):
    def test_pair_and_serialization_preserve_order(self):
        jobs=normalize_ticket(ticket())
        self.assertEqual([j['label_layout'] for j in jobs],['dodosi_departure_b1','dodosi_arrival_b1'])
        self.assertEqual(jobs[0]['winner_name'],'발송인')
        self.assertEqual(jobs[1]['winner_name'],'수령인')
        self.assertEqual(json.loads(json.dumps(jobs)),jobs)

    def test_invalid_data_is_not_silently_truncated(self):
        for key,value in [('sender_phone',''),('arrival_date','2026-11-22'),('dropoff_date','2026-02-30'),('lot_number',''),('destination','x'*181)]:
            with self.assertRaises(ValueError):normalize_ticket({**ticket(),key:value})

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
            self.assertEqual(json.loads(conn.getresponse().read())['dodosiTicketVersion'],1)
            conn.request('POST','/v1/labels',json.dumps({'labels':[ticket(),ticket()]}).encode(),headers)
            response=conn.getresponse();self.assertEqual(response.status,202)
            self.assertEqual(json.loads(response.read())['accepted'],4)
            self.assertEqual([j['label_layout'] for j in received],['dodosi_departure_b1','dodosi_arrival_b1']*2)
            conn.request('POST','/v1/labels',json.dumps({'labels':[ticket(),{**ticket(),'sender_phone':''}]}).encode(),headers)
            response=conn.getresponse();response.read();self.assertEqual(response.status,400);self.assertEqual(len(received),4)
        finally:bridge.shutdown()


if __name__=='__main__':unittest.main()
