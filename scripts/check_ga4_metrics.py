"""
Simón — Métricas GA4 multi-modo.

Modos:
  campaign  — tráfico paid por pieza/UTM (default legacy)
  ux        — todos los eventos sin filtro UTM, funnel, dispositivo, página
  overview  — todo junto: fuentes, nuevo vs recurrente, comparación período anterior

Cortes de datos (NO comparar directamente antes/después):
  27 feb 2026 — click_whatsapp pre-27feb inflado (bug: disparaba en render)
  3 abr 2026  — session_alquiler/bounce_no_action pre-3abr inflados 1.7x (multi-fire)
  3 abr 2026  — view_photos eliminado (código muerto), reemplazado por swipe_photos
  3 abr 2026  — agregados reset_filters, lead_gate
  3 abr 2026  — keepalive fix: BD sub-reportaba leads pre-3abr
  Ver docs/meta/GA4_EVENTOS.md sección "Cortes de datos" para detalle completo.

Requiere:
  pip install google-analytics-data google-auth
  Service account key en ~/.credentials/ga4-key.json

Uso:
  python check_ga4_metrics.py                          → campaign, 7 días
  python check_ga4_metrics.py --mode ux --days 2       → UX últimos 2 días
  python check_ga4_metrics.py --mode overview           → overview 7 días
  python check_ga4_metrics.py pieza03 --days 3          → campaign, solo pieza03
  python check_ga4_metrics.py --list                    → listar piezas conocidas
  python check_ga4_metrics.py --json                    → output JSON (para consumo programático)
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

def to_json(mode, campaign_data=None, ux_data=None, overview_data=None, days=7):
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

    print(json_lib.dumps(output, ensure_ascii=False, indent=2))


# ======================== MAIN ========================

def main():
    parser = argparse.ArgumentParser(description="Métricas GA4 para Simón")
    parser.add_argument("piece", nargs="?", help="UTM content de la pieza (ej: pieza03)")
    parser.add_argument("--mode", choices=["campaign", "ux", "overview"], default="campaign",
                        help="Modo: campaign (paid por pieza), ux (funnel/dispositivo), overview (todo)")
    parser.add_argument("--days", type=int, default=7, help="Días hacia atrás (default: 7)")
    parser.add_argument("--list", action="store_true", help="Listar piezas conocidas")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    args = parser.parse_args()

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

    except Exception as e:
        print(f"Error consultando GA4: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
