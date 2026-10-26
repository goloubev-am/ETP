from flask import Flask, request, jsonify, send_from_directory
from datetime import datetime
import csv, io, time, random

app = Flask(__name__, static_folder='static', static_url_path='')

store = {'tenders': {}}

def gen_id():
    return f"T-{int(time.time())}-{random.randint(100, 999)}"

# ---------- Статика ----------
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

# ---------- Загрузка реестра ТС ----------
@app.route('/api/upload-registry', methods=['POST'])
def upload_registry():
    try:
        content = request.files['file'].read().decode('utf-8-sig')
        rows = list(csv.reader(io.StringIO(content), delimiter=';'))
        vehicles = []
        for i, r in enumerate(rows[1:], start=1):
            if len(r) < 6:
                continue
            vehicles.append({
                'id': i,
                'mark': r[0], 'model': r[1], 'vin': r[2],
                'year': int(r[3]) if r[3].isdigit() else 0,
                'power': float(r[4].replace(',', '.')) if r[4] else 0,
                'value': float(r[5].replace(',', '.')) if r[5] else 0,
            })
        return jsonify({'vehicles': vehicles})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# ---------- Тендеры ----------
@app.route('/api/tenders', methods=['POST'])
def create_tender():
    data = request.json
    data['id'] = gen_id()
    data['status'] = 'CREATED'
    data['offers'] = {}
    data['winner_id'] = None
    data['created_at'] = datetime.now().isoformat()
    store['tenders'][data['id']] = data
    return jsonify(data), 201

@app.route('/api/tenders', methods=['GET'])
def list_tenders():
    return jsonify(list(store['tenders'].values()))

# ---------- Действия страховщика ----------
@app.route('/api/tender/action', methods=['POST'])
def insurer_action():
    tid = request.args.get('id')
    action = request.args.get('action')
    t = store['tenders'].get(tid)
    if not t:
        return jsonify({'error': 'Not found'}), 404
    if action == 'accept':
        t['status'] = 'ACCEPTED'
    elif action == 'decline':
        t['status'] = 'DECLINED'
    return jsonify(t)

# ---------- Отправка КП ----------
@app.route('/api/tender/offer', methods=['POST'])
def submit_offer():
    tid = request.args.get('id')
    t = store['tenders'].get(tid)
    if not t:
        return jsonify({'error': 'Not found'}), 404

    offer = request.json
    t['offers'][offer['insurer_id']] = offer

    target = t.get('target_insurers', [])
    need = 1 if (not target or target == ['ALL']) else len(target)
    t['status'] = 'ALL_OFFERS_RECEIVED' if len(t['offers']) >= need else 'KP_SUBMITTED'
    return jsonify(t)

# ---------- Скоринг ----------
@app.route('/api/tender/summary', methods=['GET'])
def summary():
    t = store['tenders'].get(request.args.get('id'))
    if not t:
        return jsonify({'error': 'Not found'}), 404
    offers = t['offers']
    if not offers:
        return jsonify([])

    min_price = min(o['price'] for o in offers.values())
    results = []
    for iid, o in offers.items():
        fin   = (min_price / o['price'] * 0.30) if o['price'] > 0 else 0
        days  = o.get('payout_days', 30)
        speed = (1.0 if days <= 10 else 0.9 if days <= 15 else 0.5) * 0.15
        qual  = o.get('rating_score', 0.5) * 0.08
        comp  = 1.0 * 0.35
        results.append({
            'insurer_id': iid,
            'total_score': fin + speed + qual + comp,
            'price': o['price'],
            'payout_days': days,
        })
    results.sort(key=lambda x: -x['total_score'])
    return jsonify(results)

# ---------- Победитель ----------
@app.route('/api/tender/winner', methods=['POST'])
def select_winner():
    tid = request.args.get('id')
    t = store['tenders'].get(tid)
    if not t:
        return jsonify({'error': 'Not found'}), 404
    t['status'] = 'CLOSED'
    t['winner_id'] = request.json['winner_id']
    return jsonify(t)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)