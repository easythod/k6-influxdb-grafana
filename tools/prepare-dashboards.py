#!/usr/bin/env python3
"""Download the community k6 dashboards from grafana.com and adapt them for file provisioning.

    python3 tools/prepare-dashboards.py

Exports from grafana.com use `${DS_*}` placeholders that only the UI import dialog fills in,
so they are replaced with the datasource uids from config/grafana/provisioning/datasources.
"""
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'config' / 'grafana' / 'dashboards'

# grafana.com dashboard id -> (backend, output file)
SOURCES = {
    18030: ('prometheus', 'prometheus/k6-prometheus.json'),  # "k6 Prometheus (Native Histograms)" by the k6 team
    23401: ('influxdb', 'influxdb/k6-influxdb.json'),  # "K6 Monitoring, Troubleshooting and Reporting"
}

# Browser Web Vitals panels of dashboard 23401; this project tests an HTTP API only.
WEB_VITALS = {'LCP', 'INP', 'CLS', 'FCP', 'TTFB', 'FID', 'Core Web Vitals Overview',
              'Core Web Vitals by Page URL', 'Core Web Vitals (can filter by page URL)'}


def walk(panels):
    for panel in panels:
        yield panel
        yield from walk(panel.get('panels', []))


def custom_variable(variable, label, values, default):
    for key in ('definition', 'regex', 'refresh', 'sort', 'datasource'):
        variable.pop(key, None)
    variable.update(type='custom', label=label, query=','.join(values),
                    current={'text': default, 'value': default},
                    options=[{'text': v, 'value': v, 'selected': v == default} for v in values])


def prepare_prometheus(d):
    d.update(uid='k6-prometheus', title='k6 Load Test Results (Prometheus)')
    for v in d['templating']['list']:
        if v['name'] == 'quantile':  # free-text box in the original
            custom_variable(v, 'Quantile', ['0.95', '0.99', '0.9', '0.5'], '0.95')
    for panel in walk(d['panels']):
        for target in panel.get('targets', []):
            expr = target.get('expr', '')
            if expr.startswith('sum(') and 'expected_response="false"' in expr and 'or vector' not in expr:
                target['expr'] = expr + ' or vector(0)'  # show 0 instead of "No data" when nothing failed
        if panel.get('type') != 'stat':
            continue
        # Stat panels default to the last value; for a finished test that is the tail of the ramp-down.
        if panel['title'] == 'HTTP Request Duration':
            # One quantile over the whole selected time range instead of the last interval.
            panel['targets'][0].update(
                expr='histogram_quantile($quantile, sum(rate(k6_http_req_duration_seconds{testid=~"$testid"}[$__range])))',
                instant=True, range=False)
        else:
            panel['options']['reduceOptions']['calcs'] = ['max']


def prepare_influxdb(d):
    d.update(uid='k6-influxdb', title='k6 Load Test Results (InfluxDB)', refresh='5s')
    d['panels'] = [p for p in d['panels'] if p.get('title') not in WEB_VITALS]
    d['templating']['list'] = [v for v in d['templating']['list'] if v['name'] != 'PageURL']
    for v in d['templating']['list']:
        if v.get('type') == 'query':
            v['datasource'] = {'type': 'influxdb', 'uid': 'influxdb'}
    for panel in d['panels']:  # close the gaps left by the removed rows (y 12-15 and 19-46)
        y = panel['gridPos']['y']
        panel['gridPos']['y'] = y - (4 if y >= 16 else 0) - (28 if y >= 47 else 0)
    for panel in walk(d['panels']):
        if panel.get('interval') == '>1s':  # rejected by Grafana 12+
            panel['interval'] = '1s'
        overrides = panel.get('fieldConfig', {}).get('overrides', [])
        panel.setdefault('fieldConfig', {})['overrides'] = [o for o in overrides if o.get('properties')]


def main():
    for gnet_id, (backend, out) in SOURCES.items():
        url = f'https://grafana.com/api/dashboards/{gnet_id}/revisions/latest/download'
        raw = urllib.request.urlopen(url).read().decode()
        if backend == 'prometheus':
            raw = raw.replace('${DS_PROMETHEUS}', 'prometheus')
        else:
            raw = (raw.replace('${DS_INFLUXDB}', 'influxdb')
                      .replace('${DS_EXPRESSION}', '__expr__')
                      .replace('"$interval"', '"$__interval"'))  # undefined variable in the original

        d = json.loads(raw)
        d.pop('__inputs', None)
        d.pop('__elements', None)
        d['id'] = None
        d['gnetId'] = gnet_id
        (prepare_prometheus if backend == 'prometheus' else prepare_influxdb)(d)
        d['tags'] = sorted(set(d.get('tags', []) + ['k6', backend]))

        path = ROOT / out
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(d, indent=2) + '\n')
        print(f'{gnet_id} -> {path.relative_to(ROOT.parent.parent.parent)}')


if __name__ == '__main__':
    main()
