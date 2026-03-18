from __future__ import annotations

import hashlib
import hmac
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Cookie, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from glaze.db.repository import Repository
from glaze.settings import get_settings

router = APIRouter(prefix='/admin')

_SESSION_TTL = 60 * 60 * 8  # 8 hours
_COOKIE_NAME = 'glaze_admin_session'


def _sign(value: str, secret: str) -> str:
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def _make_token(secret: str) -> str:
    ts = str(int(time.time()))
    sig = _sign(ts, secret)
    return f'{ts}.{sig}'


def _verify_token(token: str, secret: str) -> bool:
    try:
        ts_str, sig = token.split('.', 1)
        if int(time.time()) - int(ts_str) > _SESSION_TTL:
            return False
        expected = _sign(ts_str, secret)
        return hmac.compare_digest(sig, expected)
    except Exception:
        return False


def _is_authenticated(session_token: str | None) -> bool:
    if not session_token:
        return False
    settings = get_settings()
    return _verify_token(session_token, settings.slack_signing_secret + settings.admin_dashboard_password)


# ── HTML helpers ──────────────────────────────────────────────────────────────

_BASE_HTML = """\
<!doctype html>
<html lang="en" class="h-full">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{title} · Glaze Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; }}
    body {{
      background: #f8f8f8;
      color: #1d1c1d;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      margin: 0;
    }}
    .top-bar  {{ background: #4A154B; }}
    .card     {{ background: #fff; border: 1px solid #e8e8e8; box-shadow: 0 1px 4px rgba(0,0,0,.07); border-radius: 8px; }}
    .stat-card {{
      background: #fff;
      border: 1px solid #e8e8e8;
      border-left: 4px solid #4A154B;
      box-shadow: 0 1px 4px rgba(0,0,0,.07);
      border-radius: 8px;
    }}
    .badge-active   {{ background:#e4f5ed; color:#1a7a55; border:1px solid #b3dfc9; }}
    .badge-snoozed  {{ background:#fdf3d0; color:#9a6b00; border:1px solid #f5d97e; }}
    .badge-inactive {{ background:#fceef3; color:#c0143c; border:1px solid #f5b3c8; }}
    th {{ cursor:default; user-select:none; }}
    .table-row:hover {{ background:#f8f8f8; }}
    .scrollable {{ overflow-x:auto; }}
    thead tr {{ background:#f8f8f8; }}
    thead th {{ border-bottom:2px solid #e8e8e8; }}
    .slack-btn {{
      background:#4A154B; color:#fff; border:none; border-radius:4px;
      padding:10px 20px; font-weight:700; font-size:15px; cursor:pointer;
      transition:background .15s;
      width:100%;
    }}
    .slack-btn:hover {{ background:#611f69; }}
    .slack-input {{
      width:100%; border:1px solid #d1d2d3; border-radius:4px;
      padding:10px 12px; font-size:15px; color:#1d1c1d;
      transition:border-color .15s, box-shadow .15s;
      outline:none; margin-bottom:12px;
    }}
    .slack-input:focus {{ border-color:#4A154B; box-shadow:0 0 0 3px rgba(74,21,75,.2); }}
    .pill-weekly   {{ background:#f0e6f6; color:#4A154B;  border:1px solid #d4aadc; }}
    .pill-biweekly {{ background:#e8f0fb; color:#1264A3;  border:1px solid #a8c4e8; }}
    .pill-monthly  {{ background:#f5f5f5; color:#616061;  border:1px solid #d1d2d3; }}
    a.top-action {{
      color:rgba(255,255,255,.8); font-size:13px; text-decoration:none;
      border:1px solid rgba(255,255,255,.35); border-radius:4px;
      padding:5px 12px; transition:all .15s;
    }}
    a.top-action:hover {{ color:#fff; border-color:rgba(255,255,255,.7); background:rgba(255,255,255,.1); }}
    /* ── Dark mode ── */
    body.dark {{ background:#1a1d21; color:#d1d2d3; }}
    body.dark .card  {{ background:#222529; border-color:#383b42; box-shadow:0 1px 4px rgba(0,0,0,.3); }}
    body.dark .stat-card {{ background:#222529; border-color:#383b42; border-left-color:#7c3aed; box-shadow:0 1px 4px rgba(0,0,0,.3); }}
    body.dark .table-row:hover {{ background:#1e2228; }}
    body.dark thead tr {{ background:#1e2228; }}
    body.dark thead th {{ border-bottom-color:#383b42; color:#868f96; }}
    body.dark .badge-active   {{ background:#0d2e20; color:#2bac76; border-color:#1a5c3c; }}
    body.dark .badge-snoozed  {{ background:#2e2410; color:#ecb22e; border-color:#5c4510; }}
    body.dark .badge-inactive {{ background:#2e1018; color:#e01e5a; border-color:#5c1a30; }}
    body.dark .pill-weekly    {{ background:#2a1f2e; color:#bf8fd4; border-color:#5c3b6b; }}
    body.dark .pill-biweekly  {{ background:#1a2333; color:#5aa4d9; border-color:#2a4a6b; }}
    body.dark .pill-monthly   {{ background:#222529; color:#868f96; border-color:#383b42; }}
    body.dark .slack-input    {{ background:#2f3136; border-color:#383b42; color:#d1d2d3; }}
    body.dark .slack-input:focus {{ border-color:#7c3aed; box-shadow:0 0 0 3px rgba(124,58,237,.25); }}
    #dm-btn {{ background:none; border:1px solid rgba(255,255,255,.35); border-radius:4px;
               color:rgba(255,255,255,.8); font-size:15px; padding:4px 10px;
               cursor:pointer; transition:all .15s; line-height:1; }}
    #dm-btn:hover {{ background:rgba(255,255,255,.1); border-color:rgba(255,255,255,.7); }}
  </style>
  <script>
    (function(){{
      if(localStorage.getItem('glaze_dark')==='1') document.documentElement.classList.add('__dark_pending');
    }})();
  </script>
</head>
<body class="h-full">
<script>
  (function(){{
    if(localStorage.getItem('glaze_dark')==='1') document.body.classList.add('dark');
    document.documentElement.classList.remove('__dark_pending');
  }})();
</script>
{body}
</body>
</html>
"""


