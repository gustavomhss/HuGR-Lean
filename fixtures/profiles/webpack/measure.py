"""Capture measurements and registry tarball SRI evidence; no product checks."""
import base64
import hashlib
import json
from pathlib import Path
import urllib.request

OUT = Path(__file__).resolve().parent
receipt = json.loads((OUT / 'capture-receipt.json').read_text())


def layout(raw):
    # Preserve every original non-layout byte, including exact string token spellings.
    end = len(raw.rstrip(b' \t\r\n'))
    result = bytearray()
    quoted = escaped = False
    for byte in raw[:end]:
        if quoted:
            result.append(byte)
            if escaped:
                escaped = False
            elif byte == 92:
                escaped = True
            elif byte == 34:
                quoted = False
        elif byte == 34:
            quoted = True
            result.append(byte)
        elif byte not in b' \t\r\n':
            result.append(byte)
    return bytes(result) + raw[end:]


control = b'{ "a" : "space keep", "n": 1 }\n'
compact = layout(control)
measurements = dict(layoutControl=dict(inputHex=control.hex(), outputHex=compact.hex(),
                    removedBytes=len(control)-len(compact)), cases=[], producerIntegrity=[])
for fact in receipt['cases']:
    raw = (OUT / fact['file']).read_bytes()
    row = dict(name=fact['name'], exit=fact['termination']['code'], bytes=len(raw),
               sha256=hashlib.sha256(raw).hexdigest(), finalLF=raw.endswith(b'\n'),
               receiptHashMatches=hashlib.sha256(raw).hexdigest() == fact['boundary']['sha256'])
    if fact['name'].endswith('-json'):
        try:
            data = json.loads(raw)
            candidate = layout(raw)
            row.update(validJSON=True, candidateBytes=len(candidate), removedBytes=len(raw)-len(candidate),
                       candidateSha256=hashlib.sha256(candidate).hexdigest(),
                       tokenPolicy='delete only ASCII whitespace outside strings; preserve original EOF whitespace')
            (OUT / (fact['name'] + '.layout-candidate.json')).write_bytes(candidate)
        except (ValueError, UnicodeError) as error:
            row.update(validJSON=False, layoutProposal='none', reason=str(error))
    measurements['cases'].append(row)
for tool in ['webpack', 'webpack-cli']:
    registry = json.loads((OUT / (tool + '-registry.json')).read_text())
    with urllib.request.urlopen(registry['dist']['tarball'], timeout=60) as response:
        tarball = response.read()
    observed = 'sha512-' + base64.b64encode(hashlib.sha512(tarball).digest()).decode()
    measurements['producerIntegrity'].append(dict(tool=tool, version=registry['version'],
         tarball=registry['dist']['tarball'], bytes=len(tarball), advertisedSRI=registry['dist']['integrity'],
         observedSRI=observed, matches=observed == registry['dist']['integrity'],
         gitHead=registry['gitHead'], license=registry['license'],
         gitCorrespondence='registry-reported gitHead; no independent source-build attestation'))
measurements['totalRawBytes'] = sum(row['bytes'] for row in measurements['cases'])
measurements['JSONLayoutRemovedBytes'] = sum(row.get('removedBytes', 0) for row in measurements['cases'])
(OUT / 'measurements.json').write_text(json.dumps(measurements, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(measurements, ensure_ascii=False, indent=2))
