"""
Simón — Métricas GA4 multi-modo.

Modos:
  campaign  — tráfico paid por pieza/UTM (default legacy)
  ux        — todos los eventos sin filtro UTM, funnel, dispositivo, página
  overview  — todo junto: fuentes, nuevo vs recurrente, comparación período anterior
  retention — señales PMF: returning users, organic growth, engagement depth

Cortes de datos (NO comparar directamente antes/después):
  27 feb 2026 — click_whatsapp pre-27feb inflado (bug: disparaba en render)
  3 abr 2026  — session_alquiler/bounce_no_action pre-3abr inflados 1.7x (multi-fire)
  3 abr 2026  — view_photos eliminado (código muerto), reemplazado por swipe_photos
  3 abr 2026  — agregados reset_filters, lead_gate
  3 abr 2026  — keepalive fix: BD sub-reportaba leads pre-3abr
  8 abr 2026  — utm_source en leads_alquiler: paid vs orgánico confiable desde esta fecha.
               Leads pre-8abr con utm_source=NULL pueden ser paid o orgánico (indistinguible).
  11 abr 2026 — utm_content y utm_campaign en leads_alquiler (migración 210).
               Cruce BD por pieza confiable desde esta fecha. Leads anteriores: sin pieza.
  Ver docs/meta/GA4_EVENTOS.md sección "Cortes de datos" para detalle completo.

Requiere:
  pip install google-analytics-data google-auth
  Service account key en ~/.credentials/ga4-key.json

Uso:
  /metrics                          → retention (PMF signals), 28 dias
  /metrics --mode campaign          → paid por pieza, 7 dias
  /metrics --mode ux --days 2       → UX ultimos 2 dias
  /metrics --mode overview          → overview 7 dias
  /metrics video03 --days 3         → campaign, solo pieza03
  /metrics --list                   → listar piezas conocidas
  /metrics --json                   → output JSON
"""

import argparse
import json as json_lib
import sys
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    RunReportRequest,
    Dimension,
    Metric,
    DateRange,
    FilterExpression,
    FilterExpressionList,
    Filter,
    OrderBy,
)
from google.oauth2 import service_account

# ======================== CONFIG ========================

PROPERTY_ID = "523288591"
KEY_PATH = r"C:\Users\LUCHO\.credentials\ga4-key.json"

# Supabase (read-only pooler for leads_alquiler)
DB_CONN = "postgresql://claude_readonly.chaosoiyoeyjuwtwckix:supabasesegura123@aws-1-sa-east-1.pooler.supabase.com:6543/postgres"

PIEZAS = {
    "video07": "P7 — Se renueva cada mes",
    "video03": "P3 — El sweet spot",
    "video01": "P1 — El techo de los 4 mil",
    "video04": "P4 — La zona que nadie mira",
    "video09": "P9 — El gap de los 5 mil",
    "video10": "P10 — Así se busca en 2026",
    "carousel02": "P2 — Solo 6 sin amoblar",
    "carousel05": "P5 — 3 dorms < 5 mil",
    "carousel06": "P6 — El 65% mascotas",
    "carousel08": "P8 — Studios: 17",
}

# Eventos clave de Simón (definidos en el código frontend)
KEY_EVENTS_ALQUILER = [
    "click_whatsapp", "open_detail", "apply_filters", "view_property",
    "swipe_photos", "toggle_favorite", "open_compare", "share_alquiler",
    "bounce_no_action", "no_results", "session_alquiler",
    "open_map_mobile", "select_map_pin", "banner_zona_click",
    "page_enter_alquiler", "reset_filters", "lead_gate",
    "chat_open", "chat_message", "chat_search", "chat_click_property", "chat_lead",
]

KEY_EVENTS_VENTA = [
    "click_whatsapp_venta", "open_detail_venta", "apply_filters_venta",
    "view_photos_venta", "toggle_favorite_venta", "share_venta",
    "no_results_venta", "switch_view_venta", "open_map_mobile_venta",
    "lead_gate_venta",
]

FUNNEL_EVENTS = [
    "session_start", "view_property", "swipe_photos", "open_detail", "click_whatsapp",
]

# ======================== CLIENT ========================

def get_client():
    credentials = service_account.Credentials.from_service_account_file(
        KEY_PATH,
        scopes=["https://www.googleapis.com/auth/analytics.readonly"],
    )
    return BetaAnalyticsDataClient(credentials=credentials)


def _run(client, dimensions, metrics, days, filters=None, order_bys=None, limit=100):
    """Helper to run a GA4 report."""
    request = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        date_ranges=[DateRange(start_date=f"{days}daysAgo", end_date="today")],
        dimensions=dimensions,
        metrics=metrics,
        dimension_filter=filters,
        order_bys=order_bys or [],
        limit=limit,
    )
    return client.run_report(request)


def _run_comparison(client, dimensions, metrics, days, filters=None, limit=100):
    """Run report with current period vs previous period of same length."""
    request = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        date_ranges=[
            DateRange(start_date=f"{days}daysAgo", end_date="today"),
            DateRange(start_date=f"{days * 2}daysAgo", end_date=f"{days + 1}daysAgo"),
        ],
        dimensions=dimensions,
        metrics=metrics,
        dimension_filter=filters,
        limit=limit,
    )
    return client.run_report(request)


# ======================== CAMPAIGN MODE ========================

def query_campaign(client, days, piece_filter=None):
    """Tráfico por pieza (utm_content) + eventos por pieza."""
    utm_filter = None
    if piece_filter:
        utm_filter = FilterExpression(
            filter=Filter(
                field_name="sessionManualAdContent",
                string_filter=Filter.StringFilter(
                    value=piece_filter,
                    match_type=Filter.StringFilter.MatchType.EXACT,
                ),
            )
        )

    traffic = _run(client,
        dimensions=[
            Dimension(name="sessionCampaignName"),
            Dimension(name="sessionManualAdContent"),
            Dimension(name="sessionSource"),
        ],
        metrics=[
            Metric(name="sessions"),
            Metric(name="activeUsers"),
            Metric(name="screenPageViews"),
            Metric(name="averageSessionDuration"),
            Metric(name="bounceRate"),
        ],
        days=days, filters=utm_filter,
    )

    events = _run(client,
        dimensions=[
            Dimension(name="eventName"),
            Dimension(name="sessionManualAdContent"),
        ],
        metrics=[Metric(name="eventCount")],
        days=days, filters=utm_filter, limit=500,
    )

    return {"traffic": traffic, "events": events}


# ======================== UX MODE ========================