def _login_page(error: str = '') -> str:
    error_html = (
        f'<p style="color:#c0143c;background:#fceef3;border:1px solid #f5b3c8;border-radius:4px;'
        f'padding:10px 14px;font-size:13px;margin-top:12px;">⚠ {error}</p>'
        if error else ''
    )
    body = f"""\
<div style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;background:#f8f8f8;padding:24px;">
  <div style="width:100%;max-width:420px;">
    <!-- Logo block -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-flex;align-items:center;justify-content:center;
                  width:64px;height:64px;border-radius:16px;
                  background:#4A154B;margin-bottom:16px;">
        <span style="font-size:28px;">☕</span>
      </div>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#1d1c1d;">Glaze Admin</h1>
      <p style="margin:6px 0 0;font-size:14px;color:#616061;">Sign in to access your workspace dashboard</p>
    </div>
    <!-- Card -->
    <div class="card" style="padding:32px;">
      <form method="post" action="/admin/login">
        <label style="display:block;font-size:15px;font-weight:700;color:#1d1c1d;margin-bottom:8px;">Password</label>
        <input class="slack-input" type="password" name="password" autofocus placeholder="Enter admin password" />
        <button class="slack-btn" type="submit">Sign in</button>
      </form>
      {error_html}
    </div>
    <p style="text-align:center;font-size:12px;color:#888;margin-top:20px;">Glaze · Coffee Chat Matching</p>
  </div>
</div>
"""
    return _BASE_HTML.format(title='Login', body=body)


def _stat_card(icon: str, label: str, value: str | int, sub: str = '') -> str:
    return f"""\
<div class="stat-card" style="padding:20px;">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;">
    <div>
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;
                letter-spacing:.07em;color:#616061;">{label}</p>
      <p style="margin:0;font-size:28px;font-weight:900;color:#1d1c1d;line-height:1.1;">{value}</p>
      {f'<p style="margin:4px 0 0;font-size:11px;color:#888;">{sub}</p>' if sub else ''}
    </div>
    <span style="font-size:22px;opacity:.6;margin-left:8px;">{icon}</span>
  </div>
</div>
"""


def _badge(pref) -> str:
    today = date.today()
    s = 'font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;white-space:nowrap;'
    if not pref.is_active:
        return f'<span class="badge-inactive" style="{s}">Opted out</span>'
    if pref.snooze_until and pref.snooze_until >= today:
        return f'<span class="badge-snoozed" style="{s}">Snoozed · {pref.snooze_until}</span>'
    return f'<span class="badge-active" style="{s}">● Active</span>'


def _freq_pill(freq: str) -> str:
    cls = f'pill-{freq}' if freq in ('weekly', 'biweekly', 'monthly') else 'pill-monthly'
    s = 'font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;'
    return f'<span class="{cls}" style="{s}">{freq}</span>'


