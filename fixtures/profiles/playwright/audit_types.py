"""Field types for pinned Playwright 1.56.1 report/projection, not all configs.

Original validation code informed by upstream testReporter.d.ts/json.ts/test.ts
at 54c711571a37de525377e6f3d3608c3e029b1829; no donor implementation copied.
"""
import base64
import math
import sys

MAX_SAFE = 2**53 - 1
STATUSES = {'passed', 'failed', 'timedOut', 'skipped', 'interrupted'}
OUTCOMES = {'expected', 'unexpected', 'flaky', 'skipped'}


def shape(value, required, optional, label):
    assert type(value) is dict, f'{label} must be object'
    assert set(required) <= value.keys() <= set(required) | set(optional), f'{label} missing/unknown fields'


def string(value, label):
    assert type(value) is str, f'{label} must be string'


def integer(value, minimum, label):
    assert type(value) is int and minimum <= value <= MAX_SAFE, f'{label} must be JS-safe integer >= {minimum} (not bool/float)'


def duration(value, label):
    assert type(value) in (int, float) and 0 <= value <= sys.float_info.max and math.isfinite(value), f'{label} must be finite nonnegative number (not bool)'


def array(value, label, nonempty=False):
    assert type(value) is list and (value or not nonempty), f'{label} must be {"nonempty " if nonempty else ""}list'


def location(value, label):
    shape(value, ('file', 'line', 'column'), (), label)
    string(value['file'], label + '.file')
    for key in ('line', 'column'):
        integer(value[key], 0, label + '.' + key)


def error(value, label, formatted=False):
    # JSONReportError has required message; TestError has optional string fields.
    required = ('message',) if formatted else ()
    optional = ('location',) if formatted else ('message', 'stack', 'snippet', 'value', 'location', 'cause')
    shape(value, required, optional, label)
    for key in ('message', 'stack', 'snippet', 'value'):
        if key in value:
            string(value[key], label + '.' + key)
    if 'location' in value:
        location(value['location'], label + '.location')
    if 'cause' in value:
        error(value['cause'], label + '.cause')


def annotations(value, label):
    array(value, label)
    for index, item in enumerate(value):
        name = f'{label}[{index}]'
        shape(item, ('type',), ('description', 'location'), name)
        string(item['type'], name + '.type')
        if 'description' in item:
            string(item['description'], name + '.description')
        if 'location' in item:
            location(item['location'], name + '.location')


def steps(value, label):
    array(value, label)
    for index, item in enumerate(value):
        name = f'{label}[{index}]'
        shape(item, ('title', 'duration'), ('error', 'steps'), name)
        string(item['title'], name + '.title')
        duration(item['duration'], name + '.duration')
        if 'error' in item:
            error(item['error'], name + '.error')
        if 'steps' in item:
            steps(item['steps'], name + '.steps')


def result(value, label):
    required = ('workerIndex', 'parallelIndex', 'status', 'duration', 'errors', 'stdout', 'stderr',
                'retry', 'startTime', 'annotations', 'attachments')
    shape(value, required, ('error', 'errorLocation', 'steps'), label)
    # _appendTestResult initializes both indices to -1 for unstarted results.
    for key in ('workerIndex', 'parallelIndex'):
        integer(value[key], -1, label + '.' + key)
    integer(value['retry'], 0, label + '.retry')
    duration(value['duration'], label + '.duration')
    string(value['startTime'], label + '.startTime')
    string(value['status'], label + '.status')
    assert value['status'] in STATUSES, label + '.status unsupported'
    array(value['errors'], label + '.errors')
    for index, item in enumerate(value['errors']):
        error(item, f'{label}.errors[{index}]', formatted=True)
    annotations(value['annotations'], label + '.annotations')
    for key in ('stdout', 'stderr'):
        array(value[key], label + '.' + key)
        for index, item in enumerate(value[key]):
            name = f'{label}.{key}[{index}]'
            assert type(item) is dict and set(item) in ({'text'}, {'buffer'}), name + ' must be text/buffer entry'
            field = next(iter(item))
            string(item[field], name + '.' + field)
            if field == 'buffer':
                base64.b64decode(item[field], validate=True)
    array(value['attachments'], label + '.attachments')
    for index, item in enumerate(value['attachments']):
        name = f'{label}.attachments[{index}]'
        shape(item, ('name', 'contentType'), ('path', 'body'), name)
        for key in item:
            string(item[key], name + '.' + key)
        if 'body' in item:
            base64.b64decode(item['body'], validate=True)
    if 'error' in value:
        error(value['error'], label + '.error')
    if 'errorLocation' in value:
        location(value['errorLocation'], label + '.errorLocation')
    if 'steps' in value:
        steps(value['steps'], label + '.steps')


def tests(value, label):
    array(value, label, nonempty=True)
    for index, item in enumerate(value):
        name = f'{label}[{index}]'
        shape(item, ('title', 'project', 'status', 'annotations', 'results'), (), name)
        for key in ('title', 'project', 'status'):
            string(item[key], name + '.' + key)
        assert item['status'] in OUTCOMES, name + '.status unsupported'
        annotations(item['annotations'], name + '.annotations')
        array(item['results'], name + '.results', nonempty=True)
        for attempt, item_result in enumerate(item['results']):
            result(item_result, f'{name}.results[{attempt}]')


def stats(value, label):
    shape(value, ('startTime', 'duration', 'expected', 'unexpected', 'flaky', 'skipped'), (), label)
    string(value['startTime'], label + '.startTime')
    duration(value['duration'], label + '.duration')
    for key in ('expected', 'unexpected', 'flaky', 'skipped'):
        integer(value[key], 0, label + '.' + key)


def raw_test(value, label):
    shape(value, ('timeout', 'annotations', 'expectedStatus', 'projectName', 'projectId', 'results', 'status'), (), label)
    duration(value['timeout'], label + '.timeout')
    for key in ('projectName', 'projectId', 'expectedStatus'):
        string(value[key], label + '.' + key)
    assert value['expectedStatus'] in STATUSES, label + '.expectedStatus unsupported'


def viewport(value, label):
    shape(value, ('width', 'height'), (), label)
    for key in ('width', 'height'):
        integer(value[key], 1, label + '.' + key)
