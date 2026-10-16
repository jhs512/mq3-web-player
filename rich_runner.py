"""Collect notebook-like outputs without mixing them with program stdout."""
import ast
import base64
import builtins
import io
import json
import os
import runpy
import sys
import traceback
import warnings

os.environ['MPLBACKEND'] = 'Agg'
artifacts = []
seen_images = set()
seen_tables = set()

def capture_table(value, name='표'):
    pd = sys.modules.get('pandas')
    if pd is None or not isinstance(value, (pd.DataFrame, pd.Series)):
        return
    if id(value) in seen_tables or sum(a['kind'] == 'table' for a in artifacts) >= 6:
        return
    seen_tables.add(id(value))
    frame = value.to_frame() if isinstance(value, pd.Series) else value
    preview = frame.iloc[:100, :30]
    def cell(value):
        return str(value)[:500]
    artifacts.append({'kind': 'table', 'title': str(name)[:100],
        'columns': ['인덱스'] + [cell(c) for c in preview.columns],
        'rows': [[cell(index)] + [cell(v) for v in row]
                 for index, row in zip(preview.index, preview.itertuples(index=False, name=None))],
        'total_rows': len(frame), 'total_columns': len(frame.columns)})

def capture_plots(*args, **kwargs):
    plt = sys.modules.get('matplotlib.pyplot')
    if plt is None:
        return
    for number in plt.get_fignums():
        if sum(a['kind'] == 'image' for a in artifacts) >= 8:
            break
        stream = io.BytesIO()
        plt.figure(number).savefig(stream, format='png', dpi=100, bbox_inches='tight')
        data = stream.getvalue()
        if len(data) > 2_000_000 or data in seen_images:
            continue
        seen_images.add(data)
        artifacts.append({'kind': 'image', 'title': f'그래프 {number}',
            'data_url': 'data:image/png;base64,' + base64.b64encode(data).decode('ascii')})

def display(*values):
    for value in values:
        if value is None:
            continue
        pd = sys.modules.get('pandas')
        if pd is not None and isinstance(value, (pd.DataFrame, pd.Series)):
            capture_table(value)
        else:
            print(value)
    capture_plots()

builtins.display = display
scope = {}
try:
    source = open('main.py', encoding='utf-8').read()
    # Only load matplotlib for plotting code; plain Python needs no ML packages.
    if 'matplotlib' in source or 'seaborn' in source:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        plt.ioff()
        plt.show = capture_plots
        # Data columns and category values are Korean: use the first of the common system fonts
        # that is actually installed. Listing missing ones would make matplotlib print a
        # "findfont: Font family ... not found" line for every label drawn.
        import logging
        from matplotlib import font_manager
        logging.getLogger('matplotlib.font_manager').setLevel(logging.ERROR)
        warnings.filterwarnings('ignore', message='Glyph .* missing from font')
        warnings.filterwarnings('ignore', message='findfont')
        installed = {font.name for font in font_manager.fontManager.ttflist}
        preferred = ['Malgun Gothic', 'Apple SD Gothic Neo', 'AppleGothic', 'NanumGothic', 'Noto Sans KR', 'Noto Sans CJK KR']
        plt.rcParams['font.family'] = [name for name in preferred if name in installed] or ['DejaVu Sans']
        plt.rcParams['axes.unicode_minus'] = False
    tree = ast.parse(source, filename='main.py')
    # Like a notebook, a final expression may produce a table.
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        tree.body[-1] = ast.copy_location(ast.Expr(ast.Call(
            func=ast.Name(id='display', ctx=ast.Load()),
            args=[tree.body[-1].value], keywords=[])), tree.body[-1])
        ast.fix_missing_locations(tree)
    scope = {'__name__': '__main__', '__file__': os.path.abspath('main.py')}
    exec(compile(tree, 'main.py', 'exec'), scope)
except SystemExit:
    raise
except BaseException:
    traceback.print_exc()
    sys.exit(1)
finally:
    try:
        for name, value in list(scope.items()):
            if not name.startswith('_'):
                capture_table(value, name)
        capture_plots()
        with open('rich_results.json', 'w', encoding='utf-8') as output:
            json.dump(artifacts, output, ensure_ascii=False)
    except Exception as error:
        print(f'표·그래프 미리보기를 만들지 못했습니다: {error}', file=sys.stderr)