def _dashboard_page(prefs, pairs) -> str:
    today = date.today()

    # ── Stats ────────────────────────────────────────────────────────────────
    total_users = len(prefs)
    active = sum(1 for p in prefs if p.is_active and (not p.snooze_until or p.snooze_until < today))
    snoozed = sum(1 for p in prefs if p.is_active and p.snooze_until and p.snooze_until >= today)
    opted_out = sum(1 for p in prefs if not p.is_active)
    total_pairs = len(pairs)
    this_month_pairs = sum(
        1 for p in pairs
        if date.fromisoformat(p['cycle_date']).month == today.month
        and date.fromisoformat(p['cycle_date']).year == today.year
    )
    nudges_sent = sum(1 for p in pairs if p.get('nudge_sent_at'))
    never_nudged = sum(1 for p in pairs if not p.get('nudge_sent_at'))

    stats_html = f"""\
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:28px;">
  {_stat_card('👥', 'Total Users', total_users)}
  {_stat_card('✅', 'Active', active, 'eligible for next cycle')}
  {_stat_card('💤', 'Snoozed', snoozed)}
  {_stat_card('🚫', 'Opted Out', opted_out)}
  {_stat_card('☕', 'Total Pairs', total_pairs)}
  {_stat_card('📅', 'Pairs This Month', this_month_pairs)}
  {_stat_card('🔔', 'Nudges Sent', nudges_sent)}
  {_stat_card('🤫', 'Awaiting Nudge', never_nudged)}
</div>
"""

    # ── Chart data ───────────────────────────────────────────────────────────
    freq_counter = Counter(p.frequency for p in prefs)
    freq_labels = list(freq_counter.keys())
    freq_data = list(freq_counter.values())

    pairs_by_cycle: dict[str, int] = Counter(p['cycle_date'] for p in pairs)
    sorted_cycles = sorted(pairs_by_cycle.keys())[-12:]
    cycle_labels = sorted_cycles
    cycle_data = [pairs_by_cycle[c] for c in sorted_cycles]

    dept_counter: Counter = Counter(
        p.department for p in prefs if p.department and p.department.strip()
    )
    top_depts = dept_counter.most_common(6)
    other_count = sum(v for k, v in dept_counter.items() if k not in {d for d, _ in top_depts})
    if other_count:
        top_depts = list(top_depts) + [('Other', other_count)]
    dept_labels = [d for d, _ in top_depts]
    dept_data = [c for _, c in top_depts]

    charts_html = f"""\
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:28px;">
  <div class="card" style="padding:20px;">
    <h3 style="margin:0 0 16px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#616061;">Frequency Breakdown</h3>
    <div style="display:flex;align-items:center;justify-content:center;height:200px;">
      <canvas id="freqChart"></canvas>
    </div>
  </div>
  <div class="card" style="padding:20px;">
    <h3 style="margin:0 0 16px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#616061;">Pairs per Cycle (last 12)</h3>
    <div style="height:200px;">
      <canvas id="pairsChart"></canvas>
    </div>
  </div>
  <div class="card" style="padding:20px;">
    <h3 style="margin:0 0 16px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#616061;">Department Mix</h3>
    <div style="display:flex;align-items:center;justify-content:center;height:200px;">
      <canvas id="deptChart"></canvas>
    </div>
  </div>
</div>
<script>
Chart.defaults.color = '#616061';
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const PALETTE = ['#4A154B','#1264A3','#2BAC76','#ECB22E','#E01E5A','#611f69','#007a5a','#d72b3f'];

new Chart(document.getElementById('freqChart'), {{
  type: 'doughnut',
  data: {{
    labels: {freq_labels!r},
    datasets: [{{ data: {freq_data!r}, backgroundColor: PALETTE, borderWidth: 0 }}]
  }},
  options: {{
    cutout: '65%',
    plugins: {{ legend: {{ labels: {{ color: '#616061', font: {{ size: 11 }} }} }} }}
  }}
}});

new Chart(document.getElementById('pairsChart'), {{
  type: 'bar',
  data: {{
    labels: {cycle_labels!r},
    datasets: [{{
      label: 'Pairs',
      data: {cycle_data!r},
      backgroundColor: 'rgba(74,21,75,0.75)',
      borderColor: '#4A154B',
      borderWidth: 1,
      borderRadius: 4,
    }}]
  }},
  options: {{
    scales: {{
      x: {{ ticks: {{ color: '#888', font: {{ size: 10 }} }}, grid: {{ color: '#f0f0f0' }} }},
      y: {{ ticks: {{ color: '#888' }}, grid: {{ color: '#f0f0f0' }}, beginAtZero: true }}
    }},
    plugins: {{ legend: {{ display: false }} }}
  }}
}});

new Chart(document.getElementById('deptChart'), {{
  type: 'doughnut',
  data: {{
    labels: {dept_labels!r},
    datasets: [{{ data: {dept_data!r}, backgroundColor: PALETTE, borderWidth: 0 }}]
  }},
  options: {{
    cutout: '60%',
    plugins: {{ legend: {{ labels: {{ color: '#616061', font: {{ size: 11 }} }} }} }}
  }}
}});
</script>
"""

    # ── Users table ──────────────────────────────────────────────────────────
    sorted_prefs = sorted(prefs, key=lambda p: (not p.is_active, p.full_name or p.slack_user_id))
    _th = 'style="padding:10px 20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#616061;text-align:left;"'
    _td = 'style="padding:11px 20px;border-top:1px solid #f0f0f0;font-size:14px;"'

    user_rows = ''
    for p in sorted_prefs:
        name = p.full_name or '<span style="color:#888;font-style:italic;">—</span>'
        dept = p.department or '<span style="color:#888;">—</span>'
        user_rows += f"""\
<tr class="table-row">
  <td {_td} style="padding:11px 20px;border-top:1px solid #f0f0f0;font-size:14px;font-weight:600;color:#1d1c1d;">{name}</td>
  <td {_td}><code style="font-size:12px;color:#4A154B;background:#f5ecf6;padding:2px 7px;border-radius:4px;">{p.slack_user_id}</code></td>
  <td {_td} style="padding:11px 20px;border-top:1px solid #f0f0f0;font-size:14px;color:#616061;">{dept}</td>
  <td {_td}>{_badge(p)}</td>
  <td {_td}>{_freq_pill(p.frequency)}</td>
</tr>
"""

    users_table = f"""\
<div class="card" style="margin-bottom:24px;overflow:hidden;">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e8e8e8;">
    <div>
      <h2 style="margin:0;font-size:15px;font-weight:700;color:#1d1c1d;">Users</h2>
      <p style="margin:3px 0 0;font-size:12px;color:#888;">{total_users} total · {active} active</p>
    </div>
    <span style="font-size:11px;color:#888;background:#f5f5f5;border:1px solid #e8e8e8;padding:3px 10px;border-radius:20px;font-family:monospace;">glaze_user_preferences</span>
  </div>
  <div class="scrollable">
    <table style="width:100%;border-collapse:collapse;min-width:600px;">
      <thead>
        <tr>
          <th {_th}>Name</th>
          <th {_th}>Slack ID</th>
          <th {_th}>Department</th>
          <th {_th}>Status</th>
          <th {_th}>Frequency</th>
        </tr>
      </thead>
      <tbody>{user_rows}</tbody>
    </table>
  </div>
</div>
"""

    # ── Pair events table ─────────────────────────────────────────────────────
    name_map = {p.slack_user_id: p.full_name or p.slack_user_id for p in prefs}

    def _user_cell(uid: str, accent: str) -> str:
        name = name_map.get(uid, uid)
        title_attr = f' title="{uid}"' if name != uid else ''
        color = '#4A154B' if accent == 'indigo' else '#1264A3'
        return (
            f'<span style="font-size:14px;font-weight:600;color:{color};"{title_attr}>{name}</span>'
        )

    sorted_pairs = sorted(pairs, key=lambda p: p.get('cycle_date', ''), reverse=True)
    pair_rows = ''
    for p in sorted_pairs:
        nudge_cell = (
            f'<span style="color:#2BAC76;font-size:12px;font-weight:700;">✓ {p["nudge_sent_at"][:10] if p.get("nudge_sent_at") else ""}</span>'
            if p.get('nudge_sent_at')
            else '<span style="color:#ccc;">—</span>'
        )
        pair_rows += f"""\
<tr class="table-row">
  <td style="padding:11px 20px;border-top:1px solid #f0f0f0;font-size:13px;font-family:monospace;color:#616061;">{p['cycle_date']}</td>
  <td style="padding:11px 20px;border-top:1px solid #f0f0f0;">{_user_cell(p['user_a'], 'indigo')}</td>
  <td style="padding:11px 20px;border-top:1px solid #f0f0f0;">{_user_cell(p['user_b'], 'violet')}</td>
  <td style="padding:11px 20px;border-top:1px solid #f0f0f0;"><code style="font-size:11px;color:#888;">{p['dm_channel_id']}</code></td>
  <td style="padding:11px 20px;border-top:1px solid #f0f0f0;">{nudge_cell}</td>
  <td style="padding:11px 20px;border-top:1px solid #f0f0f0;font-size:12px;color:#888;">{(p.get('created_at') or '')[:10]}</td>
</tr>
"""

    pairs_table = f"""\
<div class="card" style="margin-bottom:24px;overflow:hidden;">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e8e8e8;">
    <div>
      <h2 style="margin:0;font-size:15px;font-weight:700;color:#1d1c1d;">Pair Events</h2>
      <p style="margin:3px 0 0;font-size:12px;color:#888;">{total_pairs} total · {nudges_sent} nudged · newest first</p>
    </div>
    <span style="font-size:11px;color:#888;background:#f5f5f5;border:1px solid #e8e8e8;padding:3px 10px;border-radius:20px;font-family:monospace;">glaze_pair_events</span>
  </div>
  <div class="scrollable">
    <table style="width:100%;border-collapse:collapse;min-width:700px;">
      <thead>
        <tr>
          <th {_th}>Cycle Date</th>
          <th {_th}>User A</th>
          <th {_th}>User B</th>
          <th {_th}>DM Channel</th>
          <th {_th}>Nudge Sent</th>
          <th {_th}>Created</th>
        </tr>
      </thead>
      <tbody>{pair_rows}</tbody>
    </table>
  </div>
</div>
"""

    now_str = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    body = f"""\
<!-- Top bar -->
<div class="top-bar" style="padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:56px;">
  <div style="display:flex;align-items:center;gap:10px;">
    <span style="font-size:22px;">☕</span>
    <span style="font-size:17px;font-weight:900;color:#fff;letter-spacing:-.3px;">Glaze Admin</span>
    <span style="font-size:12px;color:rgba(255,255,255,.5);margin-left:4px;">/ Dashboard</span>
  </div>
  <div style="display:flex;align-items:center;gap:8px;">
    <button id="dm-btn" onclick="toggleDark()" title="Toggle dark mode">🌙</button>
    <a href="#" class="top-action" onclick="location.reload();return false;">↻ Refresh</a>
    <a href="/admin/logout" class="top-action" style="color:rgba(255,200,200,.85);border-color:rgba(255,150,150,.35);">Sign out</a>
  </div>
</div>
<script>
function toggleDark(){{
  var on = document.body.classList.toggle('dark');
  localStorage.setItem('glaze_dark', on ? '1' : '0');
  document.getElementById('dm-btn').textContent = on ? '☀️' : '🌙';
}}
(function(){{
  if(localStorage.getItem('glaze_dark')==='1') document.getElementById('dm-btn').textContent='☀️';
}})();
</script>
<!-- Page body -->
<div style="max-width:1400px;margin:0 auto;padding:28px 24px 48px;">
  <p style="font-size:12px;color:#888;margin:0 0 20px;">Last loaded: {now_str}</p>
  {stats_html}
  {charts_html}
  {users_table}
  {pairs_table}
</div>
"""
    return _BASE_HTML.format(title='Dashboard', body=body)


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get('/login', response_class=HTMLResponse)
async def get_login(glaze_admin_session: Annotated[str | None, Cookie()] = None):
    if _is_authenticated(glaze_admin_session):
        return RedirectResponse('/admin', status_code=302)
    return HTMLResponse(_login_page())


@router.post('/login', response_class=HTMLResponse)
async def post_login(password: Annotated[str, Form()]):
    settings = get_settings()
    if not hmac.compare_digest(password, settings.admin_dashboard_password):
        return HTMLResponse(_login_page(error='Incorrect password.'), status_code=401)
    token = _make_token(settings.slack_signing_secret + settings.admin_dashboard_password)
    response = RedirectResponse('/admin', status_code=302)
    response.set_cookie(
        _COOKIE_NAME,
        token,
        max_age=_SESSION_TTL,
        httponly=True,
        samesite='lax',
        secure=False,  # set to True behind HTTPS in production
    )
    return response


@router.get('', response_class=HTMLResponse)
async def dashboard(glaze_admin_session: Annotated[str | None, Cookie()] = None):
    if not _is_authenticated(glaze_admin_session):
        return RedirectResponse('/admin/login', status_code=302)
    repository = Repository()
    prefs = repository.list_preferences()
    pairs = repository.list_recent_pairs()
    return HTMLResponse(_dashboard_page(prefs, pairs))


@router.get('/logout')
async def logout():
    response = RedirectResponse('/admin/login', status_code=302)
    response.delete_cookie(_COOKIE_NAME)
    return response
