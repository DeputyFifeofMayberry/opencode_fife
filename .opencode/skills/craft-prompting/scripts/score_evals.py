"""Aggregate evidence-backed reviews; never generate or infer target-model results."""
import argparse
import json
from pathlib import Path


def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding='utf-8').splitlines() if line.strip()]


def score(cases, records):
    fixtures = {c['id']: c for c in cases}
    if not fixtures or len(fixtures) != len(cases):
        raise ValueError('Fixtures must have unique IDs and cannot be empty.')
    if not records:
        raise ValueError('No run records: evaluation has not run.')
    results = {}
    targets = {}
    for r in records:
        cid, version, repeat = r['case_id'], r['version'], r['repeat']
        if cid not in fixtures or version not in ('baseline', 'candidate'):
            raise ValueError('Unknown case or version.')
        if type(repeat) is not int or repeat < 1:
            raise ValueError('repeat must be a positive integer.')
        key = (cid, version, repeat)
        if key in results:
            raise ValueError('Duplicate case/version/repeat.')
        for field in ('model', 'host', 'output'):
            if not isinstance(r.get(field), str) or not r[field].strip():
                raise ValueError(f'Missing {field}.')
        if r['model'].strip().lower() in ('unknown', 'unspecified') or r['host'].strip().lower() in ('unknown', 'unspecified'):
            raise ValueError('Target model and host versions must be identified.')
        if not isinstance(r.get('settings'), dict) or not isinstance(r.get('tools'), list):
            raise ValueError('Record settings and tools explicitly.')
        target = json.dumps({k:r[k] for k in ('model','host','settings','tools')}, sort_keys=True)
        targets[key] = target
        criteria = fixtures[cid]['criteria']
        if set(r.get('checks', {})) != set(criteria) or set(r.get('evidence', {})) != set(criteria):
            raise ValueError('Checks/evidence must match all fixture criteria exactly.')
        if any(type(v) is not bool and v is not None for v in r['checks'].values()):
            raise ValueError('Check values must be true, false or null.')
        if any(not isinstance(v, str) or not v.strip() for v in r['evidence'].values()):
            raise ValueError('Every check needs evidence or an explanation of missing evidence.')
        activated = r.get('activated')
        if type(activated) is not bool and activated is not None:
            raise ValueError('activated must be true, false or null.')
        failed = False in r['checks'].values() or (activated is not None and activated != fixtures[cid]['expected_activation'])
        incomplete = activated is None or None in r['checks'].values()
        results[key] = 'fail' if failed else ('incomplete' if incomplete else 'pass')
    pairs = {(cid, repeat) for cid, _, repeat in results}
    missing = set(fixtures) - {cid for cid, _ in pairs}
    if missing:
        raise ValueError('Missing cases: ' + ', '.join(sorted(missing)))
    regressions = []
    improvements = []
    for cid, repeat in sorted(pairs):
        a, b = (cid, 'baseline', repeat), (cid, 'candidate', repeat)
        if a not in results or b not in results:
            raise ValueError('Every repetition requires baseline and candidate records.')
        if targets[a] != targets[b]:
            raise ValueError('Paired target model, host, settings and tools must match.')
        if results[a] == 'pass' and results[b] == 'fail':
            regressions.append({'case_id':cid, 'repeat':repeat})
        if results[a] == 'fail' and results[b] == 'pass':
            improvements.append({'case_id':cid, 'repeat':repeat})
    summary = {v:{s:sum(status == s for (cid, ver, rep), status in results.items() if ver == v) for s in ('pass','fail','incomplete')} for v in ('baseline','candidate')}
    ready = summary['candidate']['fail'] == 0 and summary['candidate']['incomplete'] == 0 and summary['baseline']['incomplete'] == 0 and not regressions
    return {'summary':summary,'regressions':regressions,'improvements':improvements,'regression_gate_passed':ready,'semantic_scoring':'Reviewed observations supplied by evaluator; not automatically judged.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cases')
    parser.add_argument('runs')
    args = parser.parse_args()
    try:
        report = score(read_jsonl(args.cases), read_jsonl(args.runs))
    except (ValueError, KeyError, TypeError, OSError) as exc:
        parser.exit(2, f'Invalid or incomplete evaluation: {exc}\n')
    print(json.dumps(report, indent=2))
    return 0 if report['regression_gate_passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
