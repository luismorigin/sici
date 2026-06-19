#!/usr/bin/env python3
import json
import re
from typing import Optional, List, Dict, Any

def extract_precio(desc: str) -> tuple[Optional[int], bool, bool, str, str]:
    """Extrae precio en USD de la descripción."""
    precio_billete_usd = None
    precio_en_texto = False
    precio_en_bob = False
    tipo_cambio_detectado = "no_especificado"
    tc_confianza = "baja"

    # Buscar precio USD (múltiples formatos)
    patterns = [
        r'PRECIO:\s*\$us\s+([\d,\.]+)',
        r'\$us\s+([\d,\.]+)',
        r'USD\s+([\d,\.]+)',
        r'PRECIO:\s*([\d,\.]+)\s*USD',
        r'\$\s+([\d,\.]+)\s*\(',
    ]

    for pattern in patterns:
        match = re.search(pattern, desc, re.IGNORECASE)
        if match:
            raw = match.group(1).replace('.', '').replace(',', '')
            if len(raw) > 4:  # Probablemente sea precio, no área
                precio_billete_usd = int(raw)
                precio_en_texto = True
                break

    # Detectar tipo de cambio
    if precio_billete_usd:
        if re.search(r'paralelo|dólar paralelo|pago en dólares físicos', desc, re.IGNORECASE):
            tipo_cambio_detectado = "paralelo"
            tc_confianza = "alta"
        elif re.search(r'tc 7|tc 6\.|tc oficial', desc, re.IGNORECASE):
            tipo_cambio_detectado = "oficial"
            tc_confianza = "alta"
        else:
            tc_confianza = "media"

    # Precio en BOB
    if re.search(r'bs\s+([\d,\.]+)', desc, re.IGNORECASE) and not precio_billete_usd:
        precio_en_bob = True

    return precio_billete_usd, precio_en_texto, precio_en_bob, tipo_cambio_detectado, tc_confianza


def extract_condominio(desc: str, url: str) -> tuple[bool, Optional[str]]:
    """Extrae si es condominio cerrado y su nombre."""
    es_condominio_cerrado = bool(
        re.search(r'condominio cerrado|acceso controlado|portón eléctrico|seguridad 24h', desc, re.IGNORECASE)
    )

    nombre_condominio_mencionado = None

    # Buscar en slug
    slug_mapping = {
        'riviera-del-remanso': 'Riviera del Remanso',
        'remanso-3': 'Remanso 3',
        'versalles': 'Condominio Versalles',
        'alameda-fontana': 'Alameda Fontana',
    }

    for slug, nombre in slug_mapping.items():
        if slug.lower() in url.lower():
            nombre_condominio_mencionado = nombre
            break

    # Si no está en slug, buscar en descripción
    if not nombre_condominio_mencionado:
        if re.search(r'almería|almeria', desc, re.IGNORECASE):
            nombre_condominio_mencionado = "Almería Sumuque"
        elif re.search(r'versalles', desc, re.IGNORECASE):
            nombre_condominio_mencionado = "Condominio Versalles"
        elif re.search(r'alameda fontana', desc, re.IGNORECASE):
            nombre_condominio_mencionado = "Alameda Fontana"

    return es_condominio_cerrado, nombre_condominio_mencionado


def extract_estado(desc: str) -> Optional[str]:
    """Extrae estado de construcción."""
    if re.search(r'a estrenar|pre-venta|a estrenar|nueva', desc, re.IGNORECASE):
        return "nueva"
    elif re.search(r'precio de terreno|ideal para.*demoler|para demoler', desc, re.IGNORECASE):
        return "para_demolicion"
    else:
        return "usada"


def extract_niveles(desc: str) -> Optional[int]:
    """Extrae número de niveles."""
    if re.search(r'planta alta', desc, re.IGNORECASE) and re.search(r'planta baja', desc, re.IGNORECASE):
        return 2
    elif re.search(r'sola planta|una sola planta', desc, re.IGNORECASE):
        return 1
    elif re.search(r'tres nivel|3 nivel|tres plantas', desc, re.IGNORECASE):
        return 3
    return None