def query_ux(client, days):
    """Eventos globales + funnel + dispositivo + página. Sin filtro UTM."""

    # 1. Todos los eventos (sin filtro UTM)
    all_events = _run(client,
        dimensions=[Dimension(name="eventName")],
        metrics=[Metric(name="eventCount"), Metric(name="activeUsers")],
        days=days,
        order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="eventCount"), desc=True)],
        limit=50,
    )

    # 2. Eventos por página
    events_by_page = _run(client,
        dimensions=[Dimension(name="pagePath"), Dimension(name="eventName")],
        metrics=[Metric(name="eventCount")],
        days=days, limit=200,
    )

    # 3. Dispositivo
    by_device = _run(client,
        dimensions=[Dimension(name="deviceCategory")],
        metrics=[
            Metric(name="sessions"),
            Metric(name="activeUsers"),
            Metric(name="averageSessionDuration"),
            Metric(name="bounceRate"),
        ],
        days=days,
    )

    # 4. Funnel por evento (global)
    funnel_events_filter = FilterExpression(
        or_group=FilterExpressionList(
            expressions=[
                FilterExpression(filter=Filter(
                    field_name="eventName",
                    string_filter=Filter.StringFilter(
                        value=ev,
                        match_type=Filter.StringFilter.MatchType.EXACT,
                    ),
                ))
                for ev in FUNNEL_EVENTS
            ]
        )
    )
    funnel = _run(client,
        dimensions=[Dimension(name="eventName")],
        metrics=[Metric(name="eventCount"), Metric(name="activeUsers")],
        days=days, filters=funnel_events_filter,
    )

    # 5. Eventos por dispositivo (mobile vs desktop para key events)
    events_by_device = _run(client,
        dimensions=[Dimension(name="deviceCategory"), Dimension(name="eventName")],
        metrics=[Metric(name="eventCount")],
        days=days, limit=200,
    )

    return {
        "all_events": all_events,
        "events_by_page": events_by_page,
        "by_device": by_device,
        "funnel": funnel,
        "events_by_device": events_by_device,
    }


# ======================== OVERVIEW MODE ========================

def query_overview(client, days):
    """Resumen ejecutivo: fuentes, nuevo vs recurrente, comparación temporal."""

    # 1. Tráfico por fuente/medio
    by_source = _run(client,
        dimensions=[Dimension(name="sessionSource"), Dimension(name="sessionMedium")],
        metrics=[
            Metric(name="sessions"),
            Metric(name="activeUsers"),
            Metric(name="averageSessionDuration"),
            Metric(name="bounceRate"),
        ],
        days=days,
        order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="sessions"), desc=True)],
    )

    # 2. Nuevo vs recurrente
    new_vs_returning = _run(client,
        dimensions=[Dimension(name="newVsReturning")],
        metrics=[
            Metric(name="sessions"),
            Metric(name="activeUsers"),
            Metric(name="averageSessionDuration"),
        ],
        days=days,
    )

    # 3. Tráfico por día
    by_date = _run(client,
        dimensions=[Dimension(name="date")],
        metrics=[
            Metric(name="sessions"),
            Metric(name="activeUsers"),
            Metric(name="screenPageViews"),
        ],
        days=days,
        order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="date"))],
    )

    # 4. Top páginas
    top_pages = _run(client,
        dimensions=[Dimension(name="pagePath")],
        metrics=[
            Metric(name="sessions"),
            Metric(name="screenPageViews"),
            Metric(name="averageSessionDuration"),
            Metric(name="bounceRate"),
        ],
        days=days,
        order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="sessions"), desc=True)],
        limit=15,
    )

    # 5. Comparación con período anterior (totales)
    comparison = _run_comparison(client,
        dimensions=[],
        metrics=[
            Metric(name="sessions"),
            Metric(name="activeUsers"),
            Metric(name="screenPageViews"),
            Metric(name="averageSessionDuration"),
            Metric(name="bounceRate"),
        ],
        days=days,
    )

    return {
        "by_source": by_source,
        "new_vs_returning": new_vs_returning,
        "by_date": by_date,
        "top_pages": top_pages,
        "comparison": comparison,
    }


# ======================== RETENTION MODE ========================

RETENTION_EVENTS = [
    "click_whatsapp", "open_detail", "apply_filters", "view_property",
    "swipe_photos", "lead_gate", "session_alquiler",
]


def query_retention(client, days):
    """Señales PMF: returning users trend, organic growth, engagement by user type."""

    # 1. New vs Returning by week — core retention trend
    nr_by_week = _run(client,
        dimensions=[Dimension(name="isoWeek"), Dimension(name="newVsReturning")],
        metrics=[
            Metric(name="sessions"),
            Metric(name="activeUsers"),
            Metric(name="averageSessionDuration"),
        ],
        days=days,
        order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="isoWeek"))],
        limit=200,
    )

    # 2. Returning users × source/medium — is organic/direct returning growing?
    returning_filter = FilterExpression(
        filter=Filter(
            field_name="newVsReturning",
            string_filter=Filter.StringFilter(
                value="returning",
                match_type=Filter.StringFilter.MatchType.EXACT,
            ),
        )
    )
    returning_by_source = _run(client,
        dimensions=[Dimension(name="sessionSource"), Dimension(name="sessionMedium")],
        metrics=[
            Metric(name="sessions"),
            Metric(name="activeUsers"),
            Metric(name="averageSessionDuration"),
        ],
        days=days,
        filters=returning_filter,
        order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="sessions"), desc=True)],
    )

    # 3. Key events × new vs returning — do returning users engage more?
    events_filter = FilterExpression(
        or_group=FilterExpressionList(
            expressions=[
                FilterExpression(filter=Filter(
                    field_name="eventName",
                    string_filter=Filter.StringFilter(
                        value=ev,
                        match_type=Filter.StringFilter.MatchType.EXACT,
                    ),
                ))
                for ev in RETENTION_EVENTS
            ]
        )
    )
    events_by_type = _run(client,
        dimensions=[Dimension(name="newVsReturning"), Dimension(name="eventName")],
        metrics=[Metric(name="eventCount"), Metric(name="activeUsers")],
        days=days, filters=events_filter, limit=200,
    )

    # 4. Organic + direct sessions by week — PMF signal: growing without spend
    organic_direct_filter = FilterExpression(
        or_group=FilterExpressionList(
            expressions=[
                FilterExpression(filter=Filter(
                    field_name="sessionMedium",
                    string_filter=Filter.StringFilter(
                        value="organic",
                        match_type=Filter.StringFilter.MatchType.EXACT,
                    ),
                )),
                FilterExpression(filter=Filter(
                    field_name="sessionMedium",
                    string_filter=Filter.StringFilter(
                        value="(none)",
                        match_type=Filter.StringFilter.MatchType.EXACT,
                    ),
                )),
                FilterExpression(filter=Filter(
                    field_name="sessionMedium",
                    string_filter=Filter.StringFilter(
                        value="referral",
                        match_type=Filter.StringFilter.MatchType.EXACT,
                    ),
                )),
            ]
        )
    )
    organic_by_week = _run(client,
        dimensions=[Dimension(name="isoWeek"), Dimension(name="sessionMedium")],
        metrics=[Metric(name="sessions"), Metric(name="activeUsers")],
        days=days, filters=organic_direct_filter,
        order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="isoWeek"))],
        limit=200,
    )

    # 5. Comparison: returning users this period vs previous
    nr_comparison = _run_comparison(client,
        dimensions=[Dimension(name="newVsReturning")],
        metrics=[
            Metric(name="sessions"),
            Metric(name="activeUsers"),
        ],
        days=days,
    )

    return {
        "nr_by_week": nr_by_week,
        "returning_by_source": returning_by_source,
        "events_by_type": events_by_type,
        "organic_by_week": organic_by_week,
        "nr_comparison": nr_comparison,
    }


