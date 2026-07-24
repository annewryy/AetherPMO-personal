#!/usr/bin/env python3
"""0029 §B — 테일러링 가이드 v2.0 xlsx → V16 시드 SQL 생성기.

원본: OKC26-PRP-TL-110_테일러링_가이드_v2.0.xlsx (시트 01.OPMS/02.ODS/03.OMS/06.BIS)
사용: python3 generate_v16_seed.py <xlsx경로> > V16__tailoring_standard_seed.sql

규칙(설계 0029):
- 복합 코드: PHASE=PRR · ACTIVITY=PRR-OP · TASK=PRR-OP-1 · DELIVERABLE=PRR-OP-110(작업+산출물번호)
- 규모별 필수: '필수'→1, '선택'→0. is_optional = 3규모 모두 선택.
- BIS는 산출물명이 없어 TASK 계층까지만(더미 금지).
- OMS는 대단계(SOS/USS)–세부단계(SLM…) 2층 — 파일명 코드 기준인 세부단계를 PHASE로 시드.
"""
import sys, zipfile, re, html

def load_sheets(path):
    z = zipfile.ZipFile(path)
    ss = []
    try:
        sx = z.read('xl/sharedStrings.xml').decode('utf-8', 'ignore')
        ss = [html.unescape(re.sub(r'<[^>]+>', '', m)) for m in re.findall(r'<si>(.*?)</si>', sx, re.S)]
    except KeyError:
        pass
    wb = z.read('xl/workbook.xml').decode('utf-8', 'ignore')
    sheets = re.findall(r'<sheet[^>]*name="([^"]+)"[^>]*sheetId="\d+"[^>]*r:id="(rId\d+)"', wb)
    rels = dict(re.findall(r'<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"',
                           z.read('xl/_rels/workbook.xml.rels').decode()))
    out = {}
    for name, rid in sheets:
        t = rels.get(rid, '')
        p = t if t.startswith('xl/') else 'xl/' + t.lstrip('/')
        try:
            xml = z.read(p).decode('utf-8', 'ignore')
        except KeyError:
            continue
        rows = {}
        for rnum, rxml in re.findall(r'<row[^>]*r="(\d+)"[^>]*>(.*?)</row>', xml, re.S):
            cells = {}
            for c in re.findall(r'<c[^>]*>.*?</c>|<c[^>]*/>', rxml, re.S):
                ref = re.search(r'r="([A-Z]+)(\d+)"', c)
                if not ref:
                    continue
                t2 = re.search(r't="([^"]+)"', c)
                v = re.search(r'<v>([^<]*)</v>', c)
                val = ''
                if v is not None:
                    val = v.group(1)
                    if t2 and t2.group(1) == 's':
                        val = ss[int(val)] if int(val) < len(ss) else ''
                cells[ref.group(1)] = val
            rows[int(rnum)] = cells
        out[name] = rows
    return out

def clean(s):
    if s is None:
        return None
    s = re.sub(r'\s+', ' ', str(s)).strip()
    return s or None

def esc(s):
    return s.replace("'", "''")

def strip_paren_en(s):
    """이름에서 영문 병기 괄호 제거 없이 그대로 유지(원문 보존)."""
    return s

def req(v):
    v = clean(v)
    if v == '필수':
        return 1
    if v == '선택':
        return 0
    return None

def find_doc_cols(cells):
    """행에서 문서형식(.ext)과 실제작성파일명을 찾는다(열 위치가 시트마다 달라 값 패턴으로)."""
    items = sorted(cells.items())
    fmt = base = None
    for i, (col, v) in enumerate(items):
        v = clean(v)
        if v and re.fullmatch(r'\.[A-Za-z0-9]+', v):
            fmt = v
            for col2, v2 in items[i + 1:]:
                v2 = clean(v2)
                if v2 and not v2.startswith('OKC26-'):
                    base = v2
                    break
                if v2 and v2.startswith('OKC26-'):
                    break
            break
    if fmt is None:  # 확장자 없는 산출물(소스코드 등): OKC26- 직전 셀을 base로
        for i, (col, v) in enumerate(items):
            v = clean(v)
            if v and v.startswith('OKC26-') and i > 0:
                prev = clean(items[i - 1][1])
                if prev and prev not in ('필수', '선택', 'O'):
                    base = prev
                break
    return fmt, base