def extract_amenidades(desc: str) -> List[str]:
    """Extrae amenidades de la lista canónica."""
    amenidades = []

    mapping = {
        'piscina': [r'piscina'],
        'jardin': [r'jardín|jardin|patio'],
        'quincho': [r'quincho'],
        'dependencia_servicio': [r'dependencia'],
        'garage': [r'garaje|parqueo'],
        'escritorio': [r'escritorio'],
        'sala_juegos': [r'sala de juegos'],
        'lavanderia': [r'lavandería|lavanderia'],
        'churrasquera': [r'churrasquera|churrasquero|asador|parrilla'],
        'gimnasio': [r'gimnasio'],
        'sauna': [r'sauna'],
        'seguridad_24h': [r'seguridad 24h'],
        'areas_verdes': [r'áreas verdes|areas verdes'],
        'cancha': [r'cancha|polifuncional'],
        'galeria': [r'galería|galeria'],
    }

    for amenidad, patterns in mapping.items():
        for pattern in patterns:
            if re.search(pattern, desc, re.IGNORECASE):
                amenidades.append(amenidad)
                break

    return list(set(amenidades))


def extract_caracteristicas_extra(desc: str) -> List[str]:
    """Extrae características adicionales (no canónicas)."""
    caracteristicas_extra = []

    extras = [
        'aire acondicionado', 'gas natural', 'fibra óptica', 'depósito',
        'doble altura', 'balcón', 'vestidor', 'isla integrada', 'cajonería',
        'extractor', 'roperos', 'box de baño', 'galpón', 'desayunador',
        'alacena', 'office', 'sala de tv', 'armario', 'ascensor',
        'paneles solares', 'home office', 'domótica', 'cisterna', 'pozo de agua', 'altillo'
    ]

    for extra in extras:
        if re.search(re.escape(extra), desc, re.IGNORECASE):
            caracteristicas_extra.append(extra)

    return list(set(caracteristicas_extra))


def extract_cerca_de(desc: str) -> List[str]:
    """Extrae referencias geográficas."""
    cerca_de = []

    referencias = [
        'radial 27', 'av. alemana', 'banzer', 'calle tesalonicenses', 'av. beni',
        'av. miguel de cervantes', 'españa', 'cambridge college', 'mainter',
        'prolongación beni', 'canal isuto', 'equipetrol', '4to anillo',
        '3er anillo', '8vo anillo', 'km 9', 'km 10', 'aeropuerto', 'patujú'
    ]

    for ref in referencias:
        if re.search(re.escape(ref), desc, re.IGNORECASE):
            cerca_de.append(ref)

    return list(set(cerca_de))


def enrich_casa(item: Dict[str, Any]) -> Dict[str, Any]:
    """Aplica el prompt de enriquecimiento a una casa."""
    desc = item.get('descripcion', '')
    url = item.get('url', '')

    precio_billete_usd, precio_en_texto, precio_en_bob, tipo_cambio_detectado, tc_confianza = extract_precio(desc)
    es_condominio_cerrado, nombre_condominio_mencionado = extract_condominio(desc, url)
    estado = extract_estado(desc)
    niveles = extract_niveles(desc)
    amoblado = bool(re.search(r'amoblada|semi amoblada|equipada|semiamoblada', desc, re.IGNORECASE))
    amenidades = extract_amenidades(desc)
    caracteristicas_extra = extract_caracteristicas_extra(desc)
    cerca_de = extract_cerca_de(desc)

    return {
        'id': item.get('id'),
        'precio_billete_usd': precio_billete_usd,
        'precio_en_texto': precio_en_texto,
        'precio_en_bob': precio_en_bob,
        'tipo_cambio_detectado': tipo_cambio_detectado,
        'tc_confianza': tc_confianza,
        'es_condominio_cerrado': es_condominio_cerrado,
        'nombre_condominio_mencionado': nombre_condominio_mencionado,
        'estado': estado,
        'niveles': niveles,
        'amoblado': amoblado,
        'amenidades': amenidades,
        'caracteristicas_extra': caracteristicas_extra,
        'cerca_de': cerca_de,
    }


if __name__ == '__main__':
    # Leer JSON
    with open(r'C:\Users\LUCHO\Desktop\Censo inmobiliario\sici\scripts\sonda-suelo\descripciones-casas-zn.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Procesar cada anuncio
    resultados = [enrich_casa(item) for item in data]

    # Imprimir JSON
    print(json.dumps(resultados, indent=2, ensure_ascii=False))