# ======================== DISPLAY ========================

def _rows_to_dicts(response, dim_names, metric_names):
    """Convert GA4 response rows to list of dicts."""
    results = []
    for row in (response.rows or []):
        d = {}
        for i, name in enumerate(dim_names):
            d[name] = row.dimension_values[i].value
        for i, name in enumerate(metric_names):
            val = row.metric_values[i].value
            try:
                d[name] = int(val)
            except ValueError:
                try:
                    d[name] = round(float(val), 2)
                except ValueError:
                    d[name] = val
        results.append(d)
    return results


def print_campaign(data, days, piece_filter):
    print()
    print("=" * 70)
    print(f"  SIMÓN — Campaign Metrics (últimos {days} días)")
    if piece_filter:
        print(f"  Pieza: {PIEZAS.get(piece_filter, piece_filter)}")
    print("=" * 70)

    # Traffic
    print()
    print("TRÁFICO POR PIEZA Y CANAL")
    print("-" * 70)
    rows = _rows_to_dicts(data["traffic"],
        ["campaign", "piece", "source"],
        ["sessions", "users", "views", "duration", "bounce"])

    rows = [r for r in rows if r["piece"] and r["piece"] != "(not set)"]
    if not rows:
        print("  Sin datos de tráfico paid en este período.")
    else:
        print(f"  {'Pieza':<18} {'Canal':<12} {'Ses':>6} {'Usr':>6} {'Views':>6} {'Dur':>7} {'Bnce':>6}")
        print(f"  {'-'*16:<18} {'-'*10:<12} {'-'*6:>6} {'-'*6:>6} {'-'*6:>6} {'-'*7:>7} {'-'*6:>6}")
        for r in rows:
            print(f"  {r['piece'][:18]:<18} {r['source'][:12]:<12} {r['sessions']:>6} {r['users']:>6} {r['views']:>6} {r['duration']:>7.1f} {r['bounce']:>5.1f}%")

    # Events by piece
    print()
    print("EVENTOS POR PIEZA")
    print("-" * 70)
    events_rows = _rows_to_dicts(data["events"],
        ["event", "piece"], ["count"])
    events_rows = [r for r in events_rows if r["piece"] and r["piece"] != "(not set)"]

    by_piece = {}
    for r in events_rows:
        by_piece.setdefault(r["piece"], {})[r["event"]] = r["count"]

    key_events = ["click_whatsapp", "open_detail", "apply_filters",
                  "view_property", "bounce_no_action", "no_results"]

    for piece, events in sorted(by_piece.items()):
        name = PIEZAS.get(piece, piece)
        print(f"\n  {name}")
        for ev in key_events:
            if ev in events:
                print(f"    {ev:<28} {events[ev]:>6}")
        for ev, cnt in sorted(events.items()):
            if ev not in key_events:
                print(f"    {ev:<28} {cnt:>6}")

    # BD leads with GA4 cross-reference
    _print_leads_bd_campaign(days, data["events"])

    print()


def print_ux(data, days):
    print()
    print("=" * 70)
    print(f"  SIMÓN — UX Analysis (últimos {days} días)")
    print("=" * 70)

    # Funnel
    print()
    print("FUNNEL DE CONVERSIÓN")
    print("-" * 70)
    funnel_rows = _rows_to_dicts(data["funnel"], ["event"], ["count", "users"])
    funnel_map = {r["event"]: r for r in funnel_rows}

    prev_count = None
    for ev in FUNNEL_EVENTS:
        r = funnel_map.get(ev, {"count": 0, "users": 0})
        drop = ""
        if prev_count and prev_count > 0:
            rate = r["count"] / prev_count * 100
            drop = f"  ({rate:>5.1f}% del paso anterior)"
        print(f"  {ev:<25} {r['count']:>8} eventos  {r['users']:>6} usuarios{drop}")
        prev_count = r["count"]

    if funnel_map.get("session_start", {}).get("users", 0) > 0:
        starts = funnel_map["session_start"]["users"]
        wa = funnel_map.get("click_whatsapp", {}).get("users", 0)
        print(f"\n  Conversión total: {wa}/{starts} = {wa/starts*100:.2f}%")

    # All events
    print()
    print("TODOS LOS EVENTOS (top 30)")
    print("-" * 70)
    all_rows = _rows_to_dicts(data["all_events"], ["event"], ["count", "users"])
    print(f"  {'Evento':<30} {'Eventos':>8} {'Usuarios':>8}")
    print(f"  {'-'*28:<30} {'-'*8:>8} {'-'*8:>8}")
    for r in all_rows[:30]:
        print(f"  {r['event'][:30]:<30} {r['count']:>8} {r['users']:>8}")

    # By device
    print()
    print("POR DISPOSITIVO")
    print("-" * 70)
    dev_rows = _rows_to_dicts(data["by_device"],
        ["device"], ["sessions", "users", "duration", "bounce"])
    print(f"  {'Dispositivo':<15} {'Ses':>8} {'Usr':>8} {'Dur(s)':>8} {'Bounce':>8}")
    print(f"  {'-'*13:<15} {'-'*8:>8} {'-'*8:>8} {'-'*8:>8} {'-'*8:>8}")
    for r in dev_rows:
        print(f"  {r['device']:<15} {r['sessions']:>8} {r['users']:>8} {r['duration']:>8.1f} {r['bounce']:>7.1f}%")

    # Events by page (top pages with key events)
    print()
    print("EVENTOS POR PÁGINA (key events)")
    print("-" * 70)
    page_rows = _rows_to_dicts(data["events_by_page"], ["page", "event"], ["count"])
    by_page = {}
    for r in page_rows:
        by_page.setdefault(r["page"], {})[r["event"]] = r["count"]

    interesting_events = {"click_whatsapp", "click_whatsapp_venta", "open_detail",
                          "open_detail_venta", "apply_filters", "apply_filters_venta",
                          "view_property", "bounce_no_action", "swipe_photos",
                          "reset_filters", "lead_gate", "lead_gate_venta"}

    for page in sorted(by_page.keys()):
        events = by_page[page]
        relevant = {k: v for k, v in events.items() if k in interesting_events}
        if relevant:
            print(f"\n  {page}")
            for ev, cnt in sorted(relevant.items(), key=lambda x: -x[1]):
                print(f"    {ev:<28} {cnt:>6}")

    # Events by device
    print()
    print("KEY EVENTS POR DISPOSITIVO")
    print("-" * 70)
    dev_ev_rows = _rows_to_dicts(data["events_by_device"], ["device", "event"], ["count"])
    by_dev = {}
    for r in dev_ev_rows:
        by_dev.setdefault(r["device"], {})[r["event"]] = r["count"]

    target_events = ["click_whatsapp", "click_whatsapp_venta", "open_detail",
                     "apply_filters", "view_property", "swipe_photos",
                     "bounce_no_action", "reset_filters", "lead_gate"]
    devices = sorted(by_dev.keys())
    print(f"  {'Evento':<28}", end="")
    for d in devices:
        print(f" {d:>10}", end="")
    print()
    print(f"  {'-'*26:<28}", end="")
    for d in devices:
        print(f" {'-'*10:>10}", end="")
    print()
    for ev in target_events:
        print(f"  {ev:<28}", end="")
        for d in devices:
            cnt = by_dev.get(d, {}).get(ev, 0)
            print(f" {cnt:>10}", end="")
        print()

    # Leads BD (intenciones WhatsApp)
    _print_leads_bd(days)

    print()