SHEETS = [
    # (시트명, methodology, layout) — layout A: A~H = 단계/코드/활동/코드/작업/코드/산출물/코드
    #                                layout B(OMS): A~J = 대단계/코드/세부단계/코드/활동/코드/작업/코드/산출물/코드
    ('01.OPMS(사업관리)', 'OPMS', 'A'),
    ('02. ODS(시스템 구축)', 'ODS', 'A'),
    ('03. OMS(유지보수)', 'OMS', 'B'),
    ('06.BIS(ISP컨설팅)', 'BIS', 'A'),
]

def main():
    path = sys.argv[1]
    data = load_sheets(path)
    print("-- V16 — 0029 §B: 테일러링 표준 트리 시드 (테일러링 가이드 v2.0에서 생성 — generate_v16_seed.py)")
    print("-- 수기 편집 금지: 재생성으로 갱신한다. 기존 데모 트리(methodology NULL)는 유지.")
    stats = {}
    for sheet, meth, layout in SHEETS:
        rows = data.get(sheet)
        if not rows:
            print(f"-- !! 시트 없음: {sheet}", file=sys.stderr)
            continue
        if layout == 'A':
            C = dict(pn='A', pc='B', an='C', ac='D', tn='E', tc='F', dn='G', dc='H', s='I', m='J', l='K')
        else:
            C = dict(gn='A', gc='B', pn='C', pc='D', an='E', ac='F', tn='G', tc='H', dn='I', dc='J', s='K', m='L', ll='M')
        cur = {}
        emitted_phase = {}
        emitted_act = {}
        emitted_task = {}
        task_names = {}
        used_dcodes = set()
        order = 0
        cnt = [0, 0, 0, 0]
        print(f"\n-- ===== {meth} ({sheet}) =====")

        CODE_RE = re.compile(r'^[A-Z]{2,4}$')

        def pair(namev, codev, cn, cc, code_re):
            """(이름열, 코드열) 시프트 해석 — 병합 셀로 연속 행은 코드가 이름 열로 밀림."""
            if codev:
                return (namev or (cn if codev == cc else codev), codev)
            if namev:
                if namev == cc or code_re.match(namev):
                    return (cn if namev == cc else namev, namev)
                return (namev, cc)  # 이름만 갱신(코드 carry)
            return (cn, cc)

        for rnum in sorted(rows):
            if rnum < 7:
                continue
            cells = rows[rnum]
            get = lambda k: clean(cells.get(C[k], '')) if k in C else None
            if layout == 'B':
                # 대단계(A,B)는 그룹 시작 행에만 존재. 세부단계 이름은 C 또는 A에 온다.
                if get('gc'):
                    cur['gn'], cur['gc'] = get('gn'), get('gc')
                p_name_raw = get('pn') or (get('gn') if not get('gc') else None)
                pn, pc = pair(p_name_raw, get('pc'), cur.get('pn'), cur.get('pc'), CODE_RE)
            else:
                pn, pc = pair(get('pn'), get('pc'), cur.get('pn'), cur.get('pc'), CODE_RE)
            if pc != cur.get('pc'):
                cur.pop('an', None); cur.pop('ac', None); cur.pop('tn', None); cur.pop('tc', None)
            cur['pn'], cur['pc'] = pn, pc

            an, ac = pair(get('an'), get('ac'), cur.get('an'), cur.get('ac'), CODE_RE)
            if ac != cur.get('ac'):
                cur.pop('tn', None); cur.pop('tc', None)
            cur['an'], cur['ac'] = an, ac

            NUM_RE = re.compile(r'^\d{1,2}$')
            tn, tc = pair(get('tn'), get('tc'), cur.get('tn'), cur.get('tc'), NUM_RE)
            cur['tn'], cur['tc'] = tn, tc

            dn, dc = get('dn'), get('dc')
            is_bis = meth == 'BIS'
            if not pc or not ac or not tc:
                continue
            if not is_bis and (not dn or not dc):
                continue
            if is_bis and not tn:
                continue
            order += 10
            pkey = pc
            if pkey not in emitted_phase:
                desc = ''
                if layout == 'B' and cur.get('gn'):
                    desc = f"{cur['gn']}({cur.get('gc','')}) 하위"
                print(f"INSERT INTO pms_catalog_node (parent_node_id, node_type, code, name, description, methodology, sort_order) "
                      f"VALUES (NULL, 'PHASE', '{esc(pc)}', '{esc(pn or pc)}', "
                      f"{'NULL' if not desc else chr(39)+esc(desc)+chr(39)}, '{meth}', {order});")
                print(f"SET @ph := LAST_INSERT_ID();")
                emitted_phase[pkey] = f"@p_{meth}_{pc}"
                print(f"SET {emitted_phase[pkey]} := @ph;")
                cnt[0] += 1
            akey = f"{pc}-{ac}"
            if akey not in emitted_act:
                print(f"INSERT INTO pms_catalog_node (parent_node_id, node_type, code, name, methodology, sort_order) "
                      f"VALUES ({emitted_phase[pkey]}, 'ACTIVITY', '{esc(akey)}', '{esc(an or ac)}', '{meth}', {order});")
                emitted_act[akey] = f"@a_{meth}_{pc}_{ac}"
                print(f"SET {emitted_act[akey]} := LAST_INSERT_ID();")
                cnt[1] += 1
            # 원본 xlsx의 작업 코드 중복 보정(예: 제안발표가 PW-1로 기재 — 방법론 PPT 기준 PW-2):
            #   같은 코드에 다른 작업명이 오면 활동 내 다음 번호를 배정한다.
            tkey = f"{akey}-{tc}"
            if get('tn') and tkey in emitted_task and task_names.get(tkey) != tn:
                nums = [int(k.rsplit('-', 1)[1]) for k in emitted_task if k.startswith(akey + '-')]
                tc = str(max(nums) + 1)
                tkey = f"{akey}-{tc}"
                cur['tc'] = tc
            if tkey not in emitted_task:
                print(f"INSERT INTO pms_catalog_node (parent_node_id, node_type, code, name, methodology, sort_order) "
                      f"VALUES ({emitted_act[akey]}, 'TASK', '{esc(tkey)}', '{esc(tn or tc)}', '{meth}', {order});")
                emitted_task[tkey] = f"@t_{meth}_{pc}_{ac}_{tc}"
                task_names[tkey] = tn
                print(f"SET {emitted_task[tkey]} := LAST_INSERT_ID();")
                cnt[2] += 1
            if is_bis:
                continue
            rs, rm, rl = req(cells.get(C['s'])), req(cells.get(C['m'])), req(cells.get(C.get('l', C.get('ll'))))
            if layout == 'B':
                rl = req(cells.get(C['ll']))
            fmt, base = find_doc_cols(cells)
            dcode = f"{akey}-{tc}{dc}"  # 예: PRP-TL + 1 + 10 → PRP-TL-110
            while dcode in used_dcodes:  # 잔여 중복 방어(원본 오류) — 산출물 번호 +10
                dc = str(int(dc) + 10)
                dcode = f"{akey}-{tc}{dc}"
            used_dcodes.add(dcode)
            opt = 1 if (rs == 0 and rm == 0 and rl == 0) else 0
            print(
                "INSERT INTO pms_catalog_node (parent_node_id, node_type, code, name, methodology, sort_order, "
                "is_optional, required_small, required_medium, required_large, doc_format, file_name_base) VALUES ("
                f"{emitted_task[tkey]}, 'DELIVERABLE', '{esc(dcode)}', '{esc(dn)}', '{meth}', {order}, {opt}, "
                f"{'NULL' if rs is None else rs}, {'NULL' if rm is None else rm}, {'NULL' if rl is None else rl}, "
                f"{'NULL' if not fmt else chr(39)+esc(fmt)+chr(39)}, "
                f"{'NULL' if not base else chr(39)+esc(base)+chr(39)});")
            cnt[3] += 1
        stats[meth] = cnt
        print(f"-- {meth}: PHASE {cnt[0]} · ACTIVITY {cnt[1]} · TASK {cnt[2]} · DELIVERABLE {cnt[3]}")
    print("\n-- 생성 통계: " + ", ".join(f"{k}={v[3]}건(산출물)" for k, v in stats.items()), file=sys.stderr)

if __name__ == '__main__':
    main()