def _get_leads_conn():
    """Get psycopg2 connection to leads_alquiler. Returns (conn, cur) or (None, None)."""
    try:
        import psycopg2
    except ImportError:
        print("\n  (pip install psycopg2-binary para ver leads BD)")
        return None, None
    try:
        conn = psycopg2.connect(DB_CONN)
        return conn, conn.cursor()
    except Exception as e:
        print(f"\n  (Error BD: {e})")
        return None, None


_LEADS_WHERE = """
    created_at >= NOW() - INTERVAL '%s days'
    AND (es_test = false OR es_test IS NULL)
    AND (es_debounce = false OR es_debounce IS NULL)
    AND (es_bot = false OR es_bot IS NULL)
"""


def _print_leads_bd(days):
    """Query leads_alquiler and print daily intenciones + props unicas."""
    conn, cur = _get_leads_conn()
    if not conn:
        return

    try:
        # Daily breakdown
        cur.execute("""
            SELECT DATE(created_at - INTERVAL '4 hours') as fecha,
                   COUNT(*) as intenciones,
                   COUNT(DISTINCT propiedad_id) as props_unicas
            FROM leads_alquiler
            WHERE %s
            GROUP BY DATE(created_at - INTERVAL '4 hours')
            ORDER BY fecha
        """ % _LEADS_WHERE % int(days))
        rows = cur.fetchall()

        # By fuente (card, detail, compare, chat-bot)
        cur.execute("""
            SELECT fuente, COUNT(*) as n, COUNT(DISTINCT propiedad_id) as props
            FROM leads_alquiler
            WHERE %s
            GROUP BY fuente ORDER BY n DESC
        """ % _LEADS_WHERE % int(days))
        by_fuente = cur.fetchall()

        # Paid vs organic (utm_source)
        cur.execute("""
            SELECT COALESCE(utm_source, 'sin UTM') as canal,
                   COUNT(*) as n, COUNT(DISTINCT propiedad_id) as props
            FROM leads_alquiler
            WHERE %s
            GROUP BY COALESCE(utm_source, 'sin UTM') ORDER BY n DESC
        """ % _LEADS_WHERE % int(days))
        by_canal = cur.fetchall()

        # By pieza (utm_content) — available post-migration 210
        cur.execute("""
            SELECT COALESCE(utm_content, 'sin pieza') as pieza,
                   COALESCE(utm_source, 'sin UTM') as canal,
                   COUNT(*) as n, COUNT(DISTINCT propiedad_id) as props
            FROM leads_alquiler
            WHERE %s
            GROUP BY COALESCE(utm_content, 'sin pieza'), COALESCE(utm_source, 'sin UTM')
            ORDER BY n DESC
        """ % _LEADS_WHERE % int(days))
        by_pieza = cur.fetchall()

        conn.close()
    except Exception as e:
        print(f"\n  (Error BD: {e})")
        conn.close()
        return

    if not rows:
        print("\n  (Sin leads en BD para el periodo)")
        return

    print()
    print("LEADS BD — Intenciones WhatsApp (fuente de verdad)")
    print("-" * 70)
    print(f"  {'Fecha':<14} {'Intenciones':>12} {'Props únicas':>13}")
    print(f"  {'-'*12:<14} {'-'*12:>12} {'-'*13:>13}")

    total_int = 0
    total_props = 0
    for fecha, intenciones, props in rows:
        total_int += intenciones
        total_props += props
        print(f"  {str(fecha):<14} {intenciones:>12} {props:>13}")

    n_days = max(len(rows), 1)
    print(f"  {'-'*12:<14} {'-'*12:>12} {'-'*13:>13}")
    print(f"  {'TOTAL':<14} {total_int:>12} {total_props:>13}")
    print(f"  {'Promedio/día':<14} {total_int/n_days:>12.1f} {total_props/n_days:>13.1f}")

    print()
    print("  Por fuente (UI origin):")
    for fuente, n, props in by_fuente:
        print(f"    {fuente:<20} {n:>4} intenciones  {props:>4} props")

    print()
    print("  Paid vs orgánico (utm_source):")
    has_null_utm = False
    for canal, n, props in by_canal:
        if canal == 'sin UTM':
            has_null_utm = True
        print(f"    {canal:<25} {n:>4} intenciones  {props:>4} props")

    # Show by pieza if any have utm_content
    has_pieza = any(p[0] != 'sin pieza' for p in by_pieza)
    if has_pieza:
        print()
        print("  Por pieza (utm_content):")
        for pieza, canal, n, props in by_pieza:
            name = PIEZAS.get(pieza, pieza)
            print(f"    {name[:25]:<25} {canal:<12} {n:>4} leads  {props:>4} props")

    if has_null_utm:
        print()
        print("  CORTES DE DATOS:")
        print("    utm_source:  confiable desde 8 abr 2026")
        print("    utm_content: confiable desde migración 210")
        print("    Leads anteriores sin UTM pueden ser paid (indistinguible)")


def _print_leads_bd_campaign(days, ga4_events_data):
    """Campaign-specific leads: BD leads by piece + GA4 vs BD comparison."""
    conn, cur = _get_leads_conn()
    if not conn:
        return

    try:
        # Daily: GA4 click_whatsapp vs BD leads
        cur.execute("""
            SELECT DATE(created_at - INTERVAL '4 hours') as fecha,
                   COUNT(*) as total,
                   COUNT(*) FILTER (WHERE utm_source IS NOT NULL) as con_utm,
                   COUNT(*) FILTER (WHERE utm_source IS NULL) as sin_utm
            FROM leads_alquiler
            WHERE %s
            GROUP BY DATE(created_at - INTERVAL '4 hours')
            ORDER BY fecha
        """ % _LEADS_WHERE % int(days))
        daily = cur.fetchall()

        # By piece (utm_content) — the money query
        cur.execute("""
            SELECT COALESCE(utm_content, 'sin pieza') as pieza,
                   COUNT(*) as leads,
                   COUNT(DISTINCT propiedad_id) as props,
                   COUNT(*) FILTER (WHERE utm_source IN ('facebook', 'instagram', 'meta')) as paid,
                   COUNT(*) FILTER (WHERE utm_source IS NULL) as sin_utm,
                   COUNT(*) FILTER (WHERE utm_source NOT IN ('facebook', 'instagram', 'meta') AND utm_source IS NOT NULL) as otro
            FROM leads_alquiler
            WHERE %s
            GROUP BY COALESCE(utm_content, 'sin pieza')
            ORDER BY leads DESC
        """ % _LEADS_WHERE % int(days))
        by_piece = cur.fetchall()

        # By campaign (utm_campaign)
        cur.execute("""
            SELECT COALESCE(utm_campaign, 'sin campaña') as campaign,
                   COUNT(*) as leads,
                   COUNT(DISTINCT propiedad_id) as props
            FROM leads_alquiler
            WHERE %s
            GROUP BY COALESCE(utm_campaign, 'sin campaña')
            ORDER BY leads DESC
        """ % _LEADS_WHERE % int(days))
        by_campaign = cur.fetchall()

        # Top properties that received leads
        cur.execute("""
            SELECT propiedad_id, nombre_propiedad, zona, precio_bob, dormitorios,
                   COUNT(*) as leads, fuente
            FROM leads_alquiler
            WHERE %s AND propiedad_id IS NOT NULL
            GROUP BY propiedad_id, nombre_propiedad, zona, precio_bob, dormitorios, fuente
            ORDER BY leads DESC
            LIMIT 10
        """ % _LEADS_WHERE % int(days))
        top_props = cur.fetchall()

        conn.close()
    except Exception as e:
        print(f"\n  (Error BD: {e})")
        conn.close()
        return

    # Extract GA4 click_whatsapp counts by piece for comparison
    ga4_wa_by_piece = {}
    if ga4_events_data:
        events_rows = _rows_to_dicts(ga4_events_data,
            ["event", "piece"], ["count"])
        for r in events_rows:
            if r["event"] == "click_whatsapp" and r["piece"] and r["piece"] != "(not set)":
                ga4_wa_by_piece[r["piece"]] = r["count"]

    total_bd = sum(r[1] for r in daily) if daily else 0
    total_ga4_wa = sum(ga4_wa_by_piece.values())

    print()
    print("=" * 70)
    print("  LEADS BD vs GA4 — Cruce de conversiones")
    print("=" * 70)

    # Summary comparison
    print()
    print("RESUMEN")
    print("-" * 70)
    print(f"  GA4 click_whatsapp (eventos):  {total_ga4_wa:>6}")
    print(f"  BD leads_alquiler (reales):    {total_bd:>6}")
    if total_ga4_wa > 0 and total_bd > 0:
        ratio = total_bd / total_ga4_wa * 100
        diff = total_ga4_wa - total_bd
        print(f"  Diferencia GA4 - BD:           {diff:>+6}  ({ratio:.0f}% de GA4 llegan a BD)")
        if diff > 0:
            print("  (Normal: GA4 cuenta el evento JS, BD solo si el POST llega al server)")
        elif diff < 0:
            print("  (BD > GA4: posible adblock bloqueando GA4 pero no el POST)")

    # Daily comparison
    if daily:
        print()
        print("LEADS BD POR DÍA")
        print("-" * 70)
        print(f"  {'Fecha':<14} {'Total':>6} {'Paid':>6} {'Sin UTM':>8} {'Orgánico':>9}")
        print(f"  {'-'*12:<14} {'-'*6:>6} {'-'*6:>6} {'-'*8:>8} {'-'*9:>9}")
        for fecha, total, con_utm, sin_utm in daily:
            organic = con_utm  # con_utm incluye paid + organic con UTM
            print(f"  {str(fecha):<14} {total:>6} {con_utm:>6} {sin_utm:>8}")
        total_con = sum(r[2] for r in daily)
        total_sin = sum(r[3] for r in daily)
        print(f"  {'-'*12:<14} {'-'*6:>6} {'-'*6:>6} {'-'*8:>8}")
        print(f"  {'TOTAL':<14} {total_bd:>6} {total_con:>6} {total_sin:>8}")

    # By piece: GA4 vs BD side by side
    print()
    print("POR PIEZA — GA4 click_whatsapp vs BD leads")
    print("-" * 70)
    print(f"  {'Pieza':<25} {'GA4 WA':>7} {'BD leads':>9} {'BD paid':>8} {'BD s/UTM':>9} {'Props':>6}")
    print(f"  {'-'*23:<25} {'-'*7:>7} {'-'*9:>9} {'-'*8:>8} {'-'*9:>9} {'-'*6:>6}")

    # Merge GA4 pieces + BD pieces
    all_pieces = set(ga4_wa_by_piece.keys())
    bd_by_piece = {}
    for pieza, leads, props, paid, sin_utm, otro in by_piece:
        bd_by_piece[pieza] = {"leads": leads, "props": props, "paid": paid, "sin_utm": sin_utm, "otro": otro}
        if pieza != 'sin pieza':
            all_pieces.add(pieza)

    for piece in sorted(all_pieces):
        name = PIEZAS.get(piece, piece)[:25]
        ga4 = ga4_wa_by_piece.get(piece, 0)
        bd = bd_by_piece.get(piece, {})
        bd_leads = bd.get("leads", 0)
        bd_paid = bd.get("paid", 0)
        bd_sin = bd.get("sin_utm", 0)
        bd_props = bd.get("props", 0)
        print(f"  {name:<25} {ga4:>7} {bd_leads:>9} {bd_paid:>8} {bd_sin:>9} {bd_props:>6}")

    # Show "sin pieza" (organic/direct traffic without utm_content)
    if 'sin pieza' in bd_by_piece:
        sp = bd_by_piece['sin pieza']
        print(f"  {'(sin pieza/orgánico)':<25} {'—':>7} {sp['leads']:>9} {sp['paid']:>8} {sp['sin_utm']:>9} {sp['props']:>6}")

    # By campaign
    has_campaign = any(c[0] != 'sin campaña' for c in by_campaign)
    if has_campaign:
        print()
        print("POR CAMPAÑA (utm_campaign)")
        print("-" * 70)
        for campaign, leads, props in by_campaign:
            print(f"  {campaign[:40]:<40} {leads:>4} leads  {props:>4} props")

    # Top properties
    if top_props:
        print()
        print("TOP PROPIEDADES CON LEADS")
        print("-" * 70)
        print(f"  {'ID':>6} {'Nombre':<30} {'Zona':<16} {'Bs':>7} {'D':>2} {'Leads':>5}")
        print(f"  {'-'*6:>6} {'-'*28:<30} {'-'*14:<16} {'-'*7:>7} {'-'*2:>2} {'-'*5:>5}")
        for pid, nombre, zona, precio, dorms, leads, fuente in top_props:
            n = (nombre or '—')[:30]
            z = (zona or '—')[:16]
            p = f"{int(precio):,}" if precio else '—'
            d = str(dorms) if dorms is not None else '—'
            print(f"  {pid:>6} {n:<30} {z:<16} {p:>7} {d:>2} {leads:>5}")

    # Data quality notes
    print()
    print("  CORTES DE DATOS:")
    print("    utm_source:  confiable desde 8 abr 2026")
    print("    utm_content: confiable desde migración 210 (post-deploy)")
    print("    Leads con 'sin UTM' pre-8 abr pueden ser paid")


def print_retention(data, days):
    print()
    print("=" * 70)
    print(f"  SIMON -- Retention & PMF Signals (ultimos {days} dias)")
    print("=" * 70)

    if days < 14:
        print()
        print("  NOTA: Con menos de 14 dias no hay tendencia semanal confiable.")
        print("  Los datos son un snapshot, no una tendencia. Usar --days 28 para PMF.")

    # 1. New vs Returning by week
    print()
    print("RETENCION POR SEMANA (new vs returning)")
    print("-" * 70)
    nr_rows = _rows_to_dicts(data["nr_by_week"],
        ["week", "type"], ["sessions", "users", "duration"])

    weeks = sorted(set(r["week"] for r in nr_rows))
    print(f"  {'Semana':<10} {'New ses':>8} {'Ret ses':>8} {'Ret %':>7} {'New usr':>8} {'Ret usr':>8} {'Ret dur':>8}")
    print(f"  {'-'*8:<10} {'-'*8:>8} {'-'*8:>8} {'-'*7:>7} {'-'*8:>8} {'-'*8:>8} {'-'*8:>8}")

    for week in weeks:
        new = next((r for r in nr_rows if r["week"] == week and r["type"] == "new"), None)
        ret = next((r for r in nr_rows if r["week"] == week and r["type"] == "returning"), None)
        ns = new["sessions"] if new else 0
        rs = ret["sessions"] if ret else 0
        nu = new["users"] if new else 0
        ru = ret["users"] if ret else 0
        rd = ret["duration"] if ret else 0
        total = ns + rs
        pct = (rs / total * 100) if total > 0 else 0
        print(f"  W{week:<9} {ns:>8} {rs:>8} {pct:>6.1f}% {nu:>8} {ru:>8} {rd:>7.1f}s")

    # PMF verdict on retention trend
    if len(weeks) >= 2:
        first_week = weeks[0]
        last_week = weeks[-1]
        first_ret = next((r for r in nr_rows if r["week"] == first_week and r["type"] == "returning"), None)
        last_ret = next((r for r in nr_rows if r["week"] == last_week and r["type"] == "returning"), None)
        first_total = sum(r["sessions"] for r in nr_rows if r["week"] == first_week)
        last_total = sum(r["sessions"] for r in nr_rows if r["week"] == last_week)
        first_pct = ((first_ret["sessions"] / first_total * 100) if first_ret and first_total else 0)
        last_pct = ((last_ret["sessions"] / last_total * 100) if last_ret and last_total else 0)
        delta = last_pct - first_pct
        arrow = "+" if delta > 0 else "-" if delta < 0 else "="
        print(f"\n  Tendencia: {first_pct:.1f}% -> {last_pct:.1f}% ({arrow}{abs(delta):.1f}pp)")
        if last_pct >= 10:
            print("  [OK] Senal PMF: returning >10%")
        elif last_pct >= 5:
            print("  [..] Traccion temprana (5-10%), seguir midiendo")
        else:
            print("  [!!] Returning <5% -- producto no retiene aun")

    # 2. Returning by source
    print()
    print("RETURNING USERS POR FUENTE")
    print("-" * 70)
    src_rows = _rows_to_dicts(data["returning_by_source"],
        ["source", "medium"], ["sessions", "users", "duration"])
    if not src_rows:
        print("  Sin returning users en este período.")
    else:
        print(f"  {'Fuente':<20} {'Medio':<12} {'Ses':>6} {'Usr':>6} {'Dur':>7}")
        print(f"  {'-'*18:<20} {'-'*10:<12} {'-'*6:>6} {'-'*6:>6} {'-'*7:>7}")
        for r in src_rows[:10]:
            print(f"  {r['source'][:20]:<20} {r['medium'][:12]:<12} {r['sessions']:>6} {r['users']:>6} {r['duration']:>7.1f}")

    # 3. Engagement: returning vs new on key events
    print()
    print("ENGAGEMENT POR TIPO DE USUARIO")
    print("-" * 70)
    ev_rows = _rows_to_dicts(data["events_by_type"],
        ["type", "event"], ["count", "users"])

    by_type = {}
    for r in ev_rows:
        if r["type"] and r["type"] not in ("(not set)", ""):
            by_type.setdefault(r["type"], {})[r["event"]] = r

    types = sorted(by_type.keys())
    print(f"  {'Evento':<25}", end="")
    for t in types:
        print(f" {t + ' (ev)':>12} {t + ' (usr)':>12}", end="")
    print()
    print(f"  {'-'*23:<25}", end="")
    for t in types:
        print(f" {'-'*12:>12} {'-'*12:>12}", end="")
    print()

    for ev in RETENTION_EVENTS:
        print(f"  {ev:<25}", end="")
        for t in types:
            r = by_type.get(t, {}).get(ev, {"count": 0, "users": 0})
            print(f" {r['count']:>12} {r['users']:>12}", end="")
        print()

    # Events per user comparison
    print()
    for ev in ["click_whatsapp", "open_detail", "view_property"]:
        for t in types:
            r = by_type.get(t, {}).get(ev)
            if r and r["users"] > 0:
                rate = r["count"] / r["users"]
                print(f"  {ev} / {t} user: {rate:.2f}")

    # 4. Organic + direct by week
    print()
    print("TRAFICO NO-PAID POR SEMANA (organic + direct + referral)")
    print("-" * 70)
    org_rows = _rows_to_dicts(data["organic_by_week"],
        ["week", "medium"], ["sessions", "users"])

    org_weeks = sorted(set(r["week"] for r in org_rows))
    mediums = ["organic", "(none)", "referral"]
    medium_labels = {"organic": "Organic", "(none)": "Direct", "referral": "Referral"}

    print(f"  {'Semana':<10}", end="")
    for m in mediums:
        print(f" {medium_labels.get(m, m):>10}", end="")
    print(f" {'Total':>10}")
    print(f"  {'-'*8:<10}", end="")
    for m in mediums:
        print(f" {'-'*10:>10}", end="")
    print(f" {'-'*10:>10}")

    week_totals = []
    for week in org_weeks:
        print(f"  W{week:<9}", end="")
        total = 0
        for m in mediums:
            r = next((r for r in org_rows if r["week"] == week and r["medium"] == m), None)
            val = r["sessions"] if r else 0
            total += val
            print(f" {val:>10}", end="")
        print(f" {total:>10}")
        week_totals.append(total)

    if len(week_totals) >= 2 and week_totals[0] > 0:
        growth = (week_totals[-1] - week_totals[0]) / week_totals[0] * 100
        arrow = "+" if growth > 0 else "-"
        print(f"\n  Tendencia no-paid: {arrow}{abs(growth):.0f}% (W{org_weeks[0]} -> W{org_weeks[-1]})")
        if growth > 0:
            print("  [OK] Senal PMF: trafico no-paid creciendo")
        else:
            print("  [!!] Trafico no-paid no crece -- depende de ads")

    # 5. Comparison with previous period
    print()
    print("RETURNING: ESTE PERIODO VS ANTERIOR")
    print("-" * 70)
    comp = data["nr_comparison"]
    if comp.rows and len(comp.rows) >= 2:
        # _run_comparison returns 2 metrics per date range (sessions, users)
        # With 2 date ranges: metric_values has 4 values [ses_current, usr_current, ses_previous, usr_previous]
        comp_rows = []
        for row in comp.rows:
            t = row.dimension_values[0].value
            if not t:
                continue
            vals = [v.value for v in row.metric_values]
            try:
                comp_rows.append({
                    "type": t,
                    "ses_current": int(vals[0]) if len(vals) > 0 else 0,
                    "usr_current": int(vals[1]) if len(vals) > 1 else 0,
                    "ses_previous": int(vals[2]) if len(vals) > 2 else 0,
                    "usr_previous": int(vals[3]) if len(vals) > 3 else 0,
                })
            except (ValueError, IndexError):
                pass

        # Deduplicate (GA4 may return dupes)
        seen = set()
        unique = []
        for r in comp_rows:
            if r["type"] not in seen:
                seen.add(r["type"])
                unique.append(r)
        comp_rows = unique

        print(f"  {'Tipo':<15} {'Ses actual':>10} {'Ses anter':>10} {'Cambio':>10} {'Usr actual':>10} {'Usr anter':>10}")
        print(f"  {'-'*13:<15} {'-'*10:>10} {'-'*10:>10} {'-'*10:>10} {'-'*10:>10} {'-'*10:>10}")
        for r in comp_rows:
            sc = r["ses_current"]
            sp = r["ses_previous"]
            change = f"{(sc - sp) / sp * 100:+.0f}%" if sp > 0 else "n/a"
            print(f"  {r['type']:<15} {sc:>10} {sp:>10} {change:>10} {r['usr_current']:>10} {r['usr_previous']:>10}")
    else:
        print("  Sin datos de comparacion.")

    # Final PMF summary
    print()
    print("=" * 70)
    print("  RESUMEN PMF")
    print("=" * 70)
    print("  Senales a buscar:")
    print("  1. Returning sessions >10% del total")
    print("  2. Trafico no-paid (direct+organic) creciendo semana a semana")
    print("  3. Returning users con mayor tasa de WA click que new users")
    print("  4. Returning user duration > new user duration")
    print()

    print()


def print_overview(data, ux_data, days):
    print()
    print("=" * 70)
    print(f"  SIMÓN — Overview (últimos {days} días)")
    print("=" * 70)

    # Comparison
    print()
    print("COMPARACIÓN CON PERÍODO ANTERIOR")
    print("-" * 70)
    comp = data["comparison"]
    if comp.rows and len(comp.rows) >= 1:
        metrics_names = ["sessions", "users", "views", "duration", "bounce"]
        current = {}
        previous = {}
        for row in comp.rows:
            for i, name in enumerate(metrics_names):
                val = row.metric_values[i].value
                try:
                    v = int(val)
                except ValueError:
                    v = round(float(val), 2)
                # GA4 returns metrics for each date range in order
                # First row = current period values, but with comparison
                # Actually, with no dimensions, we get one row per date range
                pass

        # With empty dimensions, each date range gets its own row
        if len(comp.rows) >= 2:
            for i, name in enumerate(metrics_names):
                try:
                    current[name] = int(comp.rows[0].metric_values[i].value)
                except ValueError:
                    current[name] = round(float(comp.rows[0].metric_values[i].value), 2)
                try:
                    previous[name] = int(comp.rows[1].metric_values[i].value)
                except ValueError:
                    previous[name] = round(float(comp.rows[1].metric_values[i].value), 2)

            print(f"  {'Métrica':<20} {'Actual':>10} {'Anterior':>10} {'Cambio':>10}")
            print(f"  {'-'*18:<20} {'-'*10:>10} {'-'*10:>10} {'-'*10:>10}")
            for name in metrics_names:
                c = current.get(name, 0)
                p = previous.get(name, 0)
                if isinstance(c, float):
                    if name == "bounce":
                        change = f"{c - p:+.1f}pp" if p else "—"
                        print(f"  {name:<20} {c:>9.1f}% {p:>9.1f}% {change:>10}")
                    else:
                        change = f"{c - p:+.1f}" if p else "—"
                        print(f"  {name:<20} {c:>10.1f} {p:>10.1f} {change:>10}")
                else:
                    if p > 0:
                        pct = (c - p) / p * 100
                        change = f"{pct:+.0f}%"
                    else:
                        change = "—"
                    print(f"  {name:<20} {c:>10} {p:>10} {change:>10}")
        else:
            print("  Sin datos de comparación disponibles.")

    # By source
    print()
    print("TRÁFICO POR FUENTE")
    print("-" * 70)
    src_rows = _rows_to_dicts(data["by_source"],
        ["source", "medium"], ["sessions", "users", "duration", "bounce"])
    print(f"  {'Fuente':<20} {'Medio':<12} {'Ses':>6} {'Usr':>6} {'Dur':>7} {'Bnce':>6}")
    print(f"  {'-'*18:<20} {'-'*10:<12} {'-'*6:>6} {'-'*6:>6} {'-'*7:>7} {'-'*6:>6}")
    for r in src_rows[:15]:
        print(f"  {r['source'][:20]:<20} {r['medium'][:12]:<12} {r['sessions']:>6} {r['users']:>6} {r['duration']:>7.1f} {r['bounce']:>5.1f}%")

    # New vs Returning
    print()
    print("NUEVO VS RECURRENTE")
    print("-" * 70)
    nr_rows = _rows_to_dicts(data["new_vs_returning"],
        ["type"], ["sessions", "users", "duration"])
    for r in nr_rows:
        print(f"  {r['type']:<20} {r['sessions']:>6} sesiones  {r['users']:>6} usuarios  {r['duration']:>6.1f}s duración")

    # By date
    print()
    print("TRÁFICO POR DÍA")
    print("-" * 70)
    date_rows = _rows_to_dicts(data["by_date"],
        ["date"], ["sessions", "users", "views"])
    print(f"  {'Fecha':<12} {'Ses':>8} {'Usr':>8} {'Views':>8}")
    print(f"  {'-'*10:<12} {'-'*8:>8} {'-'*8:>8} {'-'*8:>8}")
    for r in date_rows:
        d = r["date"]
        formatted = f"{d[:4]}-{d[4:6]}-{d[6:8]}"
        print(f"  {formatted:<12} {r['sessions']:>8} {r['users']:>8} {r['views']:>8}")

    # Top pages
    print()
    print("TOP PÁGINAS")
    print("-" * 70)
    page_rows = _rows_to_dicts(data["top_pages"],
        ["page"], ["sessions", "views", "duration", "bounce"])
    print(f"  {'Página':<35} {'Ses':>6} {'Views':>6} {'Dur':>7} {'Bnce':>6}")
    print(f"  {'-'*33:<35} {'-'*6:>6} {'-'*6:>6} {'-'*7:>7} {'-'*6:>6}")
    for r in page_rows:
        print(f"  {r['page'][:35]:<35} {r['sessions']:>6} {r['views']:>6} {r['duration']:>7.1f} {r['bounce']:>5.1f}%")

    # Print UX data too (funnel + device)
    if ux_data:
        print_ux(ux_data, days)

    print()
    print("=" * 70)


# ======================== JSON OUTPUT ========================

def to_json(mode, campaign_data=None, ux_data=None, overview_data=None, retention_data=None, days=7):
    """Output all data as JSON for programmatic consumption."""
    output = {"mode": mode, "days": days}

    if campaign_data:
        output["campaign"] = {
            "traffic": _rows_to_dicts(campaign_data["traffic"],
                ["campaign", "piece", "source"],
                ["sessions", "users", "views", "duration", "bounce"]),
            "events": _rows_to_dicts(campaign_data["events"],
                ["event", "piece"], ["count"]),
        }

    if ux_data:
        output["ux"] = {
            "all_events": _rows_to_dicts(ux_data["all_events"],
                ["event"], ["count", "users"]),
            "by_device": _rows_to_dicts(ux_data["by_device"],
                ["device"], ["sessions", "users", "duration", "bounce"]),
            "funnel": _rows_to_dicts(ux_data["funnel"],
                ["event"], ["count", "users"]),
            "events_by_page": _rows_to_dicts(ux_data["events_by_page"],
                ["page", "event"], ["count"]),
            "events_by_device": _rows_to_dicts(ux_data["events_by_device"],
                ["device", "event"], ["count"]),
        }

    if overview_data:
        output["overview"] = {
            "by_source": _rows_to_dicts(overview_data["by_source"],
                ["source", "medium"], ["sessions", "users", "duration", "bounce"]),
            "new_vs_returning": _rows_to_dicts(overview_data["new_vs_returning"],
                ["type"], ["sessions", "users", "duration"]),
            "by_date": _rows_to_dicts(overview_data["by_date"],
                ["date"], ["sessions", "users", "views"]),
            "top_pages": _rows_to_dicts(overview_data["top_pages"],
                ["page"], ["sessions", "views", "duration", "bounce"]),
        }

    if retention_data:
        output["retention"] = {
            "nr_by_week": _rows_to_dicts(retention_data["nr_by_week"],
                ["week", "type"], ["sessions", "users", "duration"]),
            "returning_by_source": _rows_to_dicts(retention_data["returning_by_source"],
                ["source", "medium"], ["sessions", "users", "duration"]),
            "events_by_type": _rows_to_dicts(retention_data["events_by_type"],
                ["type", "event"], ["count", "users"]),
            "organic_by_week": _rows_to_dicts(retention_data["organic_by_week"],
                ["week", "medium"], ["sessions", "users"]),
        }

    print(json_lib.dumps(output, ensure_ascii=False, indent=2))


# ======================== MAIN ========================

def main():
    parser = argparse.ArgumentParser(description="Métricas GA4 para Simón")
    parser.add_argument("piece", nargs="?", help="UTM content de la pieza (ej: pieza03). Implica --mode campaign")
    parser.add_argument("--mode", choices=["retention", "campaign", "ux", "overview"],
                        help="Modo: retention (PMF, default), campaign (paid), ux (funnel), overview (todo)")
    parser.add_argument("--days", type=int, help="Dias hacia atras (default: 28 retention, 7 otros)")
    parser.add_argument("--list", action="store_true", help="Listar piezas conocidas")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    args = parser.parse_args()

    # Si pasan una pieza, forzar campaign mode
    if args.piece and not args.mode:
        args.mode = "campaign"

    # Default mode = retention
    if not args.mode:
        args.mode = "retention"

    # Default days: 28 para retention, 7 para el resto
    if not args.days:
        args.days = 28 if args.mode == "retention" else 7

    if args.list:
        print("\nPiezas conocidas:")
        for utm, name in sorted(PIEZAS.items()):
            print(f"  {utm:<15} {name}")
        print()
        return

    try:
        client = get_client()
    except Exception as e:
        print(f"Error conectando a GA4: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        if args.mode == "campaign":
            data = query_campaign(client, args.days, args.piece)
            if args.json:
                to_json("campaign", campaign_data=data, days=args.days)
            else:
                print_campaign(data, args.days, args.piece)

        elif args.mode == "ux":
            data = query_ux(client, args.days)
            if args.json:
                to_json("ux", ux_data=data, days=args.days)
            else:
                print_ux(data, args.days)

        elif args.mode == "overview":
            overview = query_overview(client, args.days)
            ux = query_ux(client, args.days)
            campaign = query_campaign(client, args.days)
            if args.json:
                to_json("overview", campaign_data=campaign, ux_data=ux, overview_data=overview, days=args.days)
            else:
                print_overview(overview, ux, args.days)
                print()
                print_campaign(campaign, args.days, args.piece)

        elif args.mode == "retention":
            data = query_retention(client, args.days)
            if args.json:
                to_json("retention", retention_data=data, days=args.days)
            else:
                print_retention(data, args.days)

    except Exception as e:
        print(f"Error consultando GA4: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
